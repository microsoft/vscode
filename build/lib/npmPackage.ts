/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { execFileSync, type SpawnSyncReturns } from 'child_process';
import { createHash } from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { stripVTControlCharacters } from 'util';
import { extract } from 'tar';

interface NpmPackageLock {
	packages?: Record<string, {
		version?: string;
		integrity?: string;
	}>;
}

type NpmPackError = NodeJS.ErrnoException & Partial<SpawnSyncReturns<string | Buffer>>;

export interface EnsureNpmPackageOptions {
	packPackage?: (packageName: string, version: string, tempDir: string) => string;
	/** Delay between transient npm pack failures, in milliseconds. Defaults to 1000. */
	retryDelay?: number;
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
		const tarballPath = packNpmPackage(packageName, lockPackage.version, tempDir, options);
		verifyNpmIntegrity(tarballPath, lockPackage.integrity);

		fs.mkdirSync(packageDir, { recursive: true });
		extract({ file: tarballPath, cwd: packageDir, strip: 1, sync: true });
		console.log(`[ensureNpmPackage] Materialized ${packageName}@${lockPackage.version} in ${packageDir}`);
	} catch (err) {
		fs.rmSync(packageDir, { recursive: true, force: true });
		throw new Error(`[ensureNpmPackage] Failed to materialize ${packageName}@${lockPackage.version}: ${err instanceof Error ? err.message : String(err)}`, { cause: err });
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
		const tarballPath = packNpmPackage(packageName, version, tempDir, options);
		verifyNpmIntegrity(tarballPath, expectedIntegrity);

		fs.rmSync(targetDir, { recursive: true, force: true });
		fs.mkdirSync(targetDir, { recursive: true });
		extract({ file: tarballPath, cwd: targetDir, strip: 1, sync: true });
		console.log(`[materializeNpmPackageVersion] Materialized ${packageName}@${version} in ${targetDir}`);
	} catch (err) {
		fs.rmSync(targetDir, { recursive: true, force: true });
		throw new Error(`[materializeNpmPackageVersion] Failed to materialize ${packageName}@${version}: ${err instanceof Error ? err.message : String(err)}`, { cause: err });
	} finally {
		fs.rmSync(tempDir, { recursive: true, force: true });
	}
}

/** Retries only the pack operation, never integrity verification or extraction. */
function packNpmPackage(packageName: string, version: string, tempDir: string, options: EnsureNpmPackageOptions): string {
	const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
	const args = ['pack', `${packageName}@${version}`, '--pack-destination', tempDir, '--loglevel=error'];
	const attempts = 3;

	for (let attempt = 1; ; attempt++) {
		try {
			if (options.packPackage) {
				return options.packPackage(packageName, version, tempDir);
			}
			execFileSync(npm, args, { stdio: 'pipe', shell: process.platform === 'win32' });
			break;
		} catch (err) {
			const packError: NpmPackError = err instanceof Error ? err : new Error(String(err));
			const details = getNpmPackErrorDetails(packError);
			const error = new Error(`${npm} ${args.join(' ')} failed (attempt ${attempt}/${attempts}):\n${details}`, { cause: err });
			if (attempt === attempts || !isRetryableNpmPackError(packError)) {
				throw error;
			}

			const retryDelay = options.retryDelay ?? 1000;
			console.warn(`[packNpmPackage] ${error.message}\nRetrying in ${retryDelay}ms...`);
			fs.rmSync(tempDir, { recursive: true, force: true });
			fs.mkdirSync(tempDir);
			Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, retryDelay);
		}
	}

	const tarball = fs.readdirSync(tempDir).find(name => name.endsWith('.tgz'));
	if (!tarball) {
		throw new Error(`npm pack did not produce a tarball in ${tempDir}`);
	}

	return path.join(tempDir, tarball);
}

function isRetryableNpmPackError(err: NpmPackError): boolean {
	if (err.signal) {
		return false;
	}

	const stderr = stripVTControlCharacters(err.stderr?.toString() ?? '');
	// A process failure takes precedence over any earlier npm output.
	const code = err.code ?? /^\s*npm (?:error|ERR!) code (?<code>\S+)/im.exec(stderr)?.groups?.code;
	return code !== undefined && /^(?:ECONNRESET|ECONNREFUSED|EAI_AGAIN|ETIMEDOUT|ESOCKETTIMEDOUT|E408|E429|E5\d\d)$/i.test(code);
}

function getNpmPackErrorDetails(err: NpmPackError): string {
	const details = [err.message];
	if (err.code) {
		details.push(`code: ${err.code}`);
	}
	if (typeof err.status === 'number') {
		details.push(`exit status: ${err.status}`);
	}
	if (err.signal) {
		details.push(`signal: ${err.signal}`);
	}
	if (err.stdout) {
		details.push(`stdout:\n${err.stdout}`);
	}
	if (err.stderr) {
		details.push(`stderr:\n${err.stderr}`);
	}
	return details.join('\n');
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
