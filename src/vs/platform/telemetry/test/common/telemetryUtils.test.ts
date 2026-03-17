/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { cleanRemoteAuthority, getPiiPathsFromEnvironment, getBrowserPiiPaths } from '../../common/telemetryUtils.js';

suite('TelemetryUtils', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	suite('cleanRemoteAuthority', () => {

		test('returns "none" when remoteAuthority is undefined', () => {
			const config = {
				remoteExtensionTips: { 'ssh-remote': {} },
				virtualWorkspaceExtensionTips: { 'codespaces': {} }
			};

			const result = cleanRemoteAuthority(undefined, config);
			assert.strictEqual(result, 'none');
		});

		test('returns remoteName when it exists in remoteExtensionTips', () => {
			const config = {
				remoteExtensionTips: {
					'ssh-remote': {},
					'dev-container': {},
					'wsl': {}
				}
			};

			assert.strictEqual(cleanRemoteAuthority('ssh-remote', config), 'ssh-remote');
			assert.strictEqual(cleanRemoteAuthority('dev-container', config), 'dev-container');
			assert.strictEqual(cleanRemoteAuthority('wsl', config), 'wsl');
		});

		test('returns remoteName when it exists in virtualWorkspaceExtensionTips', () => {
			const config = {
				remoteExtensionTips: {},
				virtualWorkspaceExtensionTips: {
					'codespaces': {},
					'tunnel': {}
				}
			};

			assert.strictEqual(cleanRemoteAuthority('codespaces', config), 'codespaces');
			assert.strictEqual(cleanRemoteAuthority('tunnel', config), 'tunnel');
		});

		test('returns "other" when remoteName is not in either config', () => {
			const config = {
				remoteExtensionTips: {
					'ssh-remote': {},
					'dev-container': {}
				},
				virtualWorkspaceExtensionTips: {
					'codespaces': {}
				}
			};

			assert.strictEqual(cleanRemoteAuthority('unknown-remote', config), 'other');
			assert.strictEqual(cleanRemoteAuthority('custom-remote', config), 'other');
		});

		test('returns "other" when config is empty', () => {
			const config = {
				remoteExtensionTips: {},
				virtualWorkspaceExtensionTips: {}
			};

			assert.strictEqual(cleanRemoteAuthority('ssh-remote', config), 'other');
		});

		test('handles config with undefined remoteExtensionTips', () => {
			const config = {
				virtualWorkspaceExtensionTips: {
					'codespaces': {}
				}
			};

			assert.strictEqual(cleanRemoteAuthority('codespaces', config), 'codespaces');
			assert.strictEqual(cleanRemoteAuthority('ssh-remote', config), 'other');
		});

		test('handles config with undefined virtualWorkspaceExtensionTips', () => {
			const config = {
				remoteExtensionTips: {
					'ssh-remote': {}
				}
			};

			assert.strictEqual(cleanRemoteAuthority('ssh-remote', config), 'ssh-remote');
			assert.strictEqual(cleanRemoteAuthority('codespaces', config), 'other');
		});

		test('handles empty config object', () => {
			const config = {};

			assert.strictEqual(cleanRemoteAuthority('ssh-remote', config), 'other');
			assert.strictEqual(cleanRemoteAuthority(undefined, config), 'none');
		});

		test('handles remoteAuthority with additional path segments', () => {
			const config = {
				remoteExtensionTips: {
					'ssh-remote': {}
				}
			};

			// getRemoteName should extract just the authority name
			assert.strictEqual(cleanRemoteAuthority('ssh-remote+server1.example.com', config), 'ssh-remote');
		});

		test('handles undefined config object', () => {
			const config = undefined!;

			assert.strictEqual(cleanRemoteAuthority('ssh-remote', config), 'other');
			assert.strictEqual(cleanRemoteAuthority(undefined, config), 'none');
		});
	});

	suite('getPiiPathsFromEnvironment', () => {
		test('returns array of paths from IPathEnvironment', () => {
			const paths = {
				appRoot: '/Applications/VS Code.app/Contents/Resources/app',
				extensionsPath: '/Users/test/.vscode/extensions',
				userDataPath: '/Users/test/Library/Application Support/Code',
				userHome: { fsPath: '/Users/test' } as any,
				tmpDir: { fsPath: '/tmp' } as any
			};

			const result = getPiiPathsFromEnvironment(paths);

			assert.strictEqual(result.length, 5);
			assert(result.includes('/Applications/VS Code.app/Contents/Resources/app'));
			assert(result.includes('/Users/test/.vscode/extensions'));
			assert(result.includes('/Users/test/Library/Application Support/Code'));
			assert(result.includes('/Users/test'));
			assert(result.includes('/tmp'));
		});
	});

	suite('getBrowserPiiPaths', () => {
		test('returns empty array when no webEndpoint is provided', () => {
			const result = getBrowserPiiPaths(undefined);
			assert.strictEqual(result.length, 0);
		});

		test('returns path patterns for vscode.dev endpoint', () => {
			const result = getBrowserPiiPaths('https://vscode.dev');

			assert.strictEqual(result.length, 4);
			// Should include the origin and common path patterns
			assert(result.some(p => p.includes('vscode.dev')));
		});

		test('returns path patterns for codespaces endpoint', () => {
			const result = getBrowserPiiPaths('https://test-github-1234567.github.dev');

			assert.strictEqual(result.length, 4);
			assert(result.some(p => p.includes('github.dev')));
		});

		test('handles endpoint with trailing slash', () => {
			const result = getBrowserPiiPaths('https://vscode.dev/');

			assert.strictEqual(result.length, 4);
			assert(result.some(p => p === 'https://vscode.dev'));
		});

		test('handles endpoint without protocol', () => {
			const result = getBrowserPiiPaths('vscode.dev');

			// Should still work, though ideally protocol is included
			assert(result.length > 0);
		});
	});
});
