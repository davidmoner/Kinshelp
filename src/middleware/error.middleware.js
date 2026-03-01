'use strict';

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
    let status = err.status || err.statusCode || 500;
    let message = err.message || 'Internal Server Error';

    // Multer / upload errors
    if (err && err.code === 'LIMIT_FILE_SIZE') {
        status = 413;
        message = 'La imagen es demasiado grande (max 900KB)';
    }

    if (status === 500 && typeof message === 'string' && message.includes('Formato no permitido')) {
        status = 422;
    }

    if (process.env.NODE_ENV !== 'production') {
        console.error(`[${status}] ${req.method} ${req.path} — ${message}`);
        if (err.stack) console.error(err.stack);
    }

    res.status(status).json({ error: message });
}

function notFound(req, res) {
    res.status(404).json({ error: `Route ${req.method} ${req.path} not found` });
}

module.exports = { errorHandler, notFound };
