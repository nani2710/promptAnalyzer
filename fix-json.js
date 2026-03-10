const fs = require('fs');
let c = fs.readFileSync('patterns/claude/patterns.json', 'utf8');

// The bad escape at line 87 is: 1\\..*2\\..*3\\.
// In the raw file this appears as the character sequence:  1\..*2\..*3\.
// Replace with a safe version: just remove the numbered list part
c = c.replace('|1\\\\..*2\\\\..*3\\\\.', '');  // remove the bad part from the regex
c = c.replace('|1\\..*2\\..*3\\.', '');  // fallback

fs.writeFileSync('patterns/claude/patterns.json', c, 'utf8');

try {
  JSON.parse(c);
  console.log('✅ JSON is valid after fix');
} catch(e) {
  console.log('❌ Still invalid:', e.message);
  // Print the problem area
  const lines = c.split('\n');
  lines.slice(84,92).forEach((l, i) => console.log(i+85, ':', l));
}
