const fs = require('fs');
const path = require('path');

const sourceDir = path.join(__dirname, '..', 'server', 'dist');
const targetDir = path.join(__dirname, '..', 'api', '_server');

fs.rmSync(targetDir, { recursive: true, force: true });
fs.mkdirSync(targetDir, { recursive: true });
fs.cpSync(sourceDir, targetDir, { recursive: true });
fs.writeFileSync(
  path.join(targetDir, 'package.json'),
  JSON.stringify({ type: 'module' }, null, 2)
);
