const fs = require('fs');
const path = require('path');

function loadDotEnv() {
  const envPath = path.resolve(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) {
    return;
  }

  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  lines.forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      return;
    }

    const equalIndex = trimmed.indexOf('=');
    if (equalIndex === -1) {
      return;
    }

    const key = trimmed.slice(0, equalIndex).trim();
    if (!key || process.env[key]) {
      return;
    }

    let value = trimmed.slice(equalIndex + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    process.env[key] = value;
  });
}

loadDotEnv();

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
    return 'https://formsubmit.co/ajax/volunteer@arafatforcongress.org';
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

function getOptionalMeasurementId() {
  try {
    return getMeasurementId();
  } catch (_) {
    return null;
  }
}

module.exports = {
  REQUIRED_ENV,
  getMeasurementId,
  getOptionalMeasurementId,
  requireEnv,
  getSignupEndpoint
};
