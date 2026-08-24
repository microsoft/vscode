/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { execFileSync } from 'child_process';
import { createHash } from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { extract } from 'tar';

interface NpmPackageLock {
	packages?: Record<string, {
		version?: string;
		integrity?: string;
	}>;
}

export interface EnsureNpmPackageOptions {
	packPackage?: (packageName: string, version: string, tempDir: string) => string;
}

/**
 * Materializes an npm package from the version recorded in the adjacent
 * package-lock.json when it is missing from node_modules.
 */
export function ensureNpmPackage(packageName: string, nodeModulesRoot = 'node_modules', options: EnsureNpmPackageOptions = {}): void {
	const packageDir = path.join(nodeModulesRoot, ...packageName.split('/'));
	if (fs.existsSync(packageDir)) {
		return;
	}

	const lockFilePath = path.join(path.dirname(nodeModulesRoot), 'package-lock.json');
	const lockPackageKey = path.posix.join('node_modules', packageName);
	const lockPackage = readNpmPackageLock(lockFilePath).packages?.[lockPackageKey];
	if (!lockPackage?.version) {
		throw new Error(`[ensureNpmPackage] Missing ${lockPackageKey} in ${lockFilePath}. Run npm install to refresh the lockfile.`);
	}

	const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vscode-npm-package-'));
	try {
		const tarballPath = (options.packPackage ?? packNpmPackage)(packageName, lockPackage.version, tempDir);
		verifyNpmIntegrity(tarballPath, lockPackage.integrity);

		fs.mkdirSync(packageDir, { recursive: true });
		extract({ file: tarballPath, cwd: packageDir, strip: 1, sync: true });
		console.log(`[ensureNpmPackage] Materialized ${packageName}@${lockPackage.version} in ${packageDir}`);
	} catch (err) {
		fs.rmSync(packageDir, { recursive: true, force: true });
		throw new Error(`[ensureNpmPackage] Failed to materialize ${packageName}@${lockPackage.version}: ${err instanceof Error ? err.message : String(err)}`);
	} finally {
		fs.rmSync(tempDir, { recursive: true, force: true });
	}
}

/**
 * Materializes a SPECIFIC version of an npm package into `targetDir`, replacing
 * any existing contents. Unlike {@link ensureNpmPackage}, the version is passed
 * explicitly rather than read from the adjacent lockfile — use for build-time
 * payloads whose required version does not match that lockfile. Pass
 * `expectedIntegrity` (the `sha512-...` recorded for that version in the
 * relevant lockfile) to verify the fetched tarball before extraction.
 */
export function materializeNpmPackageVersion(packageName: string, version: string, targetDir: string, expectedIntegrity: string | undefined, options: EnsureNpmPackageOptions = {}): void {
	const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vscode-npm-package-'));
	try {
		const tarballPath = (options.packPackage ?? packNpmPackage)(packageName, version, tempDir);
		verifyNpmIntegrity(tarballPath, expectedIntegrity);

		fs.rmSync(targetDir, { recursive: true, force: true });
		fs.mkdirSync(targetDir, { recursive: true });
		extract({ file: tarballPath, cwd: targetDir, strip: 1, sync: true });
		console.log(`[materializeNpmPackageVersion] Materialized ${packageName}@${version} in ${targetDir}`);
	} catch (err) {
		fs.rmSync(targetDir, { recursive: true, force: true });
		throw new Error(`[materializeNpmPackageVersion] Failed to materialize ${packageName}@${version}: ${err instanceof Error ? err.message : String(err)}`);
	} finally {
		fs.rmSync(tempDir, { recursive: true, force: true });
	}
}


function packNpmPackage(packageName: string, version: string, tempDir: string): string {
	execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['pack', `${packageName}@${version}`, '--pack-destination', tempDir, '--silent'], { stdio: 'pipe', shell: process.platform === 'win32' });

	const tarball = fs.readdirSync(tempDir).find(name => name.endsWith('.tgz'));
	if (!tarball) {
		throw new Error(`npm pack did not produce a tarball in ${tempDir}`);
	}

	return path.join(tempDir, tarball);
}

function readNpmPackageLock(lockFilePath: string): NpmPackageLock {
	try {
		return JSON.parse(fs.readFileSync(lockFilePath, 'utf8'));
	} catch (err) {
		throw new Error(`[ensureNpmPackage] Failed to read ${lockFilePath}: ${err instanceof Error ? err.message : String(err)}`);
	}
}

function verifyNpmIntegrity(tarballPath: string, integrity: string | undefined): void {
	if (!integrity) {
		return;
	}

	const sha512Integrity = integrity.split(/\s+/).find(entry => entry.startsWith('sha512-'));
	if (!sha512Integrity) {
		return;
	}

	const expected = sha512Integrity.slice('sha512-'.length);
	const actual = createHash('sha512').update(fs.readFileSync(tarballPath)).digest('base64');
	if (actual !== expected) {
		throw new Error(`integrity mismatch for ${tarballPath}`);
	}
}
