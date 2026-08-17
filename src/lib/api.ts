import type { Itinerary } from '../types';

const DEFAULT_API_BASE = import.meta.env.DEV ? 'https://ai-planner-backend-i37s.onrender.com' : '';
export const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined ?? DEFAULT_API_BASE).replace(/\/$/, '');
export const GENERATE_PATH = import.meta.env.VITE_GENERATE_PATH ?? '/api/generate-itinerary';

export async function fetchTrip(tripId: string): Promise<Itinerary> {
  const res = await fetch(`${API_BASE}/api/trips/${tripId}`);

  if (!res.ok) {
    const body = await res.json().catch(() => null) as { error?: { message?: string } } | null;
    throw new Error(body?.error?.message ?? `Trip not found: ${tripId}`);
  }

  return res.json() as Promise<Itinerary>;
}
