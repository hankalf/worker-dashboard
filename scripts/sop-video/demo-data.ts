// Demo dataset for the SOP walkthrough recording. Local dev DB only.
import { PrismaClient } from "../../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

type Emp = {
  name: string;
  pos: string;
  shift: "FIRST" | "SECOND" | "THIRD";
  caps: string[];
  eq: string[];
  lead?: boolean;
  lunch?: string;
  att?: "PRESENT" | "ABSENT" | "CALLED_OUT" | "PTO";
};

async function seedLocation(
  name: string,
  slug: string,
  positions: {
    title: string;
    min1: number;
    min2: number;
    reqEq?: string;
    reqCap?: string;
  }[],
  caps: string[],
  equipment: string[],
  employees: Emp[],
  notices: string[]
) {
  const loc = await prisma.location.upsert({
    where: { slug },
    update: { name },
    create: { name, slug },
  });
  const L = loc.id;

  const capRows: Record<string, string> = {};
  for (const [i, c] of caps.entries()) {
    const row = await prisma.capability.upsert({
      where: { locationId_name: { locationId: L, name: c } },
      update: { sortOrder: i },
      create: { locationId: L, name: c, sortOrder: i },
    });
    capRows[c] = row.id;
  }

  const eqRows: Record<string, string> = {};
  for (const e of equipment) {
    const row = await prisma.role.upsert({
      where: { locationId_name: { locationId: L, name: e } },
      update: {},
      create: { locationId: L, name: e },
    });
    eqRows[e] = row.id;
  }

  const posRows: Record<string, string> = {};
  for (const [i, p] of positions.entries()) {
    const row = await prisma.position.upsert({
      where: { locationId_title: { locationId: L, title: p.title } },
      update: {
        sortOrder: i,
        minFirst: p.min1,
        minSecond: p.min2,
        requiredRoleId: p.reqEq ? eqRows[p.reqEq] : null,
        requiredCapabilityId: p.reqCap ? capRows[p.reqCap] : null,
      },
      create: {
        locationId: L,
        title: p.title,
        sortOrder: i,
        minFirst: p.min1,
        minSecond: p.min2,
        requiredRoleId: p.reqEq ? eqRows[p.reqEq] : null,
        requiredCapabilityId: p.reqCap ? capRows[p.reqCap] : null,
      },
    });
    posRows[p.title] = row.id;
  }

  for (const e of employees) {
    const existing = await prisma.employee.findFirst({
      where: { locationId: L, name: e.name },
    });
    const data = {
      locationId: L,
      name: e.name,
      positionId: posRows[e.pos] ?? null,
      shift: e.shift,
      isLead: !!e.lead,
      attendance: e.att ?? ("PRESENT" as const),
      lunchStart: e.lunch ?? null,
    };
    const caps = e.caps.map((c) => ({ id: capRows[c] }));
    const eqs = e.eq.map((x) => ({ id: eqRows[x] }));
    if (existing) {
      await prisma.employee.update({
        where: { id: existing.id },
        data: { ...data, capabilities: { set: caps }, roles: { set: eqs } },
      });
    } else {
      await prisma.employee.create({
        data: { ...data, capabilities: { connect: caps }, roles: { connect: eqs } },
      });
    }
  }

  await prisma.announcement.deleteMany({ where: { locationId: L } });
  for (const m of notices) {
    await prisma.announcement.create({ data: { locationId: L, message: m } });
  }

  return L;
}

