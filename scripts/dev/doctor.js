/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// @ts-check
'use strict';

const { spawnSync } = require('child_process');

/**
 * @param {number} minMajor
 */
function checkNodeVersion(minMajor = 18) {
	const v = process.versions.node.split('.').map(Number);
	const major = v[0] || 0;
	return { major, ok: major >= minMajor };
}

/**
 * @param {string} cmd
 */
function checkCommand(cmd) {
	try {
		const res = spawnSync(cmd, ['--version'], { stdio: 'ignore' });
		return res.status === 0;
	} catch (e) {
		return false;
	}
}

function run() {
	console.log('Running developer doctor checks...');

	const node = checkNodeVersion();
	if (node.ok) {
		console.log(`Node version OK (major=${node.major})`);
	} else {
		console.warn(`Node version too old: found ${node.major}. Recommend Node >= ${18}.`);
	}

	const cmds = ['git', 'npm'];
	const missing = [];
	for (const c of cmds) {
		if (!checkCommand(c)) {
			missing.push(c);
		}
	}

	if (missing.length === 0) {
		console.log('All required commands are available: git, npm');
	} else {
		console.warn('Missing required commands:', missing.join(', '));
		console.warn('Please install them to ensure the development workflow works correctly.');
	}

	// quick check: node_modules present
	const fs = require('fs');
	if (fs.existsSync('node_modules')) {
		console.log('node_modules directory exists.');
	} else {
		console.warn('node_modules is missing. Run `npm install` to install dependencies.');
	}

	// exit with non-zero if critical failures
	if (!node.ok || missing.length > 0) {
		process.exitCode = 2;
	}
}

if (require.main === module) {
	run();
}

module.exports = { checkNodeVersion, checkCommand };
