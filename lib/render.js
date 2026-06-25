// render.js — turn collections into Markdown, HTML, and plain link lists.
// Pure and dependency-free so it's testable under Node (tools/test_render.mjs).

function htmlEscape(s = '') {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}

// Escape Markdown link/inline metacharacters in user text.
function mdEscape(s = '') {
  return String(s).replace(/([\\`*_[\]()])/g, '\\$1');
}

function fieldsText(item) {
  const f = item.fields;
  if (!f || typeof f !== 'object') return '';
  const parts = Object.keys(f)
    .filter((k) => f[k] !== '' && f[k] != null)
    .map((k) => `${k}: ${f[k]}`);
  return parts.length ? parts.join(', ') : '';
}

// ---- Markdown --------------------------------------------------------------

export function collectionToMarkdown(c) {
  const lines = [`## ${mdEscape(c.title || 'Untitled')}`, ''];
  if (Array.isArray(c.tags) && c.tags.length) {
    lines.push(`*Tags: ${c.tags.map(mdEscape).join(', ')}*`, '');
  }
  for (const it of c.items || []) {
    const box = it.done ? '[x]' : '[ ]';
    let line;
    if (it.type === 'note') {
      line = `- ${box} ${mdEscape((it.text || '').replace(/\s*\n\s*/g, ' '))}`;
    } else if (it.type === 'image') {
      const url = it.srcPageUrl || it.src || '';
      line = `- ${box} [${mdEscape(it.alt || 'Image')}](${url})`;
    } else {
      const url = it.url || '';
      line = `- ${box} [${mdEscape(it.title || url)}](${url})`;
      if (it.note) line += ` — ${mdEscape(it.note)}`;
    }
    const extra = fieldsText(it);
    if (extra) line += ` _(${mdEscape(extra)})_`;
    lines.push(line.trimEnd());
  }
  lines.push('');
  return lines.join('\n');
}

export function toMarkdown(collections = []) {
  return ['# Collections Plus export', '', ...collections.map(collectionToMarkdown)].join('\n');
}

// ---- HTML ------------------------------------------------------------------

function itemToHtml(it) {
  const box = `<input type="checkbox" disabled ${it.done ? 'checked' : ''}> `;
  const extra = fieldsText(it);
  const extraHtml = extra ? ` <span class="fields">(${htmlEscape(extra)})</span>` : '';
  if (it.type === 'note') {
    return `${box}<span class="note">${htmlEscape(it.text || '')}</span>${extraHtml}`;
  }
  if (it.type === 'image') {
    const url = it.srcPageUrl || it.src || '';
    return `${box}<a href="${htmlEscape(url)}">${htmlEscape(it.alt || 'Image')}</a>${extraHtml}`;
  }
  const url = it.url || '';
  const note = it.note ? ` — ${htmlEscape(it.note)}` : '';
  return `${box}<a href="${htmlEscape(url)}">${htmlEscape(it.title || url)}</a>${note}${extraHtml}`;
}

export function toHtml(collections = []) {
  const sections = collections
    .map((c) => {
      const items = (c.items || []).map((it) => `      <li>${itemToHtml(it)}</li>`).join('\n');
      const tags =
        Array.isArray(c.tags) && c.tags.length
          ? `\n    <p class="tags">${c.tags.map(htmlEscape).join(', ')}</p>`
          : '';
      return `  <section>\n    <h2>${htmlEscape(c.title || 'Untitled')}</h2>${tags}\n    <ul>\n${items}\n    </ul>\n  </section>`;
    })
    .join('\n');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Collections Plus export</title>
<style>
  body { font: 15px/1.5 system-ui, sans-serif; max-width: 760px; margin: 2rem auto; padding: 0 1rem; }
  h1 { font-size: 1.6rem; }
  h2 { font-size: 1.2rem; margin-top: 1.6rem; }
  ul { list-style: none; padding-left: 0; }
  li { padding: 3px 0; }
  .tags { color: #666; font-size: .9em; margin: .2rem 0; }
  .fields { color: #666; font-size: .9em; }
  a { color: #0f6cbd; text-decoration: none; }
  a:hover { text-decoration: underline; }
</style>
</head>
<body>
  <h1>Collections Plus export</h1>
${sections}
</body>
</html>
`;
}

// ---- Shareable page (self-contained single-collection HTML) ----------------

/** One card in the shareable grid: image/page/note rendered for reading. */
function itemToCard(it) {
  const fields = fieldsText(it);
  const fieldsHtml = fields ? `<p class="card-fields">${htmlEscape(fields)}</p>` : '';

  if (it.type === 'note') {
    return `    <li class="card card-note">
      <p class="card-note-text">${htmlEscape(it.text || '')}</p>${fieldsHtml ? `\n      ${fieldsHtml}` : ''}
    </li>`;
  }

  if (it.type === 'image') {
    const url = it.srcPageUrl || it.src || '';
    const src = it.src || '';
    const alt = it.alt || 'Image';
    const media = src
      ? `<a class="card-media" href="${htmlEscape(url)}"><img loading="lazy" src="${htmlEscape(src)}" alt="${htmlEscape(alt)}"></a>`
      : '';
    return `    <li class="card">
      ${media}
      <div class="card-body">
        <a class="card-title" href="${htmlEscape(url)}">${htmlEscape(alt)}</a>${fieldsHtml ? `\n        ${fieldsHtml}` : ''}
      </div>
    </li>`;
  }

  // page
  const url = it.url || '';
  const title = it.title || url;
  const note = it.note ? `<p class="card-note-text">${htmlEscape(it.note)}</p>` : '';
  const media = it.thumbnail
    ? `<a class="card-media" href="${htmlEscape(url)}"><img loading="lazy" src="${htmlEscape(it.thumbnail)}" alt=""></a>`
    : '';
  let host = '';
  try {
    host = url ? new URL(url).hostname.replace(/^www\./, '') : '';
  } catch {
    host = '';
  }
  return `    <li class="card">
      ${media}
      <div class="card-body">
        <a class="card-title" href="${htmlEscape(url)}">${htmlEscape(title)}</a>
        ${host ? `<p class="card-host">${htmlEscape(host)}</p>` : ''}${note ? `\n        ${note}` : ''}${fieldsHtml ? `\n        ${fieldsHtml}` : ''}
      </div>
    </li>`;
}

/**
 * Build a polished, fully self-contained HTML page for ONE collection — meant
 * to be sent to someone or hosted anywhere. Inline CSS, no external assets
 * (cached images are already data URLs); remote thumbnails are referenced.
 * Pure (no Date/DOM) so it's testable: pass a preformatted `date` string.
 */
export function toShareableHtml(collection, { date = '' } = {}) {
  const c = collection || {};
  const title = c.title || 'Untitled collection';
  const items = (c.items || []).map(itemToCard).join('\n');
  const count = (c.items || []).length;
  const tags =
    Array.isArray(c.tags) && c.tags.length
      ? `\n      <p class="tags">${c.tags.map((t) => `<span class="tag">${htmlEscape(t)}</span>`).join(' ')}</p>`
      : '';
  const sub = `${count} item${count === 1 ? '' : 's'}${date ? ` · shared ${htmlEscape(date)}` : ''}`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>${htmlEscape(title)} — Collections Plus</title>
<style>
  :root {
    --bg: #f6f6f6; --card: #fff; --text: #1b1b1b; --dim: #666; --border: #e2e2e2;
    --accent: #0f6cbd; --radius: 12px;
  }
  @media (prefers-color-scheme: dark) {
    :root { --bg: #1f1f1f; --card: #2b2b2b; --text: #f3f3f3; --dim: #aaa; --border: #3d3d3d; --accent: #4cc2ff; }
  }
  * { box-sizing: border-box; }
  body { font: 16px/1.55 system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
    background: var(--bg); color: var(--text); margin: 0; padding: 2.2rem 1rem 4rem; }
  .wrap { max-width: 900px; margin: 0 auto; }
  header { margin-bottom: 1.6rem; }
  h1 { font-size: 1.8rem; margin: 0 0 .25rem; }
  .sub { color: var(--dim); font-size: .92rem; }
  .tags { margin: .6rem 0 0; padding: 0; }
  .tag { display: inline-block; background: var(--card); border: 1px solid var(--border);
    border-radius: 999px; padding: 2px 10px; font-size: .82rem; color: var(--dim); }
  ul.grid { list-style: none; margin: 0; padding: 0;
    display: grid; gap: 14px; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); }
  .card { background: var(--card); border: 1px solid var(--border); border-radius: var(--radius);
    overflow: hidden; display: flex; flex-direction: column; }
  .card-media { display: block; aspect-ratio: 16 / 9; background: var(--bg); overflow: hidden; }
  .card-media img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .card-body { padding: 12px 14px; }
  .card-title { font-weight: 600; color: var(--text); text-decoration: none; }
  .card-title:hover { color: var(--accent); text-decoration: underline; }
  .card-host { color: var(--dim); font-size: .82rem; margin: .25rem 0 0; }
  .card-note-text { margin: .4rem 0 0; white-space: pre-wrap; }
  .card-note { background: linear-gradient(0deg, var(--card), var(--card)); }
  .card-note .card-note-text { margin: 14px; }
  .card-fields { color: var(--dim); font-size: .85rem; margin: .35rem 0 0; }
  footer { margin-top: 2.5rem; color: var(--dim); font-size: .85rem; text-align: center; }
  footer a { color: var(--accent); text-decoration: none; }
</style>
</head>
<body>
  <div class="wrap">
    <header>
      <h1>${htmlEscape(title)}</h1>
      <p class="sub">${sub}</p>${tags}
    </header>
    <ul class="grid">
${items}
    </ul>
    <footer>Shared from <a href="https://github.com/rod-trent/Collections-Plus">Collections Plus</a></footer>
  </div>
</body>
</html>
`;
}

// ---- Plain link list (clipboard) ------------------------------------------

export function toLinkList(c) {
  return (c.items || [])
    .filter((it) => it.type !== 'note')
    .map((it) => {
      const url = it.type === 'image' ? it.srcPageUrl || it.src || '' : it.url || '';
      const title = it.type === 'image' ? it.alt || 'Image' : it.title || url;
      return `${title} — ${url}`;
    })
    .join('\n');
}
