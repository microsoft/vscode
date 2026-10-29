/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// TEMPORARY, never merge. Tests the unattended update restart (#344141) on macOS with two signed
// builds of this branch: build A, and build B, which is A plus a commit that only changes this
// comment (an empty commit fails the hygiene hook). Both builds ask the update server at
// http://127.0.0.1:8080 instead of the real one, every minute.
//
// Install build A, replacing an installed copy of the same application:
//   node scripts/unattended-update-test.ts install <A.zip> [--dir /Applications]
//
// Offer build B to every other build, optionally only after a delay. Press Enter to stop or
// resume offering it:
//   node scripts/unattended-update-test.ts serve <B.zip> [--delay 3m]

import type { IncomingMessage, ServerResponse } from 'node:http';

const { spawnSync } = require('node:child_process') as typeof import('node:child_process');
const { createHash } = require('node:crypto') as typeof import('node:crypto');
const { createReadStream, existsSync, statSync } = require('node:fs') as typeof import('node:fs');
const { createServer } = require('node:http') as typeof import('node:http');
const { basename, join, resolve } = require('node:path') as typeof import('node:path');
const { createInterface } = require('node:readline') as typeof import('node:readline');
const { parseArgs } = require('node:util') as typeof import('node:util');

/** The builds only ask this port, see `createUpdateURL`. */
const BUILD_PORT = 8080;

interface IBuild {
	readonly zip: string;
	readonly app: string;
	readonly commit: string;
	readonly productVersion: string;
}

function fail(message: string): never {
	console.error(message);
	process.exit(1);
}

function log(message: string): void {
	console.log(`[${new Date().toLocaleTimeString()}] ${message}`);
}

