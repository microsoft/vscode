/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, suite, test } from 'node:test';
import { writePnpmLockfile } from './pnpmLockfileFixture.ts';

const repoRoot = path.join(import.meta.dirname, '..', '..', '..');
const script = 'build/azure-pipelines/common/apply-sdk-canary-override.ts';
const sdk = '@github/copilot-sdk';

// A fake `pnpm` on PATH: reports the pinned version, answers the registry queries and, unless
// FAKE_PNPM_STALE is set, locks the SDK version of package.json like `pnpm install --lockfile-only`.
// The fake `npm` fails: installing pnpm is not expected.
const FAKE_PNPM = `
const fs = require('fs'), path = require('path');
const args = process.argv.slice(2);
if (args[0] === '--version') {
	console.log(/^pnpm@([^+]+)/.exec(JSON.parse(fs.readFileSync(path.join(process.env.FAKE_ROOT, 'package.json'), 'utf8')).packageManager)[1]);
	process.exit(0);
}
fs.appendFileSync(process.env.FAKE_LOG, JSON.stringify([path.relative(process.env.FAKE_ROOT, fs.realpathSync(process.cwd())), ...args]) + '\\n');
if (args[0] === 'view' && args[2] === 'versions') {
	console.log(JSON.stringify(['1.0.0', '2.0.0-canary.9.gabc', '2.0.0-canary.10.gdef']));
} else if (args[0] === 'view' && args[2] === 'copilotCliVersion') {
	console.log(JSON.stringify('9.9.9'));
} else if (args[0] === 'install' && args.includes('--lockfile-only')) {
	if (!process.env.FAKE_PNPM_STALE) {
		const version = JSON.parse(fs.readFileSync('package.json', 'utf8')).dependencies['${sdk}'];
		const lockfile = fs.readFileSync('pnpm-lock.yaml', 'utf8');
		fs.writeFileSync('pnpm-lock.yaml', lockfile.replace(/^(      '${sdk.replace('/', '\\/')}':\\n        specifier: ).*\\n(        version: ).*$/m, '$1' + version + '\\n$2' + version));
	}
} else {
	process.exit(1);
}
`;

const FAKE_NPM = `
require('fs').appendFileSync(process.env.FAKE_LOG, JSON.stringify(['npm', ...process.argv.slice(2)]) + '\\n');
process.exit(1);
`;

/**
 * Copies a repository file and the files that it imports through relative paths, recursively.
 */
function copyWithRelativeImports(file: string, target: string): void {
	const pending = [file];
	const copied = new Set<string>();
	while (pending.length > 0) {
		const current = pending.pop()!;
		if (copied.has(current)) {
			continue;
		}
		copied.add(current);
		const content = readFileSync(path.join(repoRoot, current), 'utf8');
		mkdirSync(path.dirname(path.join(target, current)), { recursive: true });
		writeFileSync(path.join(target, current), content);
		for (const match of content.matchAll(/^(?:import|export)\b[^;]*?\bfrom '(?<specifier>\.[^']+)'/gm)) {
			pending.push(path.posix.join(path.posix.dirname(current), match.groups!.specifier));
		}
	}
}

function writeFakeCommand(bin: string, name: string, source: string): void {
	const file = path.join(bin, `${name}.cjs`);
	writeFileSync(file, source);
	writeFileSync(path.join(bin, `${name}.cmd`), `@"${process.execPath}" "${file}" %*\r\n`);
	writeFileSync(path.join(bin, name), `#!/bin/sh\nexec "${process.execPath}" "${file}" "$@"\n`);
	chmodSync(path.join(bin, name), 0o755);
}

