import { google } from "googleapis";

function getAuth() {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );
  oauth2Client.setCredentials({
    refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
  });
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
    spaces: "drive",
  });

  return res.data.files?.[0]?.id ?? null;
}

export async function uploadToGoogleDrive(
  buffer: Buffer,
  filename: string
): Promise<string> {
  const auth = getAuth();
  const drive = google.drive({ version: "v3", auth });

  const folderDId = await findFolderId(drive, "D");
  if (!folderDId) throw new Error("Hittade inte mappen 'D' på Google Drive");

  const protokollId = await findFolderId(drive, "protokoll", folderDId);
  if (!protokollId)
    throw new Error(
      "Hittade inte mappen 'protokoll' under 'D' på Google Drive"
    );

  const { Readable } = await import("stream");
  const stream = Readable.from(buffer);

  const res = await drive.files.create({
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
