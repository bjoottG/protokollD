import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";
import { google } from "googleapis";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) {
    return NextResponse.json({ ok: false, error: "Inte inloggad" }, { status: 401 });
  }

  try {
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    );
    oauth2Client.setCredentials({ access_token: session.accessToken });
    const drive = google.drive({ version: "v3", auth: oauth2Client });

    // Check for the D/protokoll folder structure (mirrors the upload logic)
    const findFolder = async (name: string, parentId?: string) => {
      const q = parentId
        ? `name='${name}' and mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`
        : `name='${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
      const res = await drive.files.list({
        q,
        fields: "files(id)",
        includeItemsFromAllDrives: true,
        supportsAllDrives: true,
        pageSize: 5,
      });
      return res.data.files?.[0]?.id ?? null;
    };

    let found = false;
    const folderDId = await findFolder("D");
    if (folderDId) {
      const pId =
        (await findFolder("protokoll", folderDId)) ??
        (await findFolder("Protokoll", folderDId));
      if (pId) found = true;
    }
    if (!found) {
      const pId =
        (await findFolder("protokoll")) ?? (await findFolder("Protokoll"));
      if (pId) found = true;
    }

    if (!found) {
      return NextResponse.json({
        ok: false,
        error: "Hittade inte mappen 'protokoll' på Google Drive.",
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Okänt Drive-fel";
    return NextResponse.json({ ok: false, error: message });
  }
}
