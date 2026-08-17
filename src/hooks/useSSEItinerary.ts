import { useCallback, useRef, useState } from 'react';
import { API_BASE, GENERATE_PATH } from '../lib/api';
import { budgetToLegacyAmount, dateRangeForRequest, normalizeLegacyItinerary } from '../lib/legacyAdapter';
import type { GenerationStatus, Itinerary, SSEMeta, TripRequest } from '../types';

interface SSEState {
  status: GenerationStatus;
  meta: SSEMeta | null;
  tokens: string;
  itinerary: Itinerary | null;
  error: string | null;
}

const INITIAL: SSEState = {
  status: 'idle',
  meta: null,
  tokens: '',
  itinerary: null,
  error: null,
};

export function useSSEItinerary() {
  const [state, setState] = useState<SSEState>(INITIAL);
  const abort = useRef<AbortController | null>(null);

  const generate = useCallback(async (request: TripRequest) => {
    abort.current?.abort();
    const ctrl = new AbortController();
    abort.current = ctrl;
    setState({ ...INITIAL, status: 'connecting' });

    try {
      const { startDate, endDate } = dateRangeForRequest(request);
      const res = await fetch(`${API_BASE}${GENERATE_PATH}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          destination: request.destination,
          startDate,
          endDate,
          budget: budgetToLegacyAmount(request.budget),
          interests: request.interests,
          travelStyle: request.travelStyle,
        }),
        signal: ctrl.signal,
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null) as { error?: string; message?: string } | null;
        throw new Error(body?.message ?? body?.error ?? `HTTP ${res.status}`);
      }

      setState((s) => ({ ...s, status: 'parsing' }));
      const itinerary = normalizeLegacyItinerary(await res.json(), request);
      setState({
        ...INITIAL,
        status: 'done',
        itinerary,
        meta: {
          tripId: itinerary.tripId,
          ragChunksUsed: itinerary.meta.ragChunksUsed,
          weatherDataUsed: itinerary.meta.weatherDataUsed,
          promptVersion: itinerary.meta.promptVersion,
        },
      });
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      setState((s) => ({ ...s, status: 'error', error: err instanceof Error ? err.message : String(err) }));
    }
  }, []);

  const cancel = useCallback(() => {
    abort.current?.abort();
    abort.current = null;
    setState(INITIAL);
  }, []);

  const reset = useCallback(() => {
    abort.current?.abort();
    abort.current = null;
    setState(INITIAL);
  }, []);

  return { ...state, generate, cancel, reset };
}
