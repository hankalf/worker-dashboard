import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/rbac";
import { logActivity } from "@/lib/activity";

// "Roles" = job functions an employee can perform (Capability model).
export async function GET() {
  const roles = await prisma.capability.findMany({ orderBy: { name: "asc" } });
  return NextResponse.json(roles);
}

export async function POST(req: Request) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { name } = await req.json();
  if (!name || !name.trim()) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  try {
    const role = await prisma.capability.create({ data: { name: name.trim() } });
    await logActivity("Role", `Added role ${role.name}`);
    return NextResponse.json(role, { status: 201 });
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") {
      return NextResponse.json(
        { error: `A role named "${name}" already exists` },
        { status: 400 }
      );
    }
    throw error;
  }
}
