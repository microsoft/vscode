/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { ExtensionIdentifier } from '../../../../../../../platform/extensions/common/extensions.js';
import { ChatAgentLocation, ChatModeKind } from '../../../../common/constants.js';
import { ILanguageModelChatMetadata, ILanguageModelChatMetadataAndIdentifier } from '../../../../common/languageModels.js';
import {
	filterModelsForSession,
	findDefaultModel,
	hasModelsTargetingSession,
	isModelSupportedForInlineChat,
	isModelSupportedForMode,
	isModelValidForSession,
	mergeModelsWithCache,
	resolveModelFromSyncState,
	shouldResetModelToDefault,
	shouldResetOnModelListChange,
	shouldRestoreLateArrivingModel,
	shouldRestorePersistedModel,
} from '../../../../browser/widget/input/chatModelSelectionLogic.js';

/**
 * Test helper that composes the full startup pipeline: merge live+cache → sort → filter by session/mode.
 * This mirrors what `chatInputPart.getModels()` does, but without the storage side effects.
 */
function computeAvailableModels(
	liveModels: ILanguageModelChatMetadataAndIdentifier[],
	cachedModels: ILanguageModelChatMetadataAndIdentifier[],
	contributedVendors: Set<string>,
	sessionType: string | undefined,
	currentModeKind: ChatModeKind,
	location: ChatAgentLocation,
): ILanguageModelChatMetadataAndIdentifier[] {
	const merged = mergeModelsWithCache(liveModels, cachedModels, contributedVendors);
	merged.sort((a, b) => a.metadata.name.localeCompare(b.metadata.name));
	return filterModelsForSession(merged, sessionType, currentModeKind, location);
}

function createModel(
	id: string,
	name: string,
	overrides?: Partial<ILanguageModelChatMetadata>,
): ILanguageModelChatMetadataAndIdentifier {
	return {
		identifier: `copilot/${id}`,
		metadata: {
			extension: new ExtensionIdentifier('test.ext'),
			id,
			name,
			vendor: 'copilot',
			version: '1.0',
			family: 'copilot',
			maxInputTokens: 128000,
			maxOutputTokens: 4096,
			isDefaultForLocation: {},
			isUserSelectable: true,
			modelPickerCategory: undefined,
			capabilities: { toolCalling: true, agentMode: true },
			...overrides,
		} as ILanguageModelChatMetadata,
	};
}

function createDefaultModelForLocation(
	id: string,
	name: string,
	location: ChatAgentLocation,
	overrides?: Partial<ILanguageModelChatMetadata>,
): ILanguageModelChatMetadataAndIdentifier {
	return createModel(id, name, {
		isDefaultForLocation: { [location]: true },
		...overrides,
	});
}

function createSessionModel(
	id: string,
	name: string,
	sessionType: string,
	overrides?: Partial<ILanguageModelChatMetadata>,
): ILanguageModelChatMetadataAndIdentifier {
	return createModel(id, name, {
		targetChatSessionType: sessionType,
		...overrides,
	});
}

