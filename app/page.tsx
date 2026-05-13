"use client";

import { useRef, useState, useCallback } from "react";
import { signOut } from "next-auth/react";

async function compressImage(file: File): Promise<File> {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const MAX = 1600;
      let w = img.width;
      let h = img.height;
      if (w > MAX) { h = Math.round((h * MAX) / w); w = MAX; }
      if (h > MAX) { w = Math.round((w * MAX) / h); h = MAX; }
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      canvas.toBlob(
        (blob) => resolve(new File([blob!], file.name, { type: "image/jpeg" })),
        "image/jpeg",
        0.75
      );
    };
    img.src = url;
  });
}

function downloadDocx(base64: string, filename: string) {
  const bytes = atob(base64);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  const blob = new Blob([arr], {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function downloadPhoto(file: File, name: string) {
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

type Phase =
  | "drive-check"
  | "protocol"
  | "namelist-prompt"
  | "namelist"
  | "processing"
  | "done"
  | "error";

type DriveMode = "drive" | "local";
type CheckState = "idle" | "checking" | "fail";

interface PhotoSet {
  protocolPhotos: File[];
  namelistPhotos: File[];
}

interface GenerateResult {
  filename: string;
  driveLink?: string;
  docxBase64: string;
}

function PhotoThumb({ file, onRemove }: { file: File; onRemove: () => void }) {
  const url = URL.createObjectURL(file);
  return (
    <div className="relative inline-block">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt="" className="h-20 w-20 object-cover rounded-lg border border-gray-200" />
      <button
        onClick={onRemove}
        className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold"
      >
        ×
      </button>
    </div>
  );
}

function StepDots({ total, current }: { total: number; current: number }) {
  return (
    <div className="flex gap-2 justify-center mb-6">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className={`w-3 h-3 rounded-full ${i < current ? "bg-blue-600" : i === current ? "bg-blue-400" : "bg-gray-300"}`}
        />
      ))}
    </div>
  );
}

export default function Home() {
  const [phase, setPhase] = useState<Phase>("drive-check");
  const [driveMode, setDriveMode] = useState<DriveMode>("drive");
  const [checkState, setCheckState] = useState<CheckState>("idle");
  const [checkError, setCheckError] = useState("");
  const [photos, setPhotos] = useState<PhotoSet>({ protocolPhotos: [], namelistPhotos: [] });
  const [result, setResult] = useState<GenerateResult | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const protocolCount = photos.protocolPhotos.length;
  const namelistCount = photos.namelistPhotos.length;

  const handleDriveCheck = useCallback(async () => {
    setCheckState("checking");
    setCheckError("");
    try {
      const res = await fetch("/api/drive-check");
      const data = await res.json();
      if (data.ok) {
        setDriveMode("drive");
        setPhase("protocol");
      } else {
        setCheckError(data.error ?? "Kunde inte ansluta till Google Drive.");
        setCheckState("fail");
      }
    } catch {
      setCheckError("Nätverksfel – kunde inte kontrollera Google Drive.");
      setCheckState("fail");
    }
  }, []);

  const handleContinueLocal = useCallback(() => {
    setDriveMode("local");
    setPhase("protocol");
  }, []);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      e.target.value = "";

      if (phase === "protocol") {
        const updated = [...photos.protocolPhotos, file];
        setPhotos((p) => ({ ...p, protocolPhotos: updated }));
        if (updated.length >= 3) setPhase("namelist-prompt");
      } else if (phase === "namelist") {
        const updated = [...photos.namelistPhotos, file];
        setPhotos((p) => ({ ...p, namelistPhotos: updated }));
      }
    },
    [phase, photos]
  );

  const openCamera = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const removeProtocol = useCallback((i: number) => {
    setPhotos((p) => ({ ...p, protocolPhotos: p.protocolPhotos.filter((_, idx) => idx !== i) }));
    if (phase !== "protocol") setPhase("protocol");
  }, [phase]);

  const removeNamelist = useCallback((i: number) => {
    setPhotos((p) => ({ ...p, namelistPhotos: p.namelistPhotos.filter((_, idx) => idx !== i) }));
  }, []);

  const handleGenerate = useCallback(async () => {
    setPhase("processing");
    try {
      const [compressedProtocol, compressedNamelist] = await Promise.all([
        Promise.all(photos.protocolPhotos.map(compressImage)),
        Promise.all(photos.namelistPhotos.map(compressImage)),
      ]);

      const fd = new FormData();
      compressedProtocol.forEach((f, i) => fd.append(`protocol_${i + 1}`, f));
      compressedNamelist.forEach((f, i) => fd.append(`namelist_${i + 1}`, f));
      if (driveMode === "local") fd.append("skipDrive", "true");

      const res = await fetch("/api/generate", { method: "POST", body: fd });
      const text = await res.text();
      let data: { error?: string; filename?: string; driveLink?: string; docxBase64?: string };
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error(`Serverfel (${res.status}): bildfiler för stora eller serverfel`);
      }

      if (!res.ok) throw new Error(data.error ?? "Serverfel");
      setResult(data as GenerateResult);
      setPhase("done");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Okänt fel");
      setPhase("error");
    }
  }, [photos, driveMode]);

  const handleDownloadPhotos = useCallback(() => {
    photos.protocolPhotos.forEach((f, i) =>
      downloadPhoto(f, `protokoll_sida${i + 1}.jpg`)
    );
    photos.namelistPhotos.forEach((f, i) =>
      downloadPhoto(f, `namnlista${i + 1}.jpg`)
    );
  }, [photos]);

  const reset = useCallback(() => {
    setPhotos({ protocolPhotos: [], namelistPhotos: [] });
    setResult(null);
    setErrorMsg("");
    setPhase("protocol");
  }, []);

  const totalPhotos = protocolCount + namelistCount;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-start px-4 py-8">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFileChange}
      />

      <div className="w-full max-w-md bg-white rounded-2xl shadow-sm p-6">
        <div className="flex items-center justify-between mb-1">
          <h1 className="text-xl font-semibold text-gray-800">Protokoll EU</h1>
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="text-xs text-gray-400 hover:text-gray-600"
          >
            Logga ut
          </button>
        </div>
        <p className="text-sm text-center text-gray-500 mb-6">Logen Derva</p>

        {/* === DRIVE CHECK PHASE === */}
        {phase === "drive-check" && (
          <div>
            {checkState === "idle" && (
              <div>
                <p className="text-center text-gray-700 font-medium mb-2">
                  Kontrollera Google Drive
                </p>
                <p className="text-sm text-center text-gray-500 mb-6">
                  Kontrollera att appen har åtkomst till Google Drive innan du fotograferar.
                </p>
                <button
                  onClick={handleDriveCheck}
                  className="w-full py-4 bg-blue-600 text-white rounded-xl font-semibold text-lg active:bg-blue-700"
                >
                  Kontrollera koppling
                </button>
              </div>
            )}

            {checkState === "checking" && (
              <div className="flex flex-col items-center py-8">
                <div className="w-14 h-14 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-6" />
                <p className="text-gray-700 font-medium">Kontrollerar Google Drive...</p>
              </div>
            )}

            {checkState === "fail" && (
              <div>
                <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mb-4 mx-auto">
                  <svg className="w-8 h-8 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <h2 className="text-lg font-semibold text-gray-800 mb-2 text-center">
                  Google Drive ej tillgänglig
                </h2>
                <p className="text-sm text-red-600 mb-6 text-center bg-red-50 rounded-lg p-3">
                  {checkError}
                </p>
                <button
                  onClick={handleContinueLocal}
                  className="w-full py-4 bg-blue-600 text-white rounded-xl font-semibold text-lg mb-3 active:bg-blue-700"
                >
                  Kör utan Google Drive
                </button>
                <button
                  onClick={() => { setCheckState("idle"); setCheckError(""); }}
                  className="w-full py-3 border-2 border-gray-200 text-gray-600 rounded-xl font-medium"
                >
                  Försök igen
                </button>
              </div>
            )}
          </div>
        )}

        {/* === PROTOCOL PHASE === */}
        {phase === "protocol" && (
          <div>
            <StepDots total={3} current={protocolCount} />
            <p className="text-center text-gray-700 font-medium mb-2">
              Protokollsida {protocolCount + 1} av 3
            </p>
            <p className="text-center text-sm text-gray-500 mb-6">
              {protocolCount === 0 && "Fotografera sida 1 (datum, §1–§3)"}
              {protocolCount === 1 && "Fotografera sida 2 (§4–§6)"}
              {protocolCount === 2 && "Fotografera sida 3 (§7–§10)"}
            </p>

            {protocolCount > 0 && (
              <div className="flex gap-3 mb-6 flex-wrap">
                {photos.protocolPhotos.map((f, i) => (
                  <PhotoThumb key={i} file={f} onRemove={() => removeProtocol(i)} />
                ))}
              </div>
            )}

            <button
              onClick={openCamera}
              className="w-full py-4 bg-blue-600 text-white rounded-xl font-semibold text-lg active:bg-blue-700"
            >
              Ta foto
            </button>

            {driveMode === "local" && (
              <p className="text-xs text-center text-orange-600 mt-3">
                Körs utan Google Drive – protokollet sparas lokalt
              </p>
            )}
          </div>
        )}

        {/* === NAMELIST PROMPT === */}
        {phase === "namelist-prompt" && (
          <div>
            <div className="flex gap-3 mb-6 flex-wrap">
              {photos.protocolPhotos.map((f, i) => (
                <PhotoThumb key={i} file={f} onRemove={() => removeProtocol(i)} />
              ))}
            </div>
            <p className="text-center text-gray-700 font-medium mb-2">
              Finns det namnlistor att fotografera?
            </p>
            <p className="text-sm text-center text-gray-500 mb-6">
              Namnlistor med gulmarkerade bröder (hälsningar)
            </p>
            <button
              onClick={() => setPhase("namelist")}
              className="w-full py-4 bg-blue-600 text-white rounded-xl font-semibold text-lg mb-3 active:bg-blue-700"
            >
              Ja, ta foto av namnlista
            </button>
            <button
              onClick={handleGenerate}
              className="w-full py-4 bg-green-600 text-white rounded-xl font-semibold text-lg active:bg-green-700"
            >
              Nej, generera protokoll
            </button>
          </div>
        )}

        {/* === NAMELIST PHASE === */}
        {phase === "namelist" && (
          <div>
            <p className="text-center text-gray-700 font-medium mb-2">
              Namnlista {namelistCount + 1}
            </p>
            <p className="text-sm text-center text-gray-500 mb-4">
              Fotografera namnlistan med gulmarkerade bröder
            </p>

            {namelistCount > 0 && (
              <div className="flex gap-3 mb-4 flex-wrap">
                {photos.namelistPhotos.map((f, i) => (
                  <PhotoThumb key={i} file={f} onRemove={() => removeNamelist(i)} />
                ))}
              </div>
            )}

            <button
              onClick={openCamera}
              className="w-full py-4 bg-blue-600 text-white rounded-xl font-semibold text-lg mb-3 active:bg-blue-700"
            >
              Ta foto
            </button>

            {namelistCount < 2 && (
              <button
                onClick={openCamera}
                className="w-full py-3 border-2 border-blue-300 text-blue-600 rounded-xl font-medium mb-3 active:bg-blue-50"
              >
                Lägg till ytterligare namnlista
              </button>
            )}

            <button
              onClick={handleGenerate}
              disabled={namelistCount === 0}
              className="w-full py-4 bg-green-600 text-white rounded-xl font-semibold text-lg active:bg-green-700 disabled:opacity-40"
            >
              Klar – generera protokoll
            </button>
          </div>
        )}

        {/* === PROCESSING === */}
        {phase === "processing" && (
          <div className="flex flex-col items-center py-8">
            <div className="w-14 h-14 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-6" />
            <p className="text-gray-700 font-medium text-lg">Genererar protokoll...</p>
            <p className="text-sm text-gray-500 mt-2 text-center">
              Claude läser handskriften och skapar dokumentet.
              <br />
              Det tar ungefär 30–60 sekunder.
            </p>
          </div>
        )}

        {/* === DONE === */}
        {phase === "done" && result && (
          <div className="flex flex-col items-center py-4">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
              <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-gray-800 mb-1">Klart!</h2>
            <p className="text-sm text-gray-600 mb-1">
              <span className="font-medium">{result.filename}</span>
            </p>

            {driveMode === "drive" ? (
              <p className="text-sm text-gray-500 mb-4 text-center">
                Sparad i Google Drive under D/protokoll
              </p>
            ) : (
              <p className="text-xs text-orange-600 mb-4 text-center bg-orange-50 rounded-lg p-2">
                Kördes utan Google Drive – ladda ner protokollet och fotona nedan
              </p>
            )}

            {driveMode === "drive" && result.driveLink && (
              <a
                href={result.driveLink}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full py-3 bg-blue-600 text-white rounded-xl font-semibold text-center mb-3 block"
              >
                Öppna i Google Drive
              </a>
            )}

            <button
              onClick={() => downloadDocx(result.docxBase64, result.filename)}
              className="w-full py-3 bg-indigo-600 text-white rounded-xl font-semibold mb-3 active:bg-indigo-700"
            >
              Ladda ner protokoll (.docx)
            </button>

            <button
              onClick={handleDownloadPhotos}
              className="w-full py-3 border-2 border-indigo-300 text-indigo-600 rounded-xl font-medium mb-4 active:bg-indigo-50"
            >
              Ladda ner foton ({totalPhotos} st)
            </button>

            <button
              onClick={reset}
              className="w-full py-3 border-2 border-gray-200 text-gray-600 rounded-xl font-medium"
            >
              Nytt protokoll
            </button>
          </div>
        )}

        {/* === ERROR === */}
        {phase === "error" && (
          <div className="flex flex-col items-center py-4">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-4">
              <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-gray-800 mb-2">Något gick fel</h2>
            <p className="text-sm text-red-600 mb-6 text-center bg-red-50 rounded-lg p-3">
              {errorMsg}
            </p>
            <button
              onClick={reset}
              className="w-full py-4 bg-blue-600 text-white rounded-xl font-semibold text-lg"
            >
              Försök igen
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
