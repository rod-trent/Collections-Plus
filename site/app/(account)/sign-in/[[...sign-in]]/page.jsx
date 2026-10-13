import { SignIn } from '@clerk/nextjs';
import { clerkEnabled } from '../../../../lib/clerk.js';
import NotOpen from '../../not-open.jsx';

export const metadata = { title: 'Sign in' };

export default function Page() {
  if (!clerkEnabled) return <NotOpen />;
  return (
    <div className="center">
      <SignIn />
    </div>
  );
}
