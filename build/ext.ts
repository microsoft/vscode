/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { promises as fs } from 'fs';
import * as path from 'path';
import * as cp from 'child_process';
import { program } from 'commander';
import { AnonymousCredential, BlobServiceClient, StorageSharedKeyCredential } from '@azure/storage-blob';
import * as mkdirp from 'mkdirp';
import * as plimit from 'p-limit';

const rootPath = path.resolve(path.join(__dirname, '..'));
const vsixsPath = path.join(rootPath, '.build', 'vsix');

const enum ExtensionType {
	Grammar = 'grammar',
	Theme = 'theme',
	Misc = 'misc'
}

interface IExtension {
	readonly name: string;
	readonly version: string;
	readonly path: string;
	readonly type: ExtensionType;
	readonly vsixPath: string;
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

async function spawn(cmd: string, opts?: cp.SpawnOptions): Promise<void>;
async function spawn(cmd: string, args: string[], opts?: cp.SpawnOptions): Promise<void>;
async function spawn(cmd: string, argsOrOpts?: cp.SpawnOptions | string[], opts: cp.SpawnOptions = {}): Promise<void> {
	return new Promise((c, e) => {
		const child = Array.isArray(argsOrOpts)
			? cp.spawn(cmd, argsOrOpts, { stdio: 'inherit', env: process.env, ...opts })
			: cp.spawn(cmd, { stdio: 'inherit', env: process.env, ...argsOrOpts });

		child.on('close', code => code === 0 ? c() : e(`Returned ${code}`));
	});
}

async function exec(cmd: string, opts: (cp.ExecOptions & { trim?: boolean }) = {}): Promise<string> {
	return new Promise((c, e) => {
		cp.exec(cmd, { env: process.env, ...opts }, (err, stdout) => err ? e(err) : c(opts.trim ? stdout.trim() : stdout));
	});
}

function getExtensionType(packageJson: any): ExtensionType {
	if (packageJson.main) {
		return ExtensionType.Misc;
	} else if (packageJson.contributes?.themes || packageJson.contributes?.iconThemes) {
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
	const { name, version } = packageJson;
	const vsixName = `${name}-${version}.vsix`;

	return {
		name,
		version,
		path: extensionPath,
		type,
		vsixPath: path.join(vsixsPath, vsixName)
	};
}

export async function* getExtensions(): AsyncGenerator<IExtension, void, any> {
	const extensionsPath = path.join(rootPath, 'extensions');
	const children = await fs.readdir(extensionsPath);

	for (const child of children) {
		try {
			const extension = await getExtension(path.join(extensionsPath, child));

			if (extension.type !== ExtensionType.Theme && extension.type !== ExtensionType.Grammar) {
				continue;
			}

			yield extension;
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
		await spawn(cmd, args, { cwd: extension.path });
	}
}

async function runExtensionCI(extension: IExtension, service: BlobServiceClient): Promise<void> {
	const vsixName = `${extension.name}-${extension.version}.vsix`;
	const commit = await exec(`git log -1 --format="%H" -- ${extension.path}`, { trim: true });
	const container = service.getContainerClient('extensions');
	const blobName = `${commit}/${vsixName}`;
	const blob = container.getBlobClient(blobName);

	try {
		await blob.downloadToFile(extension.vsixPath);
		console.log(`📦 [${extension.name}] Downloaded from cache (${blobName})`);
		return;
	} catch (err) {
		if (err.statusCode !== 404) {
			throw err;
		}
	}

	console.log(`📦 [${extension.name}] Cache miss (${blobName})`);
	console.log(`📦 [${extension.name}] Building...`);
	await spawn(`yarn`, { shell: true, cwd: extension.path });
	await spawn(`vsce package --yarn -o ${vsixsPath}`, { shell: true, cwd: extension.path });

	if (service.credential instanceof AnonymousCredential) {
		console.log(`📦 [${extension.name}] Skiping publish VSIX to cache (anonymous access only)`);
		return;
	}

	const blockBlob = await blob.getBlockBlobClient();
	await blockBlob.uploadFile(extension.vsixPath);
	console.log(`📦 [${extension.name}] Successfully uploaded VSIX to cache`);
}

async function ci(): Promise<void> {
	const { 'AZURE_STORAGE_ACCOUNT_2': account, 'AZURE_STORAGE_KEY_2': key } = process.env;

	if (!account) {
		throw new Error('Missing env: AZURE_STORAGE_ACCOUNT_2');
	}

	const creds = key ? new StorageSharedKeyCredential(account, key) : new AnonymousCredential();
	const service = new BlobServiceClient(`https://${account}.blob.core.windows.net`, creds);

	await mkdirp(vsixsPath);

	const limit = plimit(10);
	const promises = [];

	for await (const extension of getExtensions()) {
		if (extension.type !== ExtensionType.Theme && extension.type !== ExtensionType.Grammar) {
			continue;
		}

		promises.push(limit(() => runExtensionCI(extension, service)));
	}

	await Promise.all(promises);
}

if (require.main === module) {
	program.version('0.0.1');

	program
		.command('each <command...>')
		.option('-t, --type <type>', 'Specific type only')
		.description('Run a command in each extension repository')
		.allowUnknownOption()
		.action(each);

	program
		.command('ci')
		.description('Run CI build steps for extensions')
		.action(ci);

	program.parseAsync(process.argv).catch(err => {
		console.error(err);
		process.exit(1);
	});
}
