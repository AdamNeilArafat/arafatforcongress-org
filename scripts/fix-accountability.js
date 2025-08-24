const fs = require('fs');

const file = 'accountability/index.html';
if (!fs.existsSync(file)) {
  console.error(`[fix] missing ${file}`);
  process.exit(0);
}

let s = fs.readFileSync(file, 'utf8');
const orig = s;

// Work only inside <script>...</script> blocks
s = s.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, (block) => {
  let b = block;

  // 1) Fix " | | " -> " || "
  b = b.replace(/\|\s*\|/g, '||');

  // 2) Remove stray backslashes before template holes: \${ ... } or \' ${ ... }
  b = b.replace(/\\\s*\$\{/g, '${');          // \${ -> ${
  b = b.replace(/\\\s*['"]\s*\$\{/g, '${');   // \' ${ -> ${

  // 3) Very common typo: m.name || '' usage when concatenating
  //    If we see "m.name ||" without a rhs, leave it; otherwise fine.

  // 4) Clean double commas from accidental fixes: ", ,"
  b = b.replace(/,\s*,/g, ', ');

  return b;
});

// If script tags are unbalanced, append missing closers (prevents error near line ~738)
const openCount  = (s.match(/<script\b/gi)   || []).length;
const closeCount = (s.match(/<\/script>/gi)   || []).length;
if (openCount > closeCount) {
  s += '\n' + '</script>'.repeat(openCount - closeCount) + '\n';
}

if (s !== orig) {
  fs.writeFileSync(file + '.bak_pre_fix', orig);
  fs.writeFileSync(file, s);
  console.log('[fix] applied to', file);
} else {
  console.log('[fix] no changes needed in', file);
}
