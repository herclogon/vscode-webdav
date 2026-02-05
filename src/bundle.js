let fs = require('fs/promises');
let path = require('path');

// Bundling ignores these native node modules, this brings them back:
// Only copy if the directory exists (Windows-only dependency)
let sspiPath = './node_modules/node-expose-sspi/lib/arch';
fs.access(sspiPath).then(() => {
    return fs.cp(sspiPath, './out/arch', { recursive: true });
}).catch(() => {
    console.log('Skipping node-expose-sspi (Windows only)');
});