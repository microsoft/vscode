/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import cp from 'child_process';
import { createRequire } from 'module';
import { collectImporterPackages, getImporterId, parsePackageKey, parsePnpmLockfile, type PnpmLockfile } from '../../lib/pnpmLock.ts';
import { getPnpmCommand } from '../../lib/pnpm.ts';
import { dump, load } from 'js-yaml';
import { getInstalledPackages, isDistTagSpecifier, renderYarnLockPins } from './npmLockfile.ts';
import { isInUniverse, type Satisfies, type Universe } from './checks.ts';
import { alignDependencyEdges } from './edgeAlignment.ts';
import { parseOverrideKey, renderWorkspaceYaml, type NpmFolder, type WorkspaceSettings } from './workspaceConfig.ts';

/**
 * Everything needed to generate the lockfile of one install root.
 */
export interface LockfilePlan {
	/** Install root folder relative to the repository root (`''` for the main workspace). */
	readonly folder: string;
	/** Absolute path of the folder that holds the projects on disk (for `file:` dependencies). */
	readonly sourceDir: string;
	/** The root project first, then the workspace members. */
	readonly projects: readonly NpmFolder[];
	/** The converted `package.json` contents by project folder. */
	readonly packageJsonTexts: ReadonlyMap<string, string>;
	readonly settings: WorkspaceSettings;
	readonly workspaceYaml: string;
}

export interface GeneratedLockfile {
	readonly text: string;
	readonly lockfile: PnpmLockfile;
	readonly rounds: number;
	/** Extra preferred versions added per importer to stay within the npm lockfiles. */
	readonly repairs: Readonly<Record<string, readonly string[]>>;
	/** Package dependencies changed to npm's version after the import (see `alignDependencyEdges`). */
	readonly aligned: readonly string[];
	/** Package dependencies where npm uses one other version that couldn't be aligned. */
	readonly notAligned: readonly string[];
}

export interface GenerateOptions {
	readonly universe: Universe;
	readonly satisfies: Satisfies | undefined;
	readonly keepTemp?: boolean;
	readonly maxRounds?: number;
	readonly log?: (message: string) => void;
}

/**
 * Returns `semver.satisfies` from the `node_modules` of `build` or of the repository root, or
 * `undefined` if it is not installed (checks that need it then fall back to exact comparisons).
 */
export function loadSatisfies(root: string): Satisfies | undefined {
	for (const from of [path.join(root, 'build', 'package.json'), path.join(root, 'package.json')]) {
		try {
			const semver = createRequire(from)('semver') as { satisfies(version: string, range: string, options?: { loose?: boolean }): boolean };
			return (version, range) => {
				try {
					return semver.satisfies(version, range, { loose: true });
				} catch {
					return false;
				}
			};
		} catch {
			// try the next location
		}
	}
	return undefined;
}

/**
 * Runs pnpm with the given arguments (see {@link getPnpmCommand}).
 */
