const FEC_API_KEY = process.env.FEC_API_KEY;
if (!FEC_API_KEY) {
    throw new Error("FEC_API_KEY is not set");
}
// Rest of the code using FEC_API_KEY
