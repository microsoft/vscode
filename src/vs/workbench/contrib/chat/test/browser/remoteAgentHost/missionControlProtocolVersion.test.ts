/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../../base/common/async.js';
import { Event } from '../../../../../../base/common/event.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { runWithFakedTimers } from '../../../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IAgentHostService, IMissionControlOptions } from '../../../../../../platform/agentHost/common/agentService.js';
import { IConfigurationChangeEvent, IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { ConfigurationScope, Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../../../platform/configuration/common/configurationRegistry.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { MissionControlProtocolVersionOverrideSettingId } from '../../../../../../platform/agentHost/common/missionControlProtocolVersion.js';
import { PROTOCOL_VERSION } from '../../../../../../platform/agentHost/common/state/protocol/version/registry.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../../platform/log/common/log.js';
import { IProductService } from '../../../../../../platform/product/common/productService.js';
import { Registry } from '../../../../../../platform/registry/common/platform.js';
import { IWorkspaceContextService, Workspace } from '../../../../../../platform/workspace/common/workspace.js';
import { IAuthenticationService } from '../../../../../services/authentication/common/authentication.js';
import { IChatEntitlementService } from '../../../../../services/chat/common/chatEntitlementService.js';
import { MissionControlContribution } from '../../../browser/remoteAgentHost/remoteAgentHost.contribution.js';

const properties = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).getConfigurationProperties();
const setting = properties[MissionControlProtocolVersionOverrideSettingId];
const genericOverrideRegistered = properties['chat.agentHost.protocolVersionOverride'] !== undefined;

suite('Mission Control protocol version configuration', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function fixture(override: string) {
		const instantiation = store.add(new TestInstantiationService());
		const configuration = new TestConfigurationService({
			'chat.agentHost.experimentalMissionControl.enabled': true,
			'chat.agentHost.experimentalMissionControl.endpoint': 'https://api.github.com',
			[MissionControlProtocolVersionOverrideSettingId]: override,
		});
		store.add(configuration.onDidChangeConfigurationEmitter);
		const calls: { version: string | undefined; withdrawingAccountId: string | undefined }[] = [];
		instantiation.stub(IAgentHostService, new class extends mock<IAgentHostService>() {
			override readonly onAgentHostStart = Event.None;
			override startAgentHost(): void { }
			override async configureMissionControl(options: IMissionControlOptions | undefined, withdrawingAccountId?: string): Promise<void> {
				calls.push({ version: options?.protocolVersion, withdrawingAccountId });
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
			override readonly onDidChangeSentiment = Event.None;
			override readonly sentiment = { hidden: false };
		}());
		instantiation.stub(IWorkspaceContextService, new class extends mock<IWorkspaceContextService>() {
			override readonly onDidChangeWorkspaceFolders = Event.None;
			override getWorkspace() { return new Workspace('workspace', [], false, null, () => false); }
		}());
		instantiation.stub(IProductService, {});
		instantiation.stub(ILogService, store.add(new NullLogService()));
		store.add(instantiation.createInstance(MissionControlContribution));
		return { calls, configuration };
	}

	test('registers only the Mission Control override as a machine-local development setting', () => {
		assert.deepStrictEqual({
			genericOverrideRegistered,
			type: setting.type, default: setting.default, scope: setting.scope,
			ignoreSync: setting.ignoreSync, restricted: setting.restricted,
			valid: new RegExp(setting.pattern!).test('0.9.0'),
			invalid: new RegExp(setting.pattern!).test('0.9'),
		}, { genericOverrideRegistered: false, type: 'string', default: '', scope: ConfigurationScope.APPLICATION, ignoreSync: true, restricted: true, valid: true, invalid: false });
	});

	for (const override of ['', '0.9.0']) {
		test(`forwards ${override || 'the built-in version'} only through Mission Control configuration`, () => runWithFakedTimers({}, async () => {
			const { calls } = fixture(override);
			await timeout(0);
			assert.deepStrictEqual(calls, [{ version: override || PROTOCOL_VERSION, withdrawingAccountId: undefined }]);
		}));
	}

	test('changing the override withdraws Mission Control and clearing it restores the built-in version', () => runWithFakedTimers({}, async () => {
		const { calls, configuration } = fixture('0.9.0');
		await timeout(0);
		await configuration.setUserConfiguration(MissionControlProtocolVersionOverrideSettingId, '');
		configuration.onDidChangeConfigurationEmitter.fire(new class extends mock<IConfigurationChangeEvent>() {
			override affectsConfiguration(section: string) { return section === MissionControlProtocolVersionOverrideSettingId; }
		}());
		await timeout(0);
		assert.deepStrictEqual(calls, [
			{ version: '0.9.0', withdrawingAccountId: undefined },
			{ version: undefined, withdrawingAccountId: 'account' },
			{ version: PROTOCOL_VERSION, withdrawingAccountId: undefined },
		]);
	}));
});
