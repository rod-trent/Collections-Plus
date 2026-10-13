// Shown on the account pages until Clerk keys are configured.
export default function NotOpen() {
  return (
    <div className="wrap narrow">
      <h1>Accounts aren’t open yet</h1>
      <p>
        Collections Plus accounts are for <strong>Plus Sync</strong>, our upcoming paid sync service.
        You don’t need one to use Collections Plus.
      </p>
      <p>
        To use the mobile app today, <a href="/app/">open it here</a> and connect your own Dropbox. Your
        library syncs with the desktop extension for free.
      </p>
    </div>
  );
}
