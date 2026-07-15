import { tg } from './telegram';

// Все запросы к API авторизуются подписанным Telegram initData.
// Бэкенд (webapp_api.py) проверяет HMAC-подпись токеном бота.

const API_BASE: string = (import.meta.env.VITE_API_BASE as string) || '';

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
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      Authorization: `tma ${initData}`,
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
  offer_url: string;
  privacy_url: string;
};

export type Subscription = {
  id: number;
  sub_id: string;
  server: ServerInfo;
  expiry_date: number; // ms timestamp, 0 = бессрочно
  status: 'active' | 'expired';
  sub_link: string | null;
  ics_url?: string | null; // ссылка на .ics-напоминание для календаря устройства
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
    users: (limit = 100) => request<any[]>('GET', `/api/admin/users?limit=${limit}`),
    deleteUser: (userId: number) => request('DELETE', `/api/admin/users/${userId}`),
  },
};
