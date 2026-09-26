#!/usr/bin/env node
/*-------------------------------------------------------------------------------------
 * Downloads the netcoredbg debug adapter for one platform (ADR 0002: bundled, offline).
 * Usage: node scripts/fetch-netcoredbg.mjs [--platform win-x64]
 *------------------------------------------------------------------------------------*/

import { get } from 'node:http';
import { get as getSecure } from 'node:https';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const VERSION = '3.2.0-1092';
const ASSETS = {
	'win-x64': 'netcoredbg-win64.zip',
	'linux-x64': 'netcoredbg-linux-amd64.tar.gz',
	'linux-arm64': 'netcoredbg-linux-arm64.tar.gz',
	'osx-arm64': 'netcoredbg-osx-arm64.zip',
};

const args = process.argv.slice(2);
const platformFlag = args.indexOf('--platform');
const platform = platformFlag >= 0 ? args[platformFlag + 1] :
	process.platform === 'win32' ? 'win-x64' :
	process.platform === 'darwin' ? (process.arch === 'arm64' ? 'osx-arm64' : 'osx-x64') :
	(process.arch === 'arm64' ? 'linux-arm64' : 'linux-x64');

const asset = ASSETS[platform];
if (!asset) {
	console.error(`Unknown platform: ${platform}. Known: ${Object.keys(ASSETS).join(', ')}`);
	process.exit(1);
}

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const outDir = path.join(root, 'netcoredbg', platform);
fs.mkdirSync(outDir, { recursive: true });
const archive = path.join(outDir, asset);
const url = `https://github.com/Samsung/netcoredbg/releases/download/${VERSION}/${asset}`;

console.log(`Downloading ${url}`);
await downloadFollow(url, archive, 0);

console.log(`Extracting into ${outDir}`);
const tarBin = process.platform === 'win32'
	? path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe')
	: 'tar';
execSync(`"${tarBin}" -xf "${archive}" -C "${outDir}"`);
fs.rmSync(archive, { force: true });

// Some archives nest everything inside a netcoredbg/ root folder — flatten it.
const nested = path.join(outDir, 'netcoredbg');
if (fs.existsSync(nested) && fs.statSync(nested).isDirectory()) {
	for (const entry of fs.readdirSync(nested)) {
		fs.renameSync(path.join(nested, entry), path.join(outDir, entry));
	}
	fs.rmdirSync(nested);
}

const exe = path.join(outDir, platform.startsWith('win') ? 'netcoredbg.exe' : 'netcoredbg');
if (!fs.existsSync(exe)) {
	console.error(`netcoredbg binary not found after extracting ${asset}.`);
	process.exit(1);
}
if (process.platform !== 'win32') {
	fs.chmodSync(exe, 0o755);
}
console.log(`netcoredbg ready: ${exe}`);

function downloadFollow(url, dest, redirects) {
	return new Promise((resolve, reject) => {
		const mod = url.startsWith('https:') ? getSecure : get;
		const req = mod(url, res => {
			if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirects < 5) {
				res.resume();
				const next = new URL(res.headers.location, url).toString();
				downloadFollow(next, dest, redirects + 1).then(resolve, reject);
				return;
			}
			if (res.statusCode !== 200) {
				reject(new Error(`HTTP ${res.statusCode} for ${url}`));
				return;
			}
			const file = fs.createWriteStream(dest);
			res.pipe(file);
			file.on('finish', () => file.close(resolve));
			file.on('error', reject);
		});
		req.on('error', reject);
	});
}
