/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import sinon from 'sinon';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { TERMINAL_AUTO_APPROVE_SETTING_ID, URL_AUTO_APPROVE_SETTING_ID } from '../../../../../../platform/agentHost/common/agentHostSchema.js';
import { ConfigurationTarget } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { mirrorAgentHostGrants } from '../../../browser/agentSessions/agentHost/agentHostPermissionMirror.js';

suite('Agent host permission settings', () => {
	ensureNoDisposablesAreLeakedInTestSuite();
	teardown(() => sinon.restore());
	const key = URL_AUTO_APPROVE_SETTING_ID;

	test('saves URL-pattern and unrestricted grants as request approvals to user settings', async () => {
		const configurationService = new TestConfigurationService();
		const update = sinon.stub(configurationService, 'updateValue').resolves();
		await mirrorAgentHostGrants(configurationService, ['WebFetch(github.com)', 'WebFetch(*.example.com)', 'WebFetch(github.com/microsoft/vscode/wiki/*)', 'WebFetch(http://example.com)', 'Edit', 'WebFetch', 'WebFetch(*)']);
		assert.deepStrictEqual(update.args, [[key, {
			'https://github.com': { approveRequest: true, approveResponse: false },
			'https://*.example.com': { approveRequest: true, approveResponse: false },
			'https://github.com/microsoft/vscode/wiki/*': { approveRequest: true, approveResponse: false },
			'http://example.com': { approveRequest: true, approveResponse: false },
			'*': { approveRequest: true, approveResponse: false },
		}, ConfigurationTarget.USER]]);
	});

	test('merges with user booleans and objects while preserving response approvals and unrelated patterns', async () => {
		const configurationService = new TestConfigurationService({
			[key]: {
				'https://allowed.example.com': true,
				'https://denied.example.com': false,
				'https://request.example.com': { approveRequest: true },
				'https://response.example.com': { approveResponse: true },
				'https://neither.example.com': {},
				'https://unrelated.example.com': { approveResponse: false },
				'https://github.com/microsoft/vscode/wiki/*': { approveRequest: false, approveResponse: true },
			}
		});
		const update = sinon.stub(configurationService, 'updateValue').resolves();
		await mirrorAgentHostGrants(configurationService, [...['allowed', 'denied', 'request', 'response', 'neither'].map(domain => `WebFetch(${domain}.example.com)`), 'WebFetch(github.com/microsoft/vscode/wiki/*)']);
		assert.deepStrictEqual(update.args, [[key, {
			'https://allowed.example.com': true,
			'https://denied.example.com': { approveRequest: true, approveResponse: false },
			'https://request.example.com': { approveRequest: true, approveResponse: false },
			'https://response.example.com': true,
			'https://neither.example.com': { approveRequest: true, approveResponse: false },
			'https://unrelated.example.com': { approveResponse: false },
			'https://github.com/microsoft/vscode/wiki/*': true,
		}, ConfigurationTarget.USER]]);
	});

	test('does not copy workspace approvals to user settings', async () => {
		const configurationService = new class extends TestConfigurationService {
			override inspect<T>(key: string) {
				return { ...super.inspect<T>(key), userValue: undefined };
			}
		}({ [key]: { 'https://workspace.example.com': true } });
		const update = sinon.stub(configurationService, 'updateValue').resolves();
		await mirrorAgentHostGrants(configurationService, ['WebFetch(github.com)']);
		assert.deepStrictEqual(update.args, [[key, {
			'https://github.com': { approveRequest: true, approveResponse: false },
		}, ConfigurationTarget.USER]]);
	});

	test('ignores grants without supported URL or terminal rules', async () => {
		const configurationService = new TestConfigurationService();
		const update = sinon.stub(configurationService, 'updateValue').resolves();
		await mirrorAgentHostGrants(configurationService, ['Read', 'Bash(echo *)', 'WebFetch(example.com', 'WebFetch()', 'Shell', 'Shell()']);
		assert.deepStrictEqual(update.args, []);
	});

	test('merges Shell grants into user terminal rules', async () => {
		const terminalKey = TERMINAL_AUTO_APPROVE_SETTING_ID;
		const configurationService = new TestConfigurationService({
			[terminalKey]: {
				git: false,
				rm: null,
				python: { approve: false, matchCommandLine: true },
				ls: true,
			}
		});
		const update = sinon.stub(configurationService, 'updateValue').resolves();
		await mirrorAgentHostGrants(configurationService, ['Shell(git *)', 'Shell(commandLine:python *)', 'Shell(npm test)', 'Shell(/foo/i)']);
		assert.deepStrictEqual(update.args, [[terminalKey, {
			git: true,
			rm: null,
			python: { approve: true, matchCommandLine: true },
			ls: true,
			'/^npm test$/': true,
			'/foo/i': true,
		}, ConfigurationTarget.USER]]);
	});

	test('mirrors mixed grants without copying workspace terminal rules', async () => {
		const terminalKey = TERMINAL_AUTO_APPROVE_SETTING_ID;
		const configurationService = new class extends TestConfigurationService {
			override inspect<T>(key: string) {
				return { ...super.inspect<T>(key), userValue: undefined };
			}
		}({ [terminalKey]: { workspaceOnly: true } });
		const update = sinon.stub(configurationService, 'updateValue').resolves();
		await mirrorAgentHostGrants(configurationService, ['WebFetch(github.com)', 'Shell(git *)']);
		assert.deepStrictEqual(update.args, [
			[key, { 'https://github.com': { approveRequest: true, approveResponse: false } }, ConfigurationTarget.USER],
			[terminalKey, { git: true }, ConfigurationTarget.USER],
		]);
	});

	test('serializes terminal grants without losing earlier user-setting writes', async () => {
		const terminalKey = TERMINAL_AUTO_APPROVE_SETTING_ID;
		const configurationService = new TestConfigurationService({ [terminalKey]: { existing: false } });
		sinon.stub(configurationService, 'updateValue').callsFake((key, value) => configurationService.setUserConfiguration(key, value));
		await Promise.all([
			mirrorAgentHostGrants(configurationService, ['Shell(git *)']),
			mirrorAgentHostGrants(configurationService, ['Shell(npm *)']),
		]);
		assert.deepStrictEqual(configurationService.inspect(terminalKey).userValue, { existing: false, git: true, npm: true });
	});
});
