/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { spawn as _spawn } from 'child_process';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import url from 'url';

async function spawn(cmd, args, opts) {
	return new Promise((c, e) => {
		const child = _spawn(cmd, args, { shell: true, stdio: 'inherit', env: process.env, ...opts });
		child.on('close', code => code === 0 ? c() : e(`Returned ${code}`));
	});
}

async function main() {
	await spawn('npm', ['ci'], { cwd: 'extensions' });

	for (const extension of readdirSync('extensions')) {
		try {
			const packageJSON = JSON.parse(readFileSync(join('extensions', extension, 'package.json')).toString());
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
		_spawn('.\\scripts\\test-integration.bat', [], { env: process.env, stdio: 'inherit' });
	} else {
		_spawn('/bin/bash', ['./scripts/test-integration.sh'], { env: process.env, stdio: 'inherit' });
	}
}

if (import.meta.url === url.pathToFileURL(process.argv[1]).href) {
	main().catch(err => {
		console.error(err);
		process.exit(1);
	});
}
