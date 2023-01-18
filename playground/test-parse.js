const fs = require('fs');
const { parse } = require('./yarnlock');

const raw = fs.readFileSync(process.argv[2], 'utf8');
const parsed = parse(raw);
console.log(parsed);

