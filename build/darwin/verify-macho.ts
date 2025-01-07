/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as path from 'path';
import { open, stat, readdir, realpath } from 'fs/promises';
import { spawn, ExitCodeError } from '@malept/cross-spawn-promise';

const MACHO_PREFIX = 'Mach-O ';
const MACHO_64_MAGIC_LE = 0xfeedfacf;
const MACHO_UNIVERSAL_MAGIC_LE = 0xbebafeca;
const MACHO_ARM64_CPU_TYPE = new Set([
	0x0c000001,
	0x0100000c,
]);
const MACHO_X86_64_CPU_TYPE = new Set([
	0x07000001,
	0x01000007,
]);

async function read(file: string, buf: Buffer, offset: number, length: number, position: number) {
	let filehandle;
	try {
		filehandle = await open(file);
		await filehandle.read(buf, offset, length, position);
	} finally {
		await filehandle?.close();
	}
}

async function checkMachOFiles(appPath: string, arch: string) {
	const visited = new Set();
	const invalidFiles: string[] = [];
	const header = Buffer.alloc(8);
	const file_header_entry_size = 20;
	const checkx86_64Arch = (arch === 'x64');
	const checkArm64Arch = (arch === 'arm64');
	const checkUniversalArch = (arch === 'universal');
	const traverse = async (p: string) => {
		p = await realpath(p);
		if (visited.has(p)) {
			return;
		}
		visited.add(p);

		const info = await stat(p);
		if (info.isSymbolicLink()) {
			return;
		}
		if (info.isFile()) {
			let fileOutput = '';
			try {
				fileOutput = await spawn('file', ['--brief', '--no-pad', p]);
			} catch (e) {
				if (e instanceof ExitCodeError) {
					/* silently accept error codes from "file" */
				} else {
					throw e;
				}
			}
			if (fileOutput.startsWith(MACHO_PREFIX)) {
				console.log(`Verifying architecture of ${p}`);
				read(p, header, 0, 8, 0).then(_ => {
					const header_magic = header.readUInt32LE();
					if (header_magic === MACHO_64_MAGIC_LE) {
						const cpu_type = header.readUInt32LE(4);
						if (checkUniversalArch) {
							invalidFiles.push(p);
						} else if (checkArm64Arch && !MACHO_ARM64_CPU_TYPE.has(cpu_type)) {
							invalidFiles.push(p);
						} else if (checkx86_64Arch && !MACHO_X86_64_CPU_TYPE.has(cpu_type)) {
							invalidFiles.push(p);
						}
					} else if (header_magic === MACHO_UNIVERSAL_MAGIC_LE) {
						const num_binaries = header.readUInt32BE(4);
						assert.equal(num_binaries, 2);
						const file_entries_size = file_header_entry_size * num_binaries;
						const file_entries = Buffer.alloc(file_entries_size);
						read(p, file_entries, 0, file_entries_size, 8).then(_ => {
							for (let i = 0; i < num_binaries; i++) {
								const cpu_type = file_entries.readUInt32LE(file_header_entry_size * i);
								if (!MACHO_ARM64_CPU_TYPE.has(cpu_type) && !MACHO_X86_64_CPU_TYPE.has(cpu_type)) {
									invalidFiles.push(p);
								}
							}
						});
					}
				});
			}
		}

		if (info.isDirectory()) {
			for (const child of await readdir(p)) {
				await traverse(path.resolve(p, child));
			}
		}
	};
	await traverse(appPath);
	return invalidFiles;
}

const archToCheck = process.argv[2];
assert(process.env['APP_PATH'], 'APP_PATH not set');
assert(archToCheck === 'x64' || archToCheck === 'arm64' || archToCheck === 'universal', `Invalid architecture ${archToCheck} to check`);
checkMachOFiles(process.env['APP_PATH'], archToCheck).then(invalidFiles => {
	if (invalidFiles.length > 0) {
		console.error('\x1b[31mThe following files are built for the wrong architecture:\x1b[0m');
		for (const file of invalidFiles) {
			console.error(`\x1b[31m${file}\x1b[0m`);
		}
		process.exit(1);
	} else {
		console.log('\x1b[32mAll files are valid\x1b[0m');
	}
}).catch(err => {
	console.error(err);
	process.exit(1);
});
