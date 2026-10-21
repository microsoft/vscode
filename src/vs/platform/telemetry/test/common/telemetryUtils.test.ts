/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../configuration/test/common/testConfigurationService.js';
import { TelemetryConfiguration, TelemetryLevel } from '../../common/telemetry.js';
import { cleanData, cleanRemoteAuthority, getTelemetryLevel } from '../../common/telemetryUtils.js';

suite('TelemetryUtils', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('getTelemetryLevel fails closed for invalid configuration', () => {
		assert.deepStrictEqual([
			getTelemetryLevel(new TestConfigurationService()),
			getTelemetryLevel(new TestConfigurationService({ 'telemetry.telemetryLevel': TelemetryConfiguration.ON })),
			getTelemetryLevel(new TestConfigurationService({ 'telemetry.telemetryLevel': TelemetryConfiguration.ERROR })),
			getTelemetryLevel(new TestConfigurationService({ 'telemetry.telemetryLevel': TelemetryConfiguration.CRASH })),
			getTelemetryLevel(new TestConfigurationService({ 'telemetry.telemetryLevel': TelemetryConfiguration.OFF })),
			getTelemetryLevel(new TestConfigurationService({ 'telemetry.telemetryLevel': 'invalid' })),
			getTelemetryLevel(new class extends TestConfigurationService {
				override getValue<T>(): T {
					return null!;
				}
			}()),
		], [
			TelemetryLevel.USAGE,
			TelemetryLevel.USAGE,
			TelemetryLevel.ERROR,
			TelemetryLevel.CRASH,
			TelemetryLevel.NONE,
			TelemetryLevel.NONE,
			TelemetryLevel.NONE,
		]);
	});

	suite('cleanData', () => {

		test('redacts command-line credentials and shortened API keys', () => {
			const placeholder = 'PLACEHOLDER';
			assert.deepStrictEqual(cleanData({
				shortenedGoogleApiKey: `"maps": "AIza${'A1b2C3d4E5'.repeat(3)}",`,
				plinkPassword: `plink.exe -ssh -batch -l some-user -pw '${placeholder}' build-host "uptime"`,
				openSslPassword: `openssl enc -aes-256-cbc -pass pass:${placeholder} -in notes.txt`,
				windowsPassword: `runas /user:admin /pass:${placeholder} app.exe`,
				sshpassPassword: `sshpass -p ${placeholder} ssh deploy@buildbox`,
				curlBasicAuth: `curl -sS -u admin:${placeholder} api.internal:8080`,
				curlAttachedBasicAuth: `curl -sS -uadmin:${placeholder} api.internal:8080`,
				curlShortPassword: 'curl -sS -u admin:x api.internal:8080',
			}, []), {
				shortenedGoogleApiKey: '<REDACTED: Google API Key>',
				plinkPassword: '<REDACTED: CLI Password Flag>',
				openSslPassword: '<REDACTED: CLI Password Flag>',
				windowsPassword: '<REDACTED: CLI Password Flag>',
				sshpassPassword: '<REDACTED: CLI Password Flag>',
				curlBasicAuth: '<REDACTED: CLI Basic Auth>',
				curlAttachedBasicAuth: '<REDACTED: CLI Basic Auth>',
				curlShortPassword: '<REDACTED: CLI Basic Auth>',
			});
		});

		test('does not redact common command-line flags', () => {
			const commands = {
				mkdir: 'mkdir -p src && git log -p -1',
				ssh: 'ssh -p 2222 deploy@buildbox',
				docker: 'docker run -u 1000:1000 -p 8080:80 nginx',
				dockerAttached: 'docker exec -u0:0 container sh',
				msbuild: 'dotnet build /p:Configuration=Release /p:Platform=x64',
				jest: 'npx jest --passWithNoTests --ci',
				git: 'git push -u origin main',
			};
			assert.deepStrictEqual(cleanData(commands, []), commands);
		});

		test('removes OneDrive organization names from paths', () => {
			assert.deepStrictEqual(cleanData({
				path: `Set-Location 'C:\\Users\\someone\\OneDrive - Contoso Corporation\\Documents\\repo'; git status`,
				pathWithApostrophe: `Set-Location 'C:\\Users\\someone\\OneDrive - O'Brien Holdings\\Documents\\repo'; git status`,
				text: 'Could not sync "OneDrive - Contoso Corporation" folder',
			}, []), {
				path: `Set-Location '<REDACTED: user-file-path>'; git status`,
				pathWithApostrophe: `Set-Location '<REDACTED: user-file-path>'; git status`,
				text: 'Could not sync "OneDrive" folder',
			});
		});
	});

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
