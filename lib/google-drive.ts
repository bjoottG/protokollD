import { google } from "googleapis";

function getAuth(accessToken: string) {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );
  oauth2Client.setCredentials({ access_token: accessToken });
  return oauth2Client;
}

async function findFolderId(
  drive: ReturnType<typeof google.drive>,
  name: string,
  parentId?: string
): Promise<string | null> {
  const query = parentId
    ? `name='${name}' and mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`
    : `name='${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;

  const res = await drive.files.list({
    q: query,
    fields: "files(id, name)",
    includeItemsFromAllDrives: true,
    supportsAllDrives: true,
  });

  return res.data.files?.[0]?.id ?? null;
}

export async function uploadToGoogleDrive(
  buffer: Buffer,
  filename: string,
  accessToken: string
): Promise<string> {
  const auth = getAuth(accessToken);
  const drive = google.drive({ version: "v3", auth });

  // Try D/protokoll first, fall back to finding protokoll/Protokoll directly
  let protokollId: string | null = null;
  const folderDId = await findFolderId(drive, "D");
  if (folderDId) {
    protokollId =
      (await findFolderId(drive, "protokoll", folderDId)) ??
      (await findFolderId(drive, "Protokoll", folderDId));
  }
  if (!protokollId) {
    protokollId =
      (await findFolderId(drive, "protokoll")) ??
      (await findFolderId(drive, "Protokoll"));
  }
  if (!protokollId)
    throw new Error(
      "Hittade inte mappen 'protokoll' på Google Drive."
    );

  const { Readable } = await import("stream");
  const stream = Readable.from(buffer);

  const res = await drive.files.create({
    supportsAllDrives: true,
    requestBody: {
      name: filename,
      parents: [protokollId],
      mimeType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    },
    media: {
      mimeType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      body: stream,
    },
    fields: "id, webViewLink",
  });

  return res.data.webViewLink ?? "";
}
