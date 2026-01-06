/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { cleanRemoteAuthority } from '../../common/telemetryUtils.js';

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
});
