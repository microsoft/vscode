/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import * as path from 'node:path';
import { gzipSync } from 'node:zlib';
import type * as esbuild from 'esbuild';
import { parse as parseJsonc, type ParseError } from 'jsonc-parser';
import policy from './mobilePolicy.json' with { type: 'json' };

export const mobileDirectory = 'out-mobile';
export const mobileEntryPoint = 'vs/sessions/agents.web.mobile.main.internal';
export const mobileManifestName = 'mobile.json';
const manifestKind = 'sessions-mobile';
export const mobileEntrypoints = {
	workbench: `out/${mobileEntryPoint}.js`,
	stylesheet: `out/${mobileEntryPoint}.css`,
	nls: 'out/nls.messages.js',
};
const entrypoints = mobileEntrypoints;

export interface MobileExtension {
	readonly id: string;
	readonly path: string;
}

export interface MobileAsset {
	readonly path: string;
	readonly bytes: number;
	readonly gzipBytes: number;
	readonly sha256: string;
}

export interface MobileManifest {
	readonly schemaVersion: 2;
	readonly kind: typeof manifestKind;
	readonly build: { readonly commit: string; readonly version: string; readonly date: string; readonly quality: 'dev' | 'insider' | 'stable' | 'exploration' };
	readonly entrypoints: typeof entrypoints;
	readonly extensions: readonly MobileExtension[];
	readonly assets: readonly MobileAsset[];
	readonly preload: readonly string[];
	readonly sizes: { readonly initialGzipBytes: number; readonly runtimeGzipBytes: number; readonly extensionsGzipBytes: number };
	readonly budgets: typeof policy.budgets;
	readonly contributions: readonly string[];
	readonly localization: { readonly keys: string; readonly metadata: string; readonly messages: string };
}

/** Refuse to clean any path except this target's owned output. */
export async function prepareMobile(root: string, outDir: string): Promise<() => Promise<void>> {
	const output = path.resolve(root, outDir);
	const mobileRoot = path.join(root, mobileDirectory);
	if (output !== path.join(mobileRoot, 'out')) {
		throw new Error(`Mobile output must be ${mobileDirectory}/out, not ${outDir}`);
	}
	for (const directory of [mobileRoot, output, path.join(mobileRoot, 'node_modules'), path.join(mobileRoot, 'extensions')]) {
		try {
			const stat = await fs.lstat(directory);
			if (!stat.isDirectory() || stat.isSymbolicLink()) {
				throw new Error(`Mobile output is not a regular directory: ${directory}`);
			}
		} catch (error) {
			if (!isMissing(error)) {
				throw error;
			}
		}
	}
	const files = await fs.readdir(mobileRoot).catch(error => {
		if (isMissing(error)) {
			return [];
		}
		throw error;
	});
	if (files.length > 0) {
		let marker: { schemaVersion?: number; kind?: string } | null;
		try {
			const markerPath = path.join(mobileRoot, '.mobile-build.json');
			const stat = await fs.lstat(markerPath);
			if (!stat.isFile() || stat.isSymbolicLink()) {
				throw new Error('Mobile ownership marker is not a regular file');
			}
			marker = JSON.parse(await fs.readFile(markerPath, 'utf8'));
		} catch (error) {
			throw new Error(`Refusing to overwrite an unowned ${mobileDirectory} directory`, { cause: error });
		}
		if (marker?.schemaVersion !== 1 || marker?.kind !== manifestKind) {
			throw new Error(`Refusing to overwrite an unowned ${mobileDirectory} directory`);
		}
	}
	await fs.mkdir(mobileRoot, { recursive: true });
	const lock = path.join(mobileRoot, '.mobile-build.lock');
	try {
		await fs.writeFile(lock, `${process.pid}\n`, { flag: 'wx' });
	} catch (error) {
		throw new Error(`Unable to acquire the mobile build lock: ${lock}. Check for another build before removing a stale lock.`, { cause: error });
	}
	let released = false;
	const release = async () => {
		if (!released) {
			released = true;
			await fs.rm(lock, { force: true });
		}
	};
	try {
		await fs.writeFile(path.join(mobileRoot, '.mobile-build.json'), JSON.stringify({ schemaVersion: 1, kind: manifestKind }));
		// A failed rebuild must never leave a success manifest pointing to partial files.
		await fs.rm(path.join(mobileRoot, mobileManifestName), { force: true });
		await fs.rm(path.join(mobileRoot, 'node_modules'), { recursive: true, force: true });
		await fs.rm(path.join(mobileRoot, 'extensions'), { recursive: true, force: true });
	} catch (error) {
		await release();
		throw error;
	}
	return release;
}

