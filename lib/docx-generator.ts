import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  AlignmentType,
  TabStopPosition,
  TabStopType,
} from "docx";
import type { ProtocolData } from "./types";

const SWEDISH_MONTHS = [
  "januari", "februari", "mars", "april", "maj", "juni",
  "juli", "augusti", "september", "oktober", "november", "december",
];

function swedishOrdinal(day: number): string {
  const lastTwo = day % 100;
  const last = day % 10;
  if ((last === 1 || last === 2) && lastTwo !== 11 && lastTwo !== 12) return ":a";
  return ":e";
}

function formatDate(dateStr: string): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  return `${day}${swedishOrdinal(day)} ${SWEDISH_MONTHS[month - 1]} ${year}`;
}

function p(text: string): Paragraph {
  return new Paragraph({ children: [new TextRun(text)] });
}

function empty(): Paragraph {
  return new Paragraph({});
}

function sectionHeader(n: number): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text: `§ ${n}`, bold: true })],
    alignment: AlignmentType.CENTER,
  });
}

function bold(text: string): Paragraph {
  return new Paragraph({ children: [new TextRun({ text, bold: true })] });
}

export async function generateProtocolDocx(data: ProtocolData): Promise<Buffer> {
  const paragraphs: Paragraph[] = [];

  // --- Title ---
  const formattedDate = formatDate(data.meetingDate);
  paragraphs.push(
    p(`Protokoll fört vid logen Dervas ${data.meetingType} ${data.weekday} den ${formattedDate}.`)
  );
  paragraphs.push(empty());

  // --- § 1 ---
  paragraphs.push(sectionHeader(1));
  paragraphs.push(empty());
  paragraphs.push(p("Iv informerade om brandsäkerhet och utrymningsvägar. "));
  paragraphs.push(empty());
  paragraphs.push(
    p(`ÄÄ öppnade mötet kl. ${data.openingTime} med att hälsa de närvarande brr. varmt välkomna till kvällens möte.`)
  );
  paragraphs.push(p(`MÄ läste namnen på de ${data.attendeeCount} närvarande brr. `));
  paragraphs.push(empty());

  // --- § 2 ---
  paragraphs.push(sectionHeader(2));
  paragraphs.push(empty());
  if (data.officersAllOrdinarie && data.officerSubstitutes.length === 0) {
    paragraphs.push(p("Lästes förteckning över tjänstgörande ämbetsmän för dagen alla ordinarie"));
  } else {
    paragraphs.push(p("Lästes förteckning över tjänstgörande ämbetsmän för dagen alla ordinarie"));
    paragraphs.push(p("Med undantag av:"));
    for (const sub of data.officerSubstitutes) {
      paragraphs.push(p(sub));
    }
  }
  if (data.rslSlTrustee) {
    paragraphs.push(p(`RSL:s och SL:s förtroendeman i logen är ${data.rslSlTrustee}`));
  }
  paragraphs.push(empty());

  // --- § 3 ---
  paragraphs.push(sectionHeader(3));
  paragraphs.push(empty());
  paragraphs.push(p("Lästes protokoll från föregående möte i denna grad och justerades i befintligt skick."));
  paragraphs.push(empty());

  // --- § 4 ---
  paragraphs.push(sectionHeader(4));
  paragraphs.push(empty());
  paragraphs.push(p("Hälsotillståndet bland bröderna är vad MÄ känner till gott."));
  for (const line of data.healthStatus) {
    if (line.trim()) paragraphs.push(p(line));
  }
  paragraphs.push(empty());

  // --- § 5 ---
  paragraphs.push(sectionHeader(5));
  paragraphs.push(empty());
  paragraphs.push(p("Till Ordens bästa: "));
  for (const line of data.forOrdersBest) {
    if (line.trim()) paragraphs.push(p(line));
  }
  paragraphs.push(empty());

  // --- § 6 ---
  paragraphs.push(sectionHeader(6));
  paragraphs.push(empty());
  paragraphs.push(p("Hälsningar från frånvarande brr: "));
  if (data.absentGreetings.length > 0) {
    paragraphs.push(p(data.absentGreetings.join(", ")));
  }
  paragraphs.push(empty());

  // Dynamic middle sections – §7, §8, etc.
  let nextParaNum = 7;

  if (data.ideellt && data.ideellt.length > 0) {
    paragraphs.push(sectionHeader(nextParaNum));
    nextParaNum++;
    paragraphs.push(empty());
    paragraphs.push(bold("Ideellt:"));
    for (const line of data.ideellt) {
      if (line.trim()) paragraphs.push(p(line));
    }
    paragraphs.push(empty());
  }

  if (data.incomingDocuments.length > 0 || true) {
    paragraphs.push(sectionHeader(nextParaNum));
    nextParaNum++;
    paragraphs.push(empty());
    paragraphs.push(p("Inkomna skrivelser: "));
    for (const line of data.incomingDocuments) {
      if (line.trim()) paragraphs.push(p(line));
    }
    paragraphs.push(empty());
  }

  if (data.openDiscussion.length > 0 || true) {
    paragraphs.push(sectionHeader(nextParaNum));
    nextParaNum++;
    paragraphs.push(empty());
    paragraphs.push(p("Ordet fritt"));
    for (const line of data.openDiscussion) {
      if (line.trim()) paragraphs.push(p(line));
    }
    paragraphs.push(empty());
  }

  // Extra custom sections
  if (data.extraSections) {
    for (const section of data.extraSections) {
      paragraphs.push(sectionHeader(nextParaNum));
      nextParaNum++;
      paragraphs.push(empty());
      if (section.title) paragraphs.push(p(section.title));
      for (const line of section.content) {
        if (line.trim()) paragraphs.push(p(line));
      }
      paragraphs.push(empty());
    }
  }

  // --- Next meeting ---
  paragraphs.push(sectionHeader(nextParaNum));
  nextParaNum++;
  paragraphs.push(empty());
  const nextDate = formatDate(data.nextMeetingDate);
  paragraphs.push(
    p(`Datum för nästa möte i denna grad äger rum ${data.nextMeetingWeekday} den ${nextDate}.  `)
  );
  paragraphs.push(empty());

  // --- Closing ---
  paragraphs.push(sectionHeader(nextParaNum));
  paragraphs.push(empty());
  paragraphs.push(p(`ÄÄ avslutade mötet kl: ${data.closingTime}. `));
  paragraphs.push(empty());
  paragraphs.push(
    new Paragraph({
      children: [new TextRun({ text: "\t\t\tJusteras", bold: false })],
    })
  );
  paragraphs.push(empty());
  paragraphs.push(empty());
  paragraphs.push(
    p(
      "______________________                                                 _________________________"
    )
  );
  paragraphs.push(
    p(
      "Skr.                                                                                      ÄÄ "
    )
  );

  const doc = new Document({
    sections: [{ properties: {}, children: paragraphs }],
  });

  const buffer = await Packer.toBuffer(doc);
  return Buffer.from(buffer);
}

export function buildFilename(meetingDate: string): string {
  // ÅÅMMDD Protokoll EU.docx
  const parts = meetingDate.split("-");
  const yy = parts[0].slice(-2);
  const mm = parts[1];
  const dd = parts[2];
  return `${yy}${mm}${dd} Protokoll EU.docx`;
}
