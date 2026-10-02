/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ExtensionIdentifier } from '../../../../../../platform/extensions/common/extensions.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ITelemetryService } from '../../../../../../platform/telemetry/common/telemetry.js';
import { NullTelemetryService } from '../../../../../../platform/telemetry/common/telemetryUtils.js';
import { IChatEntitlementService } from '../../../../../services/chat/common/chatEntitlementService.js';
import { mock } from '../../../../../test/common/workbenchTestServices.js';
import { ChatRequestTelemetry, ChatProviderInvokedEvent } from '../../../common/chatService/chatServiceTelemetry.js';
import { ChatAgentLocation } from '../../../common/constants.js';
import { ILanguageModelChatMetadata, ILanguageModelsService } from '../../../common/languageModels.js';
import { IChatSessionsService } from '../../../common/chatSessionsService.js';
import { ChatRequestModel } from '../../../common/model/chatModel.js';
import { IChatAgentData } from '../../../common/participants/chatAgents.js';
import { NullLanguageModelsService } from '../languageModels.js';

suite('ChatRequestTelemetry request context', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function setupContext(metadata?: ILanguageModelChatMetadata, selectedModelId: string | undefined = 'selected', entitlement: { sku?: string } = { sku: 'free_limited_copilot' }) {
		const events: Record<string, unknown>[] = [];
		let currentMetadata = metadata;
		let sku = entitlement.sku;
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IChatSessionsService, new class extends mock<IChatSessionsService>() {
			override getChatSessionContribution(sessionType: string) {
				return sessionType === 'agent-host-copilotcli' ? {
					type: sessionType, name: 'Copilot', displayName: 'Copilot', description: 'Copilot',
					agentHostProviderId: 'copilotcli',
					icon: undefined,
				} : undefined;
			}
		}());
		instantiationService.stub(ILanguageModelsService, new class extends NullLanguageModelsService {
			override lookupLanguageModel(): ILanguageModelChatMetadata | undefined { return currentMetadata; }
		}());
		instantiationService.stub(IChatEntitlementService, new class extends mock<IChatEntitlementService>() {
			override get sku(): string | undefined { return sku; }
		}());
		instantiationService.stub(ITelemetryService, {
			...NullTelemetryService,
			publicLog2(eventName: string, data?: Record<string, unknown>) {
				events.push({ eventName, ...data });
			},
		});
		const telemetry = instantiationService.createInstance(ChatRequestTelemetry, {
			agent: new class extends mock<IChatAgentData>() {
				override id = 'test';
				override extensionId = new ExtensionIdentifier('test.extension');
			}(),
			agentSlashCommandPart: undefined,
			commandPart: undefined,
			requestIndex: 0,
			sessionTypeSelectionReason: undefined,
			sessionResource: URI.from({ scheme: 'vscode-chat-session', path: '/test' }),
			location: ChatAgentLocation.Chat,
			options: { userSelectedModelId: selectedModelId },
			enableCommandDetection: false,
			isVirtualWorkspace: false,
			settingDefaultToCopilotHarness: false,
			settingPreferCopilotHarness: false,
			settingLocalAgentEnabled: true,
			settingCopilotHarnessIntroductionMode: 'off',
		});
		return {
			events,
			changeContext() { sku = 'monthly_subscriber_quota'; currentMetadata = undefined; },
			complete(result: ChatProviderInvokedEvent['result']) {
				telemetry.complete({
					result, requestType: 'string', detectedAgent: undefined, timeToFirstProgress: undefined, totalTime: undefined,
					request: new class extends mock<ChatRequestModel>() {
						override readonly id = 'request';
						override get variableData() { return { variables: [] }; }
					}(),
				});
			},
		};
	}

	const model: ILanguageModelChatMetadata = {
		id: 'test-model', name: 'Test', vendor: 'copilot', extension: new ExtensionIdentifier('GitHub.copilot-chat'),
		version: '1', family: 'test', maxInputTokens: 100, maxOutputTokens: 100, isDefaultForLocation: {},
	};

	for (const result of ['success', 'error', 'errorWithOutput', 'cancelled', 'filtered'] as const) {
		test(`snapshots context and preserves once-only ${result} emission`, () => {
			const context = setupContext(model);
			context.changeContext();
			context.complete(result);
			context.complete(result);
			assert.deepStrictEqual(context.events.map(event => ({
				eventName: event.eventName, result: event.result, requestId: event.requestId,
				requestStartCopilotSku: event.requestStartCopilotSku,
				selectedModelSource: event.selectedModelSource, model: event.model,
			})), [{
				eventName: 'interactiveSessionProviderInvoked', result, requestId: 'request',
				requestStartCopilotSku: 'free_limited_copilot', selectedModelSource: 'copilot',
				model: undefined,
			}]);
		});
	}

	for (const { name, metadata, expected } of [
		{ name: 'unresolved model', metadata: undefined, expected: 'unknown' },
		{ name: 'local Copilot', metadata: model, expected: 'copilot' },
		{ name: 'local BYOK', metadata: { ...model, isBYOK: true }, expected: 'byok' },
		{ name: 'host Copilot', metadata: { ...model, vendor: 'host', targetChatSessionType: 'agent-host-copilotcli' }, expected: 'copilot' },
		{ name: 'host BYOK bridge', metadata: { ...model, vendor: 'host', targetChatSessionType: 'agent-host-copilotcli', byokModelIdentifier: 'private/model' }, expected: 'byok' },
		{ name: 'empty BYOK bridge takes precedence over Copilot', metadata: { ...model, vendor: 'host', targetChatSessionType: 'agent-host-copilotcli', byokModelIdentifier: '' }, expected: 'byok' },
		{ name: 'empty BYOK bridge takes precedence over unknown host', metadata: { ...model, vendor: 'host', targetChatSessionType: 'private-host', byokModelIdentifier: '' }, expected: 'byok' },
		{ name: 'unresolved host provider', metadata: { ...model, vendor: 'host', targetChatSessionType: 'private-host' }, expected: 'unknown' },
		{ name: 'other catalog', metadata: { ...model, vendor: 'private-vendor' }, expected: 'other' },
	]) {
		test(name, () => {
			const context = setupContext(metadata);
			context.complete('error');
			assert.deepStrictEqual(context.events.map(event => event.selectedModelSource), [expected]);
		});
	}

	test('absent selection remains unknown', () => {
		const context = setupContext(model, '');
		context.complete('error');
		assert.deepStrictEqual(context.events.map(event => event.selectedModelSource), ['unknown']);
	});

	test('missing SKU is not filled from later entitlement state', () => {
		const context = setupContext(undefined, 'unresolved', {});
		context.changeContext();
		context.complete('error');
		assert.deepStrictEqual(context.events.map(event => ({
			requestStartCopilotSku: event.requestStartCopilotSku, selectedModelSource: event.selectedModelSource,
		})), [{ requestStartCopilotSku: undefined, selectedModelSource: 'unknown' }]);
	});
});
