export interface OfficerSubstitute {
  role: string;
  substitute: string;
}

export interface ProtocolData {
  meetingDate: string;
  weekday: string;
  meetingType: string;
  openingTime: string;
  attendeeCount: string;
  officersAllOrdinarie: boolean;
  officerSubstitutes: OfficerSubstitute[];
  tjOASubstitute?: string;
  healthStatus: string[];
  forOrdersBest: string[];
  absentGreetings: string[];
  ideellt?: string[];
  incomingDocuments: string[];
  openDiscussion: string[];
  nextMeetingWeekday: string;
  nextMeetingDate: string;
  closingTime: string;
  extraSections?: { number: number; title: string; content: string[] }[];
}
