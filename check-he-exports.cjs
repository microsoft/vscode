const he = require('he');

console.log('he exports:');
console.log(JSON.stringify({
  keys: Object.keys(he),
  decode: typeof he.decode,
  encode: typeof he.encode,
  escape: typeof he.escape,
  unescape: typeof he.unescape,
  version: he.version
}, null, 2));

