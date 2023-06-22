/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { spawnSync } from 'child_process';
import { createHash } from 'crypto';
import { tmpdir } from 'os';
import * as fs from 'fs';
import * as https from 'https';
import * as path from 'path';
import { DebianArchString } from './types';
import * as util from '../../lib/util';

// Based on https://source.chromium.org/chromium/chromium/src/+/main:build/linux/sysroot_scripts/install-sysroot.py.
const URL_PREFIX = 'https://msftelectron.blob.core.windows.net';
const URL_PATH = 'sysroots/toolchain';

function getSha(filename: fs.PathLike): string {
	const hash = createHash('sha1');
	// Read file 1 MB at a time
	const fd = fs.openSync(filename, 'r');
	const buffer = Buffer.alloc(1024 * 1024);
	let position = 0;
	let bytesRead = 0;
	while ((bytesRead = fs.readSync(fd, buffer, 0, buffer.length, position)) === buffer.length) {
		hash.update(buffer);
		position += bytesRead;
	}
	hash.update(buffer.slice(0, bytesRead));
	return hash.digest('hex');
}

type SysrootDictEntry = {
	Sha1Sum: string;
	SysrootDir: string;
	Tarball: string;
};

export async function getSysroot(arch: DebianArchString): Promise<string> {
	const sysrootJSONUrl = `https://raw.githubusercontent.com/electron/electron/v${util.getElectronVersion().electronVersion}/script/sysroots.json`;
	const sysrootDictLocation = `${tmpdir()}/sysroots.json`;
	const result = spawnSync('curl', [sysrootJSONUrl, '-o', sysrootDictLocation]);
	if (result.status !== 0) {
		throw new Error('Cannot retrieve sysroots.json. Stderr:\n' + result.stderr);
	}
	const sysrootInfo = require(sysrootDictLocation);
	const sysrootArch = arch === 'armhf' ? 'bullseye_arm' : `bullseye_${arch}`;
	const sysrootDict: SysrootDictEntry = sysrootInfo[sysrootArch];
	const tarballFilename = sysrootDict['Tarball'];
	const tarballSha = sysrootDict['Sha1Sum'];
	const sysroot = path.join(tmpdir(), sysrootDict['SysrootDir']);
	const url = [URL_PREFIX, URL_PATH, tarballSha, tarballFilename].join('/');
	const stamp = path.join(sysroot, '.stamp');
	if (fs.existsSync(stamp) && fs.readFileSync(stamp).toString() === url) {
		return sysroot;
	}

	console.log(`Installing Debian ${arch} root image: ${sysroot}`);
	fs.rmSync(sysroot, { recursive: true, force: true });
	fs.mkdirSync(sysroot);
	const tarball = path.join(sysroot, tarballFilename);
	console.log(`Downloading ${url}`);
	let downloadSuccess = false;
	for (let i = 0; i < 3 && !downloadSuccess; i++) {
		fs.writeFileSync(tarball, '');
		await new Promise<void>((c) => {
			https.get(url, (res) => {
				res.on('data', (chunk) => {
					fs.appendFileSync(tarball, chunk);
				});
				res.on('end', () => {
					downloadSuccess = true;
					c();
				});
			}).on('error', (err) => {
				console.error('Encountered an error during the download attempt: ' + err.message);
				c();
			});
		});
	}
	if (!downloadSuccess) {
		fs.rmSync(tarball);
		throw new Error('Failed to download ' + url);
	}
	const sha = getSha(tarball);
	if (sha !== tarballSha) {
		throw new Error(`Tarball sha1sum is wrong. Expected ${tarballSha}, actual ${sha}`);
	}

	const proc = spawnSync('tar', ['xf', tarball, '-C', sysroot]);
	if (proc.status) {
		throw new Error('Tarball extraction failed with code ' + proc.status);
	}
	fs.rmSync(tarball);
	fs.writeFileSync(stamp, url);
	return sysroot;
}
