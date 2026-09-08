/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as cp from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ApplicationOptions, getBuildElectronPath } from '../../../../automation';

const POLICY_NAME = 'ExtensionsAutoUpdate';
const LINUX_POLICY_PATH = '/etc/vscode/policy.json';

export interface NativePolicyFixture {
	set(): void;
	clear(): void;
}

/**
 * Only enabled explicitly on disposable CI runners. Never overwrite an existing policy.
 * Each variant starts a fresh application, so this tests startup ingestion, not live refresh.
 */
export function nativePolicyFixture(options: ApplicationOptions): NativePolicyFixture {
	if (process.platform === 'linux') {
		assert.ok(!fs.existsSync(LINUX_POLICY_PATH), `Refusing to overwrite existing policy: ${LINUX_POLICY_PATH}`);
		return {
			set: () => fs.writeFileSync(LINUX_POLICY_PATH, JSON.stringify({ [POLICY_NAME]: 'off' }), { flag: 'wx' }),
			clear: () => fs.unlinkSync(LINUX_POLICY_PATH),
		};
	}

	const productPath = options.codePath
		? process.platform === 'darwin'
			? path.join(options.codePath, 'Contents', 'Resources', 'app', 'product.json')
			: path.join(path.dirname(getBuildElectronPath(options.codePath)), 'resources', 'app', 'product.json')
		: path.join(__dirname, '../../../../../product.json');
	const product: {
		win32RegValueName?: string;
		darwinBundleIdentifier?: string;
		parentPolicyConfig?: { win32RegValueName?: string; darwinBundleIdentifier?: string };
	} = JSON.parse(fs.readFileSync(productPath, 'utf8'));

	if (process.platform === 'win32') {
		const productName = product.parentPolicyConfig?.win32RegValueName ?? product.win32RegValueName;
		assert.ok(productName && /^[\w.-]+$/.test(productName), 'Expected a Windows policy product name');
		const registryPath = `Software\\Policies\\Microsoft\\${productName}`;
		const run = (script: string) => cp.execFileSync('powershell.exe', [
			'-NoProfile', '-NonInteractive', '-Command', `$ErrorActionPreference = 'Stop'; ${script}`,
		], { encoding: 'utf8', timeout: 30_000 });
		run(`
			foreach ($hive in @('HKLM', 'HKCU')) {
				if (Test-Path -LiteralPath "\${hive}:\\${registryPath}") {
					$key = Get-Item -LiteralPath "\${hive}:\\${registryPath}"
					if ($key.GetValueNames() -contains '${POLICY_NAME}') {
						throw 'Refusing to overwrite existing ${POLICY_NAME} policy'
					}
				}
			}
		`);
		const keyExisted = run(`Test-Path -LiteralPath 'HKCU:\\${registryPath}'`).trim() === 'True';
		return {
			set: () => {
				run(`
					if (!(Test-Path -LiteralPath 'HKCU:\\${registryPath}')) {
						New-Item -Path 'HKCU:\\${registryPath}' -Force | Out-Null
					}
					New-ItemProperty -LiteralPath 'HKCU:\\${registryPath}' -Name '${POLICY_NAME}' -PropertyType String -Value 'off' | Out-Null
				`);
			},
			clear: () => {
				run(`
					Remove-ItemProperty -LiteralPath 'HKCU:\\${registryPath}' -Name '${POLICY_NAME}'
					${!keyExisted ? `
						$key = Get-Item -LiteralPath 'HKCU:\\${registryPath}'
						if ($key.ValueCount -eq 0 -and $key.SubKeyCount -eq 0) {
							Remove-Item -LiteralPath 'HKCU:\\${registryPath}'
						}
					` : ''}
				`);
			},
		};
	}

	assert.strictEqual(process.platform, 'darwin', 'Unsupported native policy smoke platform');
	const domain = product.parentPolicyConfig?.darwinBundleIdentifier ?? product.darwinBundleIdentifier;
	assert.ok(domain && /^[\w.-]+$/.test(domain), 'Expected a macOS policy bundle identifier');
	for (const directory of ['/Library/Preferences', '/Library/Managed Preferences', `/Library/Managed Preferences/${os.userInfo().username}`]) {
		assert.ok(!fs.existsSync(path.join(directory, `${domain}.plist`)), `Refusing existing system preferences for ${domain}`);
	}
	const existing = cp.spawnSync('/usr/bin/defaults', ['read', domain, POLICY_NAME], { encoding: 'utf8', timeout: 30_000 });
	if (existing.error) {
		throw existing.error;
	}
	assert.ok(existing.status === 1 && existing.stderr.includes('does not exist'),
		`Expected no existing ${POLICY_NAME} preference for ${domain}: ${existing.stdout}${existing.stderr}`);
	return {
		set: () => {
			cp.execFileSync('/usr/bin/defaults', ['write', domain, POLICY_NAME, '-string', 'off'], { timeout: 30_000 });
		},
		clear: () => {
			cp.execFileSync('/usr/bin/defaults', ['delete', domain, POLICY_NAME], { timeout: 30_000 });
		},
	};
}
