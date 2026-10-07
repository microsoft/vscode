/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../../base/common/async.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { runWithFakedTimers } from '../../../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IAgentHostService, IMissionControlOptions } from '../../../../../../platform/agentHost/common/agentService.js';
import { IConfigurationChangeEvent, IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../../../platform/configuration/common/configurationRegistry.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../../platform/log/common/log.js';
import { IProductService } from '../../../../../../platform/product/common/productService.js';
import { Registry } from '../../../../../../platform/registry/common/platform.js';
import { IWorkspaceContextService, toWorkspaceFolder, Workspace } from '../../../../../../platform/workspace/common/workspace.js';
import { IAuthenticationService } from '../../../../../services/authentication/common/authentication.js';
import { IChatEntitlementService } from '../../../../../services/chat/common/chatEntitlementService.js';
import { MissionControlContribution } from '../../../browser/remoteAgentHost/remoteAgentHost.contribution.js';

const enabledSetting = 'chat.agentHost.experimentalMissionControl.enabled';
const configurationProperties = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).getConfigurationProperties();
const registeredMissionControlSettings = Object.keys(configurationProperties)
	.filter(key => key.startsWith('chat.agentHost.experimentalMissionControl'))
	.map(key => ({ key, default: configurationProperties[key].default }));
const removedSettings = {
	'chat.agentHost.experimentalMissionControl.endpoint': 'https://example.invalid',
	'chat.agentHost.experimentalMissionControl.requireConnectionBinding': true,
	'chat.agentHost.experimentalMissionControlFakeEndpoint': 'http://127.0.0.1:1234',
};
const workspaceRoot = URI.file('/mission-control-workspace');
const expectedOptions: IMissionControlOptions = {
	baseUrl: 'https://api.github.com',
	accountId: 'account',
	credential: 'test-token',
	roots: [workspaceRoot.fsPath],
	live: true,
};

suite('Mission Control registration contribution', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function fixture(enabled = true, emptyWindow = false) {
		const instantiation = store.add(new TestInstantiationService());
		const configuration = new TestConfigurationService({ [enabledSetting]: enabled, ...removedSettings });
		store.add(configuration.onDidChangeConfigurationEmitter);
		const sentimentChanged = store.add(new Emitter<void>());
		let hidden = false;
		let starts = 0;
		const calls: { options: IMissionControlOptions | undefined; withdrawingAccountId: string | undefined }[] = [];
		instantiation.stub(IAgentHostService, new class extends mock<IAgentHostService>() {
			override readonly onAgentHostStart = Event.None;
			override startAgentHost(): void { starts++; }
			override async configureMissionControl(options: IMissionControlOptions | undefined, withdrawingAccountId?: string): Promise<void> {
				calls.push({ options, withdrawingAccountId });
			}
		}());
		instantiation.stub(IConfigurationService, configuration);
		instantiation.stub(IAuthenticationService, new class extends mock<IAuthenticationService>() {
			override readonly onDidChangeSessions = Event.None;
			override async getSessions() {
				return [{ id: 'session', account: { id: 'account', label: 'Account' }, scopes: ['read:user', 'user:email', 'repo', 'workflow'], accessToken: 'test-token' }];
			}
		}());
		instantiation.stub(IChatEntitlementService, new class extends mock<IChatEntitlementService>() {
			override readonly onDidChangeSentiment = sentimentChanged.event;
			override get sentiment() { return { hidden }; }
		}());
		instantiation.stub(IWorkspaceContextService, new class extends mock<IWorkspaceContextService>() {
			override readonly onDidChangeWorkspaceFolders = Event.None;
			override getWorkspace() { return new Workspace('workspace', emptyWindow ? [] : [toWorkspaceFolder(workspaceRoot)], false, null, () => false); }
		}());
		instantiation.stub(IProductService, {});
		instantiation.stub(ILogService, store.add(new NullLogService()));
		store.add(instantiation.createInstance(MissionControlContribution));
		return {
			calls, configuration, starts: () => starts,
			disableAI: () => { hidden = true; sentimentChanged.fire(); },
		};
	}

	test('registers only the opt-in setting', () => {
		assert.deepStrictEqual(registeredMissionControlSettings, [{ key: enabledSetting, default: false }]);
	});

	for (const enabled of [false, true]) {
		test(`ignores removed settings when registration is ${enabled ? 'enabled' : 'disabled'}`, () => runWithFakedTimers({}, async () => {
			const { calls, starts } = fixture(enabled);
			await timeout(0);
			assert.deepStrictEqual({ starts: starts(), calls }, {
				starts: enabled ? 1 : 0,
				calls: enabled ? [{ options: expectedOptions, withdrawingAccountId: undefined }] : [],
			});
		}));
	}

	test('registers an empty window without a test-endpoint workspace requirement', () => runWithFakedTimers({}, async () => {
		const { calls } = fixture(true, true);
		await timeout(0);
		assert.deepStrictEqual(calls, [{ options: { ...expectedOptions, roots: [] }, withdrawingAccountId: undefined }]);
	}));

	test('does not reconfigure when removed settings change', () => runWithFakedTimers({}, async () => {
		const { calls, configuration } = fixture();
		await timeout(0);
		for (const setting of Object.keys(removedSettings)) {
			configuration.onDidChangeConfigurationEmitter.fire(new class extends mock<IConfigurationChangeEvent>() {
				override affectsConfiguration(section: string) { return section === setting; }
			}());
		}
		await timeout(0);
		assert.deepStrictEqual(calls, [{ options: expectedOptions, withdrawingAccountId: undefined }]);
	}));

	test('withdraws registration when the opt-in setting is disabled', () => runWithFakedTimers({}, async () => {
		const { calls, configuration } = fixture();
		await timeout(0);
		await configuration.setUserConfiguration(enabledSetting, false);
		configuration.onDidChangeConfigurationEmitter.fire(new class extends mock<IConfigurationChangeEvent>() {
			override affectsConfiguration(section: string) { return section === enabledSetting; }
		}());
		await timeout(0);
		assert.deepStrictEqual(calls, [
			{ options: expectedOptions, withdrawingAccountId: undefined },
			{ options: undefined, withdrawingAccountId: 'account' },
		]);
	}));

	test('withdraws registration when AI features are hidden', () => runWithFakedTimers({}, async () => {
		const { calls, disableAI } = fixture();
		await timeout(0);
		disableAI();
		await timeout(0);
		assert.deepStrictEqual(calls, [
			{ options: expectedOptions, withdrawingAccountId: undefined },
			{ options: undefined, withdrawingAccountId: 'account' },
		]);
	}));
});
