// =============================================================
// errors.js: tiny helper to throw an error that carries an HTTP status code
// =============================================================
export const fail = (status, message) => Object.assign(new Error(message), { status });
