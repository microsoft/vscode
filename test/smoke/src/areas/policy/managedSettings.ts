/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as cp from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { ApplicationOptions } from '../../../../automation';

export function managedSettingsEnv(options: ApplicationOptions): Readonly<Record<string, string | undefined>> {
	assert.ok(options.userDataDir);
	return {
		...Object.fromEntries(Object.keys(process.env).filter(key => /^(OTEL_|COPILOT_OTEL_)/i.test(key)).map(key => [key, undefined])),
		COPILOT_CACHE_HOME: path.join(options.userDataDir, 'copilot-policy-cache'),
	};
}

/**
 * Uses the real device-policy path. CI provisions its parent directory separately;
 * a temporary VS Code profile does not isolate this machine-wide state.
 */
export function managedSettingsFixture(): { set(settings: object): void; clear(): void } {
	assert.strictEqual(process.env.VSCODE_SMOKE_TEST_POLICY, '1', 'Managed policy tests require explicit opt-in on a disposable runner');
	let directory: string;
	switch (process.platform) {
		case 'linux':
			directory = '/etc/github-copilot';
			break;
		case 'darwin': {
			directory = '/Library/Application Support/GitHubCopilot';
			const domain = 'com.github.copilot';
			for (const preferences of ['/Library/Preferences', '/Library/Managed Preferences', `/Library/Managed Preferences/${os.userInfo().username}`]) {
				assert.ok(!fs.existsSync(path.join(preferences, `${domain}.plist`)), 'Refusing existing Copilot system preferences');
			}
			const existing = cp.spawnSync('/usr/bin/defaults', ['read', domain], { encoding: 'utf8', timeout: 30_000 });
			if (existing.error) {
				throw existing.error;
			}
			assert.ok(existing.status === 1 && existing.stderr.includes('does not exist'), 'Refusing existing Copilot preferences');
			break;
		}
		case 'win32':
			assert.ok(process.env.ProgramFiles, 'Expected ProgramFiles for the managed-settings path');
			directory = path.join(process.env.ProgramFiles, 'GitHubCopilot');
			cp.execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `
				$ErrorActionPreference = 'Stop'
				foreach ($hive in @('HKLM', 'HKCU')) {
					if (Test-Path -LiteralPath "\${hive}:\\SOFTWARE\\Policies\\GitHubCopilot") {
						throw 'Refusing existing Copilot registry policy'
					}
				}
			`], { timeout: 30_000 });
			break;
		default:
			throw new Error(`Unsupported managed policy smoke platform: ${process.platform}`);
	}
	assert.ok(fs.lstatSync(directory).isDirectory(), 'Expected a provisioned, non-symlink managed-settings directory');
	const file = path.join(directory, 'managed-settings.json');
	assert.ok(!fs.readdirSync(directory).includes(path.basename(file)), 'Refusing to overwrite existing managed settings');
	let created: fs.Stats | undefined;
	return {
		set: settings => {
			assert.ok(!created, 'The managed policy fixture is already installed');
			const fd = fs.openSync(file, 'wx', 0o644);
			try {
				created = fs.fstatSync(fd);
				fs.writeFileSync(fd, JSON.stringify(settings));
			} finally {
				fs.closeSync(fd);
			}
		},
		clear: () => {
			if (created) {
				const current = fs.lstatSync(file);
				assert.ok(current.isFile() && current.dev === created.dev && current.ino === created.ino, 'Refusing to remove a replaced managed policy fixture');
				fs.unlinkSync(file);
				created = undefined;
			}
		},
	};
}
