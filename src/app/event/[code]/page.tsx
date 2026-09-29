import { ParticipantClient } from "./ParticipantClient";

export default async function EventPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <ParticipantClient code={code} />;
}
