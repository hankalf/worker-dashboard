import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Current signed-in user's access level, used for client-side route guards.
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ accessLevel: "NONE" });
  }
  const employee = await prisma.employee.findUnique({
    where: { id: session.user.id },
    select: { id: true, name: true, accessLevel: true },
  });
  return NextResponse.json({
    id: employee?.id ?? null,
    name: employee?.name ?? null,
    accessLevel: employee?.accessLevel ?? "NONE",
  });
}
