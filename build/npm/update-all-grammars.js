/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const cp = require('child_process');
const fs = require('fs');
const path = require('path');

async function spawn(cmd, args, opts) {
	return new Promise((c, e) => {
		const child = cp.spawn(cmd, args, { shell: true, stdio: 'inherit', env: process.env, ...opts });
		child.on('close', code => code === 0 ? c() : e(`Returned ${code}`));
	});
}

async function main() {
	await spawn('yarn', [], { cwd: 'extensions' });

	for (const extension of fs.readdirSync('extensions')) {
		try {
			let packageJSON = JSON.parse(fs.readFileSync(path.join('extensions', extension, 'package.json')).toString());
			if (!(packageJSON && packageJSON.scripts && packageJSON.scripts['update-grammar'])) {
				continue;
			}
		} catch {
			continue;
		}

		await spawn(`npm`, ['run', 'update-grammar'], { cwd: `extensions/${extension}` });
	}

	// run integration tests

	if (process.platform === 'win32') {
		cp.spawn('.\\scripts\\test-integration.bat', [], { env: process.env, stdio: 'inherit' });
	} else {
		cp.spawn('/bin/bash', ['./scripts/test-integration.sh'], { env: process.env, stdio: 'inherit' });
	}
}

if (require.main === module) {
	main().catch(err => {
		console.error(err);
		process.exit(1);
	});
}
