/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const fs = require('fs').promises;
const path = require('path');
const cp = require('child_process');
const product = require('../../product.json');
const root = path.resolve(path.join(__dirname, '..', '..', '..'));

async function exists(path) {
	try {
		await fs.stat(path);
		return true;
	} catch {
		return false;
	}
}

async function exec(cmd, opts = {}) {
	return new Promise((c, e) => {
		const child = cp.spawn(cmd, { shell: true, stdio: 'inherit', ...opts });
		child.on('close', code => code === 0 ? c() : e(`Returned ${code}`));
	});
}

async function cloneOrPull(ext) {
	const folderName = ext.repo.replace(/.*\//, '');
	const folder = path.join(root, folderName);

	if (!await exists(folder)) {
		const url = `${ext.repo}.git`;
		await exec(`git clone ${url}`, { cwd: root });
	} else {
		await exec(`git pull`, { cwd: folder });
	}
}

async function main() {
	for (const ext of product.builtInExtensions) {
		console.log(`👉 ${ext.name}`);
		await cloneOrPull(ext);
	}
}

if (require.main === module) {
	main().catch(err => {
		console.error(err);
		process.exit(1);
	});
}
