const fs = require('fs');
const p = 'runtime/resources/app/out/renderer/assets/index-01dFNdzs.js';
let lines = fs.readFileSync(p, 'utf8').split('\n');

// Find line where "const navigate = useNavigate();" appears twice
let indices = [];
lines.forEach((line, idx) => {
  if (line.includes('const navigate = useNavigate();')) {
    indices.push(idx);
  }
});
console.log('Found navigate at lines:', indices);

if (indices.length > 1) {
  // We want to delete from indices[1] to indices[1] + 19 (the duplicate block)
  const start = indices[1];
  console.log('Removing duplicate block starting at line', start + 1);
  lines.splice(start, 20);
  fs.writeFileSync(p, lines.join('\n'), 'utf8');
  console.log('Successfully removed duplicate block!');
}
