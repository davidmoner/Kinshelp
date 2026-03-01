'use strict';
/**
 * Shared http-error factory.
 * Usage: throw httpError(404, 'Not found')
 */
function httpError(status, message) {
    const err = new Error(message);
    err.status = status;
    return err;
}

module.exports = httpError;
