import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/rbac";
import { logActivity } from "@/lib/activity";
import { getTabs } from "@/lib/tabs";

export const dynamic = "force-dynamic";

// Admin: the merged tab config (defaults + overrides) for the editor.
export async function GET() {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json(await getTabs());
}

// Admin: override a tab's name/description. Blank values revert to the default.
export async function PATCH(req: Request) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { key, name, description } = await req.json();
  if (!key) {
    return NextResponse.json({ error: "key is required" }, { status: 400 });
  }

  const upsert = async (settingKey: string, value: string) => {
    if (value.trim() === "") {
      await prisma.setting.deleteMany({ where: { key: settingKey } });
    } else {
      await prisma.setting.upsert({
        where: { key: settingKey },
        update: { value },
        create: { key: settingKey, value },
      });
    }
  };

  if (name !== undefined) await upsert(`tab.${key}.name`, name);
  if (description !== undefined) await upsert(`tab.${key}.desc`, description);
  await logActivity("Settings", `Updated tab "${key}"`);
  return NextResponse.json({ ok: true });
}
