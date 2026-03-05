/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import es from 'event-stream';
import fs from 'fs';
import cp from 'child_process';
import glob from 'glob';
import gulp from 'gulp';
import path from 'path';
import crypto from 'crypto';
import { Stream } from 'stream';
import File from 'vinyl';
import { createStatsStream } from './stats.ts';
import * as util2 from './util.ts';
import filter from 'gulp-filter';
import rename from 'gulp-rename';
import fancyLog from 'fancy-log';
import ansiColors from 'ansi-colors';
import buffer from 'gulp-buffer';
import * as jsoncParser from 'jsonc-parser';
import { getProductionDependencies } from './dependencies.ts';
import { type IExtensionDefinition, getExtensionStream } from './builtInExtensions.ts';
import { fetchUrls, fetchGithub } from './fetch.ts';
import { createTsgoStream, spawnTsgo } from './tsgo.ts';
import vzip from 'gulp-vinyl-zip';

import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const root = path.dirname(path.dirname(import.meta.dirname));
// const commit = getVersion(root);
// const sourceMappingURLBase = `https://main.vscode-cdn.net/sourcemaps/${commit}`;

function minifyExtensionResources(input: Stream): Stream {
	const jsonFilter = filter(['**/*.json', '**/*.code-snippets'], { restore: true });
	return input
		.pipe(jsonFilter)
		.pipe(buffer())
		.pipe(es.mapSync((f: File) => {
			const errors: jsoncParser.ParseError[] = [];
			const value = jsoncParser.parse(f.contents!.toString('utf8'), errors, { allowTrailingComma: true });
			if (errors.length === 0) {
				// file parsed OK => just stringify to drop whitespace and comments
				f.contents = Buffer.from(JSON.stringify(value));
			}
			return f;
		}))
		.pipe(jsonFilter.restore);
}

function updateExtensionPackageJSON(input: Stream, update: (data: any) => any): Stream {
	const packageJsonFilter = filter('extensions/*/package.json', { restore: true });
	return input
		.pipe(packageJsonFilter)
		.pipe(buffer())
		.pipe(es.mapSync((f: File) => {
			const data = JSON.parse(f.contents!.toString('utf8'));
			f.contents = Buffer.from(JSON.stringify(update(data)));
			return f;
		}))
		.pipe(packageJsonFilter.restore);
}

function fromLocal(extensionPath: string, forWeb: boolean, _disableMangle: boolean): Stream {

	const esbuildConfigFileName = forWeb
		? 'esbuild.browser.mts'
		: 'esbuild.mts';

	const hasEsbuild = fs.existsSync(path.join(extensionPath, esbuildConfigFileName));

	let input: Stream;
	let isBundled = false;

	if (hasEsbuild) {
		// Esbuild only does bundling so we still want to run a separate type check step
		input = es.merge(
			fromLocalEsbuild(extensionPath, esbuildConfigFileName),
			...getBuildRootsForExtension(extensionPath).map(root => typeCheckExtensionStream(root, forWeb)),
		);
		isBundled = true;
	} else {
		input = fromLocalNormal(extensionPath);
	}

	if (isBundled) {
		input = updateExtensionPackageJSON(input, (data: any) => {
			delete data.scripts;
			delete data.dependencies;
			delete data.devDependencies;
			if (data.main) {
				data.main = data.main.replace('/out/', '/dist/');
			}
			return data;
		});
	}

	return input;
}

export function typeCheckExtension(extensionPath: string, forWeb: boolean): Promise<void> {
	const tsconfigFileName = forWeb ? 'tsconfig.browser.json' : 'tsconfig.json';
	const tsconfigPath = path.join(extensionPath, tsconfigFileName);
	return spawnTsgo(tsconfigPath, { taskName: 'typechecking extension (tsgo)', noEmit: true });
}

export function typeCheckExtensionStream(extensionPath: string, forWeb: boolean): Stream {
	const tsconfigFileName = forWeb ? 'tsconfig.browser.json' : 'tsconfig.json';
	const tsconfigPath = path.join(extensionPath, tsconfigFileName);
	return createTsgoStream(tsconfigPath, { taskName: 'typechecking extension (tsgo)', noEmit: true });
}


