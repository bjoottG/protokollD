"use client";

import { useRef, useState, useCallback } from "react";

type Phase = "protocol" | "namelist-prompt" | "namelist" | "processing" | "done" | "error";

interface PhotoSet {
  protocolPhotos: File[];
  namelistPhotos: File[];
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
  const [phase, setPhase] = useState<Phase>("protocol");
  const [photos, setPhotos] = useState<PhotoSet>({ protocolPhotos: [], namelistPhotos: [] });
  const [result, setResult] = useState<{ filename: string; driveLink: string } | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const protocolCount = photos.protocolPhotos.length;
  const namelistCount = photos.namelistPhotos.length;

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
      const fd = new FormData();
      photos.protocolPhotos.forEach((f, i) => fd.append(`protocol_${i + 1}`, f));
      photos.namelistPhotos.forEach((f, i) => fd.append(`namelist_${i + 1}`, f));

      const res = await fetch("/api/generate", { method: "POST", body: fd });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error ?? "Serverfel");
      setResult(data);
      setPhase("done");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Okänt fel");
      setPhase("error");
    }
  }, [photos]);

  const reset = useCallback(() => {
    setPhotos({ protocolPhotos: [], namelistPhotos: [] });
    setResult(null);
    setErrorMsg("");
    setPhase("protocol");
  }, []);

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
        <h1 className="text-xl font-semibold text-center text-gray-800 mb-1">
          Protokoll EU
        </h1>
        <p className="text-sm text-center text-gray-500 mb-6">Logen Derva</p>

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
            <p className="text-sm text-gray-500 mb-6 text-center">
              Sparad i Google Drive under D/protokoll
            </p>
            {result.driveLink && (
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
