import type { Activity, DayPlan, Itinerary, TripRequest } from '../types';

interface LegacyActivity {
  time?: string;
  activity?: string;
  location?: string;
  description?: string;
  estimatedCost?: number;
  duration?: string;
  tips?: string;
}

interface LegacyDay {
  day?: number;
  date?: string;
  theme?: string;
  activities?: LegacyActivity[];
}

interface LegacyItinerary {
  destination?: string;
  duration?: number;
  totalEstimatedCost?: number;
  dailyItinerary?: LegacyDay[];
  localTips?: string[];
  packingRecommendations?: string[];
  weatherSummary?: {
    condition?: string;
    temperature?: string;
    recommendations?: string;
  };
}

interface LegacyEnvelope {
  data?: LegacyItinerary;
  success?: boolean;
}

function activityType(activity: LegacyActivity): Activity['type'] {
  const text = `${activity.activity ?? ''} ${activity.description ?? ''}`.toLowerCase();
  if (/food|restaurant|cafe|market|meal|dining/.test(text)) return 'food';
  if (/hotel|accommodation|stay|resort|hostel/.test(text)) return 'accommodation';
  if (/train|bus|metro|taxi|walk|transport/.test(text)) return 'transport';
  return 'attraction';
}

function normalizeActivity(activity: LegacyActivity): Activity {
  return {
    name: activity.activity?.trim() || 'Planned activity',
    description: activity.description?.trim() || 'Explore this recommendation.',
    duration: activity.duration?.trim() || 'Flexible',
    location: activity.location?.trim() || 'Local area',
    type: activityType(activity),
    estimatedCostUSD: Number.isFinite(activity.estimatedCost) ? Number(activity.estimatedCost) : 0,
    ragSource: null,
  };
}

function hourFromTime(value?: string): number | null {
  if (!value) return null;
  const match = value.match(/(\d{1,2})(?::\d{2})?\s*(AM|PM)?/i);
  if (!match) return null;
  let hour = Number(match[1]);
  const meridiem = match[2]?.toUpperCase();
  if (meridiem === 'PM' && hour < 12) hour += 12;
  if (meridiem === 'AM' && hour === 12) hour = 0;
  return hour;
}

function normalizeDay(day: LegacyDay, weatherNote: string | null): DayPlan {
  const activities = (day.activities ?? []).map(normalizeActivity);
  const morning: Activity[] = [];
  const afternoon: Activity[] = [];
  const evening: Activity[] = [];

  activities.forEach((activity, index) => {
    const source = day.activities?.[index];
    const hour = hourFromTime(source?.time);
    if (hour !== null && hour < 12) morning.push(activity);
    else if (hour !== null && hour < 18) afternoon.push(activity);
    else if (hour !== null) evening.push(activity);
    else if (index % 3 === 0) morning.push(activity);
    else if (index % 3 === 1) afternoon.push(activity);
    else evening.push(activity);
  });

  return {
    day: day.day ?? 1,
    title: day.theme?.trim() || `Day ${day.day ?? 1}`,
    theme: day.theme?.trim() || 'Explore the destination',
    morning,
    afternoon,
    evening,
    dailyCostUSD: activities.reduce((total, activity) => total + activity.estimatedCostUSD, 0),
    weatherNote,
  };
}

export function normalizeLegacyItinerary(payload: unknown, request: TripRequest): Itinerary {
  const envelope = payload as LegacyEnvelope;
  const legacy = envelope?.data ?? (payload as LegacyItinerary);
  if (!legacy || !Array.isArray(legacy.dailyItinerary)) {
    throw new Error('Backend returned an invalid itinerary payload.');
  }

  const weatherNote = legacy.weatherSummary
    ? [legacy.weatherSummary.condition, legacy.weatherSummary.temperature, legacy.weatherSummary.recommendations]
        .filter(Boolean)
        .join(' — ')
    : null;
  const days = legacy.dailyItinerary.map((day) => normalizeDay(day, weatherNote));
  const tips = [...(legacy.localTips ?? []), ...(legacy.packingRecommendations ?? [])]
    .map((tip) => tip.trim())
    .filter(Boolean)
    .slice(0, 8);

  return {
    tripId: `legacy-${Date.now()}`,
    destination: legacy.destination?.trim() || request.destination,
    duration: legacy.duration ?? request.duration,
    days,
    totalEstimatedCostUSD: Number.isFinite(legacy.totalEstimatedCost) ? Number(legacy.totalEstimatedCost) : 0,
    travelTips: tips.length ? tips : ['Check local weather before leaving.', 'Keep important documents secure.'],
    bestTimeToVisit: 'Check local seasonal conditions and weather before booking.',
    generatedAt: new Date().toISOString(),
    meta: {
      modelVersion: 'legacy-backend',
      promptVersion: 'legacy-api-adapter',
      ragChunksUsed: 0,
      weatherDataUsed: Boolean(legacy.weatherSummary),
      fromCache: false,
      generationMs: 0,
    },
  };
}

export function budgetToLegacyAmount(budget: TripRequest['budget']): string {
  if (budget === 'budget') return '1000';
  if (budget === 'luxury') return '8000';
  return '3000';
}

export function dateRangeForRequest(request: TripRequest): { startDate: string; endDate: string } {
  const start = request.startDate ? new Date(`${request.startDate}T00:00:00Z`) : new Date();
  const safeStart = Number.isNaN(start.getTime()) ? new Date() : start;
  const end = new Date(safeStart);
  end.setUTCDate(end.getUTCDate() + Math.max(0, request.duration - 1));
  return {
    startDate: safeStart.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
  };
}