export function checkMobileDependencies(inputs: Iterable<string>): string[] {
	const paths = [...inputs].map(file => file.replaceAll('\\', '/')).sort();
	const blocked = paths.filter(file =>
		/^src\/vs\/(?:sessions|workbench)\/(?:sessions|workbench)\.(?:common|desktop|web)\.main(?:\.internal)?\.ts$/.test(file) ||
		/^src\/vs\/.*\/(?:electron-[^/]+|node|test)\//.test(file) ||
		policy.forbiddenModules.includes(file));
	const contributions = paths.filter(file => /(?:\.contributions?|\.all)\.ts$/.test(file));
	const unexpected = contributions.filter(file => !policy.contributions.includes(file));
	if (blocked.length || unexpected.length) {
		throw new Error(`Mobile dependency boundary failed:\n${[
			...blocked.map(file => `Forbidden module: ${file}`),
			...unexpected.map(file => `Unreviewed contribution: ${file}`),
		].join('\n')}`);
	}
	return [...new Set(contributions)];
}

/** Uses emitted inputs, not type-only source imports, to enforce the component boundary. */
export function mobilePlugin(root: string): esbuild.Plugin {
	return {
		name: 'mobile-boundaries',
		setup(build) {
			build.onResolve({ filter: /codicon\.ttf$/ }, args => {
				if (path.basename(args.importer) === 'codicon.css') {
					return { path: path.join(root, 'node_modules/@vscode/codicons/dist/codicon.ttf') };
				}
				return undefined;
			});
			build.onEnd(result => {
				if (result.metafile) {
					checkMobileDependencies(Object.keys(result.metafile.inputs));
					for (const output of Object.values(result.metafile.outputs)) {
						for (const dependency of output.imports) {
							if (dependency.external && !dependency.path.startsWith('data:') &&
								(dependency.kind !== 'dynamic-import' || !policy.externalModules.includes(dependency.path))) {
								throw new Error(`Unpackaged mobile dependency: ${dependency.path}`);
							}
						}
					}
				}
			});
		},
	};
}

export function checkMobileBudgets(assets: readonly MobileAsset[], budgets = policy.budgets): MobileManifest['sizes'] {
	const byPath = new Map(assets.map(asset => [asset.path, asset]));
	const required = Object.values(entrypoints).map(file => {
		const asset = byPath.get(file);
		if (!asset) {
			throw new Error(`Mobile package is missing ${file}`);
		}
		return asset;
	});
	const initialGzipBytes = required.reduce((total, asset) => total + asset.gzipBytes, 0);
	const runtimeGzipBytes = assets.filter(asset => !asset.path.startsWith('extensions/') && !isBuildMetadata(asset.path)).reduce((total, asset) => total + asset.gzipBytes, 0);
	const extensionsGzipBytes = assets.filter(asset => asset.path.startsWith('extensions/') && !isBuildMetadata(asset.path)).reduce((total, asset) => total + asset.gzipBytes, 0);
	const measured: Record<keyof typeof budgets, number> = {
		workbenchJavaScriptGzipBytes: required[0].gzipBytes,
		workbenchCssGzipBytes: required[1].gzipBytes,
		initialGzipBytes,
		runtimeGzipBytes,
		extensionsGzipBytes,
	};
	const exceeded = (Object.keys(budgets) as (keyof typeof budgets)[]).filter(key => measured[key] > budgets[key]);
	if (exceeded.length) {
		throw new Error(`Mobile size budget exceeded:\n${exceeded.map(key => `${key}: ${measured[key]} > ${budgets[key]} bytes`).join('\n')}`);
	}
	return { initialGzipBytes, runtimeGzipBytes, extensionsGzipBytes };
}

function isBuildMetadata(file: string): boolean {
	return file.endsWith('.map') || /^out\/(?:date|nls\.(?:keys|metadata|messages)\.json)$/.test(file) || /(?:LICENSE|NOTICE)/i.test(file);
}

