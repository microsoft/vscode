/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createHash, randomUUID, X509Certificate } from 'crypto';
import { chmod, lstat, mkdir, readFile, rename, rm, stat, writeFile } from 'fs/promises';
import { join } from '../../../base/common/path.js';
import { IProcessEnvironment } from '../../../base/common/platform.js';
import { ILogService } from '../../log/common/log.js';

/** Canonicalizes PEM certificates and bundles, skipping malformed entries without logging their contents. */
export function normalizeCertificates(certificates: readonly string[], logService: ILogService): string[] {
	const normalized = new Set<string>();
	let invalidCount = 0;
	for (const bundle of certificates) {
		const parts = bundle.split('-----BEGIN CERTIFICATE-----');
		const entries = parts.length === 1 ? parts : parts.slice(1).map(part => `-----BEGIN CERTIFICATE-----${part}`);
		for (const certificate of entries) {
			try {
				normalized.add(new X509Certificate(certificate).toString());
			} catch {
				invalidCount++;
			}
		}
	}
	if (invalidCount) {
		logService.warn(`[Certificates] Ignored ${invalidCount} invalid CA certificate(s).`);
	}
	return [...normalized].sort();
}

/** Combines supplied certificates with an existing bundle without modifying the original file. */
export async function configureNodeExtraCaCerts(environment: IProcessEnvironment, directory: string, certificates: readonly string[], logService: ILogService): Promise<void> {
	if (!certificates.length) {
		return;
	}
	let combined = certificates;
	const existing = environment.NODE_EXTRA_CA_CERTS;
	if (existing) {
		try {
			if ((await stat(existing)).isFile()) {
				combined = [await readFile(existing, 'utf8'), ...certificates];
			}
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== 'ENOENT' && (error as NodeJS.ErrnoException).code !== 'ENOTDIR') {
				throw error;
			}
		}
	}
	const path = await writeCertificatesFile(combined, directory, logService);
	if (path) {
		environment.NODE_EXTRA_CA_CERTS = path;
	}
}

/** Publishes a content-addressed PEM bundle atomically in a caller-owned cache directory. */
export async function writeCertificatesFile(certificates: readonly string[], directory: string, logService: ILogService): Promise<string | undefined> {
	const normalized = normalizeCertificates(certificates, logService);
	if (!normalized.length) {
		return undefined;
	}
	const content = normalized.join('\n');
	const hash = createHash('sha256').update(content).digest('hex');
	await mkdir(directory, { recursive: true, mode: 0o700 });
	const directoryStat = await lstat(directory);
	if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink() || process.getuid && directoryStat.uid !== process.getuid()) {
		throw new Error(`Certificate cache is not an owned directory: ${directory}`);
	}
	if (process.platform !== 'win32') {
		await chmod(directory, 0o700);
	}
	const path = join(directory, `certificates-${hash}.pem`);
	if (await isCertificateFile(path)) {
		return path;
	}
	const temporaryPath = `${path}-${randomUUID()}`;
	await writeFile(temporaryPath, content, { mode: 0o600, flag: 'wx' });
	try {
		await rename(temporaryPath, path);
	} catch (error) {
		if (!await isCertificateFile(path)) {
			throw error;
		}
	} finally {
		await rm(temporaryPath, { force: true });
	}
	return path;
}

async function isCertificateFile(path: string): Promise<boolean> {
	try {
		const fileStat = await lstat(path);
		if (!fileStat.isFile() || fileStat.isSymbolicLink() || process.getuid && fileStat.uid !== process.getuid()) {
			throw new Error(`Certificate cache entry is not an owned file: ${path}`);
		}
		return true;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
			throw error;
		}
		return false;
	}
}
