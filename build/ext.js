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

async function exec(cmd, args, opts = {}) {
	return new Promise((c, e) => {
		const child = cp.spawn(cmd, args, { stdio: 'inherit', ...opts });
		child.on('close', code => code === 0 ? c() : e(`Returned ${code}`));
	});
}

function getFolderPath(extDesc) {
	const folder = extDesc.repo.replace(/.*\//, '');
	return folderPath = path.join(root, folder);
}

async function getExtensionType(folderPath) {
	const pkg = JSON.parse(await fs.readFile(path.join(folderPath, 'package.json'), 'utf8'));

	if (pkg['contributes']['themes'] || pkg['contributes']['iconThemes']) {
		return 'themes';
	} else if (pkg['contributes']['grammars']) {
		return 'grammars';
	} else {
		return 'misc';
	}
}

async function initExtension(extDesc) {
	const folderPath = getFolderPath(extDesc);

	if (!await exists(folderPath)) {
		console.log(`⏳ git clone: ${extDesc.name}`);
		await exec('git', ['clone', `${extDesc.repo}.git`], { cwd: root });
	}

	const type = await getExtensionType(folderPath);
	return { path: folderPath, type };
}

async function createWorkspace(type, extensions) {
	const workspaceName = `vscode-extensions-${type}.code-workspace`;
	const workspacePath = path.join(root, workspaceName);
	const workspace = { folders: extensions.map(ext => ({ path: path.basename(ext.path) })) };
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

async function ls() {
	const types = new Map();

	for (const extDesc of product.builtInExtensions) {
		const folderPath = getFolderPath(extDesc);
		const type = await getExtensionType(folderPath);
		types.set(type, 1 + (types.get(type) || 0));
	}

	for (const [type, count] of types) {
		console.log(`${type}: ${count} extensions`);
	}

	console.log(`total: ${product.builtInExtensions.length} extensions`);
}

async function each([cmd, ...args], opts) {
	for (const extDesc of product.builtInExtensions) {
		const folderPath = getFolderPath(extDesc);

		if (opts.type) {
			const type = await getExtensionType(folderPath);

			if (type !== opts.type) {
				continue;
			}
		}

		console.log(`👉 ${extDesc.name}`);
		await exec(cmd, args, { cwd: folderPath });
	}
}

if (require.main === module) {
	const { program } = require('commander');

	program.version('0.0.1');

	program
		.command('init')
		.description('Initialize workspace with built-in extensions')
		.action(init);

	program
		.command('ls')
		.description('List extension types')
		.action(ls);

	program
		.command('each <command...>')
		.option('-t, --type <type>', 'Specific type only')
		.description('Run a command in each extension repository')
		.allowUnknownOption()
		.action(each);

	program.parseAsync(process.argv);
}
