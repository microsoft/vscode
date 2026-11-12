/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Only Node.js modules: the extension and Copilot build scripts import this file without the
// dependencies of `build`.
import fs from 'node:fs';
import path from 'node:path';

/**
 * The parts of an esbuild metafile (`metafile: true`) that {@link findUndeclaredBundledPackages}
 * reads.
 */
export interface IBundleMetafile {
	readonly inputs: Record<string, { readonly imports?: readonly { readonly path: string; readonly external?: boolean; readonly original?: string }[] }>;
	readonly outputs: Record<string, { readonly entryPoint?: string; readonly inputs: Record<string, { readonly bytesInOutput: number }> }>;
}

export interface IBundledPackagesOptions {
	/** The working directory of the build (esbuild's `absWorkingDir`): metafile paths are relative to it. */
	readonly workingDirectory: string;
	/**
	 * The folder of the project that ships the bundles. It must declare the packages that
	 * {@link aliases} resolve to, and the packages of entry points, as production dependencies.
	 */
	readonly project: string;
	/**
	 * Import paths that the build resolves itself, with esbuild's `alias` or a plugin, for example
	 * a polyfill of a Node.js module in a browser build. They apply to every importer.
	 */
	readonly aliases?: readonly string[];
	/** Whether an output (a path of `metafile.outputs`) ships. By default, all outputs except source maps. */
	readonly isShipped?: (output: string) => boolean;
}

const productionFields = ['dependencies', 'optionalDependencies', 'peerDependencies'] as const;

interface IManifest {
	readonly name?: string;
	readonly version?: string;
	readonly dependencies?: Record<string, string>;
	readonly optionalDependencies?: Record<string, string>;
	readonly peerDependencies?: Record<string, string>;
	readonly devDependencies?: Record<string, string>;
}

/**
 * Returns the problems with the third-party packages in the shipped outputs of a build: each one
 * must be reachable from the production dependencies of the project that ships it. Otherwise the
 * license notices, which are generated from production dependencies, miss code that ships, and
 * the bundle gets whatever version the install happens to put where esbuild looks.
 *
 * - An import from the project's own code must resolve through the `node_modules` of a project
 *   that declares the package as a production dependency (its own, or a parent's, such as the
 *   TypeScript of `extensions`), not as a devDependency.
 * - An import from a package must resolve to a dependency that the package declares, not to a
 *   package that pnpm hoisted for the whole workspace (`node_modules/.pnpm/node_modules`) or that
 *   a project above it declares.
 * - The packages of {@link IBundledPackagesOptions.aliases}, and the packages of entry points
 *   (such as a stylesheet of a package), must be production dependencies of
 *   {@link IBundledPackagesOptions.project}, under any name (npm aliases included).
 *
 * Type-only imports and code that tree shaking removes don't count: only packages with bytes in
 * a shipped output do. A build that embeds the output of another build (for example in a plugin)
 * must check the metafile of that build too.
 */
