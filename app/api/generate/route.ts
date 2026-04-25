import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";
import { analyzeProtocolPhotos, analyzeNamelistPhotos } from "@/lib/claude";
import { generateProtocolDocx, buildFilename } from "@/lib/docx-generator";
import { uploadToGoogleDrive } from "@/lib/google-drive";

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Inte inloggad" }, { status: 401 });
  }

  try {
    const formData = await req.formData();

    const protocolFiles: File[] = [];
    const namelistFiles: File[] = [];

    for (let i = 1; i <= 3; i++) {
      const file = formData.get(`protocol_${i}`) as File | null;
      if (file) protocolFiles.push(file);
    }
    for (let i = 1; i <= 2; i++) {
      const file = formData.get(`namelist_${i}`) as File | null;
      if (file) namelistFiles.push(file);
    }

    if (protocolFiles.length < 3) {
      return NextResponse.json(
        { error: "Tre protokollfoton krävs" },
        { status: 400 }
      );
    }

    const toBuffer = async (file: File) =>
      Buffer.from(await file.arrayBuffer());

    const [protocolBuffers, namelistBuffers] = await Promise.all([
      Promise.all(protocolFiles.map(toBuffer)),
      Promise.all(namelistFiles.map(toBuffer)),
    ]);

    const [protocolData, highlightedNames] = await Promise.all([
      analyzeProtocolPhotos(protocolBuffers),
      analyzeNamelistPhotos(namelistBuffers),
    ]);

    protocolData.absentGreetings = highlightedNames;

    const docxBuffer = await generateProtocolDocx(protocolData);
    const filename = buildFilename(protocolData.meetingDate);

    const driveLink = await uploadToGoogleDrive(
      docxBuffer,
      filename,
      session.accessToken
    );

    return NextResponse.json({ filename, driveLink });
  } catch (err) {
    console.error(err);
    const message = err instanceof Error ? err.message : "Okänt fel";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
