/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { download, sha256 } from '../lib/download.ts';
import { getElectronVersion } from '../lib/electronVersion.ts';

const root = fs.realpathSync.native(path.dirname(path.dirname(import.meta.dirname)));
const electronTypesPath = path.join(root, '.build', 'typings', 'electron.d.ts');

function getExpectedChecksum(): string {
	const checksumFile = fs.readFileSync(path.join(root, 'build', 'checksums', 'electron.txt'), 'utf8');
	const checksum = /^(?<checksum>[a-f0-9]{64}) \*electron\.d\.ts$/m.exec(checksumFile)?.groups?.checksum;
	if (!checksum) {
		throw new Error('Electron checksum manifest does not contain electron.d.ts');
	}
	return checksum;
}

/**
 * Returns the contents of a file in a gzipped tar archive, or `undefined` if the archive does not
 * contain it. Supports the ustar entries npm package tarballs use.
 */
export function extractFileFromTgz(tgz: Uint8Array, filePath: string): Uint8Array | undefined {
	const tar = zlib.gunzipSync(tgz);
	const readString = (start: number, length: number) => {
		const field = tar.subarray(start, start + length);
		const end = field.indexOf(0);
		return field.subarray(0, end === -1 ? length : end).toString('utf8');
	};

	for (let offset = 0; offset + 512 <= tar.length;) {
		const name = readString(offset, 100);
		if (!name) {
			return undefined;
		}
		const prefix = readString(offset + 345, 155);
		const size = Number.parseInt(readString(offset + 124, 12).trim() || '0', 8);
		const type = readString(offset + 156, 1);
		const dataStart = offset + 512;
		if ((type === '' || type === '0') && (prefix ? `${prefix}/${name}` : name) === filePath) {
			return tar.subarray(dataStart, dataStart + size);
		}
		offset = dataStart + Math.ceil(size / 512) * 512;
	}
	return undefined;
}

/**
 * Downloads `electron.d.ts` from the Electron GitHub release. When GitHub fails (for example with
 * HTTP 504 during a GitHub incident), it falls back to the same file in the `electron` npm package
 * on the npm registry. Both sources are checked against the pinned checksum.
 */
export async function downloadElectronTypes(electronVersion: string, expectedChecksum: string): Promise<Uint8Array> {
	const githubUrl = `https://github.com/electron/electron/releases/download/v${electronVersion}/electron.d.ts`;
	try {
		return await download(githubUrl, { checksumSha256: expectedChecksum });
	} catch (githubError) {
		const npmUrl = `https://registry.npmjs.org/electron/-/electron-${electronVersion}.tgz`;
		console.warn(`Downloading electron.d.ts from GitHub failed (${githubError}), using ${npmUrl} instead.`);
		try {
			const contents = extractFileFromTgz(await download(npmUrl), 'package/electron.d.ts');
			if (!contents) {
				throw new Error(`${npmUrl} does not contain package/electron.d.ts`);
			}
			const actualChecksum = sha256(contents);
			if (actualChecksum !== expectedChecksum) {
				throw new Error(`Checksum mismatch for electron.d.ts in ${npmUrl} (expected ${expectedChecksum}, actual ${actualChecksum})`);
			}
			return contents;
		} catch (npmError) {
			throw new Error(`Failed to download electron.d.ts from GitHub (${githubError}) and from the npm registry (${npmError})`);
		}
	}
}

export async function ensureElectronTypes(): Promise<void> {
	const expectedChecksum = getExpectedChecksum();
	if (fs.existsSync(electronTypesPath) && sha256(fs.readFileSync(electronTypesPath)) === expectedChecksum) {
		return;
	}

	const { electronVersion } = getElectronVersion();
	const contents = await downloadElectronTypes(electronVersion, expectedChecksum);

	fs.mkdirSync(path.dirname(electronTypesPath), { recursive: true });
	fs.writeFileSync(electronTypesPath, contents);
}

if (import.meta.main) {
	ensureElectronTypes().catch(error => {
		console.error(error);
		process.exit(1);
	});
}