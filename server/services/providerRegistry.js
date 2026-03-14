import { CensusGeocoderProvider, NominatimProvider } from '../providers/geocoders.js';
import { CensusAcsProvider, FecProvider, NullAiProvider, OpenStatesProvider, OptionalGeminiProvider } from '../providers/externalData.js';
import { OptionalOpenRouteServiceProvider } from '../providers/routing.js';

export function buildProviders(env = process.env) {
  return {
    geocoderPrimary: new CensusGeocoderProvider({ timeoutMs: Number(env.CENSUS_TIMEOUT_MS || 12000), retries: 2, rateLimitPerSecond: Number(env.CENSUS_RPS || 5) }),
    geocoderFallback: new NominatimProvider({ baseUrl: env.NOMINATIM_BASE_URL, userAgent: env.NOMINATIM_USER_AGENT, retries: 1, rateLimitPerSecond: Number(env.NOMINATIM_RPS || 1) }),
    demographics: new CensusAcsProvider({ apiKey: env.CENSUS_API_KEY }),
    legislative: new OpenStatesProvider({ apiKey: env.OPENSTATES_API_KEY }),
    finance: new FecProvider({ apiKey: env.FEC_API_KEY }),
    ai: env.AI_PROVIDER === 'gemini' ? new OptionalGeminiProvider({ apiKey: env.GEMINI_API_KEY }) : new NullAiProvider(),
    routing: new OptionalOpenRouteServiceProvider({ apiKey: env.OPENROUTESERVICE_API_KEY })
  };
}
