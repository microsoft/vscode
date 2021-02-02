/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { promises as fs } from 'fs';
import * as path from 'path';
import { promisify } from 'util';
import * as cp from 'child_process';
import { program } from 'commander';
import { AnonymousCredential, BlobServiceClient, StorageSharedKeyCredential } from '@azure/storage-blob';
import * as mkdirp from 'mkdirp';
import * as plimit from 'p-limit';
import * as colors from 'colors';
import * as byline from 'byline';
import { Transform, TransformCallback } from 'stream';
import * as rimraf from 'rimraf';
const zip = require('gulp-vinyl-zip');
import * as vfs from 'vinyl-fs';
import * as File from 'vinyl';

const rootPath = path.resolve(path.join(__dirname, '..'));
const vsixsPath = path.join(rootPath, '.build', 'vsix');
const extensionsPath = path.join(rootPath, '.build', 'extensions');

const enum ExtensionType {
	Grammar = 'grammar',
	Theme = 'theme',
	Misc = 'misc'
}

interface IExtension {
	readonly name: string;
	readonly version: string;
	readonly sourcePath: string;
	readonly installPath: string;
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

interface SpawnOptions extends cp.SpawnOptions {
	readonly prefix?: string;
}

class Prefixer extends Transform {
	constructor(private prefix: string) { super(); }
	_transform(line: string, _encoding: string, callback: TransformCallback): void {
		callback(null, `${this.prefix} ${line}\n`);
	}
}

async function spawn(cmd: string, opts?: SpawnOptions): Promise<void>;
async function spawn(cmd: string, args: string[], opts?: SpawnOptions): Promise<void>;
async function spawn(cmd: string, argsOrOpts?: SpawnOptions | string[], _opts: SpawnOptions = {}): Promise<void> {
	return new Promise((c, e) => {
		const opts = (Array.isArray(argsOrOpts) ? _opts : argsOrOpts) ?? {};
		const stdio = opts.prefix ? 'pipe' : 'inherit';
		const child = Array.isArray(argsOrOpts)
			? cp.spawn(cmd, argsOrOpts, { stdio, env: process.env, ...opts })
			: cp.spawn(cmd, { stdio, env: process.env, ...opts });

		if (opts.prefix) {
			child.stdout!.pipe(new byline.LineStream()).pipe(new Prefixer(opts.prefix)).pipe(process.stdout);
			child.stderr!.pipe(new byline.LineStream()).pipe(new Prefixer(opts.prefix)).pipe(process.stderr);
		}

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
		sourcePath: extensionPath,
		installPath: path.join(extensionsPath, name),
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
		await spawn(cmd, args, { cwd: extension.sourcePath });
	}
}

async function extractExtension(extension: IExtension): Promise<void> {
	await promisify(rimraf)(extension.installPath);
	await new Promise<void>((c, e) => {
		zip.src(extension.vsixPath)
			.pipe(new Transform({
				objectMode: true,
				transform(file: File, _, cb) {
					if (/^extension\//.test(file.relative)) {
						file.base += '/extension';
						cb(null, file);
					} else {
						cb();
					}
				}
			}))
			.pipe(vfs.dest(extension.installPath))
			.on('error', e)
			.on('end', () => c());
	});
}

async function runExtensionCI(extension: IExtension, service: BlobServiceClient): Promise<void> {
	const vsixName = `${extension.name}-${extension.version}.vsix`;
	const commit = await exec(`git log -1 --format="%H" -- ${extension.sourcePath}`, { trim: true });
	const container = service.getContainerClient('extensions');
	const blobName = `${commit}/${vsixName}`;
	const blob = container.getBlobClient(blobName);
	const prefix = `📦 ${colors.green(extension.name)}`;

	try {
		await blob.downloadToFile(extension.vsixPath);
		console.log(`${prefix} Downloaded from cache ${colors.grey(`(${blobName})`)}`);
	} catch (err) {
		if (err.statusCode !== 404) {
			throw err;
		}

		console.log(`${prefix} Cache miss ${colors.grey(`(${blobName})`)}`);
		console.log(`${prefix} Building...`);
		await spawn(`yarn install --no-progress`, { prefix, shell: true, cwd: extension.sourcePath });
		await spawn(`vsce package --yarn -o ${vsixsPath}`, { prefix, shell: true, cwd: extension.sourcePath });

		if (service.credential instanceof AnonymousCredential) {
			console.log(`${prefix} Skiping publish VSIX to cache (anonymous access only)`);
		} else {
			const blockBlob = await blob.getBlockBlobClient();
			await blockBlob.uploadFile(extension.vsixPath);
			console.log(`${prefix} Successfully uploaded VSIX to cache`);
		}
	}

	await extractExtension(extension);
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
