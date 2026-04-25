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

async function findOrCreateFolder(
  drive: ReturnType<typeof google.drive>,
  name: string,
  parentId: string
): Promise<string> {
  const existing = await findFolderId(drive, name, parentId);
  if (existing) return existing;

  const res = await drive.files.create({
    supportsAllDrives: true,
    requestBody: {
      name,
      mimeType: "application/vnd.google-apps.folder",
      parents: [parentId],
    },
    fields: "id",
  });
  return res.data.id!;
}

async function getProtokollFolderId(
  drive: ReturnType<typeof google.drive>
): Promise<string | null> {
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
  return protokollId;
}

export async function uploadToGoogleDrive(
  buffer: Buffer,
  filename: string,
  accessToken: string
): Promise<string> {
  const auth = getAuth(accessToken);
  const drive = google.drive({ version: "v3", auth });

  const protokollId = await getProtokollFolderId(drive);
  if (!protokollId)
    throw new Error("Hittade inte mappen 'protokoll' på Google Drive.");

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

export async function uploadPhotosToFoton(
  protocolBuffers: Buffer[],
  namelistBuffers: Buffer[],
  meetingDate: string,
  accessToken: string
): Promise<void> {
  const auth = getAuth(accessToken);
  const drive = google.drive({ version: "v3", auth });

  const protokollId = await getProtokollFolderId(drive);
  if (!protokollId) return;

  const fotonId = await findOrCreateFolder(drive, "foton", protokollId);

  const parts = meetingDate.split("-");
  const yy = parts[0].slice(-2);
  const mm = parts[1];
  const dd = parts[2];
  const datePrefix = `${yy}${mm}${dd}`;

  const { Readable } = await import("stream");

  const uploads: Promise<unknown>[] = [];

  for (let i = 0; i < protocolBuffers.length; i++) {
    uploads.push(
      drive.files.create({
        supportsAllDrives: true,
        requestBody: {
          name: `${datePrefix}_protokoll_sida${i + 1}.jpg`,
          parents: [fotonId],
          mimeType: "image/jpeg",
        },
        media: { mimeType: "image/jpeg", body: Readable.from(protocolBuffers[i]) },
        fields: "id",
      })
    );
  }

  for (let i = 0; i < namelistBuffers.length; i++) {
    uploads.push(
      drive.files.create({
        supportsAllDrives: true,
        requestBody: {
          name: `${datePrefix}_namnlista${i + 1}.jpg`,
          parents: [fotonId],
          mimeType: "image/jpeg",
        },
        media: { mimeType: "image/jpeg", body: Readable.from(namelistBuffers[i]) },
        fields: "id",
      })
    );
  }

  await Promise.all(uploads);
}