function fromLocalNormal(extensionPath: string): Stream {
	const vsce = require('@vscode/vsce') as typeof import('@vscode/vsce');
	const result = es.through();

	vsce.listFiles({ cwd: extensionPath, packageManager: vsce.PackageManager.Npm })
		.then(fileNames => {
			const files = fileNames
				.map(fileName => path.join(extensionPath, fileName))
				.map(filePath => new File({
					path: filePath,
					stat: fs.statSync(filePath),
					base: extensionPath,
					contents: fs.createReadStream(filePath)
				}));

			es.readArray(files).pipe(result);
		})
		.catch(err => result.emit('error', err));

	return result.pipe(createStatsStream(path.basename(extensionPath)));
}

function fromLocalEsbuild(extensionPath: string, esbuildConfigFileName: string): Stream {
	const vsce = require('@vscode/vsce') as typeof import('@vscode/vsce');
	const result = es.through();

	const esbuildScript = path.join(extensionPath, esbuildConfigFileName);

	// Run esbuild, then collect the files
	new Promise<void>((resolve, reject) => {
		const proc = cp.execFile(process.argv[0], [esbuildScript], {}, (error, _stdout, stderr) => {
			if (error) {
				return reject(error);
			}

			const matches = (stderr || '').match(/\> (.+): error: (.+)?/g);
			fancyLog(`Bundled extension: ${ansiColors.yellow(path.join(path.basename(extensionPath), esbuildConfigFileName))} with ${matches ? matches.length : 0} errors.`);
			for (const match of matches || []) {
				fancyLog.error(match);
			}
			return resolve();
		});

		proc.stdout!.on('data', (data) => {
			fancyLog(`${ansiColors.green('esbuilding')}: ${data.toString('utf8')}`);
		});
	}).then(() => {
		// After esbuild completes, collect all files using vsce
		return vsce.listFiles({ cwd: extensionPath, packageManager: vsce.PackageManager.None });
	}).then(fileNames => {
		const files = fileNames
			.map(fileName => path.join(extensionPath, fileName))
			.map(filePath => new File({
				path: filePath,
				stat: fs.statSync(filePath),
				base: extensionPath,
				contents: fs.createReadStream(filePath)
			}));

		es.readArray(files).pipe(result);
	}).catch(err => {
		console.error(extensionPath);
		result.emit('error', err);
	});

	return result.pipe(createStatsStream(path.basename(extensionPath)));
}

const userAgent = 'VSCode Build';
const baseHeaders = {
	'X-Market-Client-Id': 'VSCode Build',
	'User-Agent': userAgent,
	'X-Market-User-Id': '291C1CD0-051A-4123-9B4B-30D60EF52EE2',
};

export function fromMarketplace(serviceUrl: string, { name: extensionName, version, sha256, metadata }: IExtensionDefinition): Stream {
	const json = require('gulp-json-editor') as typeof import('gulp-json-editor');

	const [publisher, name] = extensionName.split('.');
	const url = `${serviceUrl}/publishers/${publisher}/vsextensions/${name}/${version}/vspackage`;

	fancyLog('Downloading extension:', ansiColors.yellow(`${extensionName}@${version}`), '...');

	const packageJsonFilter = filter('package.json', { restore: true });

	return fetchUrls('', {
		base: url,
		nodeFetchOptions: {
			headers: baseHeaders
		},
		checksumSha256: sha256
	})
		.pipe(vzip.src())
		.pipe(filter('extension/**'))
		.pipe(rename(p => p.dirname = p.dirname!.replace(/^extension\/?/, '')))
		.pipe(packageJsonFilter)
		.pipe(buffer())
		.pipe(json({ __metadata: metadata }))
		.pipe(packageJsonFilter.restore);
}

export function fromVsix(vsixPath: string, { name: extensionName, version, sha256, metadata }: IExtensionDefinition): Stream {
	const json = require('gulp-json-editor') as typeof import('gulp-json-editor');

	fancyLog('Using local VSIX for extension:', ansiColors.yellow(`${extensionName}@${version}`), '...');

	const packageJsonFilter = filter('package.json', { restore: true });

	return gulp.src(vsixPath)
		.pipe(buffer())
		.pipe(es.mapSync((f: File) => {
			const hash = crypto.createHash('sha256');
			hash.update(f.contents as Buffer);
			const checksum = hash.digest('hex');
			if (checksum !== sha256) {
				throw new Error(`Checksum mismatch for ${vsixPath} (expected ${sha256}, actual ${checksum}))`);
			}
			return f;
		}))
		.pipe(vzip.src())
		.pipe(filter('extension/**'))
		.pipe(rename(p => p.dirname = p.dirname!.replace(/^extension\/?/, '')))
		.pipe(packageJsonFilter)
		.pipe(buffer())
		.pipe(json({ __metadata: metadata }))
		.pipe(packageJsonFilter.restore);
}


