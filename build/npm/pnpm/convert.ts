/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Converts the npm configuration of the repository to pnpm. Run it on the npm state (the
 * `package-lock.json` files on disk, or in git once they are deleted), then run verify-locks.ts:
 *
 *   node build/npm/pnpm/convert.ts && node build/npm/pnpm/verify-locks.ts
 *
 * Writes, for every install root (see build/npm/dirs.ts): `pnpm-workspace.yaml` (settings,
 * `allowBuilds` from `allowScripts`, `overrides`) and `pnpm-lock.yaml` (with the versions of the
 * npm lockfiles). Removes `overrides` and `allowScripts` from every converted `package.json`, sets
 * `packageManager` in every install root, and deletes the converted `package-lock.json` files.
 *
 * Options:
 *   --npm-ref <ref>        read the npm state from this git revision (default: see npmSource.ts)
 *   --distro <path>        convert a distro checkout instead (`<path>/npm`, `npm/remote`,
 *                          `npm/remote/web`); keeps its npm files and `allowScripts`
 *   --report <file>        write a JSON report
 *   --check-determinism    generate every lockfile twice and fail if the results differ
 *   --keep-temp            keep the temporary folders used by `pnpm import`
 */

import fs from 'fs';
import path from 'path';
import { parseArgs } from 'util';
import { createUniverse } from './checks.ts';
import { convertPackageJsonText, getAllNpmLockfileFolders, getDistroRootFolders, getInstallRootFolders, loadInstallRoot, loadNpmFolder, noDependencyFolders, renderInstallRootYaml, type InstallRoot } from './installRoots.ts';
import { generateLockfile, loadSatisfies, runPnpm, type GeneratedLockfile, type LockfilePlan } from './lockfileGenerator.ts';
import { getDiskSource, getNpmSource, type NpmSource } from './npmSource.ts';
import { pnpmVersion } from './workspaceConfig.ts';

const REPO_ROOT = path.join(import.meta.dirname, '..', '..', '..');

function log(message: string): void {
	console.log(`[convert] ${message}`);
}

function assertPnpmVersion(cwd: string): void {
	const result = runPnpm(['--version'], cwd);
	const version = result.stdout.trim();
	if (result.status !== 0 || version !== pnpmVersion) {
		throw new Error(`convert.ts needs pnpm ${pnpmVersion} on PATH, found ${version || 'none'}: ${result.stderr}`);
	}
}

interface RootResult {
	readonly root: InstallRoot;
	readonly baseDir: string;
	readonly yaml: string;
	readonly packageJsonTexts: Map<string, string>;
	readonly generated: GeneratedLockfile;
}

