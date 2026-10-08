import { NextResponse, type NextRequest } from "next/server";
import { COOKIE_SESION } from "@/lib/session";

export function GET(request: NextRequest) {
  const res = NextResponse.redirect(new URL("/login", request.url));
  res.cookies.delete(COOKIE_SESION);
  return res;
}
