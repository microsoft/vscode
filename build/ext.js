/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const fs = require('fs').promises;
const path = require('path');
const cp = require('child_process');
const os = require('os');
const mkdirp = require('mkdirp');
const product = require('../product.json');
const root = path.resolve(path.join(__dirname, '..', '..'));
const exists = (path) => fs.stat(path).then(() => true, () => false);

const controlFilePath = path.join(os.homedir(), '.vscode-oss-dev', 'extensions', 'control.json');

async function readControlFile() {
	try {
		return JSON.parse(await fs.readFile(controlFilePath, 'utf8'));
	} catch (err) {
		return {};
	}
}

async function writeControlFile(control) {
	await mkdirp(path.dirname(controlFilePath));
	await fs.writeFile(controlFilePath, JSON.stringify(control, null, '  '));
}

async function exec(cmd, args, opts = {}) {
	return new Promise((c, e) => {
		const child = cp.spawn(cmd, args, { stdio: 'inherit', env: process.env, ...opts });
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
		return 'theme';
	} else if (pkg['contributes']['grammars']) {
		return 'grammar';
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
	return { path: folderPath, type, ...extDesc };
}

async function createWorkspace(type, extensions) {
	const workspaceName = `vscode-${type}-extensions.code-workspace`;
	const workspacePath = path.join(root, workspaceName);
	const workspace = { folders: extensions.map(ext => ({ path: path.basename(ext.path) })) };

	if (!await exists(workspacePath)) {
		console.log(`✅ create workspace: ${workspaceName}`);
	}

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

	return byType;
}

async function status() {
	const byType = await init();
	const control = await readControlFile();

	for (const [type, extensions] of byType) {
		console.log(`${type} (${extensions.length} extensions):`);

		const maxWidth = Math.max(...extensions.map(e => e.name.length));
		for (const ext of extensions) {
			console.log(`  ${ext.name.padEnd(maxWidth, ' ')} ➡  ${control[ext.name]}`);
		}
	}

	console.log(`total: ${product.builtInExtensions.length} extensions`);
}

async function each([cmd, ...args], opts) {
	await init();

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

async function _link(extensions, opts, fn) {
	await init();

	const control = await readControlFile();

	for (const extDesc of product.builtInExtensions) {
		if (extensions.length > 0 && extensions.indexOf(extDesc.name) === -1) {
			continue;
		}

		if (opts.type) {
			const folderPath = getFolderPath(extDesc);
			const type = await getExtensionType(folderPath);

			if (type !== opts.type) {
				continue;
			}
		}

		await fn(control, extDesc);
	}

	await writeControlFile(control);
}

async function link(extensions, opts) {
	await _link(extensions, opts, async (control, extDesc) => {
		const ext = await initExtension(extDesc);
		control[extDesc.name] = ext.path;
		console.log(`👉 link: ${extDesc.name} ➡ ${ext.path}`);
	});
}

async function unlink(extensions, opts) {
	await _link(extensions, opts, async (control, extDesc) => {
		control[extDesc.name] = 'marketplace';
		console.log(`👉 unlink: ${extDesc.name}`);
	});
}

if (require.main === module) {
	const { program } = require('commander');

	program.version('0.0.1');

	program
		.command('init')
		.description('Initialize workspace with built-in extensions')
		.action(init);

	program
		.command('status')
		.description('Print extension status')
		.action(status);

	program
		.command('each <command...>')
		.option('-t, --type <type>', 'Specific type only')
		.description('Run a command in each extension repository')
		.allowUnknownOption()
		.action(each);

	program
		.command('link [extensions...]')
		.option('-t, --type <type>', 'Specific type only')
		.description('Link with code-oss')
		.action(link);

	program
		.command('unlink [extensions...]')
		.option('-t, --type <type>', 'Specific type only')
		.description('Unlink from code-oss')
		.action(unlink);

	program.parseAsync(process.argv);
}