export function mobileQuality(quality: string | undefined, expectedQuality?: string): MobileManifest['build']['quality'] {
	const result = quality ?? 'dev';
	assert.ok(['dev', 'insider', 'stable', 'exploration'].includes(result), `Invalid mobile product quality: ${result}`);
	if (expectedQuality) {
		assert.equal(result, expectedQuality, 'Mobile quality must come from the matching product.json mixin, not only VSCODE_QUALITY');
	}
	return result as MobileManifest['build']['quality'];
}

export function checkMobilePath(file: string): void {
	assert.ok(/^(?:[a-zA-Z0-9@_+., ()-]+\/)*[a-zA-Z0-9@_+., ()-]+$/.test(file) && file.split('/').every(part => part !== '.' && part !== '..' && !/[. ]$/.test(part)),
		`Invalid mobile relative path: ${file}`);
}

/** Also check parent directories: a regular file inside a symlink is not an artifact input. */
export async function readMobileFile(root: string, file: string): Promise<Buffer> {
	checkMobilePath(file);
	let current = root;
	for (const part of ['', ...file.split('/')]) {
		current = path.join(current, part);
		const stat = await fs.lstat(current);
		assert.ok(!stat.isSymbolicLink(), `Symlinks are not allowed in mobile assets: ${file}`);
		assert.ok(current === path.join(root, file) ? stat.isFile() : stat.isDirectory(), `Not a regular mobile input: ${file}`);
	}
	return fs.readFile(current);
}

interface ExtensionManifest {
	name: string;
	publisher: string;
	version: string;
	license?: string;
	main?: string;
	browser?: string;
	icon?: string;
	scripts?: object;
	dependencies?: object;
	devDependencies?: object;
	extensionDependencies?: string[];
	contributes?: {
		themes?: { path: string }[];
		iconThemes?: { path: string }[];
		grammars?: { path: string }[];
		snippets?: { path: string }[];
		languages?: { configuration?: string; icon?: { light: string; dark: string } }[];
	};
}

function extensionId(manifest: ExtensionManifest): string {
	assert.ok(typeof manifest.publisher === 'string' && typeof manifest.name === 'string' &&
		/^[a-z0-9-]+\.[a-z0-9-]+$/i.test(`${manifest.publisher}.${manifest.name}`), 'Invalid mobile extension identity');
	assert.ok(typeof manifest.version === 'string' && manifest.version.length > 0, 'Missing mobile extension version');
	return `${manifest.publisher}.${manifest.name}`.toLowerCase();
}

function checkExtensionDependencies(manifests: readonly ExtensionManifest[]): void {
	const ids = new Set(manifests.map(extensionId));
	assert.equal(ids.size, manifests.length, 'Duplicate mobile extension identity');
	for (const manifest of manifests) {
		assert.ok(!manifest.extensionDependencies || Array.isArray(manifest.extensionDependencies), `Invalid dependencies for ${extensionId(manifest)}`);
		for (const dependency of manifest.extensionDependencies ?? []) {
			assert.ok(typeof dependency === 'string' && ids.has(dependency.toLowerCase()),
				`Required extension ${dependency} for ${extensionId(manifest)} must be explicitly included in the mobile package`);
		}
	}
}

