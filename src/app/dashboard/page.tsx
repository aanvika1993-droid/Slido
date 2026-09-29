import { redirect } from "next/navigation";
import { HostHeader } from "@/components/HostHeader";
import { prisma } from "@/server/db";
import { getCurrentUser } from "@/server/session";
import { DashboardClient } from "./DashboardClient";

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const events = await prisma.event.findMany({
    where: { ownerId: user.id },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { participants: true, questions: true, polls: true } } },
  });
  return (
    <div className="min-h-screen">
      <HostHeader userName={user.name} />
      <DashboardClient
        events={events.map((e) => ({
          code: e.code,
          name: e.name,
          archived: e.archived,
          startsAt: e.startsAt.toISOString(),
          participants: e._count.participants,
          questions: e._count.questions,
          polls: e._count.polls,
        }))}
      />
    </div>
  );
}
