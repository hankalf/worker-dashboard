import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/rbac";
import { logActivity } from "@/lib/activity";

export async function GET() {
  const positions = await prisma.position.findMany({
    include: { requiredRole: true },
    orderBy: { title: "asc" },
  });
  return NextResponse.json(positions);
}

export async function POST(req: Request) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { title, description, requiredRoleId } = await req.json();
  if (!title) {
    return NextResponse.json({ error: "Title is required" }, { status: 400 });
  }

  const position = await prisma.position.create({
    data: { title, description, requiredRoleId: requiredRoleId || null },
  });
  await logActivity("Position", `Added position ${position.title}`);
  return NextResponse.json(position, { status: 201 });
}
