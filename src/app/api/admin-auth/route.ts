import { NextRequest, NextResponse } from "next/server";
import { adminToken } from "@/lib/adminauth";

// POST /api/admin-auth -> verify the admin password (set in env)
export async function POST(req: NextRequest) {
  try {
    const { password } = await req.json();
    const expected = process.env.ADMIN_PASSWORD;
    if (!expected) {
      return NextResponse.json(
        { error: "ADMIN_PASSWORD is not configured on the server." },
        { status: 500 }
      );
    }
    if (password === expected) {
      return NextResponse.json({ ok: true, token: adminToken() });
    }
    return NextResponse.json({ error: "Incorrect password." }, { status: 401 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
