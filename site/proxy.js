// proxy.js — runs before matching requests.
//  • /app → /app/: the mobile web app needs the trailing slash so its relative
//    paths and service-worker scope resolve.
//  • Clerk runs only on the account pages. The landing page and the mobile web
//    app never touch Clerk, so free users load no account scripts and get no
//    auth cookies.
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { clerkEnabled } from './lib/clerk.js';

const isProtected = createRouteMatcher(['/account(.*)']);
const clerk = clerkEnabled
  ? clerkMiddleware(async (auth, req) => {
      if (isProtected(req)) await auth.protect();
    })
  : null;

export default function proxy(req, event) {
  const { pathname } = req.nextUrl;
  if (pathname === '/app') return NextResponse.redirect(new URL('/app/', req.url), 308);
  if (pathname === '/app/') return NextResponse.next();
  return clerk ? clerk(req, event) : NextResponse.next();
}

export const config = {
  matcher: ['/app', '/account(.*)', '/sign-in(.*)', '/sign-up(.*)'],
};
