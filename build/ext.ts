/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { promises as fs } from 'fs';
import * as path from 'path';
import * as cp from 'child_process';
import { program } from 'commander';

const root = path.resolve(path.join(__dirname, '..'));

const enum ExtensionType {
	Grammar = 'grammar',
	Theme = 'theme',
	Misc = 'misc'
}

interface IExtension {
	readonly name: string;
	readonly path: string;
	readonly type: ExtensionType;
}

// const exists = (path) => fs.stat(path).then(() => true, () => false);

// const controlFilePath = path.join(os.homedir(), '.vscode-oss-dev', 'extensions', 'control.json');

// async function readControlFile() {
// 	try {
// 		return JSON.parse(await fs.readFile(controlFilePath, 'utf8'));
// 	} catch (err) {
// 		return {};
// 	}
// }

// async function writeControlFile(control) {
// 	await mkdirp(path.dirname(controlFilePath));
// 	await fs.writeFile(controlFilePath, JSON.stringify(control, null, '  '));
// }

async function exec(cmd: string, args: string[], opts: cp.SpawnOptions = {}): Promise<void> {
	return new Promise((c, e) => {
		const child = cp.spawn(cmd, args, { stdio: 'inherit', env: process.env, ...opts });
		child.on('close', code => code === 0 ? c() : e(`Returned ${code}`));
	});
}

function getExtensionType(packageJson: any): ExtensionType {
	if (packageJson.contributes?.themes || packageJson.contributes?.iconThemes) {
		return ExtensionType.Theme;
	} else if (packageJson.contributes?.grammars) {
		return ExtensionType.Grammar;
	} else {
		return ExtensionType.Misc;
	}
}

async function getExtension(extensionPath: string): Promise<IExtension> {
	const packageJsonPath = path.join(extensionPath, 'package.json');
	const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf8'));
	const type = getExtensionType(packageJson);

	return {
		name: packageJson.name,
		path: extensionPath,
		type
	};
}

async function* getExtensions(): AsyncGenerator<IExtension, void, any> {
	const extensionsPath = path.join(root, 'extensions');
	const children = await fs.readdir(extensionsPath);

	for (const child of children) {
		try {
			yield await getExtension(path.join(extensionsPath, child));
		} catch (err) {
			if (/ENOENT|ENOTDIR/.test(err.message)) {
				continue;
			}

			throw err;
		}
	}
}

async function each([cmd, ...args]: string[], opts: { type?: string }) {
	for await (const extension of getExtensions()) {
		if (opts.type && extension.type !== opts.type) {
			continue;
		}

		console.log(`👉 ${extension.name}`);
		await exec(cmd, args, { cwd: extension.path });
	}
}

if (require.main === module) {
	program.version('0.0.1');

	program
		.command('each <command...>')
		.option('-t, --type <type>', 'Specific type only')
		.description('Run a command in each extension repository')
		.allowUnknownOption()
		.action(each);

	program.parseAsync(process.argv).catch(err => {
		console.error(err);
		process.exit(1);
	});
}
