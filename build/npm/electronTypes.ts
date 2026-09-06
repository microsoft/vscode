/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import fs from 'fs';
import path from 'path';
import { download, sha256 } from '../lib/download.ts';
import { getElectronVersion } from '../lib/electronVersion.ts';
import { root } from './installStateHash.ts';

const electronTypesPath = path.join(root, '.build', 'typings', 'electron.d.ts');

function getExpectedChecksum(): string {
	const checksumFile = fs.readFileSync(path.join(root, 'build', 'checksums', 'electron.txt'), 'utf8');
	const checksum = /^(?<checksum>[a-f0-9]{64}) \*electron\.d\.ts$/m.exec(checksumFile)?.groups?.checksum;
	if (!checksum) {
		throw new Error('Electron checksum manifest does not contain electron.d.ts');
	}
	return checksum;
}

export async function ensureElectronTypes(): Promise<void> {
	const expectedChecksum = getExpectedChecksum();
	if (fs.existsSync(electronTypesPath) && sha256(fs.readFileSync(electronTypesPath)) === expectedChecksum) {
		return;
	}

	const { electronVersion } = getElectronVersion();
	const url = `https://github.com/electron/electron/releases/download/v${electronVersion}/electron.d.ts`;
	const contents = await download(url, { checksumSha256: expectedChecksum });

	fs.mkdirSync(path.dirname(electronTypesPath), { recursive: true });
	fs.writeFileSync(electronTypesPath, contents);
}

if (import.meta.main) {
	ensureElectronTypes().catch(error => {
		console.error(error);
		process.exit(1);
	});
}
