// Account pages are the only part of the site that loads Clerk.
import { ClerkProvider } from '@clerk/nextjs';
import { clerkEnabled } from '../../lib/clerk.js';

export default function AccountLayout({ children }) {
  if (!clerkEnabled) return children;
  return <ClerkProvider>{children}</ClerkProvider>;
}
