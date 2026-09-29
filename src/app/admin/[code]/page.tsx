import { notFound, redirect } from "next/navigation";
import { getOwnedEvent } from "@/server/session";
import { AdminClient } from "./AdminClient";

export default async function AdminPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const { user, event } = await getOwnedEvent(code);
  if (!user) redirect("/login");
  if (!event) notFound();
  return <AdminClient code={code} userName={user.name} />;
}
