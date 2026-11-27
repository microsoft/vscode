/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { execSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import zlib from 'zlib';
import { download, sha256 } from '../lib/download.ts';

const root = fs.realpathSync.native(path.dirname(path.dirname(import.meta.dirname)));

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
		const sizeField = readString(offset + 124, 12).trim();
		const size = sizeField ? Number.parseInt(sizeField, 8) : 0;
		if (!/^[0-7]*$/.test(sizeField) || offset + 512 + size > tar.length) {
			throw new Error(`Invalid tar entry size for ${name}: ${JSON.stringify(sizeField)}`);
		}
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
 * Fetches the `electron` npm package tarball with `npm pack`, so that it uses the npm registry and
 * credentials the build configured (for example the Azure Artifacts feed in product builds).
 */
export function packElectronFromNpm(electronVersion: string): Uint8Array {
	if (!/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(electronVersion)) {
		throw new Error(`Unexpected Electron version: ${electronVersion}`);
	}
	const destination = fs.mkdtempSync(path.join(os.tmpdir(), 'electron-types-'));
	try {
		const output = execSync(`npm pack electron@${electronVersion} --pack-destination "${destination}" --json --ignore-scripts`, {
			// Run from the checkout so npm also reads its project-level .npmrc, like pnpm install.
			cwd: root,
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'inherit'],
			timeout: 5 * 60 * 1000,
		});
		const [{ filename }] = JSON.parse(output) as { filename: string }[];
		return fs.readFileSync(path.join(destination, filename));
	} finally {
		fs.rmSync(destination, { recursive: true, force: true });
	}
}

/**
 * Downloads `electron.d.ts` from the Electron GitHub release. When GitHub fails (for example with
 * HTTP 504 during a GitHub incident), it falls back to the same file in the `electron` npm package
 * from the configured npm registry. Both sources are checked against the pinned checksum.
 */
export async function downloadElectronTypes(electronVersion: string, expectedChecksum: string, packFromNpm: (electronVersion: string) => Uint8Array | Promise<Uint8Array> = packElectronFromNpm): Promise<Uint8Array> {
	const githubUrl = `https://github.com/electron/electron/releases/download/v${electronVersion}/electron.d.ts`;
	try {
		return await download(githubUrl, { checksumSha256: expectedChecksum });
	} catch (githubError) {
		console.warn(`Downloading electron.d.ts from GitHub failed (${githubError}), using the electron@${electronVersion} npm package instead.`);
		try {
			const contents = extractFileFromTgz(await packFromNpm(electronVersion), 'package/electron.d.ts');
			if (!contents) {
				throw new Error(`electron@${electronVersion} does not contain package/electron.d.ts`);
			}
			const actualChecksum = sha256(contents);
			if (actualChecksum !== expectedChecksum) {
				throw new Error(`Checksum mismatch for electron.d.ts in electron@${electronVersion} (expected ${expectedChecksum}, actual ${actualChecksum})`);
			}
			return contents;
		} catch (npmError) {
			throw new Error(`Failed to download electron.d.ts from GitHub (${githubError}) and from the npm registry (${npmError})`);
		}
	}
}
