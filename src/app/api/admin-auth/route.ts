import { NextRequest, NextResponse } from "next/server";
import { adminToken } from "@/lib/adminauth";
import { apiError } from "@/lib/api";

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
      const token = adminToken();
      const res = NextResponse.json({ ok: true, token });
      res.cookies.set("meridian_admin", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 30, // 30 days
      });
      return res;
    }
    return NextResponse.json({ error: "Incorrect password." }, { status: 401 });
  } catch (err) {
    return apiError("admin-auth", err);
  }
}
