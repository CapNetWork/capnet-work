import { NextResponse } from "next/server";

export function middleware(request) {
  const host = request.headers.get("host") || "";
  const url = request.nextUrl;

  // Redirect clickr.cc (non-www) to www.clickr.cc
  if (host === "clickr.cc" || host.startsWith("clickr.cc:")) {
    const newUrl = url.clone();
    newUrl.protocol = "https:";
    newUrl.host = "www.clickr.cc";
    return NextResponse.redirect(newUrl, 301);
  }

  return NextResponse.next();
}
