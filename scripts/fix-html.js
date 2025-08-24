const fs = require('fs');

function fixFile(path) {
  if (!fs.existsSync(path)) return { path, skipped: true };
  const orig = fs.readFileSync(path, 'utf8');
  let s = orig;

  // Work on <script>...</script> blocks only
  s = s.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, block => {
    let b = block;

    // 1) Fix accidental " | | " → " || "
    b = b.replace(/\|\s*\|/g, '||');

    // 2) Fix stray escaping before template holes: \ '${foo}' or \'${foo} → ${foo}
    b = b.replace(/\\\s*['"]\s*\$\{/g, '${');

    // 3) Also fix cases like "\ ${" or "\${"
    b = b.replace(/\\\s*\$\{/g, '${');

    // 4) Common typo "m.name | |" → "(m.name || '')"
    b = b.replace(/\bm\.name\s*\|\s*\|/g, "(m.name || '')");

    // 5) Guard: accidental "<script>" inside a script string not closed—leave as is.
    return b;
  });

  // If script tags unbalanced, append missing closers at end of file
  const opens = (s.match(/<script\b/gi) || []).length;
  const closes = (s.match(/<\/script>/gi) || []).length;
  if (opens > closes) {
    s += '\n' + '</script>'.repeat(opens - closes) + '\n';
  }

  if (s !== orig) {
    fs.writeFileSync(path + '.bak_pre_fix', orig); // backup
    fs.writeFileSync(path, s);
    return { path, fixed: true };
  } else {
    return { path, fixed: false };
  }
}

const targets = [
  'index.html',
  'accountability/index.html',
  'accountability/financial-alignment.html',
];

const results = targets.map(fixFile);
console.log(JSON.stringify(results, null, 2));