async function main() {
  const main = await seedLocation(
    "Main Warehouse",
    "default",
    [
      { title: "Receiving", min1: 3, min2: 2, reqCap: "Receive" },
      { title: "Put-away", min1: 2, min2: 2, reqEq: "Reach Truck" },
      { title: "Picking", min1: 4, min2: 3, reqCap: "Pick" },
      { title: "Shipping", min1: 3, min2: 2, reqCap: "Ship" },
      { title: "Cycle Count", min1: 1, min2: 1 },
    ],
    ["Receive", "Put-away", "Pick", "Ship", "Cycle Count", "DAX"],
    ["Sit-down Forklift", "Reach Truck", "Order Picker", "Electric Pallet Jack", "Clamp Truck"],
    [
      { name: "Dennis Reyes", pos: "Receiving", shift: "FIRST", caps: ["Receive", "DAX"], eq: ["Sit-down Forklift", "Electric Pallet Jack"], lead: true, lunch: "11:00" },
      { name: "Donovan Lake", pos: "Receiving", shift: "FIRST", caps: ["Receive"], eq: ["Electric Pallet Jack"], lunch: "11:30" },
      { name: "Percy Adams", pos: "Receiving", shift: "FIRST", caps: ["Receive", "Put-away"], eq: ["Reach Truck"], lunch: "12:00" },
      { name: "Omar Castillo", pos: "Put-away", shift: "FIRST", caps: ["Put-away", "DAX"], eq: ["Reach Truck", "Sit-down Forklift"], lead: true, lunch: "11:15" },
      { name: "Marcus Bell", pos: "Put-away", shift: "FIRST", caps: ["Put-away"], eq: ["Reach Truck"], lunch: "11:45" },
      { name: "Tina Alvarez", pos: "Picking", shift: "FIRST", caps: ["Pick", "Cycle Count"], eq: ["Order Picker"], lead: true, lunch: "11:00" },
      { name: "Ray Whitfield", pos: "Picking", shift: "FIRST", caps: ["Pick"], eq: ["Order Picker", "Electric Pallet Jack"], lunch: "11:30" },
      { name: "Nina Ortega", pos: "Picking", shift: "FIRST", caps: ["Pick", "Ship"], eq: ["Electric Pallet Jack"], lunch: "12:00" },
      { name: "Curtis Mabry", pos: "Picking", shift: "FIRST", caps: ["Pick"], eq: [], att: "CALLED_OUT" },
      { name: "Gloria Pham", pos: "Shipping", shift: "FIRST", caps: ["Ship", "DAX"], eq: ["Sit-down Forklift"], lead: true, lunch: "11:15" },
      { name: "Andre Solis", pos: "Shipping", shift: "FIRST", caps: ["Ship"], eq: ["Clamp Truck"], lunch: "11:45" },
      { name: "Kayla Brennan", pos: "Cycle Count", shift: "FIRST", caps: ["Cycle Count", "DAX"], eq: ["Order Picker"], lunch: "12:15" },
      { name: "Victor Nunez", pos: "Receiving", shift: "SECOND", caps: ["Receive"], eq: ["Sit-down Forklift"], lead: true },
      { name: "Sasha Klein", pos: "Picking", shift: "SECOND", caps: ["Pick"], eq: ["Order Picker"] },
      { name: "Terrell Hughes", pos: "Shipping", shift: "SECOND", caps: ["Ship"], eq: ["Electric Pallet Jack"] },
      { name: "Priya Raman", pos: "Put-away", shift: "SECOND", caps: ["Put-away"], eq: ["Reach Truck"], att: "PTO" },
      { name: "Wes Donnelly", pos: "Picking", shift: "THIRD", caps: ["Pick", "Cycle Count"], eq: ["Order Picker"] },
      { name: "Ingrid Vasquez", pos: "Receiving", shift: "THIRD", caps: ["Receive"], eq: ["Electric Pallet Jack"], lead: true },
    ],
    [
      "Safety stand-down at 10:00 in the break room — all shifts.",
      "Dock 12 is down for repair until Thursday.",
    ]
  );

  await seedLocation(
    "Production Warehouse",
    "production",
    [
      { title: "Line 1", min1: 4, min2: 4 },
      { title: "Line 2", min1: 4, min2: 4 },
      { title: "Materials", min1: 2, min2: 2, reqEq: "Sit-down Forklift" },
      { title: "QA", min1: 1, min2: 1 },
    ],
    ["Assembly", "Materials", "QA", "Changeover"],
    ["Sit-down Forklift", "Electric Pallet Jack", "Scissor Lift"],
    [
      { name: "Hector Lim", pos: "Line 1", shift: "FIRST", caps: ["Assembly", "Changeover"], eq: [], lead: true },
      { name: "Bea Ferrer", pos: "Line 1", shift: "FIRST", caps: ["Assembly"], eq: [] },
      { name: "Joel Ramsey", pos: "Line 2", shift: "FIRST", caps: ["Assembly"], eq: [] },
      { name: "Dana Whitlow", pos: "Materials", shift: "FIRST", caps: ["Materials"], eq: ["Sit-down Forklift"], lead: true },
      { name: "Sam Okafor", pos: "QA", shift: "FIRST", caps: ["QA"], eq: [] },
    ],
    ["Line 2 changeover to SKU 4471 after first break."]
  );

  // Side tasks on the main location
  await prisma.job.deleteMany({ where: { locationId: main } });
  const tina = await prisma.employee.findFirst({
    where: { locationId: main, name: "Tina Alvarez" },
  });
  await prisma.job.createMany({
    data: [
      { locationId: main, title: "Sweep aisle 4 and stage empty pallets", priority: 2, status: "UNASSIGNED" },
      { locationId: main, title: "Rewrap the damaged skid at door 9", priority: 3, status: "ASSIGNED", assignedEmployeeId: tina?.id ?? null },
      { locationId: main, title: "Charge the spare pallet jacks overnight", priority: 1, status: "UNASSIGNED" },
    ],
  });

  // Handoff note for 1st shift on the main location only
  await prisma.shiftNote.deleteMany({ where: { locationId: main } });
  await prisma.shiftNote.create({
    data: {
      locationId: main,
      shift: "FIRST",
      message: "Two hot loads for door 23 land before 10am — Dennis has the paperwork.",
      updatedByName: "Gloria Pham",
    },
  });

  // A registered wall screen for the fleet demo
  await prisma.screen.deleteMany({ where: { locationId: main } });
  await prisma.screen.create({
    data: {
      locationId: main,
      name: "Receiving Office TV",
      token: "demo-screen-token-main",
      lastSeenAt: new Date(),
    },
  });

  console.log("demo data ready");
}

main().finally(() => prisma.$disconnect());
