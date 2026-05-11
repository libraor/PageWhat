const fs = require('fs');
const files = ['lib/utils.js', 'background.js', 'lib/checker.js', 'lib/diff.js', 'popup/popup.js'];
let ok = 0;
files.forEach((f) => {
  const c = fs.readFileSync(f, 'utf-8');
  console.log(f + ': ' + c.length + ' chars OK');
  ok++;
});
console.log('\nAll ' + ok + ' files readable');
