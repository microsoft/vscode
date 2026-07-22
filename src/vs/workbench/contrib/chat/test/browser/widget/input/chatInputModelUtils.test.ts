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
	findBestMatchingModel,
	findDefaultModel,
	findReplacementForProvisionalModel,
	getAgentHostByokManageModelsIdentifier,
	hasModelsTargetingSession,
	isModelHiddenInPicker,
	isModelSupportedForInlineChat,
	isModelSupportedForMode,
	isModelValidForSession,
	mergeModelsWithCache,
	resolveModelFromSyncState,
	shouldDropAgnosticDraftModel,
	shouldResetModelToDefault,
	shouldResetOnModelListChange,
	shouldRestorePerTypeModelOnSessionSwitch,
	shouldWaitForSessionModel,
} from '../../../../browser/widget/input/chatInputModelUtils.js';

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
	resolvedVendors?: ReadonlySet<string>,
): ILanguageModelChatMetadataAndIdentifier[] {
	const merged = mergeModelsWithCache(liveModels, cachedModels, contributedVendors, resolvedVendors);
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

/**
 * Creates a model served by a specific (typically BYOK) vendor, with the identifier prefixed by that vendor
 * (e.g. `ollama/deepseek`). Mirrors how the language model registry qualifies non-Copilot models.
 */
function createVendorModel(
	vendor: string,
	id: string,
	name: string,
	overrides?: Partial<ILanguageModelChatMetadata>,
): ILanguageModelChatMetadataAndIdentifier {
	const model = createModel(id, name, { vendor, family: vendor, isBYOK: true, ...overrides });
	return { identifier: `${vendor}/${id}`, metadata: model.metadata };
}

suite('ChatInputModelUtils', () => {

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

	suite('findBestMatchingModel', () => {

		test('returns undefined when previous is undefined', () => {
			const pool = [createSessionModel('claude-sonnet-4.6', 'Claude Sonnet 4.6', 'agent-host-copilotcli')];
			assert.strictEqual(findBestMatchingModel(undefined, pool), undefined);
		});

		test('returns undefined for empty pool', () => {
			const prev = createModel('claude-sonnet-4.6', 'Claude Sonnet 4.6');
			assert.strictEqual(findBestMatchingModel(prev, []), undefined);
		});

		test('matches across vendors by raw model id (the issue #319583 case)', () => {
			// Previous selection from the in-extension copilotcli participant,
			// switching to the agent-host pool where the same model exists with
			// a different identifier/vendor.
			const prev = createModel('claude-sonnet-4.6', 'Claude Sonnet 4.6', { vendor: 'copilotcli', family: 'claude-sonnet-4.6' });
			const target = createSessionModel('claude-sonnet-4.6', 'Claude Sonnet 4.6', 'agent-host-copilotcli', { family: 'claude-sonnet-4.6' });
			const other = createSessionModel('gpt-5', 'GPT-5', 'agent-host-copilotcli', { family: 'gpt-5' });
			assert.strictEqual(findBestMatchingModel(prev, [other, target])?.identifier, target.identifier);
		});

		test('matches by id even when family differs', () => {
			const prev = createModel('claude-sonnet-4.6', 'Claude Sonnet 4.6', { family: 'claude' });
			const target = createSessionModel('claude-sonnet-4.6', 'Other Name', 'agent-host-copilotcli', { family: 'other' });
			assert.strictEqual(findBestMatchingModel(prev, [target])?.identifier, target.identifier);
		});

		test('prefers id over family when both could match different pool entries', () => {
			// Family is shared across distinct models (e.g. all Claude variants share `claude`),
			// so the id match must win over the family match.
			const prev = createModel('claude-sonnet-4.6', 'Claude Sonnet 4.6', { family: 'claude' });
			const familyMatch = createSessionModel('claude-opus-4.7', 'Claude Opus 4.7', 'agent-host-copilotcli', { family: 'claude' });
			const idMatch = createSessionModel('claude-sonnet-4.6', 'Claude Sonnet 4.6', 'agent-host-copilotcli', { family: 'claude-sonnet' });
			assert.strictEqual(findBestMatchingModel(prev, [familyMatch, idMatch])?.identifier, idMatch.identifier);
		});

		test('falls back to name when neither id nor family match', () => {
			const prev = createModel('a', 'Claude Sonnet 4.6', { family: 'fa' });
			const target = createSessionModel('b', 'Claude Sonnet 4.6', 'agent-host-copilotcli', { family: 'fb' });
			assert.strictEqual(findBestMatchingModel(prev, [target])?.identifier, target.identifier);
		});

		test('returns undefined when nothing matches', () => {
			const prev = createModel('gpt-5', 'GPT-5', { family: 'gpt-5' });
			const pool = [createSessionModel('claude', 'Claude', 'agent-host-copilotcli', { family: 'claude' })];
			assert.strictEqual(findBestMatchingModel(prev, pool), undefined);
		});

		test('match is case-insensitive', () => {
			const prev = createModel('Claude-Sonnet-4.6', 'CLAUDE SONNET 4.6', { family: 'CLAUDE-SONNET-4.6' });
			const target = createSessionModel('claude-sonnet-4.6', 'claude sonnet 4.6', 'agent-host-copilotcli', { family: 'claude-sonnet-4.6' });
			assert.strictEqual(findBestMatchingModel(prev, [target])?.identifier, target.identifier);
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

		test('replaces only the current provisional model when a location default arrives', () => {
			const provisional = createModel('byok', 'BYOK');
			const defaultModel = createDefaultModelForLocation('auto', 'Auto', ChatAgentLocation.Chat);
			assert.deepStrictEqual([
				findReplacementForProvisionalModel(provisional.identifier, provisional.identifier, [provisional], ChatAgentLocation.Chat)?.identifier,
				findReplacementForProvisionalModel(provisional.identifier, provisional.identifier, [provisional, defaultModel], ChatAgentLocation.Chat)?.identifier,
				findReplacementForProvisionalModel(defaultModel.identifier, provisional.identifier, [provisional, defaultModel], ChatAgentLocation.Chat)?.identifier,
			], [undefined, defaultModel.identifier, undefined]);
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

		test('returns default when current and state share an identifier but neither belongs to the new session pool', () => {
			// Regression for #319583: switching from a general pool (`local`) to a
			// session-targeted pool (`agent-host-copilotcli`) while the picker
			// still holds a general model. The general model's identifier matches
			// both `currentModel` and the persisted `stateModel`, but it is not
			// valid for the new pool — the resolver must fall through to
			// `'default'` rather than short-circuit to `'keep'`.
			const generalModel = createModel('claude', 'Claude');
			const sessionModel = createSessionModel('claude', 'Claude', 'agent-host-copilotcli');
			const allModels = [generalModel, sessionModel];
			const result = resolveModelFromSyncState(generalModel, generalModel, allModels, 'agent-host-copilotcli');
			assert.strictEqual(result.action, 'default');
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

		test('evicts cached entries for a resolved vendor that returned zero models (BYOK delete)', () => {
			// vendor-a is resolved with one live model; vendor-b is resolved with no live models
			// (e.g. the user removed their BYOK API key). Cached vendor-b entries must NOT
			// resurrect those models in the picker.
			const liveA = createModel('a-model', 'A Model', { vendor: 'vendor-a' });
			const staleB = createModel('b-model', 'B Model', { vendor: 'vendor-b' });
			const result = mergeModelsWithCache(
				[liveA],
				[staleB],
				new Set(['vendor-a', 'vendor-b']),
				new Set(['vendor-a', 'vendor-b']),
			);
			assert.strictEqual(result.length, 1);
			assert.strictEqual(result[0].metadata.vendor, 'vendor-a');
		});

		test('keeps cached entries for an unresolved vendor (extension reload race)', () => {
			// vendor-b is contributed but its provider hasn't completed a resolution yet
			// (e.g. extension is mid-reload). Cache must bridge the gap so the picker
			// keeps showing the user's previously-seen models.
			const liveA = createModel('a-model', 'A Model', { vendor: 'vendor-a' });
			const cachedB = createModel('b-model', 'B Model', { vendor: 'vendor-b' });
			const result = mergeModelsWithCache(
				[liveA],
				[cachedB],
				new Set(['vendor-a', 'vendor-b']),
				new Set(['vendor-a']), // vendor-b not yet resolved
			);
			assert.strictEqual(result.length, 2);
			assert.deepStrictEqual(result.map(m => m.metadata.vendor).sort(), ['vendor-a', 'vendor-b']);
		});

		test('evicts cache for a resolved vendor even when all live models are zero', () => {
			// Edge case: the only resolved vendor returns zero models (user deleted all
			// configurations). Cache must be ignored — the picker should be empty.
			const stale = createModel('b-model', 'B Model', { vendor: 'vendor-b' });
			const result = mergeModelsWithCache(
				[],
				[stale],
				new Set(['vendor-b']),
				new Set(['vendor-b']),
			);
			assert.strictEqual(result.length, 0);
		});

		test('preserves full cache when no vendors are contributed yet (startup race)', () => {
			// During startup or an extension reload, vendor descriptors may not be
			// registered yet. contributedVendors is empty and so is resolvedVendors.
			// We must NOT drop the cache — that would reset the user's selected model
			// before the vendors come back.
			const cachedA = createModel('a-model', 'A Model', { vendor: 'vendor-a' });
			const cachedB = createModel('b-model', 'B Model', { vendor: 'vendor-b' });
			const result = mergeModelsWithCache(
				[],
				[cachedA, cachedB],
				new Set(),
				new Set(),
			);
			assert.deepStrictEqual(result.map(m => m.metadata.id).sort(), ['a-model', 'b-model']);
		});

		test('evicts cached agent-host entries when the vendor is resolved with zero live models', () => {
			// The agent-host "empty is transient" grace is scoped to restore *resolution* only
			// (resolveModelIdentifierFromCatalog); it must NOT relax cache-retention. A resolved
			// agent-host vendor with no live models is authoritative here, so its cache is evicted
			// like any other vendor — otherwise a removed/unentitled agent-host model could be
			// offered from cache (and the input's "no models"/send-blocked state would be masked).
			const liveCopilot = createModel('gpt', 'GPT');
			const staleAgentHost = createVendorModel('agent-host-copilotcli', 'gpt-5.6-sol', 'GPT 5.6 Sol');
			const result = mergeModelsWithCache(
				[liveCopilot],
				[staleAgentHost],
				new Set(['copilot', 'agent-host-copilotcli']),
				new Set(['copilot', 'agent-host-copilotcli']),
			);
			assert.strictEqual(result.length, 1);
			assert.strictEqual(result[0].metadata.vendor, 'copilot');
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

		test('reset when the selected model is hidden from the available models', () => {
			const gpt = createModel('gpt', 'GPT');
			const claude = createModel('claude', 'Claude');
			const visibleModels = [gpt, claude].filter(model => model.identifier !== gpt.identifier);

			assert.strictEqual(shouldResetOnModelListChange(gpt.identifier, visibleModels), true);
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

		test('startup/extension reload with no contributors yet preserves cache (production path)', () => {
			// Mirrors chatInputPart.getAllMergedModels at a moment when getVendors()
			// is temporarily empty (extension host reloading). resolvedVendors is
			// also empty because nothing has resolved. The picker must continue to
			// show cached models so the user's selection isn't reset.
			const cachedA = createModel('a-model', 'A Model', { vendor: 'vendor-a' });
			const cachedB = createModel('b-model', 'B Model', { vendor: 'vendor-b' });
			const result = computeAvailableModels(
				[],
				[cachedA, cachedB],
				new Set(),
				undefined,
				ChatModeKind.Ask,
				ChatAgentLocation.Chat,
				new Set(),
			);
			assert.deepStrictEqual(result.map(m => m.metadata.id).sort(), ['a-model', 'b-model']);
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

		test('restored model passes Agent compatibility check', () => {
			const agentModel = createModel('agent-model', 'Agent Model', {
				capabilities: { toolCalling: true, agentMode: true },
			});
			assert.strictEqual(shouldResetModelToDefault(agentModel, [agentModel], agentContext, [agentModel]), false);
		});

		test('restored model that fails Agent compatibility resets to an Agent model', () => {
			const askOnlyModel = createModel('ask-only', 'Ask Only', {
				capabilities: { toolCalling: false, agentMode: false },
			});
			const agentModel = createModel('agent-model', 'Agent Model');

			assert.strictEqual(shouldResetModelToDefault(askOnlyModel, [askOnlyModel, agentModel], agentContext, [askOnlyModel, agentModel]), true);

			const agentCompatibleModels = filterModelsForSession(
				[askOnlyModel, agentModel], undefined, ChatModeKind.Agent, ChatAgentLocation.Chat,
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

		// Repro for #321037: on first launch the restored Copilot selection is reset to a BYOK model. The Copilot
		// vendor depends on the Copilot token, which round-trips slower than fast/local BYOK providers (Ollama,
		// Cerebras). So the Copilot vendor resolves an EMPTY live list first while the BYOK vendors already have live
		// models. `mergeModelsWithCache` then treats Copilot's empty resolution as authoritative and evicts the cached
		// Copilot models that were used to restore the selection — leaving only BYOK models, which triggers a
		// reset-to-default that clobbers the user's persisted Copilot choice.
		test('startup race #321037: Copilot vendor resolves empty before BYOK, restored selection must survive', () => {
			// The user's persisted choice (a Copilot model) and its siblings, seeded into the cache from the previous
			// session.
			const persistedId = 'copilot/claude-opus-4.6-1m';
			const cachedCopilot = [
				createModel('claude-opus-4.6-1m', 'Claude Opus 4.6 (1M)'),
				createModel('gpt-5.5', 'GPT-5.5'),
			];

			// Fast/local BYOK providers that publish live models immediately.
			const liveByok = [
				createVendorModel('ollama', 'deepseek-v3.1', 'DeepSeek V3.1'),
				createVendorModel('cerebras', 'zai-glm-4.7', 'GLM 4.7'),
			];

			// Copilot contributed a vendor but resolved an EMPTY live list (token not ready yet); the BYOK vendors
			// resolved with models. All three are therefore "resolved".
			const contributedVendors = new Set(['copilot', 'ollama', 'cerebras']);
			const resolvedVendors = new Set(['copilot', 'ollama', 'cerebras']);

			const available = computeAvailableModels(
				liveByok,
				[...cachedCopilot, ...liveByok],
				contributedVendors,
				undefined,
				ChatModeKind.Agent,
				ChatAgentLocation.Chat,
				resolvedVendors,
			);

			// DESIRED: the user's restored Copilot model is still selectable during the race, so no reset-to-BYOK
			// happens and the persisted choice is kept. CURRENT (bug): Copilot cache is evicted, only BYOK remains, the
			// model is considered unavailable and gets reset to a BYOK default.
			assert.ok(
				available.some(m => m.identifier === persistedId),
				'restored Copilot model should remain available while its vendor is still activating',
			);
			assert.strictEqual(
				shouldResetOnModelListChange(persistedId, available),
				false,
				'must not reset the restored Copilot selection during the startup race',
			);

			// And the fallback default must not be a BYOK model (which is what gets persisted today, clobbering the user
			// choice on the next launch).
			const fallback = findDefaultModel(available, ChatAgentLocation.Chat);
			assert.notStrictEqual(
				fallback?.metadata.isBYOK,
				true,
				'reset fallback should not be a BYOK model',
			);
		});
	});

	suite('agent-host model restore', () => {
		const sessionType = 'agent-host-claude';
		const agnosticAuto = createModel('auto', 'Auto');
		const agentHostHaiku: ILanguageModelChatMetadataAndIdentifier = {
			...createSessionModel('claude-haiku-4.5', 'Claude Haiku 4.5', sessionType, { isDefaultForLocation: { [ChatAgentLocation.Chat]: true } }),
			identifier: 'agent-host-claude:claude-haiku-4.5',
		};
		const agentHostOpus: ILanguageModelChatMetadataAndIdentifier = {
			...createSessionModel('claude-opus-4.8', 'Claude Opus 4.8', sessionType),
			identifier: 'agent-host-claude:claude-opus-4.8',
		};
		const allMerged = [agnosticAuto, agentHostHaiku, agentHostOpus];

		test('restores a remembered per-type model only for a fresh own-pool draft', () => {
			assert.deepStrictEqual([
				shouldRestorePerTypeModelOnSessionSwitch(true, true, false),
				shouldRestorePerTypeModelOnSessionSwitch(true, true, true),
				shouldRestorePerTypeModelOnSessionSwitch(false, true, false),
				shouldRestorePerTypeModelOnSessionSwitch(true, false, false),
			], [true, false, false, false]);
		});

		test('drops cross-pool draft models in both directions', () => {
			assert.deepStrictEqual([
				shouldDropAgnosticDraftModel(agnosticAuto, allMerged, sessionType),
				shouldDropAgnosticDraftModel(agentHostOpus, allMerged, undefined),
				shouldDropAgnosticDraftModel(agentHostOpus, allMerged, sessionType),
			], [true, true, false]);
		});

		suite('shouldWaitForSessionModel (cold-restore wait)', () => {
			test('waits when the session model targets this pool but is not loaded yet', () => {
				assert.strictEqual(shouldWaitForSessionModel(agentHostOpus, sessionType, []), true);
				assert.strictEqual(shouldWaitForSessionModel(agentHostOpus, sessionType, [agnosticAuto, agentHostHaiku]), true);
			});

			test('does NOT wait once the session model is available (normal apply path handles it)', () => {
				assert.strictEqual(shouldWaitForSessionModel(agentHostOpus, sessionType, allMerged), false);
			});

			test('does NOT wait for a model that does not belong to this session pool (would wait forever)', () => {
				assert.strictEqual(shouldWaitForSessionModel(agnosticAuto, sessionType, [agentHostHaiku]), false);
				const otherType = { ...agentHostOpus, metadata: { ...agentHostOpus.metadata, targetChatSessionType: 'agent-host-copilotcli' } };
				assert.strictEqual(shouldWaitForSessionModel(otherType, sessionType, []), false);
				assert.strictEqual(shouldWaitForSessionModel(agentHostOpus, undefined, []), false);
			});
		});
	});

	suite('BYOK agent-host visibility (isModelHiddenInPicker / getAgentHostByokManageModelsIdentifier)', () => {

		// Mirrors the agent-host copy produced by `AgentHostLanguageModelProvider` after a
		// BYOK model round-trips the bridge: it is surfaced under the agent-host vendor with
		// `identifier = <agent-host-vendor>:<vendor>/<id>` and carries the original LM service
		// identifier (`byokModelIdentifier`, the "Manage Models" visibility key) that the node
		// agent host forwarded across the bridge via `_meta`.
		function createAgentHostByokModel(vendor: string, modelId: string, manageModelsIdentifier: string): ILanguageModelChatMetadataAndIdentifier {
			const sessionType = 'agent-host-copilotcli';
			const appendedId = `${vendor}/${modelId}`;
			return {
				identifier: `${sessionType}:${appendedId}`,
				metadata: {
					extension: new ExtensionIdentifier('vscode.chat'),
					id: appendedId,
					name: modelId,
					vendor: sessionType,
					version: '1.0',
					family: appendedId,
					maxInputTokens: 128000,
					maxOutputTokens: 4096,
					isDefaultForLocation: {},
					isUserSelectable: true,
					targetChatSessionType: sessionType,
					modelGroup: { id: vendor },
					byokModelIdentifier: manageModelsIdentifier,
					capabilities: { toolCalling: true, agentMode: true },
				} as ILanguageModelChatMetadata,
			};
		}

		// A native harness model (e.g. Copilot CLI's own model) carries no
		// `byokModelIdentifier`; it is toggled under its own identifier.
		function createNativeAgentHostModel(modelId: string): ILanguageModelChatMetadataAndIdentifier {
			const sessionType = 'agent-host-copilotcli';
			return {
				identifier: `${sessionType}:${modelId}`,
				metadata: {
					extension: new ExtensionIdentifier('vscode.chat'),
					id: modelId,
					name: modelId,
					vendor: sessionType,
					version: '1.0',
					family: modelId,
					maxInputTokens: 128000,
					maxOutputTokens: 4096,
					isDefaultForLocation: {},
					isUserSelectable: true,
					targetChatSessionType: sessionType,
					modelGroup: { id: 'copilotcli' },
					capabilities: { toolCalling: true, agentMode: true },
				} as ILanguageModelChatMetadata,
			};
		}

		test('returns the carried Manage Models identifier for a groupless BYOK copy', () => {
			const model = createAgentHostByokModel('anthropic', 'claude-sonnet-4', 'anthropic/claude-sonnet-4');
			assert.strictEqual(getAgentHostByokManageModelsIdentifier(model.metadata), 'anthropic/claude-sonnet-4');
		});

		test('returns the carried grouped identifier verbatim (group name + slashes preserved)', () => {
			// OpenRouter under a user-configured group "OpenRouter 2"; the model id itself has a slash.
			const model = createAgentHostByokModel('openrouter', 'ai21/jamba-large-1.7', 'openrouter/OpenRouter 2/ai21/jamba-large-1.7');
			assert.strictEqual(getAgentHostByokManageModelsIdentifier(model.metadata), 'openrouter/OpenRouter 2/ai21/jamba-large-1.7');
		});

		test('returns undefined for native harness models (no carried identifier)', () => {
			const model = createNativeAgentHostModel('claude-haiku-4.5');
			assert.strictEqual(getAgentHostByokManageModelsIdentifier(model.metadata), undefined);
		});

		test('returns undefined for non-agent-host models', () => {
			const model = createModel('gpt-5', 'GPT-5');
			assert.strictEqual(getAgentHostByokManageModelsIdentifier(model.metadata), undefined);
		});

		test('hides a grouped BYOK copy via its carried registered identifier', () => {
			const model = createAgentHostByokModel('openrouter', 'ai21/jamba-large-1.7', 'openrouter/OpenRouter 2/ai21/jamba-large-1.7');
			// The user hid the model in Manage Models, which stored the grouped identifier.
			const hidden = new Set(['openrouter/OpenRouter 2/ai21/jamba-large-1.7']);
			assert.strictEqual(isModelHiddenInPicker(model, id => hidden.has(id)), true);
		});

		test('hides a groupless BYOK copy via its carried identifier', () => {
			const model = createAgentHostByokModel('anthropic', 'claude-sonnet-4', 'anthropic/claude-sonnet-4');
			const hidden = new Set(['anthropic/claude-sonnet-4']);
			assert.strictEqual(isModelHiddenInPicker(model, id => hidden.has(id)), true);
		});

		test('shows an agent-host BYOK copy when nothing is hidden', () => {
			const model = createAgentHostByokModel('openrouter', 'ai21/jamba-large-1.7', 'openrouter/OpenRouter 2/ai21/jamba-large-1.7');
			assert.strictEqual(isModelHiddenInPicker(model, () => false), false);
		});

		test('also hides when the agent-host copy identifier itself is hidden', () => {
			const model = createAgentHostByokModel('anthropic', 'claude-sonnet-4', 'anthropic/claude-sonnet-4');
			const hidden = new Set([model.identifier]);
			assert.strictEqual(isModelHiddenInPicker(model, id => hidden.has(id)), true);
		});

		test('filters out a hidden grouped BYOK model but keeps visible peers', () => {
			const visible = createAgentHostByokModel('anthropic', 'claude-sonnet-4', 'anthropic/claude-sonnet-4');
			const hiddenModel = createAgentHostByokModel('openrouter', 'ai21/jamba-large-1.7', 'openrouter/OpenRouter 2/ai21/jamba-large-1.7');
			const hidden = new Set(['openrouter/OpenRouter 2/ai21/jamba-large-1.7']);
			const result = [visible, hiddenModel].filter(m => !isModelHiddenInPicker(m, id => hidden.has(id)));
			assert.deepStrictEqual(result.map(m => m.identifier), ['agent-host-copilotcli:anthropic/claude-sonnet-4']);
		});
	});
});
