import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/rbac";

export async function GET() {
  const tabs = await prisma.tab.findMany({ orderBy: { sortOrder: "asc" } });
  return NextResponse.json(tabs);
}

export async function POST(req: Request) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { name, description, sortOrder } = await req.json();
  if (!name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const tab = await prisma.tab.create({
    data: { name, description, sortOrder: sortOrder ?? 0 },
  });
  return NextResponse.json(tab, { status: 201 });
}
