import { HELP_PAGES } from '../../lib/help.js';
import HelpNav from './help-nav.jsx';

export const metadata = { title: { default: 'Help', template: '%s · Help · Collections Plus' } };

export default function HelpLayout({ children }) {
  return (
    <div className="wrap help">
      <HelpNav pages={HELP_PAGES.map(({ slug, title }) => ({ slug, title }))} />
      <div className="help-body">{children}</div>
    </div>
  );
}
