/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const version = '1.29.3';

function getInstallerHost(): string {
	if (process.platform === 'win32') {
		return 'x86_64-pc-windows-msvc';
	}
	const arch = process.arch === 'arm64' ? 'aarch64' : process.arch === 'x64' ? 'x86_64' : undefined;
	if (process.platform === 'darwin' && arch) {
		return `${arch}-apple-darwin`;
	}
	if (process.platform === 'linux') {
		if (arch) {
			return `${arch}-unknown-linux-${existsSync('/etc/alpine-release') ? 'musl' : 'gnu'}`;
		}
		if (process.arch === 'arm') {
			return 'armv7-unknown-linux-gnueabihf';
		}
	}
	throw new Error(`Unsupported rustup host: ${process.platform}-${process.arch}`);
}

const host = getInstallerHost();
const filename = process.platform === 'win32' ? 'rustup-init.exe' : 'rustup-init';
const artifact = `${host}/${filename}`;
const manifest = readFileSync(new URL('../../checksums/rustup.txt', import.meta.url), 'utf8');
const entries = manifest.trim().split(/\r?\n/).map(line => line.split(/\s+/)).filter(([, path]) => path === artifact);
if (entries.length !== 1 || !/^[a-f0-9]{64}$/.test(entries[0][0])) {
	throw new Error(`Expected one SHA-256 checksum for ${artifact}`);
}

// Verify the executable itself: rustup's shell wrapper downloads it in a second step.
const dir = mkdtempSync(join(tmpdir(), 'rustup-'));
try {
	const installer = join(dir, filename);
	execFileSync(process.platform === 'win32' ? 'curl.exe' : 'curl', ['-fsSL', `https://static.rust-lang.org/rustup/archive/${version}/${artifact}`, '-o', installer], { stdio: 'inherit' });
	if (createHash('sha256').update(readFileSync(installer)).digest('hex') !== entries[0][0]) {
		throw new Error(`SHA-256 checksum mismatch for ${artifact}`);
	}
	if (process.platform !== 'win32') {
		chmodSync(installer, 0o700);
	}
	execFileSync(installer, process.argv.slice(2), { stdio: 'inherit' });
} finally {
	rmSync(dir, { recursive: true, force: true });
}