export function findUndeclaredBundledPackages(metafile: IBundleMetafile, options: IBundledPackagesOptions): string[] {
	const isShipped = options.isShipped ?? (output => !output.endsWith('.map'));
	const toAbsolute = (file: string) => toSlashes(path.resolve(options.workingDirectory, file));
	// Read the manifests again for each check: watch builds check every rebuild in one process.
	const manifests = new ManifestReader();
	const shippedInputs = new Set<string>();
	const shippedPackages = new Set<string>();
	const entryPointPackages = new Map<string, string[]>();
	for (const [output, { entryPoint, inputs }] of Object.entries(metafile.outputs)) {
		if (!isShipped(output)) {
			continue;
		}
		const entryPointPackage = entryPoint && !hasNamespace(entryPoint) ? getPackageRoot(toAbsolute(entryPoint)) : undefined;
		if (entryPointPackage) {
			entryPointPackages.set(entryPointPackage, [...entryPointPackages.get(entryPointPackage) ?? [], entryPoint!]);
		}
		for (const [input, { bytesInOutput }] of Object.entries(inputs)) {
			shippedInputs.add(input);
			const packageRoot = bytesInOutput > 0 && !hasNamespace(input) ? getPackageRoot(toAbsolute(input)) : undefined;
			if (packageRoot) {
				shippedPackages.add(packageRoot);
			}
		}
	}

	const project = toSlashes(path.resolve(options.project));
	const aliases = options.aliases ?? [];
	// One problem per project (or package) and imported package, naming the first importer.
	const problems = new Map<string, string>();
	const report = (key: string, problem: string) => {
		if (!problems.has(key)) {
			problems.set(key, problem);
		}
	};
	// Chunks of dynamic imports (with `splitting`) are entry points too; the imports are checked below.
	const imported = new Set(Object.values(metafile.inputs).flatMap(({ imports = [] }) => imports.map(({ path: importedPath }) => toAbsolute(importedPath))));
	for (const [packageRoot, entryPoints] of entryPointPackages) {
		const entryPoint = entryPoints.find(file => !imported.has(toAbsolute(file)));
		if (entryPoint && !manifests.isProductionDependency(project, packageRoot)) {
			report(`${project}\0${packageRoot}`, `${relative(project)}: the build has an entry point in ${manifests.describe(packageRoot)} (${relative(toAbsolute(entryPoint))}), which isn't a production dependency of ${relative(project)}.`);
		}
	}
	for (const [input, { imports = [] }] of Object.entries(metafile.inputs).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) {
		if (!shippedInputs.has(input) || hasNamespace(input)) {
			continue;
		}
		const importer = toAbsolute(input);
		const importerPackage = getPackageRoot(importer);
		for (const { path: importedPath, external, original } of imports) {
			if (external || !original || hasNamespace(importedPath)) {
				continue;
			}
			const specifier = getPackageName(original.startsWith('node:') ? original.slice('node:'.length) : original);
			const target = getPackageRoot(toAbsolute(importedPath));
			if (!specifier || !target || target === importerPackage || !shippedPackages.has(target)) {
				continue;
			}
			const bundled = manifests.describe(target);
			const importerLabel = importerPackage ? manifests.describe(importerPackage) : relative(importer);

			if (aliases.some(alias => original === alias || original.startsWith(`${alias}/`))) {
				if (!manifests.isProductionDependency(project, target)) {
					report(`${project}\0${target}`, `${relative(project)}: the build resolves '${original}' to ${bundled}, which isn't a production dependency of ${relative(project)}.`);
				}
				continue;
			}

			if (importerPackage) {
				// pnpm's store links the dependencies of a package next to it. Other layouts can hoist
				// them anywhere above, so only packages in a store are checked.
				const siblings = importerPackage.slice(0, importerPackage.lastIndexOf('/node_modules/') + '/node_modules'.length);
				if (siblings.includes('/node_modules/.pnpm/') && !isSameFolder(path.posix.join(siblings, specifier), target) && !isSameFolder(path.posix.join(importerPackage, 'node_modules', specifier), target)) {
					report(`${importerPackage}\0${specifier}`, `${importerLabel} imports '${specifier}' without declaring it, and gets ${bundled} from ${relative(findResolvingFolder(importer, specifier) ?? target)}. Declare it with packageExtensions in pnpm-workspace.yaml.`);
				}
				continue;
			}

			const resolvingFolder = findResolvingFolder(importer, specifier);
			if (!resolvingFolder || !isSameFolder(resolvingFolder, target)) {
				// A plugin of the build resolved the import, without node_modules.
				continue;
			}
			const owner = resolvingFolder.slice(0, resolvingFolder.length - `/node_modules/${specifier}`.length);
			if (!fs.existsSync(path.join(owner, 'package.json'))) {
				report(`${resolvingFolder}`, `${importerLabel} imports '${specifier}', which no project declares, and gets ${bundled} from ${relative(resolvingFolder)}.`);
			} else if (!manifests.declaresForProduction(owner, specifier)) {
				const declaration = manifests.read(owner).devDependencies?.[specifier] ? 'a devDependency' : 'not a dependency';
				report(`${owner}\0${specifier}`, `${relative(owner)}: '${specifier}' is bundled (${bundled}, imported by ${importerLabel}) but is ${declaration} of ${relative(owner)}. Declare it in dependencies.`);
			}
		}
	}
	return [...problems.values()].sort();
}

