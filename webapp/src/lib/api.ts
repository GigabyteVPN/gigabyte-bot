import { tg } from './telegram';

// Авторизация запросов к API:
//   • внутри Telegram — подписанный initData (`tma …`);
//   • в веб-дашборде (обычный браузер) — подписанный ботом токен (`Bearer …`),
//     который админ получает командой /dashboard. Бэкенд проверяет HMAC
//     токеном бота в обоих случаях.
const API_BASE: string = (import.meta.env.VITE_API_BASE as string) || '';

const DASH_TOKEN_KEY = 'gigabyte_dash_token';

/** Токен дашборда: из ?token=… в URL (сохраняем) либо из localStorage.
 *  Именно query, а не hash — hash занят HashRouter'ом приложения. */
export function getDashToken(): string | null {
  try {
    const q = new URLSearchParams(window.location.search);
    const t = q.get('token');
    if (t) {
      localStorage.setItem(DASH_TOKEN_KEY, t);
      // убираем токен из адресной строки, чтобы не светился в истории
      q.delete('token');
      const qs = q.toString();
      history.replaceState(
        null,
        '',
        window.location.pathname + (qs ? `?${qs}` : '') + window.location.hash,
      );
      return t;
    }
    return localStorage.getItem(DASH_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function clearDashToken() {
  try {
    localStorage.removeItem(DASH_TOKEN_KEY);
  } catch {
    /* noop */
  }
}

/** Мы в режиме веб-дашборда (вне Telegram)? */
export function isDashboardMode(): boolean {
  return !tg.initData && !!getDashToken();
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T = any>(
  method: 'GET' | 'POST' | 'DELETE',
  path: string,
  body?: unknown,
): Promise<T> {
  const initData = tg.initData || '';
  const dashToken = initData ? null : getDashToken();
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      Authorization: dashToken ? `Bearer ${dashToken}` : `tma ${initData}`,
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  let payload: any = null;
  try {
    payload = await res.json();
  } catch {
    throw new ApiError(`Сервер недоступен (${res.status})`, res.status);
  }
  if (!res.ok || payload?.ok === false) {
    throw new ApiError(payload?.error || `Ошибка запроса (${res.status})`, res.status);
  }
  return payload.data as T;
}

// ---------- Типы ----------
export type Tariff = { months: number; rub: number; usd: number; stars: number; label: string };
export type ServerInfo = { id: number; name: string; flag?: string; is_active?: boolean };

export type Bootstrap = {
  user: { id: number; username?: string; first_name?: string; last_name?: string };
  is_admin: boolean;
  accepted_terms: boolean;
  trial_used: boolean;
  tariffs: Tariff[];
  servers: ServerInfo[];
  countries: string[];
  wallet: string;
  contracts: { USDT: string; USDC: string };
  ref_points?: number;
  reminders_enabled?: boolean;
  referral?: { points_signup: number; points_purchase: number; redeem_cost: number; redeem_months: number };
};

export type Subscription = {
  id: number;
  sub_id: string;
  server: ServerInfo;
  expiry_date: number; // ms timestamp, 0 = бессрочно
  status: 'active' | 'expired';
  sub_link: string | null;
  ics_url?: string | null; // ссылка на .ics-напоминание для календаря устройства
  qr_url?: string | null; // публичная ссылка на PNG QR-кода подписки
  email?: string | null; // идентификатор клиента в панели (для поддержки)
};

export type ReferralSummary = {
  available: boolean;
  link: string;
  points: number;
  invited_total: number;
  invited_paid: number;
  history: { delta: number; reason: string; created_at: string }[];
  points_signup: number;
  points_purchase: number;
  redeem_cost: number;
  redeem_months: number;
};

export const apiBase = API_BASE;

export type Payment = {
  id: number;
  payment_uid?: string;
  amount_rub?: number;
  amount_usd?: number;
  method?: string;
  currency?: string;
  status?: string;
  created_at?: string;
  tx_hash?: string;
};

export type TicketMessage = {
  sender_id: number;
  message_text: string;
  created_at: string;
  is_admin: boolean;
};

export type Ticket = {
  ticket_id: string;
  status: string;
  created_at: string;
  user_id?: number;
  username?: string;
  full_name?: string;
  messages: TicketMessage[];
};

export type CryptoOrder = {
  payment_id: number;
  wallet: string;
  contract: string;
  amount_usd: number;
  amount_rub: number;
  currency: string;
  network: string;
};

export type HashResult = {
  verified: boolean;
  reason?: string;
  sub_link?: string;
  extended?: boolean;
  warning?: string;
};

// ---------- Пользовательские методы ----------
export const api = {
  bootstrap: () => request<Bootstrap>('GET', '/api/bootstrap'),
  acceptTerms: () => request('POST', '/api/terms/accept', {}),
  subscriptions: () => request<Subscription[]>('GET', '/api/subscriptions'),
  payments: () => request<{ pending: Payment[]; history: Payment[] }>('GET', '/api/payments'),
  trial: (server_id: number) => request<{ sub_link: string }>('POST', '/api/trial', { server_id }),
  purchase: (params: {
    kind: 'buy' | 'extend';
    method: 'stars' | 'crypto';
    months: number;
    server_id?: number;
    sub_id?: string;
    currency?: 'USDT' | 'USDC';
  }) => request<any>('POST', '/api/purchase', params),
  submitHash: (paymentId: number, tx_hash: string) =>
    request<HashResult>('POST', `/api/payments/${paymentId}/hash`, { tx_hash }),
  paymentInvoice: (paymentId: number) =>
    request<{ invoice_link: string }>('POST', `/api/payments/${paymentId}/invoice`, {}),
  deletePayment: (paymentId: number) => request('DELETE', `/api/payments/${paymentId}`),
  activatePromo: (code: string) =>
    request<{ sub_link: string; label: string }>('POST', '/api/promo/activate', { code }),
  tickets: () => request<Ticket[]>('GET', '/api/tickets'),
  createTicket: (text: string) => request<{ ticket_id: string }>('POST', '/api/tickets', { text }),
  replyTicket: (ticketId: string, text: string) =>
    request('POST', `/api/tickets/${ticketId}/messages`, { text }),
  closeTicket: (ticketId: string) => request('POST', `/api/tickets/${ticketId}/close`, {}),
  requestCountry: (country: string) => request('POST', '/api/country-requests', { country }),
  deleteAccount: () => request('DELETE', '/api/account'),
  subStats: (subId: string) =>
    request<{ available: boolean; up: number; down: number; online: boolean }>(
      'GET',
      `/api/subscriptions/${subId}/stats`,
    ),
  referral: () => request<ReferralSummary>('GET', '/api/referral'),
  referralRedeem: (params: { sub_id?: string; server_id?: number }) =>
    request<{ redeemed: boolean; extended: boolean; months: number; sub_link?: string }>(
      'POST',
      '/api/referral/redeem',
      params,
    ),
  setReminders: (enabled: boolean) =>
    request<{ enabled: boolean }>('POST', '/api/settings/reminders', { enabled }),
  shareSubQr: (subId: string) => request<{ sent: boolean }>('POST', `/api/subscriptions/${subId}/qr/share`, {}),

  // ---------- Админские методы ----------
  admin: {
    stats: () => request<any>('GET', '/api/admin/stats'),
    rates: () => request<any>('GET', '/api/admin/rates'),
    starsBalance: () => request<any>('GET', '/api/admin/stars-balance'),
    tariffs: () => request<Tariff[]>('GET', '/api/admin/tariffs'),
    updateTariffs: (body: { mode: 'percent' | 'base'; value: number } | { mode: 'list'; items: { months: number; rub: number }[] }) =>
      request<Tariff[]>('POST', '/api/admin/tariffs', body),
    promoKeys: () => request<any[]>('GET', '/api/admin/promo-keys'),
    createPromo: (months: number | 'unlimited') =>
      request<{ code: string; label: string }>('POST', '/api/admin/promo-keys', { months }),
    tickets: () => request<Ticket[]>('GET', '/api/admin/tickets'),
    countryRequests: () => request<any[]>('GET', '/api/admin/country-requests'),
    replyCountry: (requestId: string, text: string) =>
      request('POST', `/api/admin/country-requests/${requestId}/reply`, { text }),
    broadcast: (text: string) => request<{ queued: number }>('POST', '/api/admin/broadcast', { text }),
    createSubscription: (user_id: number, server_id: number, months: number) =>
      request<{ sub_link: string }>('POST', '/api/admin/subscriptions', { user_id, server_id, months }),
    sync: () => request<any>('POST', '/api/admin/sync', {}),
    importClients: () => request<any>('POST', '/api/admin/import', {}),
    servers: () => request<any[]>('GET', '/api/admin/servers'),
    createServer: (body: Record<string, unknown>) => request<any>('POST', '/api/admin/servers', body),
    updateServer: (id: number, body: Record<string, unknown>) =>
      request<any>('POST', `/api/admin/servers/${id}`, body),
    deleteServer: (id: number) => request('DELETE', `/api/admin/servers/${id}`),
    testServer: (id: number) =>
      request<{ ok: boolean; error?: string; inbounds?: { id: number; remark: string; port: number; protocol: string; enable: boolean; clients: number }[] }>(
        'POST',
        `/api/admin/servers/${id}/test`,
        {},
      ),
    panelStatus: () => request<any>('GET', '/api/admin/panel-status'),
    serversHealth: () => request<ServerHealth[]>('GET', '/api/admin/servers/health'),
    users: (limit = 100) => request<any[]>('GET', `/api/admin/users?limit=${limit}`),
    userDetail: (userId: number) => request<AdminUserDetail>('GET', `/api/admin/users/${userId}`),
    deleteUser: (userId: number) => request('DELETE', `/api/admin/users/${userId}`),
    revokeSub: (subId: string) => request<{ revoked: boolean }>('POST', `/api/admin/subscriptions/${subId}/revoke`, {}),
    search: (q: string) => request<AdminSearchResult[]>('GET', `/api/admin/search?q=${encodeURIComponent(q)}`),
    reprovision: (serverId?: number) =>
      request<{ started: boolean; active: number }>('POST', '/api/admin/reprovision', serverId ? { server_id: serverId } : {}),
  },
};

export type AdminSearchResult = {
  user_id: number;
  matched_by: string;
  matched_value: string;
  username?: string;
  full_name?: string;
};

export type ServerHealth = {
  id: number;
  name: string;
  online: boolean;
  inbound_found?: boolean;
  port?: number;
  clients?: number;
  clients_online?: number;
  traffic_up?: number;
  traffic_down?: number;
  cpu_percent?: number;
  cpu_cores?: number;
  load?: number[];
  mem_used?: number;
  mem_total?: number;
  disk_used?: number;
  disk_total?: number;
  uptime?: number;
  net_up_speed?: number;
  net_down_speed?: number;
  net_sent?: number;
  net_recv?: number;
  xray_state?: string;
  xray_version?: string;
  tcp_count?: number;
  udp_count?: number;
};

export type AdminUserDetail = {
  user: {
    user_id: number;
    username?: string;
    full_name?: string;
    created_at?: string;
    lang?: string;
    reminders_enabled?: boolean;
    is_admin: boolean;
  };
  subscriptions: {
    sub_id: string;
    server: ServerInfo;
    expiry_date: number;
    status: 'active' | 'expired';
    email?: string;
  }[];
  payments: {
    payment_uid?: string;
    amount_rub?: number;
    method?: string;
    status?: string;
    created_at?: string;
    tx_hash?: string;
  }[];
  total_paid: number;
  referral: { points: number; invited_total: number; invited_paid: number; referred_by?: number | null };
};
