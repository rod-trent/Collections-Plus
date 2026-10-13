import { SignUp } from '@clerk/nextjs';
import { clerkEnabled } from '../../../../lib/clerk.js';
import NotOpen from '../../not-open.jsx';

export const metadata = { title: 'Create your account' };

export default function Page() {
  if (!clerkEnabled) return <NotOpen />;
  return (
    <div className="center">
      <SignUp />
    </div>
  );
}
