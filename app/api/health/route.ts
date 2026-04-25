import { NextResponse } from "next/server";
import { google } from "googleapis";

export async function GET() {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const googleJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;

  let googleEmail = null;
  let folders: string[] = [];
  let driveError = null;

  try {
    if (googleJson) {
      const credentials = JSON.parse(googleJson);
      googleEmail = credentials.client_email;

      const auth = new google.auth.GoogleAuth({
        credentials,
        scopes: ["https://www.googleapis.com/auth/drive"],
      });
      const drive = google.drive({ version: "v3", auth });

      const res = await drive.files.list({
        q: "mimeType='application/vnd.google-apps.folder' and trashed=false",
        fields: "files(id, name, parents)",
        pageSize: 20,
        includeItemsFromAllDrives: true,
        supportsAllDrives: true,
      });

      folders = (res.data.files ?? []).map(
        (f) => `${f.name} (id:${f.id})`
      );
    }
  } catch (e) {
    driveError = e instanceof Error ? e.message : String(e);
  }

  return NextResponse.json({
    anthropic: anthropicKey ? `satt (${anthropicKey.length} tecken)` : "SAKNAS",
    google_client_email: googleEmail ?? "SAKNAS",
    drive_folders_visible: folders,
    drive_error: driveError,
  });
}
