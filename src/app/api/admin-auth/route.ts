import { guardLogin } from "@/lib/login-limit";
import { SESSION_SECONDS } from "@/lib/session";
import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { adminToken } from "@/lib/adminauth";
import { apiError } from "@/lib/api";

// POST /api/admin-auth -> verify the admin password (set in env)
export async function POST(req: NextRequest) {
  try {
    const limited = await guardLogin("admin");
    if (limited) return limited;
    const { password } = await req.json();
    const expected = process.env.ADMIN_PASSWORD;
    if (!expected) {
      return NextResponse.json(
        { error: "ADMIN_PASSWORD is not configured on the server." },
        { status: 500 }
      );
    }
    const supplied = typeof password === "string" ? Buffer.from(password) : Buffer.alloc(0);
    const wanted = Buffer.from(expected);
    if (supplied.length === wanted.length && timingSafeEqual(supplied, wanted)) {
      const token = adminToken();
      const res = NextResponse.json({ ok: true, token });
      res.cookies.set("meridian_admin", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: SESSION_SECONDS,
      });
      return res;
    }
    return NextResponse.json({ error: "Incorrect password." }, { status: 401 });
  } catch (err) {
    return apiError("admin-auth", err);
  }
}