async function packageExtensionNotices(root: string, source: string, output: string): Promise<void> {
	const { getProductionDependencies } = await import('../lib/dependencies.ts');
	const dependencies = new Set(getProductionDependencies(source).map(dependency => dependency.source));
	// Source maps also reveal bundled aliases resolved outside the extension's dependency tree.
	for (const file of await fs.readdir(path.join(output, 'dist'), { recursive: true })) {
		if (!file.endsWith('.map')) {
			continue;
		}
		const mapFile = path.join(output, 'dist', file);
		const map: { sources: string[] } = JSON.parse(await fs.readFile(mapFile, 'utf8'));
		for (const entry of map.sources) {
			if (/^[a-zA-Z][a-zA-Z\d+.-]*:|^</.test(entry)) {
				continue;
			}
			const parts = path.resolve(path.dirname(mapFile), entry).split(path.sep);
			const index = parts.lastIndexOf('node_modules');
			if (index >= 0 && parts[index + 1]) {
				if (parts[index + 1] === '.pnpm') {
					// Published maps can point above a package root within its pnpm store entry.
					const storePackages = parts.slice(0, index + 3).join(path.sep) + path.sep + 'node_modules' + path.sep;
					assert.ok(parts[index + 2] && [...dependencies].some(dependency => dependency.startsWith(storePackages)),
						`Unidentified pnpm source-map dependency: ${entry}`);
					continue;
				}
				dependencies.add(parts.slice(0, index + (parts[index + 1].startsWith('@') ? 3 : 2)).join(path.sep));
			}
		}
	}
	const notices: string[] = [];
	try {
		notices.push((await readMobileFile(output, 'ThirdPartyNotices.txt')).toString());
	} catch (error) {
		if (!isMissing(error)) {
			throw error;
		}
	}
	for (const directory of [...dependencies].sort()) {
		const relative = path.relative(root, directory).replaceAll('\\', '/');
		const manifest: { name: string; version: string; license?: string | { type: string } } =
			JSON.parse((await readMobileFile(root, `${relative}/package.json`)).toString());
		const files = (await fs.readdir(directory)).filter(file => /^(?:licen[sc]e|notice|thirdpartynotices)(?:[.-]|$)/i.test(file)).sort();
		assert.ok(files.length > 0 || manifest.license, `Missing license information for bundled dependency ${manifest.name}`);
		const license = typeof manifest.license === 'string' ? manifest.license : manifest.license?.type;
		notices.push(`${manifest.name}@${manifest.version}\nLicense: ${license ?? 'See the notices below'}`);
		for (const file of files) {
			notices.push((await readMobileFile(root, `${relative}/${file}`)).toString());
		}
	}
	if (notices.length) {
		await fs.writeFile(path.join(output, 'ThirdPartyNotices.txt'), notices.join('\n\n') + '\n');
	}
}

/** Build browser code into the artifact, then copy only VSCE-selected source resources, never checkout build output. */
export async function packageMobileExtensions(root: string, names: readonly string[] = policy.extensions): Promise<void> {
	assert.ok(names.length > 0 && new Set(names).size === names.length, 'Mobile extensions must be an explicit, nonempty set');
	const manifests = await Promise.all(names.map(async name => {
		assert.match(name, /^[a-z0-9-]+$/, 'Invalid mobile extension folder');
		const manifest: ExtensionManifest = JSON.parse((await readMobileFile(root, `extensions/${name}/package.json`)).toString());
		extensionId(manifest);
		assert.ok(!manifest.main || manifest.browser, `Mobile extension ${name} has no browser entry`);
		if (manifest.browser) {
			assert.match(manifest.browser, /^\.\/dist\/browser\/[a-zA-Z0-9_-]+\.js$/, `Unsupported browser build layout for ${name}`);
			await readMobileFile(root, `extensions/${name}/esbuild.browser.mts`);
		}
		return manifest;
	}));
	checkExtensionDependencies(manifests);

	const { esbuildExtensions } = await import('../lib/extensions.ts');
	const mobileRoot = path.join(root, mobileDirectory);
	await fs.mkdir(path.join(mobileRoot, 'extensions'), { recursive: true });
	await esbuildExtensions('mobile extensions', false, names.flatMap((name, index) => manifests[index].browser ? [{
		script: path.join(root, 'extensions', name, 'esbuild.browser.mts'),
		outputRoot: path.join(mobileRoot, 'extensions', name, 'dist'),
	}] : []));

	const vsce = createRequire(import.meta.url)('@vscode/vsce') as typeof import('@vscode/vsce');
	const license = await readMobileFile(root, 'LICENSE.txt');
	for (const [index, name] of names.entries()) {
		const source = path.join(root, 'extensions', name);
		const output = path.join(mobileRoot, 'extensions', name);
		const files = await vsce.listFiles({ cwd: source, packageManager: vsce.PackageManager.None });
		for (const file of files) {
			if (/^(?:dist|out|node_modules)\//.test(file)) {
				continue;
			}
			const contents = await readMobileFile(source, file);
			const destination = path.join(output, file);
			await fs.mkdir(path.dirname(destination), { recursive: true });
			await fs.writeFile(destination, contents);
		}
		const manifest = { ...manifests[index] };
		delete manifest.main;
		delete manifest.scripts;
		delete manifest.dependencies;
		delete manifest.devDependencies;
		await fs.writeFile(path.join(output, 'package.json'), JSON.stringify(manifest));
		if (!files.some(file => /^(?:licen[sc]e)(?:[.-]|$)/i.test(file))) {
			assert.equal(manifest.license, 'MIT', `Missing license for mobile extension ${name}`);
			await fs.writeFile(path.join(output, 'LICENSE.txt'), license);
		}
		if (manifest.browser) {
			await readMobileFile(output, manifest.browser.slice(2));
			await packageExtensionNotices(root, source, output);
		}
	}
}

