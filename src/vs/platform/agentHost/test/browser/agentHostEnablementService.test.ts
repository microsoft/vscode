/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { autorun } from '../../../../base/common/observable.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { AgentHostEnablementService } from '../../browser/agentHostEnablementService.js';
import { AGENT_HOST_ENABLED_CONTEXT_KEY } from '../../common/agentHostEnablementService.js';
import { ConfigurationTarget, IConfigurationChangeEvent, IConfigurationOverrides } from '../../../configuration/common/configuration.js';
import { ChatAIDisabledSettingId } from '../../../chat/common/chatSettings.js';
import { TestConfigurationService } from '../../../configuration/test/common/testConfigurationService.js';
import { MockContextKeyService } from '../../../keybinding/test/common/mockKeybindingService.js';

class AgentHostTestConfigurationService extends TestConfigurationService {

	private readonly values = new Map<string, boolean>();

	constructor(aiDisabled = false) {
		super();
		this.values.set(ChatAIDisabledSettingId, aiDisabled);
	}

	override getValue<T>(arg1?: string | IConfigurationOverrides): T | undefined {
		return (typeof arg1 === 'string' ? this.values.get(arg1) : undefined) as T | undefined;
	}

	setValue(key: string, value: boolean, source: ConfigurationTarget): void {
		this.values.set(key, value);
		const event: IConfigurationChangeEvent = {
			source,
			affectedKeys: new Set([key]),
			change: { keys: [key], overrides: [] },
			affectsConfiguration: candidate => candidate === key,
		};
		this.onDidChangeConfigurationEmitter.fire(event);
	}
}

suite('AgentHostEnablementService', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createService(aiDisabled = false, runtimeAvailable = true): {
		readonly service: AgentHostEnablementService;
		readonly configurationService: AgentHostTestConfigurationService;
		readonly contextKeyService: MockContextKeyService;
	} {
		const configurationService = new AgentHostTestConfigurationService(aiDisabled);
		disposables.add(configurationService.onDidChangeConfigurationEmitter);
		const contextKeyService = disposables.add(new MockContextKeyService());
		const service = disposables.add(new AgentHostEnablementService(runtimeAvailable, configurationService, contextKeyService));
		return { service, configurationService, contextKeyService };
	}

	test('is enabled when the runtime is available', () => {
		const { service, contextKeyService } = createService();
		assert.deepStrictEqual({
			enabled: service.enabled.get(),
			contextKey: contextKeyService.getContextKeyValue(AGENT_HOST_ENABLED_CONTEXT_KEY.key),
		}, {
			enabled: true,
			contextKey: true,
		});
	});

	test('is disabled when AI features are disabled', () => {
		const { service, contextKeyService } = createService(true);
		assert.deepStrictEqual({
			enabled: service.enabled.get(),
			contextKey: contextKeyService.getContextKeyValue(AGENT_HOST_ENABLED_CONTEXT_KEY.key),
		}, {
			enabled: false,
			contextKey: false,
		});
	});

	test('is disabled when the runtime is unavailable', () => {
		const { service, contextKeyService } = createService(false, false);
		assert.deepStrictEqual({
			enabled: service.enabled.get(),
			contextKey: contextKeyService.getContextKeyValue(AGENT_HOST_ENABLED_CONTEXT_KEY.key),
		}, {
			enabled: false,
			contextKey: false,
		});
	});

	test('tracks AI feature disablement in both directions', () => {
		const { service, configurationService, contextKeyService } = createService();
		const changes: boolean[] = [];
		disposables.add(autorun(reader => changes.push(service.enabled.read(reader))));

		configurationService.setValue(ChatAIDisabledSettingId, true, ConfigurationTarget.USER);
		configurationService.setValue(ChatAIDisabledSettingId, false, ConfigurationTarget.USER);

		assert.deepStrictEqual({
			enabled: service.enabled.get(),
			contextKey: contextKeyService.getContextKeyValue(AGENT_HOST_ENABLED_CONTEXT_KEY.key),
			changes,
		}, {
			enabled: true,
			contextKey: true,
			changes: [true, false, true],
		});
	});

});
