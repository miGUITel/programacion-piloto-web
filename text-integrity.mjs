/** Locate damaged Unicode without copying field contents into diagnostics. */
export function findTextIntegrityIssues(value) {
  const issues = [], ancestors = new WeakSet();
  function check(text, path, location) {
    let replacements = 0, surrogates = 0;
    for (let index = 0; index < text.length; index += 1) {
      const code = text.charCodeAt(index);
      if (code === 0xfffd) replacements += 1;
      else if (code >= 0xd800 && code <= 0xdbff) {
        const next = text.charCodeAt(index + 1);
        if (next >= 0xdc00 && next <= 0xdfff) index += 1;
        else surrogates += 1;
      } else if (code >= 0xdc00 && code <= 0xdfff) surrogates += 1;
    }
    if (replacements) issues.push({ path, code: 'REPLACEMENT_CHARACTER', count: replacements, location });
    if (surrogates) issues.push({ path, code: 'UNPAIRED_SURROGATE', count: surrogates, location });
  }
  function walk(current, path) {
    if (typeof current === 'string') { check(current, path, 'value'); return; }
    if (!current || typeof current !== 'object' || ancestors.has(current)) return;
    ancestors.add(current);
    for (const [index, [key, child]] of Object.entries(current).entries()) {
      // Unusual keys are located by position rather than echoed as user content.
      const next = Array.isArray(current) && /^(?:0|[1-9]\d*)$/.test(key) ? `${path}[${key}]`
        : key.length <= 80 && /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key) ? `${path}.${key}` : `${path}[key#${index}]`;
      check(key, next, 'key');
      walk(child, next);
    }
    ancestors.delete(current);
  }
  walk(value, '$');
  return issues;
}
