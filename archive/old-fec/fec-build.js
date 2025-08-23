import 'dotenv/config';

const FEC_API_KEY = process.env.FEC_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!FEC_API_KEY) {
  throw new Error("FEC_API_KEY is not set");
}
if (!OPENAI_API_KEY) {
  throw new Error("OPENAI_API_KEY is not set");
}

// Example usage:
console.log("FEC API:", FEC_API_KEY.substring(0,5) + "...");
console.log("OpenAI API:", OPENAI_API_KEY.substring(0,5) + "...");
