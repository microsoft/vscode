/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import fs from 'fs';
import path from 'path';
import { spawn } from '@malept/cross-spawn-promise';

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
		const fd = fs.openSync(filePath, 'r');
		const buffer = Buffer.alloc(4);
		fs.readSync(fd, buffer, 0, 4, 0);
		fs.closeSync(fd);
		const magic = buffer.readUInt32BE(0);
		return MACHO_MAGIC_NUMBERS.has(magic);
	} catch {
		return false;
	}
}

function findMachOBinaries(dir: string): string[] {
	const binaries: string[] = [];
	const entries = fs.readdirSync(dir, { withFileTypes: true });

	for (const entry of entries) {
		const filePath = path.join(dir, entry.name);

		if (entry.isDirectory()) {
			// Skip node_modules/.cache and other non-essential directories
			if (entry.name !== '.cache') {
				binaries.push(...findMachOBinaries(filePath));
			}
		} else if (entry.isFile() && isMachOBinary(filePath)) {
			binaries.push(filePath);
		}
	}

	return binaries;
}

async function signBinary(filePath: string, identity: string, keychain: string, entitlementsPath: string): Promise<void> {
	console.log(`Signing: ${filePath}`);

	const args = [
		'--sign', identity,
		'--keychain', keychain,
		'--options', 'runtime',
		'--timestamp',
		'--force',
		'--entitlements', entitlementsPath,
		filePath
	];

	await spawn('codesign', args);
}

async function main(serverDir: string): Promise<void> {
	const tempDir = process.env['AGENT_TEMPDIRECTORY'];
	const identity = process.env['CODESIGN_IDENTITY'];

	if (!serverDir) {
		throw new Error('Server directory argument is required');
	}

	if (!tempDir) {
		throw new Error('$AGENT_TEMPDIRECTORY not set');
	}

	if (!identity) {
		throw new Error('$CODESIGN_IDENTITY not set');
	}

	const keychain = path.join(tempDir, 'buildagent.keychain');
	const root = path.dirname(path.dirname(import.meta.dirname));
	const entitlementsPath = path.join(root, 'azure-pipelines', 'darwin', 'server-entitlements.plist');

	if (!fs.existsSync(serverDir)) {
		throw new Error(`Server directory does not exist: ${serverDir}`);
	}

	console.log(`Finding Mach-O binaries in: ${serverDir}`);
	const binaries = findMachOBinaries(serverDir);
	console.log(`Found ${binaries.length} Mach-O binaries to sign`);

	for (const binary of binaries) {
		await signBinary(binary, identity, keychain, entitlementsPath);
	}

	console.log(`Successfully signed ${binaries.length} binaries`);
}

if (import.meta.main) {
	main(process.argv[2]).catch(err => {
		console.error(err);
		process.exit(1);
	});
}