export function fromGithub({ name, version, repo, sha256, metadata }: IExtensionDefinition): Stream {
	const json = require('gulp-json-editor') as typeof import('gulp-json-editor');

	fancyLog('Downloading extension from GH:', ansiColors.yellow(`${name}@${version}`), '...');

	const packageJsonFilter = filter('package.json', { restore: true });

	return fetchGithub(new URL(repo).pathname, {
		version,
		name: name => name.endsWith('.vsix'),
		checksumSha256: sha256
	})
		.pipe(buffer())
		.pipe(vzip.src())
		.pipe(filter('extension/**'))
		.pipe(rename(p => p.dirname = p.dirname!.replace(/^extension\/?/, '')))
		.pipe(packageJsonFilter)
		.pipe(buffer())
		.pipe(json({ __metadata: metadata }))
		.pipe(packageJsonFilter.restore);
}

/**
 * All extensions that are known to have some native component and thus must be built on the
 * platform that is being built.
 */
const nativeExtensions = [
	'microsoft-authentication',
];

const excludedExtensions = [
	'vscode-api-tests',
	'vscode-colorize-tests',
	'vscode-colorize-perf-tests',
	'vscode-test-resolver',
	'ms-vscode.node-debug',
	'ms-vscode.node-debug2',
];

const marketplaceWebExtensionsExclude = new Set([
	'ms-vscode.node-debug',
	'ms-vscode.node-debug2',
	'ms-vscode.js-debug-companion',
	'ms-vscode.js-debug',
	'ms-vscode.vscode-js-profile-table'
]);

const productJson = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, '../../product.json'), 'utf8'));
const builtInExtensions: IExtensionDefinition[] = productJson.builtInExtensions || [];
const webBuiltInExtensions: IExtensionDefinition[] = productJson.webBuiltInExtensions || [];

type ExtensionKind = 'ui' | 'workspace' | 'web';
interface IExtensionManifest {
	main?: string;
	browser?: string;
	extensionKind?: ExtensionKind | ExtensionKind[];
	extensionPack?: string[];
	extensionDependencies?: string[];
	contributes?: { [id: string]: any };
}
/**
 * Loosely based on `getExtensionKind` from `src/vs/workbench/services/extensions/common/extensionManifestPropertiesService.ts`
 */
export function isWebExtension(manifest: IExtensionManifest): boolean {
	if (Boolean(manifest.browser)) {
		return true;
	}
	if (Boolean(manifest.main)) {
		return false;
	}
	// neither browser nor main
	if (typeof manifest.extensionKind !== 'undefined') {
		const extensionKind = Array.isArray(manifest.extensionKind) ? manifest.extensionKind : [manifest.extensionKind];
		if (extensionKind.indexOf('web') >= 0) {
			return true;
		}
	}
	if (typeof manifest.contributes !== 'undefined') {
		for (const id of ['debuggers', 'terminal', 'typescriptServerPlugins']) {
			if (manifest.contributes.hasOwnProperty(id)) {
				return false;
			}
		}
	}
	return true;
}

/**
 * Package local extensions that are known to not have native dependencies. Mutually exclusive to {@link packageNativeLocalExtensionsStream}.
 * @param forWeb build the extensions that have web targets
 * @param disableMangle disable the mangler
 * @returns a stream
 */
export function packageNonNativeLocalExtensionsStream(forWeb: boolean, disableMangle: boolean): Stream {
	return doPackageLocalExtensionsStream(forWeb, disableMangle, false);
}

/**
 * Package local extensions that are known to have native dependencies. Mutually exclusive to {@link packageNonNativeLocalExtensionsStream}.
 * @note it's possible that the extension does not have native dependencies for the current platform, especially if building for the web,
 * but we simplify the logic here by having a flat list of extensions (See {@link nativeExtensions}) that are known to have native
 * dependencies on some platform and thus should be packaged on the platform that they are building for.
 * @param forWeb build the extensions that have web targets
 * @param disableMangle disable the mangler
 * @returns a stream
 */
export function packageNativeLocalExtensionsStream(forWeb: boolean, disableMangle: boolean): Stream {
	return doPackageLocalExtensionsStream(forWeb, disableMangle, true);
}

/**
 * Package all the local extensions... both those that are known to have native dependencies and those that are not.
 * @param forWeb build the extensions that have web targets
 * @param disableMangle disable the mangler
 * @returns a stream
 */
