const fs = require('fs');
const xdiff = require('xdiff');
const { parse, stringify } = require('./yarnlock');

function merge(ours, base, theirs) {
  const diff = xdiff.diff3(ours, base, theirs);
  return diff ? xdiff.patch(base, diff) : base;
}

const [ours, base, theirs] = [
  parse(fs.readFileSync(process.argv[2], 'utf8')),
  parse(fs.readFileSync(process.argv[3], 'utf8')),
  parse(fs.readFileSync(process.argv[4], 'utf8'))
];

process.stdout.write(stringify(merge(ours, base, theirs)));