export function runPnpm(args: readonly string[], cwd: string): { status: number | null; stdout: string; stderr: string } {
	const pnpm = getPnpmCommand();
	const result = cp.spawnSync(pnpm.command, [...pnpm.args, ...args], { cwd, encoding: 'utf8', shell: pnpm.shell, maxBuffer: 256 * 1024 * 1024 });
	if (result.error) {
		throw result.error;
	}
	return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

function versionsByName(universe: Universe): Map<string, string[]> {
	const result = new Map<string, string[]>();
	for (const key of [...universe.keys].sort()) {
		const at = key.lastIndexOf('@');
		const name = key.substring(0, at);
		let list = result.get(name);
		if (!list) {
			list = [];
			result.set(name, list);
		}
		list.push(key.substring(at + 1));
	}
	return result;
}

function getDirectSpecifiers(project: NpmFolder): Map<string, string> {
	const result = new Map<string, string>();
	for (const kind of ['dependencies', 'devDependencies', 'optionalDependencies'] as const) {
		for (const [name, specifier] of Object.entries(project.packageJson[kind] ?? {})) {
			const alias = /^npm:(@?[^@]+)@/.exec(specifier);
			result.set(alias ? alias[1] : name, alias ? specifier.substring(alias[0].length) : specifier);
		}
	}
	return result;
}

/**
 * Computes the preferred versions (`name@version`) of every project of an install root:
 *
 * - The root project prefers the versions of its own npm lockfile, and for packages that its
 *   lockfile doesn't have, the versions of the members' lockfiles. `pnpm import` uses these as
 *   the shared preferences of the workspace.
 * - Each member prefers the versions of its own npm lockfile (these replace the shared ones per
 *   package name), plus the versions in any npm lockfile that satisfy a workspace override of a
 *   package it doesn't depend on directly (pnpm applies overrides to the whole workspace).
 */
export function computePins(plan: LockfilePlan, universe: Universe, satisfies: Satisfies | undefined): Map<string, Set<string>> {
	const result = new Map<string, Set<string>>();
	const [rootProject, ...members] = plan.projects;
	const rootPins = new Set(getInstalledPackages(rootProject.lockfile).map(p => `${p.name}@${p.version}`));
	const rootNames = new Set(getInstalledPackages(rootProject.lockfile).map(p => p.name));
	for (const member of members) {
		for (const p of getInstalledPackages(member.lockfile)) {
			if (!rootNames.has(p.name)) {
				rootPins.add(`${p.name}@${p.version}`);
			}
		}
	}
	result.set(rootProject.folder, rootPins);

	const byName = versionsByName(universe);
	const overrides = Object.entries((plan.settings.overrides ?? {}) as Record<string, string>)
		.filter(([, value]) => !value.startsWith('file:') && !value.startsWith('link:'))
		.map(([key, value]) => ({ name: parseOverrideKey(key).name, range: value.startsWith('npm:') ? value.substring(value.indexOf('@', 5) + 1) : value }));
	for (const member of members) {
		const pins = new Set(getInstalledPackages(member.lockfile).map(p => `${p.name}@${p.version}`));
		const direct = getDirectSpecifiers(member);
		for (const { name, range } of overrides) {
			if (direct.has(name)) {
				continue;
			}
			for (const version of byName.get(name) ?? []) {
				if (version === range || satisfies?.(version, range)) {
					pins.add(`${name}@${version}`);
				}
			}
		}
		result.set(member.folder, pins);
	}
	return result;
}

/**
 * Returns the lockfile importer id of a project of the plan (`.` for the install root).
 */
export function getImporterIdOfProject(plan: LockfilePlan, project: NpmFolder): string {
	return getImporterId(path.resolve('/', plan.folder), path.resolve('/', project.folder));
}

function copyDirectory(source: string, target: string): void {
	fs.cpSync(source, target, { recursive: true, filter: file => path.basename(file) !== 'node_modules' });
}

/**
 * A direct dependency on a dist-tag (such as `latest`), pinned to the version that npm locked.
 */
export interface PinnedDistTag {
	readonly folder: string;
	readonly importerId: string;
	readonly name: string;
	readonly specifier: string;
	readonly pinned: string;
}

/**
 * Finds the direct dependencies on a dist-tag. pnpm always resolves a dist-tag to its current
 * target, so the import uses npm's locked version instead, and the lockfile gets the original
 * specifier back afterwards ({@link restoreImporterSpecifiers}). The result is the lockfile pnpm
 * would have written when the tag still pointed to that version.
 */
export function getPinnedDistTags(plan: LockfilePlan): PinnedDistTag[] {
	const result: PinnedDistTag[] = [];
	for (const project of plan.projects) {
		for (const kind of ['dependencies', 'devDependencies', 'optionalDependencies'] as const) {
			for (const [name, specifier] of Object.entries(project.packageJson[kind] ?? {})) {
				const locked = project.lockfile.packages[`node_modules/${name}`];
				if (!isDistTagSpecifier(specifier) || !locked?.version) {
					continue;
				}
				const pinned = specifier.startsWith('npm:') ? `npm:${locked.name ?? name}@${locked.version}` : locked.version;
				result.push({ folder: project.folder, importerId: getImporterIdOfProject(plan, project), name, specifier, pinned });
			}
		}
	}
	return result;
}

/**
 * Replaces the `specifier` of the given importer dependencies in the text of a lockfile.
 */
export function restoreImporterSpecifiers(text: string, distTags: readonly PinnedDistTag[]): string {
	if (distTags.length === 0) {
		return text;
	}
	const lines = text.split('\n');
	let inImporters = false;
	let importerId: string | undefined;
	let dependencyName: string | undefined;
	let restored = 0;
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		if (/^\S/.test(line)) {
			inImporters = line === 'importers:';
			continue;
		}
		if (!inImporters) {
			continue;
		}
		let match = /^  (\S.*):$/.exec(line);
		if (match) {
			importerId = String(load(match[1]));
			continue;
		}
		match = /^      (\S.*):$/.exec(line);
		if (match) {
			dependencyName = String(load(match[1]));
			continue;
		}
		match = /^        specifier: (.*)$/.exec(line);
		if (match) {
			const distTag = distTags.find(d => d.importerId === importerId && d.name === dependencyName && String(load(match![1])) === d.pinned);
			if (distTag) {
				lines[i] = `        specifier: ${dump(distTag.specifier, { lineWidth: -1 }).trimEnd()}`;
				restored++;
			}
		}
	}
	if (restored !== distTags.length) {
		throw new Error(`Could only restore ${restored} of ${distTags.length} dist-tag specifiers in the lockfile.`);
	}
	return lines.join('\n');
}

