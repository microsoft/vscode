/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { suite, test } from 'node:test';
import { create } from 'tar';
import { ensureOSProxyResolverPlatformPackage, getOSProxyResolverExcludeFilter, getOSProxyResolverPlatformFiles, osProxyResolverPlatforms } from '../osProxyResolver.ts';

suite('osProxyResolver', () => {
	test('selects the target platform package', () => {
		assert.deepStrictEqual(getOSProxyResolverPlatformFiles('darwin', 'x64'), [
			'node_modules/@vscode/os-proxy-resolver-darwin-x64/**',
		]);
		assert.deepStrictEqual(getOSProxyResolverPlatformFiles('linux', 'armhf'), [
			'node_modules/@vscode/os-proxy-resolver-linux-arm-gnueabihf/**',
		]);
		assert.deepStrictEqual(getOSProxyResolverPlatformFiles('win32', 'arm64'), [
			'node_modules/@vscode/os-proxy-resolver-win32-arm64-msvc/**',
		]);
		assert.deepStrictEqual(getOSProxyResolverPlatformFiles('alpine', 'arm64'), []);
	});

	test('excludes non-target platform packages', () => {
		assert.deepStrictEqual(getOSProxyResolverExcludeFilter('darwin', 'x64'), [
			'**',
			...osProxyResolverPlatforms
				.filter(platform => platform !== 'darwin-x64')
				.map(platform => `!**/node_modules/@vscode/os-proxy-resolver-${platform}/**`),
		]);
		assert.deepStrictEqual(getOSProxyResolverExcludeFilter('alpine', 'arm64'), [
			'**',
			...osProxyResolverPlatforms.map(platform => `!**/node_modules/@vscode/os-proxy-resolver-${platform}/**`),
		]);
	});

	test('materializes a missing target platform package', () => {
		const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vscode-os-proxy-resolver-platform-test-'));
		const nodeModulesRoot = path.join(repoRoot, 'node_modules');
		try {
			fs.mkdirSync(nodeModulesRoot, { recursive: true });
			fs.writeFileSync(path.join(repoRoot, 'package-lock.json'), JSON.stringify({
				packages: {
					'node_modules/@vscode/os-proxy-resolver-darwin-x64': {
						version: '0.2.0',
					}
				}
			}));

			ensureOSProxyResolverPlatformPackage('darwin', 'x64', nodeModulesRoot, {
				packPackage: (_packageName, _version, tempDir) => {
					const packageRoot = path.join(tempDir, 'package');
					fs.mkdirSync(packageRoot, { recursive: true });
					fs.writeFileSync(path.join(packageRoot, 'os_proxy_resolver.node'), '');
					const tarball = path.join(tempDir, 'os-proxy-resolver-darwin-x64.tgz');
					create({ file: tarball, cwd: tempDir, gzip: true, sync: true }, ['package']);
					return tarball;
				}
			});

			assert(fs.existsSync(path.join(nodeModulesRoot, '@vscode', 'os-proxy-resolver-darwin-x64', 'os_proxy_resolver.node')));
		} finally {
			fs.rmSync(repoRoot, { recursive: true, force: true });
		}
	});
});
