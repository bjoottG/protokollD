import { NextResponse } from "next/server";

export async function GET() {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const googleJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;

  let googleEmail = null;
  let googleError = null;
  try {
    if (googleJson) {
      const parsed = JSON.parse(googleJson);
      googleEmail = parsed.client_email ?? "(client_email saknas i JSON)";
    }
  } catch {
    googleError = "Ogiltig JSON";
  }

  return NextResponse.json({
    anthropic: anthropicKey ? `satt (${anthropicKey.length} tecken)` : "SAKNAS",
    google_service_account: googleJson
      ? `satt (${googleJson.length} tecken)`
      : "SAKNAS",
    google_client_email: googleEmail ?? googleError ?? "SAKNAS",
  });
}
