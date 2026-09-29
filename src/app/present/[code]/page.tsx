import { notFound, redirect } from "next/navigation";
import { getOwnedEvent } from "@/server/session";
import { PresentClient } from "./PresentClient";

export default async function PresentPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const { user, event } = await getOwnedEvent(code);
  if (!user) redirect("/login");
  if (!event) notFound();
  return <PresentClient code={code} />;
}
