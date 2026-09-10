// Wrapper per handler/middleware async: inoltra le promise rejected a next(err),
// così l'error middleware centrale risponde (500) invece di lasciare un
// unhandledRejection che, su Node moderno, termina il processo.
export const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);
