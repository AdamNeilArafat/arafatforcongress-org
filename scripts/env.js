const REQUIRED_ENV = ['GA_MEASUREMENT_ID'];

function requireEnv(name) {
  const value = process.env[name];
  if (!value || !String(value).trim() || value.includes('XXXXXXXXXX')) {
    throw new Error(`${name} is required and must be set to a valid value.`);
  }
  return String(value).trim();
}


function getSignupEndpoint() {
  const value = process.env.SIGNUP_ENDPOINT;
  if (!value || !String(value).trim()) {
    return 'SIGNUP_ENDPOINT_PLACEHOLDER';
  }
  return String(value).trim();
}

function getMeasurementId() {
  const measurementId = requireEnv('GA_MEASUREMENT_ID');
  if (!/^G-[A-Z0-9]+$/i.test(measurementId)) {
    throw new Error('GA_MEASUREMENT_ID must look like a GA4 measurement ID (ex: G-XXXXXXXXXX).');
  }
  return measurementId;
}

module.exports = {
  REQUIRED_ENV,
  getMeasurementId,
  requireEnv,
  getSignupEndpoint
};
