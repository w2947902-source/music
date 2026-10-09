import { NextResponse } from "next/server";

// Preserve the original demo files in Git while retiring their public URLs.
// The archive now serves every cover and excerpt through private Storage RLS.
export function proxy() {
  return new NextResponse("Not found", {
    status: 404,
    headers: { "Cache-Control": "no-store" },
  });
}

export const config = {
  matcher: ["/covers/:path*", "/audio/:path*"],
};