function run(command: string, args: string[]): string {
	const result = spawnSync(command, args, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
	if (result.status !== 0) {
		fail(`'${command} ${args.join(' ')}' failed: ${result.stderr || result.error}`);
	}
	return result.stdout;
}

function short(commit: string): string {
	return commit.slice(0, 10);
}

/**
 * Reads the application name, commit and version from a client archive of the build.
 */
function readBuild(zip: string | undefined): IBuild {
	if (!zip || !existsSync(zip)) {
		fail(`Archive not found: ${zip}`);
	}

	const app = run('unzip', ['-Z1', zip]).split('\n').map(entry => entry.split('/')[0]).find(name => name.endsWith('.app'));
	if (!app) {
		fail(`No application in ${zip}`);
	}

	const appRoot = `${app}/Contents/Resources/app`;
	const product = JSON.parse(run('unzip', ['-p', zip, `${appRoot}/product.json`]));
	const { version } = JSON.parse(run('unzip', ['-p', zip, `${appRoot}/package.json`]));
	const productVersion = product.quality === 'stable' ? version : `${version}-${product.quality}`;

	return { zip: resolve(zip), app, commit: product.commit, productVersion };
}

function parseDuration(value: string): number {
	const match = /^(?<amount>\d+)(?<unit>s|m)?$/.exec(value);
	if (!match?.groups) {
		fail(`Invalid delay '${value}', use for example 90s or 3m`);
	}
	return Number(match.groups.amount) * (match.groups.unit === 'm' ? 60_000 : 1000);
}

async function hashFile(path: string): Promise<{ sha1: string; sha256: string }> {
	const sha1 = createHash('sha1');
	const sha256 = createHash('sha256');
	for await (const chunk of createReadStream(path)) {
		sha1.update(chunk);
		sha256.update(chunk);
	}
	return { sha1: sha1.digest('hex'), sha256: sha256.digest('hex') };
}

function install(build: IBuild, dir: string): void {
	const target = join(dir, build.app);
	if (!/^[^/]+\.app$/.test(build.app) || !existsSync(dir)) {
		fail(`Refusing to install ${build.app} into ${dir}`);
	}
	if (spawnSync('pgrep', ['-f', `${target}/Contents/MacOS/`]).status === 0) {
		fail(`Quit ${build.app} first.`);
	}

	run('rm', ['-rf', target]);
	run('ditto', ['-x', '-k', build.zip, dir]);
	log(`Installed ${target}: ${build.productVersion}, commit ${short(build.commit)}`);

	// Squirrel only installs updates that are signed like the running application
	const signature = spawnSync('codesign', ['--verify', '--deep', '--strict', target], { encoding: 'utf8' });
	if (signature.status !== 0) {
		log(`Warning: the signature does not verify, so updates cannot be installed: ${signature.stderr.trim()}`);
	}
}

async function serve(build: IBuild, delay: number, port: number): Promise<void> {
	const { sha1, sha256 } = await hashFile(build.zip);
	const { size } = statSync(build.zip);
	const downloadPath = `/${basename(build.zip)}`;
	const origin = `http://127.0.0.1:${port}`;

	// The same fields as the real update server. Electron reports `notes` as the release notes and
	// `name` as the release name, which VS Code reads as the commit and the product version.
	const update = {
		url: `${origin}${downloadPath}`,
		name: build.productVersion,
		version: build.commit,
		productVersion: build.productVersion,
		hash: sha1,
		timestamp: Date.now(),
		sha256hash: sha256,
		supportsFastUpdate: true,
		notes: build.commit,
	};

	let offering = delay === 0;
	let delayTimer: ReturnType<typeof setTimeout> | undefined = delay > 0 ? setTimeout(() => {
		offering = true;
		log('Offering build B now');
	}, delay) : undefined;

	const server = createServer((req: IncomingMessage, res: ServerResponse) => {
		res.setHeader('Cache-Control', 'no-store');
		const { pathname } = new URL(req.url ?? '/', origin);
		const feed = /^\/api\/update\/(?<platform>[^/]+)\/(?<quality>[^/]+)\/(?<commit>[^/]+)$/.exec(pathname);

		if (feed?.groups) {
			const { platform, quality, commit } = feed.groups;
			const request = `${req.method} ${platform}/${quality}/${short(commit)}`;
			if (commit === build.commit) {
				res.writeHead(204).end();
				log(`${request} → 204, that is build B`);
			} else if (!offering) {
				res.writeHead(204).end();
				log(`${request} → 204, build B isn't offered`);
			} else {
				res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(update));
				log(`${request} → 200, offering build B`);
			}
			return;
		}

		if (pathname === downloadPath && (req.method === 'GET' || req.method === 'HEAD')) {
			res.writeHead(200, { 'Content-Type': 'application/zip', 'Content-Length': size });
			if (req.method === 'HEAD') {
				res.end();
				return;
			}

			log(`${req.method} ${pathname} → downloading build B`);
			res.on('close', () => log(res.writableFinished ? 'Build B downloaded' : 'Download of build B aborted'));
			createReadStream(build.zip).pipe(res);
			return;
		}

		res.writeHead(404).end();
		log(`${req.method} ${pathname} → 404`);
	});

	server.on('error', error => fail(`Cannot listen on ${origin}: ${error.message}`));
	server.listen(port, '127.0.0.1', () => {
		log(`Serving build B (${build.productVersion}, commit ${short(build.commit)}) on ${origin} to every other build`);
		if (port !== BUILD_PORT) {
			log(`Warning: the builds only ask port ${BUILD_PORT}`);
		}
		log(offering ? 'Offering build B now. Press Enter to stop offering it.' : `Offering build B in ${delay / 1000}s. Press Enter to offer it now.`);
	});

	createInterface({ input: process.stdin }).on('line', () => {
		clearTimeout(delayTimer);
		delayTimer = undefined;
		offering = !offering;
		log(offering ? 'Offering build B now. Press Enter to stop.' : 'Stopped offering build B. Press Enter to resume.');
	});
}

async function main(): Promise<void> {
	const { positionals: [command, zip], values } = parseArgs({
		allowPositionals: true,
		options: {
			dir: { type: 'string', default: '/Applications' },
			delay: { type: 'string', default: '0' },
			port: { type: 'string', default: String(BUILD_PORT) },
		},
	});

	if (command === 'install') {
		install(readBuild(zip), resolve(values.dir));
	} else if (command === 'serve') {
		await serve(readBuild(zip), parseDuration(values.delay), Number(values.port));
	} else {
		fail('Usage: node scripts/unattended-update-test.ts install <A.zip> [--dir /Applications]\n       node scripts/unattended-update-test.ts serve <B.zip> [--delay 3m]');
	}
}

main().catch(error => fail(String(error)));