/** Validate the packaged manifests and their browser, grammar, theme and font resources. */
export async function readMobileExtensions(
	mobileRoot: string,
	assets: ReadonlySet<string>,
	readContents: (file: string) => Promise<Buffer> = file => readMobileFile(mobileRoot, file),
): Promise<MobileExtension[]> {
	const names = await fs.readdir(path.join(mobileRoot, 'extensions'));
	const extensions: MobileExtension[] = [];
	const manifests: ExtensionManifest[] = [];
	assert.ok(names.length > 0, 'Mobile package has no packaged extensions');
	for (const name of names.sort()) {
		const extensionPath = `extensions/${name}`;
		const manifestPath = `${extensionPath}/package.json`;
		assert.ok(assets.has(manifestPath), `Missing packaged extension manifest: ${manifestPath}`);
		const manifest: ExtensionManifest = JSON.parse((await readContents(manifestPath)).toString());
		assert.ok(!manifest.main, `Mobile extension ${name} must not reference a desktop entry`);
		const id = extensionId(manifest);
		extensions.push({ id, path: extensionPath });
		manifests.push(manifest);
		const resource = (base: string, reference: string) => {
			assert.ok(typeof reference === 'string' && !/^[\\/]|[\\%?#]/.test(reference), `Invalid extension resource in ${base}`);
			const file = path.posix.join(path.posix.dirname(base), reference);
			checkMobilePath(file);
			assert.ok(file.startsWith(`${extensionPath}/`) && assets.has(file), `Missing packaged extension resource: ${file}`);
			return file;
		};
		if (manifest.browser) {
			resource(manifestPath, manifest.browser);
		}
		if (manifest.icon) {
			resource(manifestPath, manifest.icon);
		}
		for (const entry of [...manifest.contributes?.grammars ?? [], ...manifest.contributes?.snippets ?? []]) {
			resource(manifestPath, entry.path);
		}
		for (const language of manifest.contributes?.languages ?? []) {
			if (language.configuration) {
				resource(manifestPath, language.configuration);
			}
			if (language.icon) {
				resource(manifestPath, language.icon.light);
				resource(manifestPath, language.icon.dark);
			}
		}
		const visitedThemes = new Set<string>();
		const checkTheme = async (file: string): Promise<void> => {
			if (visitedThemes.has(file)) {
				return;
			}
			visitedThemes.add(file);
			const errors: ParseError[] = [];
			const theme: { include?: string; fonts?: { src: { path: string }[] }[]; iconDefinitions?: Record<string, { iconPath?: string }> } =
				parseJsonc((await readContents(file)).toString(), errors, { allowTrailingComma: true });
			assert.equal(errors.length, 0, `Invalid packaged theme: ${file}`);
			if (theme.include) {
				await checkTheme(resource(file, theme.include));
			}
			for (const font of theme.fonts ?? []) {
				for (const source of font.src) {
					resource(file, source.path);
				}
			}
			for (const icon of Object.values(theme.iconDefinitions ?? {})) {
				if (icon.iconPath) {
					resource(file, icon.iconPath);
				}
			}
		};
		for (const theme of [...manifest.contributes?.themes ?? [], ...manifest.contributes?.iconThemes ?? []]) {
			await checkTheme(resource(manifestPath, theme.path));
		}
	}
	checkExtensionDependencies(manifests);
	return extensions;
}

/** Runtime libraries loaded by FileAccess/AMD live beside out/, not in a shared web package. */
export async function copyMobileLibraries(root: string): Promise<void> {
	const mobileRoot = path.join(root, mobileDirectory);
	for (const notice of ['LICENSE.txt', 'ThirdPartyNotices.txt']) {
		await fs.writeFile(path.join(mobileRoot, 'out', notice), await readMobileFile(root, notice));
	}
	for (const [packageName, patterns] of Object.entries(policy.libraries)) {
		const source = path.join(root, 'node_modules', packageName);
		const notices = (await fs.readdir(source)).filter(file => /^(?:licen[sc]e|notice|thirdpartynotices)(?:[.-]|$)/i.test(file));
		for (const pattern of [...patterns, ...notices]) {
			const matches: string[] = [];
			for await (const match of fs.glob(pattern, { cwd: source })) {
				matches.push(match);
			}
			if (!matches.length) {
				throw new Error(`Missing mobile library ${packageName}/${pattern}; restore repository dependencies`);
			}
			for (const file of matches) {
				const input = path.join(source, file);
				if (!(await fs.stat(input)).isFile()) {
					continue;
				}
				const dest = path.join(mobileRoot, 'node_modules', packageName, file);
				await fs.mkdir(path.dirname(dest), { recursive: true });
				await fs.copyFile(input, dest);
			}
		}
	}
}

export async function writeMobileManifest(
	root: string,
	build: MobileManifest['build'],
	inputs: Iterable<string>,
): Promise<MobileManifest> {
	const mobileRoot = path.join(root, mobileDirectory);
	const contributions = checkMobileDependencies(inputs);
	const assets: MobileAsset[] = [];
	for (const prefix of ['out', 'node_modules', 'extensions']) {
		const directory = path.join(mobileRoot, prefix);
		for (const file of await fs.readdir(directory, { recursive: true, withFileTypes: true })) {
			if (file.isSymbolicLink()) {
				throw new Error(`Symlinks are not allowed in mobile assets: ${file.name}`);
			}
			if (!file.isFile()) {
				continue;
			}
			const absolute = path.join(file.parentPath, file.name);
			const relative = path.relative(mobileRoot, absolute).replaceAll('\\', '/');
			const contents = await readMobileFile(mobileRoot, relative);
			if (relative.endsWith('.js') && contents.includes(Buffer.from('%%NLS'))) {
				throw new Error(`Unresolved localization placeholders in ${relative}`);
			}
			assets.push({
				path: relative, bytes: contents.byteLength, gzipBytes: gzipSync(contents).byteLength,
				sha256: createHash('sha256').update(contents).digest('hex'),
			});
		}
	}
	assets.sort((a, b) => a.path.localeCompare(b.path));
	const keys: [string, string[]][] = JSON.parse(await fs.readFile(path.join(mobileRoot, 'out/nls.keys.json'), 'utf8'));
	const messages: string[] = JSON.parse(await fs.readFile(path.join(mobileRoot, 'out/nls.messages.json'), 'utf8'));
	assert.equal(keys.reduce((sum, [, keys]) => sum + keys.length, 0), messages.length, 'Mobile NLS keys and messages must match');
	assert.ok(keys.some(([module]) => module.startsWith('vs/sessions/contrib/mobile/')), 'Mobile NLS must include experimental messages');
	const manifest: MobileManifest = {
		schemaVersion: 2,
		kind: manifestKind,
		build,
		entrypoints,
		extensions: await readMobileExtensions(mobileRoot, new Set(assets.map(asset => asset.path))),
		assets,
		preload: Object.values(entrypoints),
		sizes: checkMobileBudgets(assets),
		budgets: policy.budgets,
		contributions,
		localization: { keys: 'out/nls.keys.json', messages: 'out/nls.messages.json', metadata: 'out/nls.metadata.json' },
	};
	await fs.writeFile(path.join(mobileRoot, mobileManifestName), JSON.stringify(manifest, null, '\t') + '\n');
	console.log(`[mobile] ${assets.length} assets; ${manifest.extensions.length} extensions; ${manifest.sizes.initialGzipBytes} initial gzip bytes; ${manifest.sizes.runtimeGzipBytes} core runtime gzip bytes; ${manifest.sizes.extensionsGzipBytes} extension gzip bytes`);
	return manifest;
}

function isMissing(error: unknown): boolean {
	return error instanceof Error && (error as NodeJS.ErrnoException).code === 'ENOENT';
}
