export const logSecurity = (event, metadata = {}) => {
  console.log(JSON.stringify({ level: 'security', event, metadata, ts: new Date().toISOString() }));
};
