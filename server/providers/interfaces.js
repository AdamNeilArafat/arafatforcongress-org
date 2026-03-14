export class ProviderError extends Error {
  constructor(provider, operation, code, message, detail = {}) {
    super(message);
    this.name = 'ProviderError';
    this.provider = provider;
    this.operation = operation;
    this.code = code;
    this.detail = detail;
  }

  toJSON() {
    return {
      name: this.name,
      provider: this.provider,
      operation: this.operation,
      code: this.code,
      message: this.message,
      detail: this.detail
    };
  }
}

export class GeocoderProvider {}
export class DemographicsProvider {}
export class LegislativeProvider {}
export class FinanceProvider {}
export class PlacesProvider {}
export class RoutingProvider {}
export class AiProvider {}