suite('apply-sdk-canary-override', () => {
	let root: string;
	let bin: string;

	beforeEach(() => {
		// A copy of the script without node_modules, as on a build agent before `pnpm install`.
		root = realpathSync(mkdtempSync(path.join(tmpdir(), 'sdk-canary-')));
		copyWithRelativeImports(script, root);
		for (const dir of ['', 'remote']) {
			mkdirSync(path.join(root, dir), { recursive: true });
			writeFileSync(path.join(root, dir, 'package.json'), JSON.stringify({ packageManager: 'pnpm@1.2.3', dependencies: { [sdk]: '1.0.0' }, copilotRuntimeVersion: '1.0.0' }, null, 2) + '\n');
			writePnpmLockfile(path.join(root, dir, 'pnpm-lock.yaml'), { [sdk]: { version: '1.0.0' } });
		}
		bin = path.join(root, '.bin');
		mkdirSync(bin);
		writeFakeCommand(bin, 'pnpm', FAKE_PNPM);
		writeFakeCommand(bin, 'npm', FAKE_NPM);
	});

	afterEach(() => {
		rmSync(root, { recursive: true, force: true });
	});

	function run(env: Record<string, string>) {
		assert.throws(() => createRequire(path.join(root, script)).resolve('js-yaml'), { code: 'MODULE_NOT_FOUND' });
		const childEnv: NodeJS.ProcessEnv = { ...process.env, FAKE_ROOT: root, FAKE_LOG: path.join(root, 'calls.log'), ...env };
		for (const name of ['NODE_OPTIONS', 'NODE_PATH', 'NODE_TEST_CONTEXT', 'VSCODE_SDK_CANARY_VERSION', 'VSCODE_CLI_CANARY_VERSION']) {
			if (env[name] === undefined) {
				delete childEnv[name];
			}
		}
		const pathKey = Object.keys(childEnv).find(key => key.toUpperCase() === 'PATH') ?? 'PATH';
		childEnv[pathKey] = `${bin}${path.delimiter}${childEnv[pathKey] ?? ''}`;
		writeFileSync(childEnv.FAKE_LOG!, '');
		const result = spawnSync(process.execPath, [script], { cwd: root, env: childEnv, encoding: 'utf8' });
		return {
			status: result.status,
			error: /^Error\b.*$/m.exec(result.stderr)?.[0],
			calls: readFileSync(childEnv.FAKE_LOG!, 'utf8').split('\n').filter(line => line).map(line => JSON.parse(line)),
			verified: result.stdout.split('\n').filter(line => line.startsWith('[canary-override] verified')),
			sdk: ['', 'remote'].map(dir => {
				const packageJson = JSON.parse(readFileSync(path.join(root, dir, 'package.json'), 'utf8'));
				return `${packageJson.dependencies[sdk]} runtime ${packageJson.copilotRuntimeVersion}`;
			}),
		};
	}

	test('does nothing without an override', () => {
		assert.deepStrictEqual(run({}), {
			status: 0,
			error: undefined,
			calls: [],
			verified: [],
			sdk: ['1.0.0 runtime 1.0.0', '1.0.0 runtime 1.0.0'],
		});
	});

	test('overrides the SDK and verifies the refreshed lockfiles without installed packages', () => {
		assert.deepStrictEqual(run({ VSCODE_SDK_CANARY_VERSION: 'latest-canary' }), {
			status: 0,
			error: undefined,
			calls: [
				['', 'view', sdk, 'versions', '--json'],
				['', 'view', `${sdk}@2.0.0-canary.10.gdef`, 'copilotCliVersion', '--json'],
				['', 'install', '--lockfile-only', '--no-frozen-lockfile', '--ignore-scripts'],
				['remote', 'install', '--lockfile-only', '--no-frozen-lockfile', '--ignore-scripts'],
			],
			verified: [
				`[canary-override] verified pnpm-lock.yaml: ${sdk}@2.0.0-canary.10.gdef`,
				`[canary-override] verified ${path.join('remote', 'pnpm-lock.yaml')}: ${sdk}@2.0.0-canary.10.gdef`,
			],
			sdk: ['2.0.0-canary.10.gdef runtime 9.9.9', '2.0.0-canary.10.gdef runtime 9.9.9'],
		});
	});

	test('fails when the refreshed lockfile does not lock the override', () => {
		assert.deepStrictEqual(run({ VSCODE_SDK_CANARY_VERSION: '2.0.0-canary.9.gabc', FAKE_PNPM_STALE: '1' }), {
			status: 1,
			error: `Error: [canary-override] pnpm-lock.yaml: ${sdk} resolved to 1.0.0, expected 2.0.0-canary.9.gabc`,
			calls: [
				['', 'view', `${sdk}@2.0.0-canary.9.gabc`, 'copilotCliVersion', '--json'],
				['', 'install', '--lockfile-only', '--no-frozen-lockfile', '--ignore-scripts'],
			],
			verified: [],
			sdk: ['2.0.0-canary.9.gabc runtime 9.9.9', '1.0.0 runtime 1.0.0'],
		});
	});
});
