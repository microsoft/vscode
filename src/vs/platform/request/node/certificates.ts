/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createHash, randomUUID, X509Certificate } from 'crypto';
import { chmod, lstat, mkdir, rename, rm, writeFile } from 'fs/promises';
import { join } from '../../../base/common/path.js';
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

/** Publishes certificates for child processes that read `NODE_EXTRA_CA_CERTS`, sharing one content-addressed file per certificate set. */
export function writeUserDataCertificatesFile(certificates: readonly string[], userDataPath: string, logService: ILogService): Promise<string | undefined> {
	return writeCertificatesFile(certificates, join(userDataPath, 'certificates'), logService);
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
