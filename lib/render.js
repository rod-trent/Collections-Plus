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
