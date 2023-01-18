const fs = require('fs');
const { parse, stringify } = require('./yarnlock');

const raw = fs.readFileSync(process.argv[2], 'utf8');
const parsed = parse(raw);
const stringified = stringify(parsed);
console.log(stringified);

