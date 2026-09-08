#!/usr/bin/env node
try { await import('../dist/server/cli.js'); }
catch (error) { console.error(error.code === 'ERR_MODULE_NOT_FOUND' ? 'Run npm ci and npm run build first.' : error.message); process.exitCode = 1; }
