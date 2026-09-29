/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { spawn } from '@malept/cross-spawn-promise';
import fs from 'fs';
import path from 'path';

const MACHO_MAGIC_NUMBERS = new Set([
	0xFEEDFACE, // MH_MAGIC (32-bit)
	0xCEFAEDFE, // MH_CIGAM (32-bit, byte-swapped)
	0xFEEDFACF, // MH_MAGIC_64 (64-bit)
	0xCFFAEDFE, // MH_CIGAM_64 (64-bit, byte-swapped)
	0xCAFEBABE, // FAT_MAGIC (universal binary)
	0xBEBAFECA, // FAT_CIGAM (universal binary, byte-swapped)
]);

function isMachOBinary(filePath: string): boolean {
	try {
		let fd: number | undefined;
		try {
			fd = fs.openSync(filePath, 'r');
			const buffer = Buffer.alloc(4);
			fs.readSync(fd, buffer, 0, 4, 0);
			const magic = buffer.readUInt32BE(0);
			return MACHO_MAGIC_NUMBERS.has(magic);
		} finally {
			if (fd !== undefined) {
				fs.closeSync(fd);
			}
		}
	} catch {
		return false;
	}
}

async function main(serverDir: string): Promise<void> {
	if (!serverDir || !fs.existsSync(serverDir)) {
		throw new Error('Server directory argument is required');
	}

	const tempDir = process.env['AGENT_TEMPDIRECTORY'];
	if (!tempDir) {
		throw new Error('$AGENT_TEMPDIRECTORY not set');
	}

	const identity = process.env['CODESIGN_IDENTITY'];
	if (!identity) {
		throw new Error('$CODESIGN_IDENTITY not set');
	}

	const keychain = path.join(tempDir, 'buildagent.keychain');
	const baseDir = path.dirname(import.meta.dirname);
	const entitlementsPath = path.join(baseDir, 'azure-pipelines', 'darwin', 'server-entitlements.plist');

	console.log(`Signing Mach-O binaries in: ${serverDir}`);
	for (const entry of fs.readdirSync(serverDir, { withFileTypes: true, recursive: true })) {
		if (entry.isFile()) {
			const filePath = path.join(entry.parentPath, entry.name);
			if (isMachOBinary(filePath)) {
				console.log(`Signing: ${filePath}`);
				await spawn('codesign', [
					'--sign', identity,
					'--keychain', keychain,
					'--options', 'runtime',
					'--timestamp',
					'--force',
					'--entitlements', entitlementsPath,
					filePath
				]);
			}
		}
	}
}

if (import.meta.main) {
	main(process.argv[2]).catch(err => {
		console.error(err);
		process.exit(1);
	});
}