export function packageAllLocalExtensionsStream(forWeb: boolean, disableMangle: boolean): Stream {
	return es.merge([
		packageNonNativeLocalExtensionsStream(forWeb, disableMangle),
		packageNativeLocalExtensionsStream(forWeb, disableMangle)
	]);
}

/**
 * @param forWeb build the extensions that have web targets
 * @param disableMangle disable the mangler
 * @param native build the extensions that are marked as having native dependencies
 */
function doPackageLocalExtensionsStream(forWeb: boolean, disableMangle: boolean, native: boolean): Stream {
	const nativeExtensionsSet = new Set(nativeExtensions);
	const localExtensionsDescriptions = (
		(glob.sync('extensions/*/package.json') as string[])
			.map(manifestPath => {
				const absoluteManifestPath = path.join(root, manifestPath);
				const extensionPath = path.dirname(path.join(root, manifestPath));
				const extensionName = path.basename(extensionPath);
				return { name: extensionName, path: extensionPath, manifestPath: absoluteManifestPath };
			})
			.filter(({ name }) => native ? nativeExtensionsSet.has(name) : !nativeExtensionsSet.has(name))
			.filter(({ name }) => excludedExtensions.indexOf(name) === -1)
			.filter(({ name }) => builtInExtensions.every(b => b.name !== name))
			.filter(({ manifestPath }) => (forWeb ? isWebExtension(require(manifestPath)) : true))
	);
	const localExtensionsStream = minifyExtensionResources(
		es.merge(
			...localExtensionsDescriptions.map(extension => {
				return fromLocal(extension.path, forWeb, disableMangle)
					.pipe(rename(p => p.dirname = `extensions/${extension.name}/${p.dirname}`));
			})
		)
	);

	let result: Stream;
	if (forWeb) {
		result = localExtensionsStream;
	} else {
		// also include shared production node modules
		const productionDependencies = getProductionDependencies('extensions/');
		const dependenciesSrc = productionDependencies.map(d => path.relative(root, d)).map(d => [`${d}/**`, `!${d}/**/{test,tests}/**`]).flat();

		result = es.merge(
			localExtensionsStream,
			gulp.src(dependenciesSrc, { base: '.' })
				.pipe(util2.cleanNodeModules(path.join(root, 'build', '.moduleignore')))
				.pipe(util2.cleanNodeModules(path.join(root, 'build', `.moduleignore.${process.platform}`))));
	}

	return (
		result
			.pipe(util2.setExecutableBit(['**/*.sh']))
	);
}

export function packageMarketplaceExtensionsStream(forWeb: boolean): Stream {
	const marketplaceExtensionsDescriptions = [
		...builtInExtensions.filter(({ name }) => (forWeb ? !marketplaceWebExtensionsExclude.has(name) : true)),
		...(forWeb ? webBuiltInExtensions : [])
	];
	const marketplaceExtensionsStream = minifyExtensionResources(
		es.merge(
			...marketplaceExtensionsDescriptions
				.map(extension => {
					const src = getExtensionStream(extension).pipe(rename(p => p.dirname = `extensions/${p.dirname}`));
					return updateExtensionPackageJSON(src, (data: any) => {
						delete data.scripts;
						delete data.dependencies;
						delete data.devDependencies;
						return data;
					});
				})
		)
	);

	return (
		marketplaceExtensionsStream
			.pipe(util2.setExecutableBit(['**/*.sh']))
	);
}

export interface IScannedBuiltinExtension {
	readonly extensionPath: string;
	readonly packageJSON: unknown;
	readonly packageNLS: unknown | undefined;
	readonly readmePath: string | undefined;
	readonly changelogPath: string | undefined;
}

