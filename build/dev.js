/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const fs = require('fs').promises;
const path = require('path');
const cp = require('child_process');
const product = require('../product.json');
const root = path.resolve(path.join(__dirname, '..', '..'));
const exists = (path) => fs.stat(path).then(() => true, () => false);

async function exec(cmd, opts = {}) {
	return new Promise((c, e) => {
		const child = cp.spawn(cmd, { shell: true, stdio: 'inherit', ...opts });
		child.on('close', code => code === 0 ? c() : e(`Returned ${code}`));
	});
}

async function initExtension(extDesc) {
	const folder = extDesc.repo.replace(/.*\//, '');
	const folderPath = path.join(root, folder);

	if (!await exists(folderPath)) {
		console.log(`⏳ git clone: ${extDesc.name}`);
		await exec(`git clone ${extDesc.repo}.git`, { cwd: root });
	}

	const pkg = require(path.join(folderPath, 'package.json'));
	let type = undefined;

	if (pkg['contributes']['themes'] || pkg['contributes']['iconThemes']) {
		type = 'themes';
	} else if (pkg['contributes']['grammars']) {
		type = 'grammars';
	} else {
		type = 'misc';
	}

	return { folder, type };
}

async function createWorkspace(type, extensions) {
	const workspaceName = `vscode-extensions-${type}.code-workspace`;
	const workspacePath = path.join(root, workspaceName);
	const workspace = { folders: extensions.map(ext => ({ path: ext.folder })) };
	console.log(`✅ create workspace: ${workspaceName}`);
	await fs.writeFile(workspacePath, JSON.stringify(workspace, undefined, '  '));
}

async function init() {
	const extensions = [];

	for (const extDesc of product.builtInExtensions) {
		extensions.push(await initExtension(extDesc));
	}

	await createWorkspace('all', extensions);

	const byType = extensions
		.reduce((m, e) => m.set(e.type, [...(m.get(e.type) || []), e]), new Map());

	for (const [type, extensions] of byType) {
		await createWorkspace(type, extensions);
	}
}

if (require.main === module) {
	const { program } = require('commander');

	program.version('0.0.1');

	program
		.command('init')
		.description('Initialize workspace with built-in extensions')
		.action(init);

	program.parseAsync(process.argv);
}
