/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { copilotPlatforms } from '../../lib/copilotPlatforms.ts';
import { runtimeArtifactName } from '../../lib/copilotRuntimeSource.ts';

const NPM = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const SOURCE_VERSION = /^\d+\.\d+\.\d+-[0-9A-Za-z]+(?:[0-9A-Za-z.-]*[0-9A-Za-z])?$/;

interface PackageManifest {
	name: string;
	version: string;
	description?: string;
	license?: string;
	type?: string;
	repository?: object;
	bugs?: object;
	homepage?: string;
	author?: string;
	bin?: Record<string, string>;
	dependencies?: Record<string, string>;
	optionalDependencies?: Record<string, string>;
	files?: string[];
	exports?: Record<string, string | Record<string, string>>;
	os?: string[];
	cpu?: string[];
	libc?: string[];
}

export function assertSourceVersion(version: string): void {
	if (!SOURCE_VERSION.test(version)) {
		throw new Error(`[copilot-source-publish] Invalid source package version "${version}". Expected a semver prerelease.`);
	}
}

function readManifest(dir: string): PackageManifest {
	const manifestPath = path.join(dir, 'package.json');
	if (!fs.existsSync(manifestPath)) {
		throw new Error(`[copilot-source-publish] Missing package.json in ${dir}.`);
	}
	return JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as PackageManifest;
}

function writeManifest(dir: string, manifest: PackageManifest): void {
	fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(manifest, null, 2) + '\n');
}

function targetMetadata(target: string): { platform: string; arch: string; os: string; libc?: string } {
	const separator = target.lastIndexOf('-');
	const platform = target.slice(0, separator);
	const arch = target.slice(separator + 1);
	return {
		platform,
		arch,
		os: platform === 'linuxmusl' ? 'linux' : platform,
		libc: platform === 'linux' ? 'glibc' : platform === 'linuxmusl' ? 'musl' : undefined,
	};
}

function assertRuntimePackage(dir: string, target: string, expectedRef: string): void {
	for (const relativePath of ['index.js', 'npm-loader.js', 'sdk/index.js', 'sdk/index.d.ts']) {
		if (!fs.existsSync(path.join(dir, relativePath))) {
			throw new Error(`[copilot-source-publish] ${runtimeArtifactName(target)} is incomplete: missing ${relativePath}.`);
		}
	}
	const markerPath = path.join(dir, '.copilot-source-complete');
	if (!fs.existsSync(markerPath)) {
		throw new Error(`[copilot-source-publish] ${runtimeArtifactName(target)} is incomplete: missing .copilot-source-complete.`);
	}
	const actualRef = fs.readFileSync(markerPath, 'utf8').trim();
	if (actualRef !== expectedRef) {
		throw new Error(`[copilot-source-publish] ${runtimeArtifactName(target)} was built from ${actualRef || '<empty>'}, but this build requires ${expectedRef}.`);
	}
}

/**
 * Converts the eight target artifacts into the package layout consumed by npm:
 * one thin `@github/copilot` loader plus one full JS/native package per target.
 */
export function assembleRuntimePackages(artifactsDir: string, outputDir: string, version: string, runtimeRef: string): string[] {
	assertSourceVersion(version);
	fs.rmSync(outputDir, { recursive: true, force: true });
	fs.mkdirSync(outputDir, { recursive: true });

	const optionalDependencies: Record<string, string> = {};
	let mainSource: string | undefined;
	const packageDirs: string[] = [];

	for (const target of copilotPlatforms) {
		const artifactDir = path.join(artifactsDir, runtimeArtifactName(target));
		assertRuntimePackage(artifactDir, target, runtimeRef);
		mainSource ??= artifactDir;

		const packageDir = path.join(outputDir, target);
		fs.cpSync(artifactDir, packageDir, { recursive: true });
		fs.rmSync(path.join(packageDir, '.copilot-source-complete'), { force: true });

		const { arch, os, libc } = targetMetadata(target);
		const packageName = `@github/copilot-${target}`;
		const sourceManifest = readManifest(packageDir);
		const manifest: PackageManifest = {
			name: packageName,
			version,
			description: `GitHub Copilot CLI runtime for ${target}`,
			license: sourceManifest.license,
			type: sourceManifest.type,
			repository: sourceManifest.repository,
			bugs: sourceManifest.bugs,
			homepage: sourceManifest.homepage,
			os: [os],
			cpu: [arch],
			exports: {
				'.': './index.js',
				'./sdk': {
					types: './sdk/index.d.ts',
					import: './sdk/index.js',
				},
			},
			files: sourceManifest.files,
		};
		if (libc) {
			manifest.libc = [libc];
		}
		writeManifest(packageDir, manifest);
		optionalDependencies[packageName] = version;
		packageDirs.push(packageDir);
	}

	if (!mainSource) {
		throw new Error('[copilot-source-publish] No runtime artifacts were assembled.');
	}

	const mainDir = path.join(outputDir, 'copilot');
	fs.mkdirSync(mainDir, { recursive: true });
	for (const file of ['npm-loader.js', 'README.md', 'LICENSE.md']) {
		const source = path.join(mainSource, file);
		if (fs.existsSync(source)) {
			fs.copyFileSync(source, path.join(mainDir, file));
		}
	}
	const sourceManifest = readManifest(mainSource);
	writeManifest(mainDir, {
		name: '@github/copilot',
		version,
		description: sourceManifest.description,
		license: sourceManifest.license,
		type: sourceManifest.type,
		repository: sourceManifest.repository,
		bugs: sourceManifest.bugs,
		homepage: sourceManifest.homepage,
		author: sourceManifest.author,
		bin: { copilot: 'npm-loader.js' },
		dependencies: sourceManifest.dependencies,
		optionalDependencies,
		files: ['npm-loader.js', 'README.md', 'LICENSE.md'],
	});

	return [...packageDirs, mainDir];
}

function runNpm(args: string[], cwd?: string): { status: number; output: string } {
	const result = spawnSync(NPM, args, {
		cwd,
		encoding: 'utf8',
		shell: process.platform === 'win32',
	});
	const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
	if (result.error) {
		throw result.error;
	}
	return { status: result.status ?? 1, output };
}

function packageExists(name: string, version: string, registry: string): boolean {
	const result = runNpm(['view', `${name}@${version}`, 'version', '--registry', registry]);
	if (result.status === 0) {
		return result.output.trim().replace(/^"|"$/g, '') === version;
	}
	if (/\bE404\b|404 Not Found|is not in this registry/i.test(result.output)) {
		return false;
	}
	throw new Error(`[copilot-source-publish] Failed to query ${name}@${version}:\n${result.output}`);
}

export function publishPackage(packagePath: string, registry: string, tag = 'vscode-source', identity?: { name: string; version: string }): void {
	const packageDirectory = fs.statSync(packagePath).isDirectory() ? packagePath : undefined;
	const { name, version } = identity ?? readManifest(packageDirectory!);
	if (packageExists(name, version, registry)) {
		console.log(`[copilot-source-publish] ${name}@${version} already exists; skipping.`);
		return;
	}

	const result = runNpm(['publish', packagePath, '--tag', tag, '--access', 'restricted', '--registry', registry]);
	if (result.status !== 0) {
		throw new Error(`[copilot-source-publish] Failed to publish ${name}@${version}:\n${result.output}`);
	}
	console.log(result.output);
	console.log(`[copilot-source-publish] Published ${name}@${version}.`);
}