export function scanBuiltinExtensions(extensionsRoot: string, exclude: string[] = []): IScannedBuiltinExtension[] {
	const scannedExtensions: IScannedBuiltinExtension[] = [];

	try {
		const extensionsFolders = fs.readdirSync(extensionsRoot);
		for (const extensionFolder of extensionsFolders) {
			if (exclude.indexOf(extensionFolder) >= 0) {
				continue;
			}
			const packageJSONPath = path.join(extensionsRoot, extensionFolder, 'package.json');
			if (!fs.existsSync(packageJSONPath)) {
				continue;
			}
			const packageJSON = JSON.parse(fs.readFileSync(packageJSONPath).toString('utf8'));
			if (!isWebExtension(packageJSON)) {
				continue;
			}
			const children = fs.readdirSync(path.join(extensionsRoot, extensionFolder));
			const packageNLSPath = children.filter(child => child === 'package.nls.json')[0];
			const packageNLS = packageNLSPath ? JSON.parse(fs.readFileSync(path.join(extensionsRoot, extensionFolder, packageNLSPath)).toString()) : undefined;
			const readme = children.filter(child => /^readme(\.txt|\.md|)$/i.test(child))[0];
			const changelog = children.filter(child => /^changelog(\.txt|\.md|)$/i.test(child))[0];

			scannedExtensions.push({
				extensionPath: extensionFolder,
				packageJSON,
				packageNLS,
				readmePath: readme ? path.join(extensionFolder, readme) : undefined,
				changelogPath: changelog ? path.join(extensionFolder, changelog) : undefined,
			});
		}
		return scannedExtensions;
	} catch (ex) {
		return scannedExtensions;
	}
}

export function translatePackageJSON(packageJSON: string, packageNLSPath: string) {
	interface NLSFormat {
		[key: string]: string | { message: string; comment: string[] };
	}
	const CharCode_PC = '%'.charCodeAt(0);
	const packageNls: NLSFormat = JSON.parse(fs.readFileSync(packageNLSPath).toString());
	const translate = (obj: any) => {
		for (const key in obj) {
			const val = obj[key];
			if (Array.isArray(val)) {
				val.forEach(translate);
			} else if (val && typeof val === 'object') {
				translate(val);
			} else if (typeof val === 'string' && val.charCodeAt(0) === CharCode_PC && val.charCodeAt(val.length - 1) === CharCode_PC) {
				const translated = packageNls[val.substr(1, val.length - 2)];
				if (translated) {
					obj[key] = typeof translated === 'string' ? translated : (typeof translated.message === 'string' ? translated.message : val);
				}
			}
		}
	};
	translate(packageJSON);
	return packageJSON;
}

const extensionsPath = path.join(root, 'extensions');

export async function esbuildExtensions(taskName: string, isWatch: boolean, scripts: { script: string; outputRoot?: string }[]): Promise<void> {
	function reporter(stdError: string, script: string) {
		const matches = (stdError || '').match(/\> (.+): error: (.+)?/g);
		fancyLog(`Finished ${ansiColors.green(taskName)} ${script} with ${matches ? matches.length : 0} errors.`);
		for (const match of matches || []) {
			fancyLog.error(match);
		}
	}

	const tasks = scripts.map(({ script, outputRoot }) => {
		return new Promise<void>((resolve, reject) => {
			const args = [script];
			if (isWatch) {
				args.push('--watch');
			}
			if (outputRoot) {
				args.push('--outputRoot', outputRoot);
			}
			const proc = cp.execFile(process.argv[0], args, {}, (error, _stdout, stderr) => {
				if (error) {
					return reject(error);
				}
				reporter(stderr, script);
				return resolve();
			});

			proc.stdout!.on('data', (data) => {
				fancyLog(`${ansiColors.green(taskName)}: ${data.toString('utf8')}`);
			});
		});
	});

	await Promise.all(tasks);
}


// Additional projects to run esbuild on. These typically build code for webviews
const esbuildMediaScripts = [
	'ipynb/esbuild.notebook.mts',
	'markdown-language-features/esbuild.notebook.mts',
	'markdown-language-features/esbuild.webview.mts',
	'markdown-math/esbuild.notebook.mts',
	'mermaid-chat-features/esbuild.webview.mts',
	'notebook-renderers/esbuild.notebook.mts',
	'simple-browser/esbuild.webview.mts',
];

export function buildExtensionMedia(isWatch: boolean, outputRoot?: string): Promise<void> {
	return esbuildExtensions('esbuilding extension media', isWatch, esbuildMediaScripts.map(p => ({
		script: path.join(extensionsPath, p),
		outputRoot: outputRoot ? path.join(root, outputRoot, path.dirname(p)) : undefined
	})));
}

export function getBuildRootsForExtension(extensionPath: string): string[] {
	// These extensions split their code between a client and server folder. We should treat each as build roots
	if (extensionPath.endsWith('css-language-features') || extensionPath.endsWith('html-language-features') || extensionPath.endsWith('json-language-features')) {
		return [
			path.join(extensionPath, 'client'),
			path.join(extensionPath, 'server'),
		];
	}

	return [extensionPath];
}