function main(): void {
	const { values } = parseArgs({
		options: {
			'npm-ref': { type: 'string' },
			'distro': { type: 'string' },
			'report': { type: 'string' },
			'check-determinism': { type: 'boolean', default: false },
			'keep-temp': { type: 'boolean', default: false },
		},
	});

	const distroDir = values.distro ? path.resolve(values.distro) : undefined;
	const baseDir = distroDir ?? REPO_ROOT;
	assertPnpmVersion(baseDir);

	const repoSource = getNpmSource(REPO_ROOT, values['npm-ref']);
	repoSource.prefetch?.(getAllNpmLockfileFolders().flatMap(folder => [path.posix.join(folder, 'package.json'), path.posix.join(folder, 'package-lock.json')]));
	const source: NpmSource = distroDir ? getDiskSource(distroDir) : repoSource;
	log(`npm state: ${source.description}`);
	const satisfies = loadSatisfies(REPO_ROOT);
	if (!satisfies) {
		log('warning: semver is not installed in node_modules; overrides and pins use exact versions only');
	}

	const universeLockfiles = getAllNpmLockfileFolders().map(folder => loadNpmFolder(repoSource, folder).lockfile);
	const rootFolders = distroDir ? getDistroRootFolders() : getInstallRootFolders();
	const roots = rootFolders.map(folders => loadInstallRoot(source, folders, satisfies, baseDir, !distroDir));
	const universe = createUniverse([...universeLockfiles, ...roots.flatMap(r => r.projects.map(p => p.lockfile))]);

	const results: RootResult[] = [];
	for (const root of roots) {
		const yaml = renderInstallRootYaml(root);
		const packageJsonTexts = new Map<string, string>();
		for (const project of root.projects) {
			const diskText = fs.readFileSync(path.join(baseDir, project.folder, 'package.json'), 'utf8');
			packageJsonTexts.set(project.folder, convertPackageJsonText(diskText, { isInstallRoot: project === root.projects[0], keepNpmFields: !!distroDir }));
		}
		for (const note of root.notes) {
			log(`${root.folder || '.'}: ${note.kind}: ${note.folder || '.'}: ${note.message}`);
		}
		const plan: LockfilePlan = { folder: root.folder, sourceDir: path.join(baseDir, root.folder), projects: root.projects, packageJsonTexts, settings: root.settings, workspaceYaml: yaml };
		const generated = generateLockfile(plan, { universe, satisfies, keepTemp: values['keep-temp'], log });
		if (values['check-determinism']) {
			const again = generateLockfile(plan, { universe, satisfies, keepTemp: values['keep-temp'], log });
			if (again.text !== generated.text) {
				throw new Error(`Non-deterministic lockfile for ${root.folder || '.'}: two runs produced different results.`);
			}
			log(`${root.folder || '.'}: determinism check passed`);
		}
		results.push({ root, baseDir, yaml, packageJsonTexts, generated });
	}

	const written: string[] = [];
	const deleted: string[] = [];
	const write = (relativePath: string, content: string) => {
		const file = path.join(baseDir, relativePath);
		if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== content) {
			fs.writeFileSync(file, content);
			written.push(relativePath);
		}
	};
	const remove = (relativePath: string) => {
		const file = path.join(baseDir, relativePath);
		if (fs.existsSync(file)) {
			fs.rmSync(file);
			deleted.push(relativePath);
		}
	};
	for (const { root, yaml, packageJsonTexts, generated } of results) {
		write(path.posix.join(root.folder, 'pnpm-workspace.yaml'), yaml);
		write(path.posix.join(root.folder, 'pnpm-lock.yaml'), generated.text);
		for (const [folder, text] of packageJsonTexts) {
			write(path.posix.join(folder, 'package.json'), text);
			if (!distroDir) {
				remove(path.posix.join(folder, 'package-lock.json'));
			}
		}
	}
	if (!distroDir) {
		for (const folder of noDependencyFolders) {
			const packageJson = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, folder, 'package.json'), 'utf8'));
			if (packageJson.dependencies || packageJson.devDependencies || packageJson.optionalDependencies) {
				throw new Error(`${folder} has dependencies; make it an install root in build/npm/dirs.ts.`);
			}
			remove(path.posix.join(folder, 'package-lock.json'));
		}
	}

	log(`wrote ${written.length} files, deleted ${deleted.length} package-lock.json files`);
	if (values.report) {
		fs.mkdirSync(path.dirname(path.resolve(values.report)), { recursive: true });
		fs.writeFileSync(values.report, JSON.stringify({
			npmState: source.description,
			pnpmVersion,
			roots: results.map(({ root, generated }) => ({
				folder: root.folder,
				projects: root.projects.map(p => p.folder),
				notes: root.notes,
				rounds: generated.rounds,
				repairs: generated.repairs,
				aligned: generated.aligned,
				notAligned: generated.notAligned,
			})),
			written,
			deleted,
		}, null, '\t') + '\n');
		log(`report: ${values.report}`);
	}
}

try {
	main();
} catch (err) {
	console.error(`[convert] ${err instanceof Error ? err.message : err}`);
	process.exit(1);
}
