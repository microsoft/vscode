/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ExtensionIdentifier } from '../../../../../platform/extensions/common/extensions.js';
import { TelemetryTrustedValue } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import type { IAutomationDescriptor } from '../../../../../workbench/contrib/chat/common/automations/automation.js';
import type { ILanguageModelChatMetadata } from '../../../../../workbench/contrib/chat/common/languageModels.js';
import { NullLanguageModelsService } from '../../../../../workbench/contrib/chat/test/common/languageModels.js';
import { hashSessionIdForTelemetry } from '../../../../common/sessionsTelemetry.js';
import { getAutomationConfigurationTelemetry, getAutomationRunTelemetry } from '../../browser/automationTelemetry.js';

suite('Automation telemetry', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const automation: IAutomationDescriptor = {
		id: 'automation',
		name: 'Private name',
		prompt: 'Private prompt',
		target: { kind: 'workspace', folderUri: URI.file('/private/workspace'), isolation: { kind: 'default' } },
		schedule: { interval: 'manual', scheduleHour: 9, scheduleMinute: 0, scheduleDay: 1 },
		enabled: true,
		createdAt: '2026-01-01T00:00:00.000Z',
		updatedAt: '2026-01-01T00:00:00.000Z',
	};

	test('reports provider defaults explicitly without definition content', () => {
		assert.deepStrictEqual(getAutomationConfigurationTelemetry(automation, new NullLanguageModelsService()), {
			provider: 'default',
			model: undefined,
			modelSelectionKind: 'default',
			mode: 'providerDefault',
			permissionLevel: 'providerDefault',
			isolationMode: 'providerDefault',
			targetKind: 'workspace',
			folderCount: 1,
			hasCustomAgent: false,
		});
	});

	test('reports trusted catalog model IDs and bounded configuration without connection or branch details', () => {
		const models = new class extends NullLanguageModelsService {
			override lookupLanguageModel(): ILanguageModelChatMetadata {
				return {
					extension: new ExtensionIdentifier('github.copilot-chat'),
					id: 'test-model',
					vendor: 'remote-private-host-copilotcli',
					name: 'Private display name',
					version: '1',
					family: 'test',
					maxInputTokens: 100,
					maxOutputTokens: 100,
					isDefaultForLocation: {},
				};
			}
		}();
		assert.deepStrictEqual(getAutomationConfigurationTelemetry({
			...automation,
			sessionTemplate: {
				modelId: 'remote-private-host-copilotcli:test-model',
				modelConfiguration: { privateSetting: 'Private preference' },
				agent: { uri: 'file:///private/custom-agent.md' },
				config: { mode: 'plan', autoApprove: 'assisted', privateSetting: 'Private value' },
			},
			target: {
				kind: 'workspace',
				folderUri: URI.file('/private/workspace'),
				providerId: 'remote-agent-host-private',
				sessionTypeId: 'remote-private-host-copilotcli',
				isolation: { kind: 'worktree', branch: 'private-branch' },
			},
		}, models), {
			provider: 'copilotcli',
			model: new TelemetryTrustedValue('test-model'),
			modelSelectionKind: 'explicit',
			mode: 'plan',
			permissionLevel: 'assisted',
			isolationMode: 'worktree',
			targetKind: 'workspace',
			folderCount: 1,
			hasCustomAgent: true,
		});
	});

	test('an explicit empty session template overrides stale legacy aliases', () => {
		assert.deepStrictEqual(getAutomationConfigurationTelemetry({
			...automation,
			sessionTemplate: {},
			modelId: 'auto',
			mode: 'autopilot',
			permissionLevel: 'autoApprove',
		}, new NullLanguageModelsService()), getAutomationConfigurationTelemetry(automation, new NullLanguageModelsService()));
	});

	test('redacts unknown and BYOK model IDs and unknown configuration values', () => {
		const model: ILanguageModelChatMetadata = {
			extension: new ExtensionIdentifier('github.copilot-chat'),
			id: 'private-model',
			vendor: 'copilot',
			name: 'Private model',
			version: '1',
			family: 'private',
			maxInputTokens: 100,
			maxOutputTokens: 100,
			isDefaultForLocation: {},
			isBYOK: true,
		};
		const models = new class extends NullLanguageModelsService {
			override lookupLanguageModel(id: string): ILanguageModelChatMetadata | undefined {
				return id === 'known-byok' ? model : id === 'copied-byok' ? { ...model, isBYOK: false, byokModelIdentifier: 'private-provider/private-model' } : undefined;
			}
		}();
		const results = ['unknown-model', 'known-byok', 'copied-byok', 'auto'].map(modelId =>
			getAutomationConfigurationTelemetry({
				...automation,
				sessionTemplate: { modelId, config: { mode: 'private-mode', autoApprove: 'private-permission' } },
				target: { kind: 'quickChat', providerId: 'private-host', sessionTypeId: 'private-provider' },
			}, models));

		assert.deepStrictEqual(results, ['unknown', 'byokModel', 'byokModel', new TelemetryTrustedValue('auto')].map((model, index) => ({
			provider: 'other',
			model,
			modelSelectionKind: index === 3 ? 'auto' : 'explicit',
			mode: 'other',
			permissionLevel: 'other',
			isolationMode: 'none',
			targetKind: 'quickChat',
			folderCount: 0,
			hasCustomAgent: false,
		})));
	});

	test('continues reporting saved legacy configuration for unmigrated definitions', () => {
		const legacy = { ...automation, modelId: 'auto', mode: 'plan', permissionLevel: 'assisted' };
		assert.deepStrictEqual(getAutomationConfigurationTelemetry(legacy, new NullLanguageModelsService()), getAutomationConfigurationTelemetry({
			...automation,
			sessionTemplate: { modelId: 'auto', config: { mode: 'plan', autoApprove: 'assisted' } },
		}, new NullLanguageModelsService()));
	});

	test('uses native host and window session identities without emitting resource URIs', () => {
		const resource = URI.parse('remote-private-host-copilotcli:/session-1');
		const sessionId = `remote-agent-host-private:${resource.toString()}`;
		assert.deepStrictEqual(getAutomationRunTelemetry({
			id: 'run',
			automationId: 'automation',
			trigger: 'catch_up',
			status: 'running',
			sessionResource: resource,
			sessionId,
			startedAt: automation.createdAt,
			leaderWindowId: 123,
		}), {
			automationId: 'automation',
			runId: 'run',
			executionAuthority: 'browser',
			trigger: 'catch_up',
			runCreatedAt: automation.createdAt,
			sessionProvider: 'copilotcli',
			agentSessionId: 'session-1',
			agentsWindowSessionId: hashSessionIdForTelemetry(sessionId),
			sessionCreated: true,
		});
	});
});
