// Accounts (Clerk) are only for the paid Plus Sync tier. The site runs without
// them: until both keys are set in the environment, sign-in pages explain that
// accounts aren't open yet and nothing Clerk-related loads.
export const clerkEnabled = Boolean(
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY
);
