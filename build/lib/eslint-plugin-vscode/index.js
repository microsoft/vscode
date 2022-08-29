const glob = require('glob');
const path = require('path');

require('ts-node').register({ experimentalResolver: true, transpileOnly: true });

// Re-export all .ts files as rules
const rules = {};
glob.sync(`${__dirname}/*.ts`).forEach((file) => {
	rules[path.basename(file, '.ts')] = require(file);
});

module.exports = { rules };
