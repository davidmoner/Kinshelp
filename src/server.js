'use strict';
const app = require('./app');
const { PORT } = require('./config/env');

const server = app.listen(PORT, () => {
    console.log(`\n🚀  KingsHelp API  →  http://localhost:${PORT}`);
    console.log(`   Health: /health    API: /api/v1\n`);
});

// Graceful shutdown
process.on('SIGTERM', () => server.close(() => process.exit(0)));
process.on('SIGINT', () => server.close(() => process.exit(0)));
