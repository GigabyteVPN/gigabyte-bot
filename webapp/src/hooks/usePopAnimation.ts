import { useState, useCallback } from 'react';

export const useSinglePop = () => {
    const [isPopping, setIsPopping] = useState(false);
    
    const trigger = useCallback(() => {
        setIsPopping(true);
        setTimeout(() => setIsPopping(false), 150);
    }, []);
    
    return { isPopping, trigger };
};

export const usePopAnimation = () => {
    const [poppingId, setPoppingId] = useState<string | null>(null);
    
    const triggerPop = useCallback((id: string) => {
        setPoppingId(id);
        setTimeout(() => setPoppingId(null), 150);
    }, []);
    
    return { poppingId, triggerPop };
};
