import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";

// POST /api/admin-logout -> clear the admin session cookie.
export async function POST(_req: NextRequest) {
  try {
    const res = NextResponse.json({ ok: true });
    res.cookies.set("meridian_admin", "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
    return res;
  } catch (err) {
    return apiError("admin-logout", err);
  }
}
