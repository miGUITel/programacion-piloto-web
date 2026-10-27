import { safeResourceUrl } from './resources.mjs?v=20261027-rf32';
// Text-only Markdown subset: never interpret HTML, scripts, embeds or remote images.
const el = (tag, value) => { const node = document.createElement(tag); if (value !== undefined) node.textContent = value; return node; };
function inline(parent, text) {
  const pattern = /`([^`]+)`|\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^\s)]+)\)/g;
  let end = 0;
  for (const match of text.matchAll(pattern)) {
    parent.append(document.createTextNode(text.slice(end, match.index)));
    if (match[1] !== undefined) parent.append(el('code', match[1]));
    else if (match[2] !== undefined) parent.append(el('strong', match[2]));
    else if (safeResourceUrl(match[4], true)) {
      const link = el('a', match[3]); link.href = match[4]; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.referrerPolicy = 'no-referrer'; parent.append(link);
    } else parent.append(document.createTextNode(match[0]));
    end = match.index + match[0].length;
  }
  parent.append(document.createTextNode(text.slice(end)));
}
export function renderPrivateMarkdown(parent, content) {
  parent.replaceChildren();
  let code = null, list = null, paragraph = [];
  function flush() { if (paragraph.length) { const p = el('p'); inline(p, paragraph.join('\n')); parent.append(p); paragraph = []; } list = null; }
  for (const line of content.replace(/\r\n/g, '\n').split('\n')) {
    if (/^\s*```/.test(line)) { flush(); if (code) code = null; else { const pre = el('pre'); code = el('code', ''); pre.append(code); parent.append(pre); } continue; }
    if (code) { code.textContent += line + '\n'; continue; }
    if (!line.trim()) { flush(); continue; }
    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    if (heading) { flush(); const h = el('h' + Math.min(heading[1].length + 1, 6)); inline(h, heading[2]); parent.append(h); continue; }
    const bullet = /^\s*(?:[-*+]\s+|\d+[.)]\s+)(.+)$/.exec(line);
    if (bullet) { if (paragraph.length) flush(); if (!list) { list = el('ul'); parent.append(list); } const li = el('li'); inline(li, bullet[1]); list.append(li); continue; }
    if (list) list = null;
    if (/^\s*\|/.test(line)) { flush(); parent.append(el('pre', line)); continue; }
    paragraph.push(line);
  }
  flush();
}