function writeShadow(plan: LockfilePlan, shadow: string, pins: ReadonlyMap<string, ReadonlySet<string>> | undefined, distTags: readonly PinnedDistTag[]): void {
	fs.mkdirSync(shadow, { recursive: true });
	for (const project of plan.projects) {
		const relative = path.relative(plan.folder, project.folder);
		const dir = path.join(shadow, relative);
		fs.mkdirSync(dir, { recursive: true });
		let packageJsonText = plan.packageJsonTexts.get(project.folder)!;
		const projectDistTags = pins ? distTags.filter(d => d.folder === project.folder) : [];
		if (projectDistTags.length > 0) {
			const json = JSON.parse(packageJsonText);
			for (const { name, pinned } of projectDistTags) {
				for (const kind of ['dependencies', 'devDependencies', 'optionalDependencies']) {
					if (json[kind]?.[name] !== undefined) {
						json[kind][name] = pinned;
					}
				}
			}
			packageJsonText = JSON.stringify(json, null, '\t');
		}
		fs.writeFileSync(path.join(dir, 'package.json'), packageJsonText);
		if (pins) {
			fs.writeFileSync(path.join(dir, 'yarn.lock'), renderYarnLockPins(pins.get(project.folder) ?? []));
		}
		for (const kind of ['dependencies', 'devDependencies', 'optionalDependencies'] as const) {
			for (const specifier of Object.values(project.packageJson[kind] ?? {})) {
				const filePath = specifier.startsWith('file:') ? specifier.substring('file:'.length) : undefined;
				// An absolute path (e.g. a local tarball) resolves the same from the copy.
				if (filePath !== undefined && !path.isAbsolute(filePath)) {
					const target = path.join(dir, filePath);
					if (!fs.existsSync(target)) {
						copyDirectory(path.join(plan.sourceDir, relative, filePath), target);
					}
				}
			}
		}
	}
	// The pnpmfile only sets environment variables for scripts, so it doesn't affect the resolution;
	// the copy doesn't have it. generateLockfile adds the checksum that pnpm records for it.
	const workspace = getShadowWorkspace(plan);
	for (const { source, target } of workspace.patchFiles) {
		fs.mkdirSync(path.dirname(path.join(shadow, target)), { recursive: true });
		fs.copyFileSync(source, path.join(shadow, target));
	}
	fs.writeFileSync(path.join(shadow, 'pnpm-workspace.yaml'), workspace.yaml);
}

/**
 * Returns the `pnpm-workspace.yaml` of the temporary copy of an install root (without the
 * pnpmfile), and the patch files to copy into it. pnpm records only a hash of each patch in the
 * lockfile, so the copy has them in its own `.patches` folder, wherever they are in the repository.
 */