/**
 * Throws if {@link findUndeclaredBundledPackages} finds problems.
 */
export function assertBundledPackagesDeclared(metafile: IBundleMetafile, options: IBundledPackagesOptions): void {
	const problems = findUndeclaredBundledPackages(metafile, options);
	if (problems.length > 0) {
		throw new Error(`Bundled packages that the shipping project doesn't reach through its production dependencies:\n${problems.map(problem => `  - ${problem}`).join('\n')}`);
	}
}

/**
 * Returns the folder of the nearest `package.json` above `file`.
 */
export function findProjectFolder(file: string): string {
	for (let dir = path.dirname(path.resolve(file)); ; dir = path.dirname(dir)) {
		if (fs.existsSync(path.join(dir, 'package.json'))) {
			return dir;
		}
		if (path.dirname(dir) === dir) {
			throw new Error(`No package.json above ${file}`);
		}
	}
}

/**
 * Reads the `package.json` files of projects and packages, each once.
 */
class ManifestReader {
	private readonly manifests = new Map<string, IManifest>();

	read(folder: string): IManifest {
		let manifest = this.manifests.get(folder);
		if (!manifest) {
			manifest = JSON.parse(fs.readFileSync(path.join(folder, 'package.json'), 'utf8')) as IManifest;
			this.manifests.set(folder, manifest);
		}
		return manifest;
	}

	describe(packageRoot: string): string {
		const { name, version } = this.read(packageRoot);
		return `${name}@${version}`;
	}

	declaresForProduction(folder: string, name: string): boolean {
		const manifest = this.read(folder);
		return productionFields.some(field => manifest[field]?.[name] !== undefined);
	}

	/**
	 * Whether a production dependency of `project`, under the name that it declares (which can be
	 * an npm alias), resolves to `packageRoot`.
	 */
	isProductionDependency(project: string, packageRoot: string): boolean {
		const manifest = this.read(project);
		return productionFields.some(field => Object.keys(manifest[field] ?? {}).some(name => {
			const folder = findResolvingFolder(path.posix.join(project, 'package.json'), name);
			return folder !== undefined && isSameFolder(folder, packageRoot);
		}));
	}
}

/** Returns the folder that Node.js finds for `node_modules/<name>` from the folder of `importer`. */
function findResolvingFolder(importer: string, name: string): string | undefined {
	for (let dir = path.posix.dirname(importer); ; dir = path.posix.dirname(dir)) {
		const candidate = path.posix.join(dir, 'node_modules', name);
		if (fs.existsSync(candidate)) {
			return candidate;
		}
		if (path.posix.dirname(dir) === dir) {
			return undefined;
		}
	}
}

function isSameFolder(a: string, b: string): boolean {
	try {
		return fs.realpathSync(a) === fs.realpathSync(b);
	} catch {
		return false;
	}
}

/** Returns the folder of the installed package that holds `file`, if any. */
function getPackageRoot(file: string): string | undefined {
	const index = file.lastIndexOf('/node_modules/');
	if (index < 0) {
		return undefined;
	}
	const start = index + '/node_modules/'.length;
	const name = getPackageName(file.slice(start));
	return name ? file.slice(0, start) + name : undefined;
}

/** Returns the package name of a bare import path (`@scope/name/sub` → `@scope/name`). */
function getPackageName(importPath: string): string | undefined {
	if (importPath.startsWith('.') || importPath.startsWith('/') || path.isAbsolute(importPath)) {
		return undefined;
	}
	const parts = importPath.split('/');
	if (importPath.startsWith('@')) {
		return parts.length > 1 ? `${parts[0]}/${parts[1]}` : undefined;
	}
	return parts[0];
}

/** Whether a metafile path is in a namespace of esbuild or a plugin, such as `(disabled):…`. */
function hasNamespace(file: string): boolean {
	return /^[^/\\.]+:/.test(file) && !path.isAbsolute(file);
}

function toSlashes(file: string): string {
	return file.replace(/\\/g, '/');
}

const repositoryRoot = path.resolve(import.meta.dirname, '..', '..');

/** Returns `file` relative to the repository, for messages. */
function relative(file: string): string {
	return toSlashes(path.relative(repositoryRoot, file)) || 'the root project';
}
