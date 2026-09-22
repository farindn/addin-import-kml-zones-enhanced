const createLogger = (name) => ({
  log: (message) => console.log(`[${name}] ${message}`),
  warn: (message) => console.warn(`[${name}] ${message}`),
  error: (message) => console.error(`[${name}] ${message}`)
});

export default createLogger;