export function getShadowWorkspace(plan: LockfilePlan): { readonly yaml: string; readonly patchFiles: readonly { readonly source: string; readonly target: string }[] } {
	const yaml = plan.workspaceYaml.replace(/^pnpmfile: .*\n/m, '');
	const patches = plan.settings.patchedDependencies as Readonly<Record<string, string>> | undefined;
	if (!patches) {
		return { yaml, patchFiles: [] };
	}
	const patchFiles = Object.entries(patches).map(([name, file]) => ({ name, source: path.join(plan.sourceDir, file), target: `.patches/${path.posix.basename(file)}` }));
	const patchedDependencies = Object.fromEntries(patchFiles.map(p => [p.name, p.target]));
	return {
		yaml: renderWorkspaceYaml({ ...(load(yaml) as WorkspaceSettings), patchedDependencies }),
		patchFiles: patchFiles.map(({ source, target }) => ({ source, target })),
	};
}

/**
 * Checks that pnpm accepts a lockfile as up to date for the real manifests and settings, without
 * resolving anything (`pnpm install --frozen-lockfile --lockfile-only`).
 */
function validateLockfile(plan: LockfilePlan, shadow: string, text: string, extraArgs: readonly string[] = []): void {
	writeShadow(plan, shadow, undefined, []);
	fs.writeFileSync(path.join(shadow, 'pnpm-lock.yaml'), text);
	const result = runPnpm(['install', '--frozen-lockfile', '--lockfile-only', '--ignore-scripts', '--config.minimum-release-age=0', ...extraArgs], shadow);
	if (result.status !== 0) {
		throw new Error(`pnpm rejects the generated lockfile of ${plan.folder || '.'} (exit code ${result.status}):\n${result.stdout}\n${result.stderr}`);
	}
	if (fs.readFileSync(path.join(shadow, 'pnpm-lock.yaml'), 'utf8') !== text) {
		throw new Error(`pnpm changed the generated lockfile of ${plan.folder || '.'} during validation.`);
	}
}

/**
 * Returns the `pnpmfileChecksum` that pnpm records in the lockfile of an install root whose
 * pnpmfile has hooks: the SHA-256 of the pnpmfile with LF line endings (pnpm normalizes them, so a
 * checkout with CRLF line endings gets the same lockfile), or `undefined` without a pnpmfile.
 */
export function getPnpmfileChecksum(sourceDir: string, settings: WorkspaceSettings): string | undefined {
	if (typeof settings.pnpmfile !== 'string') {
		return undefined;
	}
	const content = fs.readFileSync(path.join(sourceDir, settings.pnpmfile), 'utf8').replace(/\r\n/g, '\n');
	return `sha256-${crypto.createHash('sha256').update(content).digest('base64')}`;
}

/**
 * Adds `pnpmfileChecksum` to a lockfile generated without the pnpmfile, where pnpm writes it:
 * directly before `patchedDependencies`, or before `importers` without patches.
 */
export function addPnpmfileChecksum(text: string, checksum: string): string {
	const next = /^(?:patchedDependencies|importers):$/m.exec(text);
	if (!next || /^pnpmfileChecksum:/m.test(text)) {
		throw new Error('Cannot add pnpmfileChecksum to the lockfile.');
	}
	return `${text.slice(0, next.index)}pnpmfileChecksum: ${checksum}\n\n${text.slice(next.index)}`;
}

/**
 * Generates the lockfile of an install root with `pnpm import`, in a temporary copy of its
 * manifests (so the repository is not touched) that has the preferred versions of
 * {@link computePins} as `yarn.lock` files. pnpm resolves the dependencies of a package once per
 * workspace, using the preferences of the first project that reaches it, so a package can end up
 * outside the npm lockfiles. Each such package gets the versions from the npm lockfiles added to
 * the preferences of the projects that reach it (except where that could change a direct
 * dependency), and the import runs again, up to `maxRounds` times.
 */
