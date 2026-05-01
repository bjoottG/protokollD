import Anthropic from "@anthropic-ai/sdk";
import type { ProtocolData } from "./types";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const PROTOCOL_EXTRACTION_PROMPT = `Du ser foton på ett handskrivet mötesprotokoll från logen Derva (Odd Fellows).
Det är tre A4-sidor med ett delvis förtryckt formulär där handskrivna delar ska extraheras.

Formuläret innehåller följande paragrafer:
- Sida 1: DATUM (längst upp), §1 (öppningstid och antal närvarande), §2 (ämbetsmän och eventuella ersättare), §3 (datum föregående möte)
- Sida 2: §4 (hälsotillståndet), §5 (Till Orden bästa), §6 (hälsningar frånvarande brr)
- Sida 3: §7 (inkomna skrivelser), §8 (Ordet fritt), §9 (datum nästa möte), §10 (avslutning)

Viktigt: Extrahera BARA vad som är handskrivet (inte den förtryckta texten i formuläret).

För §2: titta på ERSÄTTARE-kolumnen för varje rad.
- Om ett namn är ifyllt i ERSÄTTARE-kolumnen: lägg till {"role": "<ämbete>", "substitute": "<namn utan br-prefix>"}
- Om "Vakant" är skrivet i ERSÄTTARE-kolumnen: lägg till {"role": "<ämbete>", "substitute": "Vakant"}
- Specifikt: kolla om "TjOÄ Daniel Wikberg" har en ersättare — fyll i ersättarens namn i "tjOASubstitute".

För §6: extrahera alla handskrivna namn och texter under §6 (hälsningar från frånvarande bröder).
Returnera varje namn/rad som ett eget element i "absentGreetings".

Returnera EXAKT följande JSON-format (ingen annan text):
{
  "meetingDate": "ÅÅÅÅ-MM-DD",
  "weekday": "lördagen|tisdagen|måndagen|onsdagen|torsdagen|fredagen|söndagen",
  "meetingType": "ordinarie Eubatmöte",
  "openingTime": "HH:MM",
  "attendeeCount": "24",
  "officersAllOrdinarie": true|false,
  "officerSubstitutes": [{"role": "SkattMästare", "substitute": "Erik Andersson"}, {"role": "Arkivarie", "substitute": "Vakant"}],
  "tjOASubstitute": null,
  "healthStatus": ["rad 1", "rad 2"],
  "forOrdersBest": ["rad 1", "rad 2"],
  "absentGreetings": ["Namn1", "Namn2"],
  "incomingDocuments": ["rad 1"],
  "openDiscussion": ["Namn: text", "Namn2: text2"],
  "nextMeetingWeekday": "tisdagen|lördagen|etc",
  "nextMeetingDate": "ÅÅÅÅ-MM-DD",
  "closingTime": "HH:MM",
  "ideellt": null
}

Om något fält är tomt eller oläsbart, använd tom lista [] eller null.
tjOASubstitute ska vara null om Daniel Wikberg inte har någon ersättare.
officerSubstitutes ska vara [] om alla ämbetsmän är ordinarie.`;

const NAMELIST_PROMPT = `Du ser ett eller flera foton på namnlistor.
Vissa namn är markerade/gulmarkerade (highlighted i gult).

Returnera EXAKT följande JSON-format (ingen annan text):
{
  "highlightedNames": ["Förnamn Efternamn", "Förnamn2 Efternamn2"]
}

Ta med ALLA gulmarkerade namn du kan se. Om inget namn är gulmarkerat, returnera tom lista.`;

export async function analyzeProtocolPhotos(
  imageBuffers: Buffer[]
): Promise<ProtocolData> {
  const imageContent = imageBuffers.map((buf) => ({
    type: "image" as const,
    source: {
      type: "base64" as const,
      media_type: "image/jpeg" as const,
      data: buf.toString("base64"),
    },
  }));

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2048,
    messages: [
      {
        role: "user",
        content: [
          ...imageContent,
          { type: "text", text: PROTOCOL_EXTRACTION_PROMPT },
        ],
      },
    ],
  });

  const text =
    response.content[0].type === "text" ? response.content[0].text : "";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Claude returnerade inget giltigt JSON");

  const parsed = JSON.parse(jsonMatch[0]);
  return {
    ...parsed,
    absentGreetings: parsed.absentGreetings ?? [],
    officerSubstitutes: parsed.officerSubstitutes ?? [],
  } as ProtocolData;
}

export async function analyzeNamelistPhotos(
  imageBuffers: Buffer[]
): Promise<string[]> {
  if (imageBuffers.length === 0) return [];

  const imageContent = imageBuffers.map((buf) => ({
    type: "image" as const,
    source: {
      type: "base64" as const,
      media_type: "image/jpeg" as const,
      data: buf.toString("base64"),
    },
  }));

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: [
          ...imageContent,
          { type: "text", text: NAMELIST_PROMPT },
        ],
      },
    ],
  });

  const text =
    response.content[0].type === "text" ? response.content[0].text : "";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return [];

  const parsed = JSON.parse(jsonMatch[0]);
  return parsed.highlightedNames ?? [];
}