suite('ChatModelSelectionLogic', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	suite('isModelSupportedForMode', () => {

		test('any model is supported in Ask mode', () => {
			const model = createModel('basic', 'Basic', { capabilities: undefined });
			assert.strictEqual(isModelSupportedForMode(model, ChatModeKind.Ask), true);
		});

		test('any model is supported in Edit mode', () => {
			const model = createModel('basic', 'Basic', { capabilities: undefined });
			assert.strictEqual(isModelSupportedForMode(model, ChatModeKind.Edit), true);
		});

		test('model with tool calling and agent mode is supported in Agent mode', () => {
			const model = createModel('agent-capable', 'Agent-Capable', {
				capabilities: { toolCalling: true, agentMode: true },
			});
			assert.strictEqual(isModelSupportedForMode(model, ChatModeKind.Agent), true);
		});

		test('model with tool calling but agentMode=undefined is supported in Agent mode', () => {
			const model = createModel('tool-only', 'Tool-Only', {
				capabilities: { toolCalling: true },
			});
			assert.strictEqual(isModelSupportedForMode(model, ChatModeKind.Agent), true);
		});

		test('model without tool calling is NOT supported in Agent mode', () => {
			const model = createModel('no-tools', 'No-Tools', {
				capabilities: { toolCalling: false },
			});
			assert.strictEqual(isModelSupportedForMode(model, ChatModeKind.Agent), false);
		});

		test('model with agentMode=false is NOT supported in Agent mode', () => {
			const model = createModel('no-agent', 'No-Agent', {
				capabilities: { toolCalling: true, agentMode: false },
			});
			assert.strictEqual(isModelSupportedForMode(model, ChatModeKind.Agent), false);
		});

		test('model with no capabilities is NOT supported in Agent mode', () => {
			const model = createModel('no-caps', 'No-Caps', { capabilities: undefined });
			assert.strictEqual(isModelSupportedForMode(model, ChatModeKind.Agent), false);
		});
	});

	suite('isModelSupportedForInlineChat', () => {

		test('any model is supported when not in EditorInline location', () => {
			const model = createModel('basic', 'Basic', { capabilities: undefined });
			assert.strictEqual(isModelSupportedForInlineChat(model, ChatAgentLocation.Chat), true);
			assert.strictEqual(isModelSupportedForInlineChat(model, ChatAgentLocation.Terminal), true);
			assert.strictEqual(isModelSupportedForInlineChat(model, ChatAgentLocation.Notebook), true);
		});

		test('model with tool calling is supported in EditorInline', () => {
			const model = createModel('tools', 'Tools', {
				capabilities: { toolCalling: true },
			});
			assert.strictEqual(isModelSupportedForInlineChat(model, ChatAgentLocation.EditorInline), true);
		});

		test('model without tool calling is NOT supported in EditorInline', () => {
			const model = createModel('no-tools', 'No-Tools', {
				capabilities: { toolCalling: false },
			});
			assert.strictEqual(isModelSupportedForInlineChat(model, ChatAgentLocation.EditorInline), false);
		});

		test('model with no capabilities is NOT supported in EditorInline', () => {
			const model = createModel('no-caps', 'No-Caps', { capabilities: undefined });
			assert.strictEqual(isModelSupportedForInlineChat(model, ChatAgentLocation.EditorInline), false);
		});
	});

	suite('filterModelsForSession', () => {

		const gpt4o = createModel('gpt-4o', 'GPT-4o');
		const claude = createModel('claude', 'Claude');
		const notSelectable = createModel('hidden', 'Hidden', { isUserSelectable: false });
		const cloudModel = createSessionModel('cloud-gpt', 'Cloud GPT', 'cloud');
		const noToolsModel = createModel('no-tools', 'No-Tools', {
			capabilities: { toolCalling: false, agentMode: false },
		});

		test('returns user-selectable general models when no session type set', () => {
			const result = filterModelsForSession(
				[gpt4o, claude, notSelectable],
				undefined,
				ChatModeKind.Ask,
				ChatAgentLocation.Chat,
			);
			assert.deepStrictEqual(result.map(m => m.metadata.id), ['gpt-4o', 'claude']);
		});

		test('returns user-selectable general models for local session type', () => {
			const result = filterModelsForSession(
				[gpt4o, claude, notSelectable],
				'local',
				ChatModeKind.Ask,
				ChatAgentLocation.Chat,
			);
			assert.deepStrictEqual(result.map(m => m.metadata.id), ['gpt-4o', 'claude']);
		});

		test('excludes models targeting a specific session type when in general session', () => {
			const result = filterModelsForSession(
				[gpt4o, claude, cloudModel],
				undefined,
				ChatModeKind.Ask,
				ChatAgentLocation.Chat,
			);
			assert.deepStrictEqual(result.map(m => m.metadata.id), ['gpt-4o', 'claude']);
		});

		test('returns only session-targeted models for a specific session type', () => {
			const result = filterModelsForSession(
				[gpt4o, claude, cloudModel],
				'cloud',
				ChatModeKind.Ask,
				ChatAgentLocation.Chat,
			);
			assert.deepStrictEqual(result.map(m => m.metadata.id), ['cloud-gpt']);
		});

		test('filters out models incompatible with Agent mode in general session', () => {
			const result = filterModelsForSession(
				[gpt4o, noToolsModel],
				undefined,
				ChatModeKind.Agent,
				ChatAgentLocation.Chat,
			);
			assert.deepStrictEqual(result.map(m => m.metadata.id), ['gpt-4o']);
		});

		test.skip('filters by mode for session-targeted models', () => {
			const cloudNoTools = createSessionModel('cloud-basic', 'Cloud Basic', 'cloud', {
				capabilities: { toolCalling: false, agentMode: false },
			});
			const result = filterModelsForSession(
				[gpt4o, cloudModel, cloudNoTools],
				'cloud',
				ChatModeKind.Agent,
				ChatAgentLocation.Chat,
			);
			// Session-type filtering also checks mode and inline chat support
			assert.deepStrictEqual(result.map(m => m.metadata.id), ['cloud-gpt']);
		});

		test('excludes non-selectable models from session-targeted results', () => {
			const cloudHidden = createSessionModel('cloud-hidden', 'Cloud Hidden', 'cloud', {
				isUserSelectable: false,
			});
			const result = filterModelsForSession(
				[cloudModel, cloudHidden],
				'cloud',
				ChatModeKind.Ask,
				ChatAgentLocation.Chat,
			);
			assert.deepStrictEqual(result.map(m => m.metadata.id), ['cloud-gpt']);
		});

		test('falls back to general models when no models target the session type', () => {
			const result = filterModelsForSession(
				[gpt4o, claude],
				'cloud',
				ChatModeKind.Ask,
				ChatAgentLocation.Chat,
			);
			assert.deepStrictEqual(result.map(m => m.metadata.id), ['gpt-4o', 'claude']);
		});

		test('filters inline chat incompatible models in EditorInline', () => {
			const noToolsSelectable = createModel('no-tools-selectable', 'No-Tools-Selectable', {
				capabilities: { toolCalling: false },
			});
			const result = filterModelsForSession(
				[gpt4o, noToolsSelectable],
				undefined,
				ChatModeKind.Ask,
				ChatAgentLocation.EditorInline,
			);
			assert.deepStrictEqual(result.map(m => m.metadata.id), ['gpt-4o']);
		});
	});

	suite('hasModelsTargetingSession', () => {

		test('returns false when session type is undefined', () => {
			const models = [createModel('gpt', 'GPT')];
			assert.strictEqual(hasModelsTargetingSession(models, undefined), false);
		});

		test('returns false when no models target the session type', () => {
			const models = [createModel('gpt', 'GPT')];
			assert.strictEqual(hasModelsTargetingSession(models, 'cloud'), false);
		});

		test('returns true when a model targets the session type', () => {
			const models = [
				createModel('gpt', 'GPT'),
				createSessionModel('cloud-gpt', 'Cloud GPT', 'cloud'),
			];
			assert.strictEqual(hasModelsTargetingSession(models, 'cloud'), true);
		});

		test('returns false for different session type', () => {
			const models = [createSessionModel('cloud-gpt', 'Cloud GPT', 'cloud')];
			assert.strictEqual(hasModelsTargetingSession(models, 'enterprise'), false);
		});
	});

	suite('isModelValidForSession', () => {

		test('general model is valid when no models target the session', () => {
			const generalModel = createModel('gpt', 'GPT');
			const allModels = [generalModel];
			assert.strictEqual(isModelValidForSession(generalModel, allModels, 'cloud'), true);
		});

		test('session-targeted model is NOT valid when no models target the session type in pool', () => {
			const sessionModel = createSessionModel('cloud-gpt', 'Cloud GPT', 'cloud');
			const generalModel = createModel('gpt', 'GPT');
			assert.strictEqual(isModelValidForSession(sessionModel, [generalModel], undefined), false);
		});

		test('session-targeted model IS valid when pool has models targeting that session', () => {
			const sessionModel = createSessionModel('cloud-gpt', 'Cloud GPT', 'cloud');
			const allModels = [createModel('gpt', 'GPT'), sessionModel];
			assert.strictEqual(isModelValidForSession(sessionModel, allModels, 'cloud'), true);
		});

		test('general model is NOT valid when pool has models targeting the session', () => {
			const generalModel = createModel('gpt', 'GPT');
			const sessionModel = createSessionModel('cloud-gpt', 'Cloud GPT', 'cloud');
			const allModels = [generalModel, sessionModel];
			assert.strictEqual(isModelValidForSession(generalModel, allModels, 'cloud'), false);
		});

		test('model targeting wrong session is NOT valid', () => {
			const wrongSessionModel = createSessionModel('ent-gpt', 'Enterprise GPT', 'enterprise');
			const cloudModel = createSessionModel('cloud-gpt', 'Cloud GPT', 'cloud');
			const allModels = [wrongSessionModel, cloudModel];
			assert.strictEqual(isModelValidForSession(wrongSessionModel, allModels, 'cloud'), false);
		});

		test('general model is valid when session type is undefined', () => {
			const generalModel = createModel('gpt', 'GPT');
			assert.strictEqual(isModelValidForSession(generalModel, [generalModel], undefined), true);
		});
	});

	suite('findDefaultModel', () => {

		test('returns model marked as default for location', () => {
			const regular = createModel('gpt', 'GPT');
			const defaultModel = createDefaultModelForLocation('claude', 'Claude', ChatAgentLocation.Chat);
			const result = findDefaultModel([regular, defaultModel], ChatAgentLocation.Chat);
			assert.strictEqual(result?.metadata.id, 'claude');
		});

		test('falls back to first model when no default for location', () => {
			const modelA = createModel('gpt', 'GPT');
			const modelB = createModel('claude', 'Claude');
			const result = findDefaultModel([modelA, modelB], ChatAgentLocation.Chat);
			assert.strictEqual(result?.metadata.id, 'gpt');
		});

		test('returns undefined for empty models array', () => {
			const result = findDefaultModel([], ChatAgentLocation.Chat);
			assert.strictEqual(result, undefined);
		});

		test('returns location-specific default when multiple defaults exist', () => {
			const chatDefault = createDefaultModelForLocation('chat-default', 'Chat Default', ChatAgentLocation.Chat);
			const terminalDefault = createDefaultModelForLocation('terminal-default', 'Terminal Default', ChatAgentLocation.Terminal);
			const result = findDefaultModel([chatDefault, terminalDefault], ChatAgentLocation.Chat);
			assert.strictEqual(result?.metadata.id, 'chat-default');
		});

		test('does not pick terminal default when looking for chat default', () => {
			const terminalDefault = createDefaultModelForLocation('terminal-default', 'Terminal Default', ChatAgentLocation.Terminal);
			const regular = createModel('gpt', 'GPT');
			const result = findDefaultModel([terminalDefault, regular], ChatAgentLocation.Chat);
			// Falls back to first model since none is default for Chat
			assert.strictEqual(result?.metadata.id, 'terminal-default');
		});
	});

	suite('shouldRestorePersistedModel', () => {

		test('restores model that was explicitly chosen (not default)', () => {
			const model = createModel('gpt', 'GPT');
			const result = shouldRestorePersistedModel('copilot/gpt', false, [model], ChatAgentLocation.Chat);
			assert.strictEqual(result.shouldRestore, true);
			assert.strictEqual(result.model?.identifier, 'copilot/gpt');
		});

		test('restores model that was default and is still default', () => {
			const model = createDefaultModelForLocation('gpt', 'GPT', ChatAgentLocation.Chat);
			const result = shouldRestorePersistedModel('copilot/gpt', true, [model], ChatAgentLocation.Chat);
			assert.strictEqual(result.shouldRestore, true);
		});

		test('does NOT restore model that was default but is no longer default', () => {
			const model = createModel('gpt', 'GPT');
			const result = shouldRestorePersistedModel('copilot/gpt', true, [model], ChatAgentLocation.Chat);
			assert.strictEqual(result.shouldRestore, false);
			assert.strictEqual(result.model?.identifier, 'copilot/gpt');
		});

		test('does NOT restore model that no longer exists', () => {
			const otherModel = createModel('claude', 'Claude');
			const result = shouldRestorePersistedModel('copilot/gpt', false, [otherModel], ChatAgentLocation.Chat);
			assert.strictEqual(result.shouldRestore, false);
			assert.strictEqual(result.model, undefined);
		});

		test('handles empty models list', () => {
			const result = shouldRestorePersistedModel('copilot/gpt', false, [], ChatAgentLocation.Chat);
			assert.strictEqual(result.shouldRestore, false);
			assert.strictEqual(result.model, undefined);
		});

		test('user choice is preserved when default changes to a different model', () => {
			// User explicitly chose GPT-4o, default used to be Claude, now default is something else
			const gpt = createModel('gpt-4o', 'GPT-4o');
			const claude = createModel('claude', 'Claude');
			const result = shouldRestorePersistedModel('copilot/gpt-4o', false, [gpt, claude], ChatAgentLocation.Chat);
			assert.strictEqual(result.shouldRestore, true);
			assert.strictEqual(result.model?.metadata.id, 'gpt-4o');
		});

		test('default tracking: follows new default when user never explicitly chose', () => {
			// Old default was GPT-4o (persisted as default), now Claude is the default
			const gpt = createModel('gpt-4o', 'GPT-4o');
			const claude = createDefaultModelForLocation('claude', 'Claude', ChatAgentLocation.Chat);
			const result = shouldRestorePersistedModel('copilot/gpt-4o', true, [gpt, claude], ChatAgentLocation.Chat);
			// Should NOT restore because GPT-4o is no longer default and was stored as default
			assert.strictEqual(result.shouldRestore, false);
		});
	});

	suite('shouldResetModelToDefault', () => {

		const defaultContext = {
			location: ChatAgentLocation.Chat,
			currentModeKind: ChatModeKind.Ask,
			sessionType: undefined,
		};

		test('should reset when current model is undefined', () => {
			assert.strictEqual(shouldResetModelToDefault(undefined, [], defaultContext, []), true);
		});

		test('should reset when model is no longer available', () => {
			const model = createModel('gpt', 'GPT');
			assert.strictEqual(shouldResetModelToDefault(model, [], defaultContext, [model]), true);
		});

		test('should NOT reset when model is available and compatible', () => {
			const model = createModel('gpt', 'GPT');
			assert.strictEqual(shouldResetModelToDefault(model, [model], defaultContext, [model]), false);
		});

		test('should reset when model is not supported for current mode', () => {
			const model = createModel('no-tools', 'No-Tools', {
				capabilities: { toolCalling: false, agentMode: false },
			});
			const context = { ...defaultContext, currentModeKind: ChatModeKind.Agent };
			assert.strictEqual(shouldResetModelToDefault(model, [model], context, [model]), true);
		});

		test('should reset when model is not supported for inline chat', () => {
			const model = createModel('no-tools', 'No-Tools', {
				capabilities: { toolCalling: false },
			});
			const context = {
				...defaultContext,
				location: ChatAgentLocation.EditorInline,
			};
			assert.strictEqual(shouldResetModelToDefault(model, [model], context, [model]), true);
		});

		test('should reset when model is not valid for session', () => {
			const generalModel = createModel('gpt', 'GPT');
			const sessionModel = createSessionModel('cloud-gpt', 'Cloud GPT', 'cloud');
			const allModels = [generalModel, sessionModel];
			const context = { ...defaultContext, sessionType: 'cloud' };
			assert.strictEqual(shouldResetModelToDefault(generalModel, [generalModel], context, allModels), true);
		});

		test('should NOT reset session model in matching session', () => {
			const sessionModel = createSessionModel('cloud-gpt', 'Cloud GPT', 'cloud');
			const context = { ...defaultContext, sessionType: 'cloud' };
			assert.strictEqual(shouldResetModelToDefault(sessionModel, [sessionModel], context, [sessionModel]), false);
		});
	});

	suite('resolveModelFromSyncState', () => {

		test('keeps current model when same as state model', () => {
			const model = createModel('gpt', 'GPT');
			const result = resolveModelFromSyncState(model, model, [model], undefined);
			assert.strictEqual(result.action, 'keep');
		});

		test('applies state model when different and valid', () => {
			const current = createModel('gpt', 'GPT');
			const stateModel = createModel('claude', 'Claude');
			const result = resolveModelFromSyncState(stateModel, current, [current, stateModel], undefined);
			assert.strictEqual(result.action, 'apply');
		});

		test('uses default when state model not valid for session', () => {
			const current = createSessionModel('cloud-gpt', 'Cloud GPT', 'cloud');
			const stateModel = createModel('gpt', 'GPT'); // general model, not valid for cloud session
			const allModels = [current, stateModel];
			const result = resolveModelFromSyncState(stateModel, current, allModels, 'cloud');
			assert.strictEqual(result.action, 'default');
		});

		test('applies when current model is undefined', () => {
			const stateModel = createModel('gpt', 'GPT');
			const result = resolveModelFromSyncState(stateModel, undefined, [stateModel], undefined);
			assert.strictEqual(result.action, 'apply');
		});

		test('applies session model when valid for matching session', () => {
			const sessionModel = createSessionModel('cloud-gpt', 'Cloud GPT', 'cloud');
			const generalModel = createModel('gpt', 'GPT');
			const allModels = [generalModel, sessionModel];
			const result = resolveModelFromSyncState(sessionModel, generalModel, allModels, 'cloud');
			assert.strictEqual(result.action, 'apply');
		});

		test('returns default when state model does not support current mode', () => {
			const current = createModel('gpt', 'GPT');
			const stateModel = createModel('no-tools', 'No-Tools', {
				capabilities: { toolCalling: false, agentMode: false },
			});
			const result = resolveModelFromSyncState(stateModel, current, [current, stateModel], undefined, {
				location: ChatAgentLocation.Chat,
				currentModeKind: ChatModeKind.Agent,
				sessionType: undefined,
			});
			assert.strictEqual(result.action, 'default');
		});

		test('returns default when state model does not support inline chat', () => {
			const current = createModel('gpt', 'GPT');
			const stateModel = createModel('no-tools', 'No-Tools', {
				capabilities: { toolCalling: false },
			});
			const result = resolveModelFromSyncState(stateModel, current, [current, stateModel], undefined, {
				location: ChatAgentLocation.EditorInline,
				currentModeKind: ChatModeKind.Ask,
				sessionType: undefined,
			});
			assert.strictEqual(result.action, 'default');
		});

		test('applies when state model supports current mode with context', () => {
			const current = createModel('gpt', 'GPT');
			const stateModel = createModel('agent-model', 'Agent Model', {
				capabilities: { toolCalling: true, agentMode: true },
			});
			const result = resolveModelFromSyncState(stateModel, current, [current, stateModel], undefined, {
				location: ChatAgentLocation.Chat,
				currentModeKind: ChatModeKind.Agent,
				sessionType: undefined,
			});
			assert.strictEqual(result.action, 'apply');
		});
	});

	suite('mergeModelsWithCache', () => {

		test('uses live models when available', () => {
			const liveModel = createModel('gpt', 'GPT');
			const cachedModel = createModel('cached-gpt', 'Cached GPT');
			const result = mergeModelsWithCache([liveModel], [cachedModel], new Set(['copilot']));
			assert.strictEqual(result.length, 1);
			assert.strictEqual(result[0].metadata.id, 'gpt');
		});

		test('falls back to cached models when no live models', () => {
			const cachedModel = createModel('cached-gpt', 'Cached GPT');
			const result = mergeModelsWithCache([], [cachedModel], new Set(['copilot']));
			assert.strictEqual(result.length, 1);
			assert.strictEqual(result[0].metadata.id, 'cached-gpt');
		});

		test('merges cached models from vendors not yet resolved', () => {
			const liveModel = createModel('gpt', 'GPT');
			const cachedOtherVendor = createModel('other-model', 'Other Model', { vendor: 'other-vendor' });
			const result = mergeModelsWithCache(
				[liveModel],
				[cachedOtherVendor],
				new Set(['copilot', 'other-vendor']),
			);
			assert.strictEqual(result.length, 2);
			assert.deepStrictEqual(result.map(m => m.metadata.id).sort(), ['gpt', 'other-model']);
		});

		test('evicts cached models from vendors no longer contributed', () => {
			const liveModel = createModel('gpt', 'GPT');
			const cachedRemovedVendor = createModel('removed-model', 'Removed Model', { vendor: 'removed-vendor' });
			const result = mergeModelsWithCache(
				[liveModel],
				[cachedRemovedVendor],
				new Set(['copilot']), // removed-vendor is NOT contributed
			);
			assert.strictEqual(result.length, 1);
			assert.strictEqual(result[0].metadata.id, 'gpt');
		});

		test('does not duplicate models from same vendor', () => {
			const liveModel = createModel('gpt', 'GPT');
			const cachedSameVendor = createModel('cached-gpt', 'Cached GPT');
			const result = mergeModelsWithCache(
				[liveModel],
				[cachedSameVendor],
				new Set(['copilot']),
			);
			// Both are vendor 'copilot', live vendor takes priority
			assert.strictEqual(result.length, 1);
			assert.strictEqual(result[0].metadata.id, 'gpt');
		});

		test('handles empty cache and empty live models', () => {
			const result = mergeModelsWithCache([], [], new Set());
			assert.deepStrictEqual(result, []);
		});

		test('handles multiple vendors with partial resolution', () => {
			const liveA = createModel('a-model', 'A Model', { vendor: 'vendor-a' });
			const cachedB = createModel('b-model', 'B Model', { vendor: 'vendor-b' });
			const cachedC = createModel('c-model', 'C Model', { vendor: 'vendor-c' });
			const result = mergeModelsWithCache(
				[liveA],
				[cachedB, cachedC],
				new Set(['vendor-a', 'vendor-b']), // vendor-c not contributed
			);
			assert.strictEqual(result.length, 2);
			assert.deepStrictEqual(result.map(m => m.metadata.vendor).sort(), ['vendor-a', 'vendor-b']);
		});
	});

	suite('model switching scenarios', () => {

		test('switching from Ask to Agent mode should reset model without tool support', () => {
			const noToolsModel = createModel('no-tools', 'No-Tools', {
				capabilities: { toolCalling: false, agentMode: false },
			});
			const toolModel = createModel('tool-model', 'Tool Model');
			const allModels = [noToolsModel, toolModel];

			// In Ask mode, model is fine
			assert.strictEqual(
				shouldResetModelToDefault(noToolsModel, allModels, {
					location: ChatAgentLocation.Chat,
					currentModeKind: ChatModeKind.Ask,
					sessionType: undefined,
				}, allModels),
				false,
			);

			// After switching to Agent mode, model should be reset
			assert.strictEqual(
				shouldResetModelToDefault(noToolsModel, allModels, {
					location: ChatAgentLocation.Chat,
					currentModeKind: ChatModeKind.Agent,
					sessionType: undefined,
				}, allModels),
				true,
			);
		});

		test('switching sessions should reject model from wrong session pool', () => {
			const cloudModel = createSessionModel('cloud-gpt', 'Cloud GPT', 'cloud');
			const generalModel = createModel('gpt', 'GPT');
			const allModels = [generalModel, cloudModel];

			// Cloud model is valid in cloud session
			assert.strictEqual(
				isModelValidForSession(cloudModel, allModels, 'cloud'),
				true,
			);

			// Cloud model is NOT valid in general session (no session type)
			assert.strictEqual(
				isModelValidForSession(cloudModel, allModels, undefined),
				false,
			);

			// General model is NOT valid in cloud session (when cloud models exist)
			assert.strictEqual(
				isModelValidForSession(generalModel, allModels, 'cloud'),
				false,
			);

			// General model IS valid in general session
			assert.strictEqual(
				isModelValidForSession(generalModel, allModels, undefined),
				true,
			);
		});

		test('model removal should trigger reset', () => {
			const gpt = createModel('gpt', 'GPT');
			const claude = createModel('claude', 'Claude');

			// Initially both available, GPT is selected
			assert.strictEqual(
				shouldResetModelToDefault(gpt, [gpt, claude], {
					location: ChatAgentLocation.Chat,
					currentModeKind: ChatModeKind.Ask,
					sessionType: undefined,
				}, [gpt, claude]),
				false,
			);

			// GPT is removed from available models
			assert.strictEqual(
				shouldResetModelToDefault(gpt, [claude], {
					location: ChatAgentLocation.Chat,
					currentModeKind: ChatModeKind.Ask,
					sessionType: undefined,
				}, [claude]),
				true,
			);
		});

		test('syncing model from state respects session boundaries', () => {
			const cloudModel = createSessionModel('cloud-gpt', 'Cloud GPT', 'cloud');
			const generalModel = createModel('gpt', 'GPT');
			const allModels = [generalModel, cloudModel];

			// State has a cloud model, but we are in a general session
			const result = resolveModelFromSyncState(cloudModel, generalModel, allModels, undefined);
			assert.strictEqual(result.action, 'default');
		});

		test('syncing model from state applies model when switching to matching session', () => {
			const cloudModel = createSessionModel('cloud-gpt', 'Cloud GPT', 'cloud');
			const generalModel = createModel('gpt', 'GPT');
			const allModels = [generalModel, cloudModel];

			// State has a cloud model and we are in a cloud session
			const result = resolveModelFromSyncState(cloudModel, generalModel, allModels, 'cloud');
			assert.strictEqual(result.action, 'apply');
		});

		test('persisted model selection survives when model is still default', () => {
			const model = createDefaultModelForLocation('gpt-4o', 'GPT-4o', ChatAgentLocation.Chat);
			const result = shouldRestorePersistedModel('copilot/gpt-4o', true, [model], ChatAgentLocation.Chat);
			assert.strictEqual(result.shouldRestore, true);
		});

		test('persisted model selection does NOT restore when a new default is assigned', () => {
			// GPT-4o was the old default (persisted as default=true), but it's no longer default
			const gpt4o = createModel('gpt-4o', 'GPT-4o');
			const newDefault = createDefaultModelForLocation('claude', 'Claude', ChatAgentLocation.Chat);
			const result = shouldRestorePersistedModel('copilot/gpt-4o', true, [gpt4o, newDefault], ChatAgentLocation.Chat);
			assert.strictEqual(result.shouldRestore, false);
		});

		test('user explicit model choice persists even when default changes', () => {
			// User explicitly picked Claude (persistedAsDefault=false), default was GPT-4o
			// Now default switches to something else — Claude should still be restored
			const claude = createModel('claude', 'Claude');
			const newDefault = createDefaultModelForLocation('new-model', 'New Model', ChatAgentLocation.Chat);
			const result = shouldRestorePersistedModel('copilot/claude', false, [claude, newDefault], ChatAgentLocation.Chat);
			assert.strictEqual(result.shouldRestore, true);
			assert.strictEqual(result.model?.metadata.id, 'claude');
		});

		test('combining mode switch + session switch validates correctly', () => {
			const cloudToolModel = createSessionModel('cloud-tool', 'Cloud Tool', 'cloud', {
				capabilities: { toolCalling: true, agentMode: true },
			});
			const cloudNoToolModel = createSessionModel('cloud-basic', 'Cloud Basic', 'cloud', {
				capabilities: { toolCalling: false, agentMode: false },
			});
			const allCloudModels = [cloudToolModel, cloudNoToolModel];

			// In cloud session, Agent mode — tool model is valid
			assert.strictEqual(
				shouldResetModelToDefault(cloudToolModel, allCloudModels, {
					location: ChatAgentLocation.Chat,
					currentModeKind: ChatModeKind.Agent,
					sessionType: 'cloud',
				}, allCloudModels),
				false,
			);

			// The no-tool model should be reset in Agent mode
			// Both filterModelsForSession and shouldResetModelToDefault enforce mode support
			assert.strictEqual(
				shouldResetModelToDefault(cloudNoToolModel, allCloudModels, {
					location: ChatAgentLocation.Chat,
					currentModeKind: ChatModeKind.Agent,
					sessionType: 'cloud',
				}, allCloudModels),
				true,
			);
		});
	});

	suite('onDidChangeLanguageModels race conditions', () => {

		test('model temporarily removed then re-added loses user choice', () => {
			const gpt = createModel('gpt', 'GPT');
			const claude = createModel('claude', 'Claude');

			// Step 1: User has GPT selected, both models available
			assert.strictEqual(shouldResetOnModelListChange('copilot/gpt', [gpt, claude]), false);

			// Step 2: Extension reloads, GPT temporarily disappears from model list
			assert.strictEqual(shouldResetOnModelListChange('copilot/gpt', [claude]), true);
			// → ChatInputPart resets to default (Claude)

			// Step 3: GPT comes back — but the handler just checks if current is still valid.
			// By now the current is Claude (from step 2), so it stays.
			assert.strictEqual(shouldResetOnModelListChange('copilot/claude', [gpt, claude]), false);
			// → User's original GPT choice is lost! This is the "random switch" bug pattern.
		});

		test('model stays when model list refreshes with it still present', () => {
			const gpt = createModel('gpt', 'GPT');
			const claude = createModel('claude', 'Claude');

			// Model list refreshes but GPT is still there
			assert.strictEqual(shouldResetOnModelListChange('copilot/gpt', [gpt, claude]), false);
		});

		test('reset when current model identifier is undefined', () => {
			const gpt = createModel('gpt', 'GPT');
			assert.strictEqual(shouldResetOnModelListChange(undefined, [gpt]), true);
		});

		test('reset when models list is empty', () => {
			assert.strictEqual(shouldResetOnModelListChange('copilot/gpt', []), true);
		});

		test('cache bridges the gap when live models temporarily unavailable', () => {
			const cachedGpt = createModel('gpt', 'GPT');
			const cachedClaude = createModel('claude', 'Claude');

			// Step 1: Extension unloaded, no live models. Cache fills the gap.
			const merged = mergeModelsWithCache([], [cachedGpt, cachedClaude], new Set(['copilot']));
			assert.strictEqual(merged.length, 2);

			// Selected model is still found in the cached list
			assert.strictEqual(shouldResetOnModelListChange('copilot/gpt', merged), false);
		});

		test('cache kept even for uncontributed vendors when no live models exist', () => {
			const cachedGpt = createModel('gpt', 'GPT');

			// When liveModels is empty, mergeModelsWithCache returns ALL cached
			// because it can't distinguish "startup not ready" from "vendor removed"
			const merged = mergeModelsWithCache([], [cachedGpt], new Set());
			assert.strictEqual(merged.length, 1);
			assert.strictEqual(shouldResetOnModelListChange('copilot/gpt', merged), false);
		});

		test('cache evicted for uncontributed vendor once live models arrive', () => {
			const cachedGpt = createModel('gpt', 'GPT');
			const liveOther = createModel('other', 'Other', { vendor: 'other-vendor' });

			// Once live models exist, the vendor filter kicks in
			const merged = mergeModelsWithCache([liveOther], [cachedGpt], new Set(['other-vendor']));
			assert.strictEqual(merged.length, 1);
			assert.strictEqual(merged[0].metadata.id, 'other');
			assert.strictEqual(shouldResetOnModelListChange('copilot/gpt', merged), true);
		});
	});

	suite('late-arriving model restoration', () => {

		test('restores explicitly-chosen model that arrives late', () => {
			const model = createModel('gpt', 'GPT');
			assert.strictEqual(
				shouldRestoreLateArrivingModel('copilot/gpt', false, model, ChatAgentLocation.Chat),
				true,
			);
		});

		test('restores model that was default and is still default for location', () => {
			const model = createDefaultModelForLocation('gpt', 'GPT', ChatAgentLocation.Chat);
			assert.strictEqual(
				shouldRestoreLateArrivingModel('copilot/gpt', true, model, ChatAgentLocation.Chat),
				true,
			);
		});

		test('does NOT restore model that was default but is no longer default', () => {
			const model = createModel('gpt', 'GPT'); // not default for any location
			assert.strictEqual(
				shouldRestoreLateArrivingModel('copilot/gpt', true, model, ChatAgentLocation.Chat),
				false,
			);
		});

		test('does NOT restore model that is not user-selectable', () => {
			const model = createModel('internal', 'Internal', { isUserSelectable: false });
			assert.strictEqual(
				shouldRestoreLateArrivingModel('copilot/internal', false, model, ChatAgentLocation.Chat),
				false,
			);
		});

		test('does NOT restore model with isUserSelectable=undefined (treated as falsy)', () => {
			const model = createModel('undef-sel', 'Undef-Sel', { isUserSelectable: undefined });
			assert.strictEqual(
				shouldRestoreLateArrivingModel('copilot/undef-sel', false, model, ChatAgentLocation.Chat),
				false,
			);
		});

		test('restores model arriving late at a different location where it is default', () => {
			const model = createDefaultModelForLocation('gpt', 'GPT', ChatAgentLocation.Terminal);
			// User is in Terminal — model is default there
			assert.strictEqual(
				shouldRestoreLateArrivingModel('copilot/gpt', true, model, ChatAgentLocation.Terminal),
				true,
			);
			// But not in Chat
			assert.strictEqual(
				shouldRestoreLateArrivingModel('copilot/gpt', true, model, ChatAgentLocation.Chat),
				false,
			);
		});
	});

	suite('full startup pipeline (computeAvailableModels)', () => {

		test('startup with only cached models returns filtered cache', () => {
			const cached = createModel('gpt', 'GPT');
			const result = computeAvailableModels(
				[], // no live models yet
				[cached],
				new Set(['copilot']),
				undefined,
				ChatModeKind.Ask,
				ChatAgentLocation.Chat,
			);
			assert.deepStrictEqual(result.map(m => m.metadata.id), ['gpt']);
		});

		test('startup with cached models from removed vendor still returns them (no live to compare)', () => {
			const cached = createModel('gpt', 'GPT');
			// When liveModels is empty, mergeModelsWithCache returns ALL cached
			// because it cannot tell startup-delay from vendor removal
			const result = computeAvailableModels(
				[], // no live models
				[cached],
				new Set(), // vendor no longer contributed
				undefined,
				ChatModeKind.Ask,
				ChatAgentLocation.Chat,
			);
			assert.deepStrictEqual(result.map(m => m.metadata.id), ['gpt']);
		});

		test('live models supersede cached models from same vendor', () => {
			const live = createModel('gpt-new', 'GPT New');
			const cached = createModel('gpt-old', 'GPT Old');
			const result = computeAvailableModels(
				[live],
				[cached],
				new Set(['copilot']),
				undefined,
				ChatModeKind.Ask,
				ChatAgentLocation.Chat,
			);
			assert.deepStrictEqual(result.map(m => m.metadata.id), ['gpt-new']);
		});

		test('partial vendor resolution keeps unresolved vendors from cache', () => {
			const liveA = createModel('a-model', 'A Model', { vendor: 'vendor-a' });
			const cachedB = createModel('b-model', 'B Model', { vendor: 'vendor-b' });
			const result = computeAvailableModels(
				[liveA],
				[cachedB],
				new Set(['vendor-a', 'vendor-b']),
				undefined,
				ChatModeKind.Ask,
				ChatAgentLocation.Chat,
			);
			assert.deepStrictEqual(result.map(m => m.metadata.id).sort(), ['a-model', 'b-model']);
		});

		test('results are sorted alphabetically by name', () => {
			const modelC = createModel('c', 'Charlie');
			const modelA = createModel('a', 'Alpha');
			const modelB = createModel('b', 'Bravo');
			const result = computeAvailableModels(
				[modelC, modelA, modelB],
				[],
				new Set(['copilot']),
				undefined,
				ChatModeKind.Ask,
				ChatAgentLocation.Chat,
			);
			assert.deepStrictEqual(result.map(m => m.metadata.name), ['Alpha', 'Bravo', 'Charlie']);
		});

		test('session-targeted models excluded from general session startup', () => {
			const general = createModel('gpt', 'GPT');
			const cloudOnly = createSessionModel('cloud', 'Cloud', 'cloud');
			const result = computeAvailableModels(
				[general, cloudOnly],
				[],
				new Set(['copilot']),
				undefined,
				ChatModeKind.Ask,
				ChatAgentLocation.Chat,
			);
			assert.deepStrictEqual(result.map(m => m.metadata.id), ['gpt']);
		});

		test('only session-targeted models returned for cloud session startup', () => {
			const general = createModel('gpt', 'GPT');
			const cloudOnly = createSessionModel('cloud', 'Cloud', 'cloud');
			const result = computeAvailableModels(
				[general, cloudOnly],
				[],
				new Set(['copilot']),
				'cloud',
				ChatModeKind.Ask,
				ChatAgentLocation.Chat,
			);
			assert.deepStrictEqual(result.map(m => m.metadata.id), ['cloud']);
		});

		test('agent mode filters non-tool models during startup', () => {
			const toolModel = createModel('tool', 'Tool Model');
			const noToolModel = createModel('no-tool', 'No Tool', {
				capabilities: { toolCalling: false, agentMode: false },
			});
			const result = computeAvailableModels(
				[toolModel, noToolModel],
				[],
				new Set(['copilot']),
				undefined,
				ChatModeKind.Agent,
				ChatAgentLocation.Chat,
			);
			assert.deepStrictEqual(result.map(m => m.metadata.id), ['tool']);
		});
	});

	suite('_syncFromModel edge cases', () => {

		test('sync state with undefined selectedModel keeps current', () => {
			const current = createModel('gpt', 'GPT');
			// When state has no selectedModel, _syncFromModel skips the model sync
			// (the code checks `if (state?.selectedModel)`)
			// This means the current model stays — test that resolveModelFromSyncState
			// correctly identifies "keep" for same model
			const result = resolveModelFromSyncState(current, current, [current], undefined);
			assert.strictEqual(result.action, 'keep');
		});

		test('sync state model from different session does not apply', () => {
			// Scenario: User is in session A with cloud model, switches to session B (general)
			// Session B's state still has the cloud model reference
			const cloudModel = createSessionModel('cloud-gpt', 'Cloud GPT', 'cloud');
			const generalModel = createModel('gpt', 'GPT');
			const allModels = [generalModel, cloudModel];

			const result = resolveModelFromSyncState(cloudModel, generalModel, allModels, undefined);
			assert.strictEqual(result.action, 'default');
		});

		test('sync state with model matching different session type falls back to default', () => {
			const enterpriseModel = createSessionModel('ent-gpt', 'Enterprise GPT', 'enterprise');
			const cloudModel = createSessionModel('cloud-gpt', 'Cloud GPT', 'cloud');
			const allModels = [cloudModel, enterpriseModel];

			// State has enterprise model, but we're in cloud session
			const result = resolveModelFromSyncState(enterpriseModel, cloudModel, allModels, 'cloud');
			assert.strictEqual(result.action, 'default');
		});

		test('sync identical model reference returns keep', () => {
			const model = createModel('gpt', 'GPT');
			// Same object reference
			const result = resolveModelFromSyncState(model, model, [model], undefined);
			assert.strictEqual(result.action, 'keep');
		});

		test('sync same identifier but different object returns keep', () => {
			const model1 = createModel('gpt', 'GPT');
			const model2 = createModel('gpt', 'GPT');
			// Different objects, same identifier
			const result = resolveModelFromSyncState(model1, model2, [model1, model2], undefined);
			assert.strictEqual(result.action, 'keep');
		});
	});

	suite('checkModelSupported interaction patterns', () => {

		const askContext = {
			location: ChatAgentLocation.Chat,
			currentModeKind: ChatModeKind.Ask,
			sessionType: undefined,
		};

		const agentContext = {
			...askContext,
			currentModeKind: ChatModeKind.Agent,
		};

		test('initSelectedModel → checkModelSupported: restored model passes Agent check', () => {
			const agentModel = createModel('agent-model', 'Agent Model', {
				capabilities: { toolCalling: true, agentMode: true },
			});

			// 1. shouldRestorePersistedModel says "restore"
			const restoreResult = shouldRestorePersistedModel('copilot/agent-model', false, [agentModel], ChatAgentLocation.Chat);
			assert.strictEqual(restoreResult.shouldRestore, true);

			// 2. Immediately after, checkModelSupported runs with Agent mode
			assert.strictEqual(shouldResetModelToDefault(agentModel, [agentModel], agentContext, [agentModel]), false);
		});

		test('initSelectedModel → checkModelSupported: restored model FAILS Agent check', () => {
			const askOnlyModel = createModel('ask-only', 'Ask Only', {
				capabilities: { toolCalling: false, agentMode: false },
			});
			const agentModel = createModel('agent-model', 'Agent Model');

			// 1. shouldRestorePersistedModel says "restore"
			const restoreResult = shouldRestorePersistedModel('copilot/ask-only', false, [askOnlyModel, agentModel], ChatAgentLocation.Chat);
			assert.strictEqual(restoreResult.shouldRestore, true);

			// 2. checkModelSupported runs with Agent mode → should reset
			assert.strictEqual(shouldResetModelToDefault(askOnlyModel, [askOnlyModel, agentModel], agentContext, [askOnlyModel, agentModel]), true);

			// 3. findDefaultModel picks replacement from models filtered for Agent mode
			const agentCompatibleModels = filterModelsForSession(
				[askOnlyModel, agentModel], undefined, ChatModeKind.Agent, ChatAgentLocation.Chat
			);
			const defaultModel = findDefaultModel(agentCompatibleModels, ChatAgentLocation.Chat);
			assert.strictEqual(defaultModel?.metadata.id, 'agent-model');
		});

		test('mode switch triggers checkModelSupported which resets incompatible model', () => {
			const noToolModel = createModel('no-tool', 'No Tool', {
				capabilities: { toolCalling: false },
			});
			const toolModel = createModel('tool', 'Tool');

			// In Ask mode: fine
			assert.strictEqual(shouldResetModelToDefault(noToolModel, [noToolModel, toolModel], askContext, [noToolModel, toolModel]), false);

			// Switch to Agent mode: not fine
			assert.strictEqual(shouldResetModelToDefault(noToolModel, [noToolModel, toolModel], agentContext, [noToolModel, toolModel]), true);
		});

		test('double reset is idempotent', () => {
			const defaultModel = createDefaultModelForLocation('default', 'Default', ChatAgentLocation.Chat);
			const otherModel = createModel('other', 'Other');
			const allModels = [defaultModel, otherModel];

			// First reset: picks default
			const result1 = findDefaultModel(allModels, ChatAgentLocation.Chat);
			assert.strictEqual(result1?.metadata.id, 'default');

			// "Second reset" — same call, same result
			const result2 = findDefaultModel(allModels, ChatAgentLocation.Chat);
			assert.strictEqual(result2?.metadata.id, 'default');

			// Default model continues to pass validation
			assert.strictEqual(shouldResetModelToDefault(result1!, allModels, askContext, allModels), false);
		});
	});

	suite('multiple session types and cross-contamination', () => {

		test('model from session A rejected in session B', () => {
			const cloudModel = createSessionModel('cloud-gpt', 'Cloud GPT', 'cloud');
			const enterpriseModel = createSessionModel('ent-gpt', 'Enterprise GPT', 'enterprise');
			const generalModel = createModel('gpt', 'GPT');
			const allModels = [generalModel, cloudModel, enterpriseModel];

			// Cloud model not valid in enterprise session
			assert.strictEqual(isModelValidForSession(cloudModel, allModels, 'enterprise'), false);
			// Enterprise model not valid in cloud session
			assert.strictEqual(isModelValidForSession(enterpriseModel, allModels, 'cloud'), false);
			// General model not valid when session-targeted models exist
			assert.strictEqual(isModelValidForSession(generalModel, allModels, 'cloud'), false);
		});

		test('general model is valid when session type has no targeted models', () => {
			const cloudModel = createSessionModel('cloud-gpt', 'Cloud GPT', 'cloud');
			const generalModel = createModel('gpt', 'GPT');
			const allModels = [generalModel, cloudModel];

			// 'enterprise' session has no targeted models
			assert.strictEqual(isModelValidForSession(generalModel, allModels, 'enterprise'), true);
		});

		test('filterModelsForSession isolates session types correctly', () => {
			const general = createModel('gpt', 'GPT');
			const cloud = createSessionModel('cloud-gpt', 'Cloud GPT', 'cloud');
			const enterprise = createSessionModel('ent-gpt', 'Enterprise GPT', 'enterprise');
			const allModels = [general, cloud, enterprise];

			const cloudFiltered = filterModelsForSession(allModels, 'cloud', ChatModeKind.Ask, ChatAgentLocation.Chat);
			assert.deepStrictEqual(cloudFiltered.map(m => m.metadata.id), ['cloud-gpt']);

			const entFiltered = filterModelsForSession(allModels, 'enterprise', ChatModeKind.Ask, ChatAgentLocation.Chat);
			assert.deepStrictEqual(entFiltered.map(m => m.metadata.id), ['ent-gpt']);

			const generalFiltered = filterModelsForSession(allModels, undefined, ChatModeKind.Ask, ChatAgentLocation.Chat);
			assert.deepStrictEqual(generalFiltered.map(m => m.metadata.id), ['gpt']);
		});

		test('switching from cloud to general session resets cloud model', () => {
			const cloudModel = createSessionModel('cloud-gpt', 'Cloud GPT', 'cloud');
			const generalModel = createModel('gpt', 'GPT');
			const allModels = [generalModel, cloudModel];

			// In cloud session, cloud model is valid
			assert.strictEqual(shouldResetModelToDefault(cloudModel, [cloudModel], {
				location: ChatAgentLocation.Chat,
				currentModeKind: ChatModeKind.Ask,
				sessionType: 'cloud',
			}, allModels), false);

			// Switch to general session — cloud model should be reset
			assert.strictEqual(shouldResetModelToDefault(cloudModel, [generalModel], {
				location: ChatAgentLocation.Chat,
				currentModeKind: ChatModeKind.Ask,
				sessionType: undefined,
			}, allModels), true);
		});
	});

	suite('mode with forced model (mode.model property)', () => {

		test('mode forces model — simulating switchModelByQualifiedName success', () => {
			const gpt = createModel('gpt-4o', 'GPT-4o');
			const claude = createModel('claude', 'Claude');
			const allModels = [gpt, claude];

			// The autorun calls switchModelByQualifiedName which checks ILanguageModelChatMetadata.matchesQualifiedName
			// Simulate: mode wants "GPT-4o (copilot)"
			const qualifiedName = 'GPT-4o (copilot)';
			const match = allModels.find(m => ILanguageModelChatMetadata.matchesQualifiedName(qualifiedName, m.metadata));
			assert.strictEqual(match?.metadata.id, 'gpt-4o');
		});

		test('mode forces model — copilot vendor shorthand works', () => {
			const gpt = createModel('gpt-4o', 'GPT-4o');
			// For copilot vendor, just the name works
			const match = [gpt].find(m => ILanguageModelChatMetadata.matchesQualifiedName('GPT-4o', m.metadata));
			assert.strictEqual(match?.metadata.id, 'gpt-4o');
		});

		test('mode forces model — nonexistent model gracefully misses', () => {
			const gpt = createModel('gpt-4o', 'GPT-4o');
			const match = [gpt].find(m => ILanguageModelChatMetadata.matchesQualifiedName('NonExistent (copilot)', m.metadata));
			assert.strictEqual(match, undefined);
		});

		test('mode forces model that is then checked for support', () => {
			// Mode forces a model, then checkModelSupported runs
			const forcedModel = createModel('forced', 'Forced', {
				capabilities: { toolCalling: false, agentMode: false },
			});

			// Mode forced this model but we're in Agent mode — should be reset
			assert.strictEqual(shouldResetModelToDefault(forcedModel, [forcedModel], {
				location: ChatAgentLocation.Chat,
				currentModeKind: ChatModeKind.Agent,
				sessionType: undefined,
			}, [forcedModel]), true);
		});
	});

	suite('EditorInline + mode combined scenarios', () => {

		test('EditorInline + Agent requires both agentMode and toolCalling', () => {
			const partialModel = createModel('partial', 'Partial', {
				capabilities: { toolCalling: true, agentMode: false },
			});
			// Fails Agent mode check
			assert.strictEqual(isModelSupportedForMode(partialModel, ChatModeKind.Agent), false);
			// Passes inline chat check (has toolCalling)
			assert.strictEqual(isModelSupportedForInlineChat(partialModel, ChatAgentLocation.EditorInline), true);

			// Combined: should reset because Agent mode fails
			assert.strictEqual(shouldResetModelToDefault(partialModel, [partialModel], {
				location: ChatAgentLocation.EditorInline,
				currentModeKind: ChatModeKind.Agent,
				sessionType: undefined,
			}, [partialModel]), true);
		});

		test('EditorInline + Ask only requires toolCalling', () => {
			const toolModel = createModel('tool', 'Tool');
			assert.strictEqual(shouldResetModelToDefault(toolModel, [toolModel], {
				location: ChatAgentLocation.EditorInline,
				currentModeKind: ChatModeKind.Ask,
				sessionType: undefined,
			}, [toolModel]), false);
		});

		test('EditorInline + Ask rejects model without toolCalling', () => {
			const noToolModel = createModel('no-tool', 'No Tool', {
				capabilities: {},
			});
			assert.strictEqual(shouldResetModelToDefault(noToolModel, [noToolModel], {
				location: ChatAgentLocation.EditorInline,
				currentModeKind: ChatModeKind.Ask,
				sessionType: undefined,
			}, [noToolModel]), true);
		});
	});

	suite('findDefaultModel edge cases', () => {

		test('when all models are session-targeted and none is default, first model wins', () => {
			const m1 = createSessionModel('s1', 'Session 1', 'cloud');
			const m2 = createSessionModel('s2', 'Session 2', 'cloud');
			const result = findDefaultModel([m1, m2], ChatAgentLocation.Chat);
			assert.strictEqual(result?.metadata.id, 's1');
		});

		test('default for one location does not leak to another', () => {
			const chatDefault = createDefaultModelForLocation('chat-def', 'Chat Default', ChatAgentLocation.Chat);
			const noDefault = createModel('no-def', 'No Default');

			// For Chat: chatDefault wins
			assert.strictEqual(findDefaultModel([noDefault, chatDefault], ChatAgentLocation.Chat)?.metadata.id, 'chat-def');
			// For Terminal: no model is default, so first model wins
			assert.strictEqual(findDefaultModel([noDefault, chatDefault], ChatAgentLocation.Terminal)?.metadata.id, 'no-def');
		});
	});

	suite('realistic multi-step race simulations', () => {

		test('startup: cached model → live models arrive → user choice preserved', () => {
			const cachedGpt = createModel('gpt', 'GPT');
			const cachedClaude = createModel('claude', 'Claude');

			// Step 1: Startup with only cache. User had GPT selected.
			const cachedModels = computeAvailableModels(
				[],
				[cachedGpt, cachedClaude],
				new Set(['copilot']),
				undefined,
				ChatModeKind.Ask,
				ChatAgentLocation.Chat,
			);
			// GPT is in the cached list
			assert.strictEqual(shouldResetOnModelListChange('copilot/gpt', cachedModels), false);

			// Step 2: Live models arrive (same models)
			const liveModels = computeAvailableModels(
				[cachedGpt, cachedClaude],
				[cachedGpt, cachedClaude],
				new Set(['copilot']),
				undefined,
				ChatModeKind.Ask,
				ChatAgentLocation.Chat,
			);
			// GPT still in the list — no reset needed
			assert.strictEqual(shouldResetOnModelListChange('copilot/gpt', liveModels), false);
		});

		test('startup: no cache → models arrive late → persisted choice restored', () => {
			// Step 1: No models available at all
			const emptyModels = computeAvailableModels([], [], new Set(['copilot']), undefined, ChatModeKind.Ask, ChatAgentLocation.Chat);
			assert.strictEqual(emptyModels.length, 0);

			// initSelectedModel: model not found, enters _waitForPersistedLanguageModel path
			const restoreResult = shouldRestorePersistedModel('copilot/gpt', false, emptyModels, ChatAgentLocation.Chat);
			assert.strictEqual(restoreResult.shouldRestore, false);
			assert.strictEqual(restoreResult.model, undefined);

			// Step 2: Models arrive via onDidChangeLanguageModels
			const arrivedModel = createModel('gpt', 'GPT');
			assert.strictEqual(
				shouldRestoreLateArrivingModel('copilot/gpt', false, arrivedModel, ChatAgentLocation.Chat),
				true,
			);
		});

		test('extension reload: selected model flickers out then back', () => {
			const gpt = createModel('gpt', 'GPT');
			const claude = createModel('claude', 'Claude');

			// Step 1: GPT is selected
			assert.strictEqual(shouldResetOnModelListChange('copilot/gpt', [gpt, claude]), false);

			// Step 2: Extension reloads, copilot vendor has no live models
			// But cache bridges the gap
			const duringReload = mergeModelsWithCache([], [gpt, claude], new Set(['copilot']));
			assert.strictEqual(shouldResetOnModelListChange('copilot/gpt', duringReload), false);

			// Step 3: Extension finishes loading, live models back
			const afterReload = mergeModelsWithCache([gpt, claude], [gpt, claude], new Set(['copilot']));
			assert.strictEqual(shouldResetOnModelListChange('copilot/gpt', afterReload), false);
		});

		test('extension reload without cache: model lost', () => {
			const gpt = createModel('gpt', 'GPT');

			// Step 1: GPT selected, no cache
			// Step 2: Extension reloads with no models and no cache
			const duringReload = mergeModelsWithCache([], [], new Set(['copilot']));
			assert.strictEqual(duringReload.length, 0);
			assert.strictEqual(shouldResetOnModelListChange('copilot/gpt', duringReload), true);
			// → Model is lost, reset to default

			// Step 3: Models come back but user's choice is already gone
			const afterReload = mergeModelsWithCache([gpt], [], new Set(['copilot']));
			assert.strictEqual(afterReload.length, 1);
			// User's selection was already reset to something else
			// This is expected behavior — cache is the mitigation
		});

		test('session switch race: mode + session change together', () => {
			const generalDefault = createDefaultModelForLocation('gpt', 'GPT', ChatAgentLocation.Chat);
			const cloudModel = createSessionModel('cloud-gpt', 'Cloud GPT', 'cloud', {
				capabilities: { toolCalling: true, agentMode: true },
			});
			const allModels = [generalDefault, cloudModel];

			// User is in general session with GPT in Agent mode
			assert.strictEqual(shouldResetModelToDefault(generalDefault, [generalDefault], {
				location: ChatAgentLocation.Chat,
				currentModeKind: ChatModeKind.Agent,
				sessionType: undefined,
			}, allModels), false);

			// Switch to cloud session — general model should be reset
			assert.strictEqual(shouldResetModelToDefault(generalDefault, [cloudModel], {
				location: ChatAgentLocation.Chat,
				currentModeKind: ChatModeKind.Agent,
				sessionType: 'cloud',
			}, allModels), true);

			// The default for cloud session should be the cloud model
			const cloudDefault = findDefaultModel([cloudModel], ChatAgentLocation.Chat);
			assert.strictEqual(cloudDefault?.metadata.id, 'cloud-gpt');
		});

		test('rapid mode changes: ask → agent → ask preserves compatible model', () => {
			const model = createModel('gpt', 'GPT'); // Compatible with all modes
			const allModels = [model];

			// Ask mode: fine
			assert.strictEqual(shouldResetModelToDefault(model, allModels, {
				location: ChatAgentLocation.Chat, currentModeKind: ChatModeKind.Ask,
				sessionType: undefined,
			}, allModels), false);

			// → Agent mode: model has toolCalling, still fine
			assert.strictEqual(shouldResetModelToDefault(model, allModels, {
				location: ChatAgentLocation.Chat, currentModeKind: ChatModeKind.Agent,
				sessionType: undefined,
			}, allModels), false);

			// → Back to Ask: still fine
			assert.strictEqual(shouldResetModelToDefault(model, allModels, {
				location: ChatAgentLocation.Chat, currentModeKind: ChatModeKind.Ask,
				sessionType: undefined,
			}, allModels), false);
		});

		test('rapid mode changes: ask → agent resets incompatible, then agent → ask does not restore', () => {
			const noToolModel = createModel('no-tool', 'No Tool', {
				capabilities: { toolCalling: false },
			});
			const toolModel = createDefaultModelForLocation('tool', 'Tool', ChatAgentLocation.Chat);
			const allModels = [noToolModel, toolModel];

			// Ask mode with noToolModel: fine
			assert.strictEqual(shouldResetModelToDefault(noToolModel, allModels, {
				location: ChatAgentLocation.Chat, currentModeKind: ChatModeKind.Ask,
				sessionType: undefined,
			}, allModels), false);

			// → Agent mode: noToolModel fails, reset picks default (toolModel)
			assert.strictEqual(shouldResetModelToDefault(noToolModel, allModels, {
				location: ChatAgentLocation.Chat, currentModeKind: ChatModeKind.Agent,
				sessionType: undefined,
			}, allModels), true);
			const defaultAfterReset = findDefaultModel(allModels, ChatAgentLocation.Chat);
			assert.strictEqual(defaultAfterReset?.metadata.id, 'tool');

			// → Back to Ask: toolModel is fine in Ask mode, stays as toolModel
			// The original noToolModel is NOT restored — this is expected and matches ChatInputPart behavior
			assert.strictEqual(shouldResetModelToDefault(toolModel, allModels, {
				location: ChatAgentLocation.Chat, currentModeKind: ChatModeKind.Ask,
				sessionType: undefined,
			}, allModels), false);
		});
	});
});