export function generateLockfile(plan: LockfilePlan, options: GenerateOptions): GeneratedLockfile {
	const log = options.log ?? (() => { });
	const pins = computePins(plan, options.universe, options.satisfies);
	const distTags = getPinnedDistTags(plan);
	const repairs = new Map<string, Set<string>>();
	const byName = versionsByName(options.universe);
	const maxRounds = options.maxRounds ?? 4;
	const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'vscode-pnpm-convert-'));
	try {
		for (let round = 1; ; round++) {
			const shadow = path.join(temp, `round-${round}`);
			writeShadow(plan, shadow, pins, distTags);
			const result = runPnpm(['import', '--config.minimum-release-age=0'], shadow);
			if (result.status !== 0) {
				throw new Error(`pnpm import failed for ${plan.folder || '.'} (exit code ${result.status}):\n${result.stdout}\n${result.stderr}`);
			}
			const text = restoreImporterSpecifiers(fs.readFileSync(path.join(shadow, 'pnpm-lock.yaml'), 'utf8'), distTags);
			const lockfile = parsePnpmLockfile(text);

			const outside = Object.keys(lockfile.packages ?? {}).filter(key => {
				const { name, version } = parsePackageKey(key);
				return !/^(file|link):/.test(version) && !isInUniverse(options.universe, name, version);
			});
			log(`${plan.folder || '.'}: round ${round}, ${Object.keys(lockfile.packages ?? {}).length} packages, ${outside.length} outside the npm lockfiles`);

			let added = 0;
			if (outside.length > 0 && round < maxRounds) {
				const reachable = new Map(Object.keys(lockfile.importers).map(id => [id, collectImporterPackages(lockfile, id)]));
				for (const key of outside) {
					const { name } = parsePackageKey(key);
					for (const project of plan.projects) {
						const importerId = getImporterIdOfProject(plan, project);
						const packages = reachable.get(importerId);
						if (!packages || ![...packages].some(k => k === key || k.startsWith(`${key}(`))) {
							continue;
						}
						const range = getDirectSpecifiers(project).get(name);
						const projectPins = pins.get(project.folder)!;
						for (const version of byName.get(name) ?? []) {
							const pin = `${name}@${version}`;
							if (projectPins.has(pin) || (range !== undefined && (!options.satisfies || options.satisfies(version, range)))) {
								continue;
							}
							projectPins.add(pin);
							let projectRepairs = repairs.get(importerId);
							if (!projectRepairs) {
								projectRepairs = new Set();
								repairs.set(importerId, projectRepairs);
							}
							projectRepairs.add(pin);
							added++;
						}
					}
				}
			}
			if (added === 0) {
				validateLockfile(plan, path.join(temp, 'validate'), text);
				// pnpm records one set of dependencies per package; use npm's where npm agrees everywhere
				const alignment = alignDependencyEdges(text, plan.projects.map(project => project.lockfile));
				let finalText = text;
				let aligned = alignment.aligned;
				if (aligned.length > 0) {
					try {
						validateLockfile(plan, path.join(temp, 'validate-aligned'), alignment.text);
						finalText = alignment.text;
						log(`${plan.folder || '.'}: aligned ${aligned.length} package dependencies with npm`);
					} catch (err) {
						log(`${plan.folder || '.'}: pnpm rejects the lockfile with dependencies aligned with npm, keeping pnpm's resolution: ${err instanceof Error ? err.message.split('\n')[0] : err}`);
						aligned = [];
					}
				}
				const checksum = getPnpmfileChecksum(plan.sourceDir, plan.settings);
				if (checksum) {
					finalText = addPnpmfileChecksum(finalText, checksum);
					// The copy has no pnpmfile: pnpm accepts the recorded checksum only when ignoring it
					validateLockfile(plan, path.join(temp, 'validate-checksum'), finalText, ['--ignore-pnpmfile']);
				}
				return {
					text: finalText,
					lockfile: parsePnpmLockfile(finalText),
					rounds: round,
					repairs: Object.fromEntries([...repairs.entries()].sort(([a], [b]) => a < b ? -1 : 1).map(([id, set]) => [id, [...set].sort()])),
					aligned,
					notAligned: alignment.skipped,
				};
			}
			log(`${plan.folder || '.'}: added ${added} preferred versions, importing again`);
		}
	} finally {
		if (options.keepTemp) {
			log(`kept temporary folder ${temp}`);
		} else {
			fs.rmSync(temp, { recursive: true, force: true });
		}
	}
}
