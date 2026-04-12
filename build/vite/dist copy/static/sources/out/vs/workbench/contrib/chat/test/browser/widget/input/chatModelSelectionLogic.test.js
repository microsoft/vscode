/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { ExtensionIdentifier } from '../../../../../../../platform/extensions/common/extensions.js';
import { ChatAgentLocation, ChatModeKind } from '../../../../common/constants.js';
import { ILanguageModelChatMetadata } from '../../../../common/languageModels.js';
import { filterModelsForSession, findDefaultModel, hasModelsTargetingSession, isModelSupportedForInlineChat, isModelSupportedForMode, isModelValidForSession, mergeModelsWithCache, resolveModelFromSyncState, shouldResetModelToDefault, shouldResetOnModelListChange, shouldRestoreLateArrivingModel, shouldRestorePersistedModel, } from '../../../../browser/widget/input/chatModelSelectionLogic.js';
/**
 * Test helper that composes the full startup pipeline: merge live+cache → sort → filter by session/mode.
 * This mirrors what `chatInputPart.getModels()` does, but without the storage side effects.
 */
function computeAvailableModels(liveModels, cachedModels, contributedVendors, sessionType, currentModeKind, location, isInlineChatV2Enabled) {
    const merged = mergeModelsWithCache(liveModels, cachedModels, contributedVendors);
    merged.sort((a, b) => a.metadata.name.localeCompare(b.metadata.name));
    return filterModelsForSession(merged, sessionType, currentModeKind, location, isInlineChatV2Enabled);
}
function createModel(id, name, overrides) {
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
        },
    };
}
function createDefaultModelForLocation(id, name, location, overrides) {
    return createModel(id, name, {
        isDefaultForLocation: { [location]: true },
        ...overrides,
    });
}
function createSessionModel(id, name, sessionType, overrides) {
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
            assert.strictEqual(isModelSupportedForInlineChat(model, ChatAgentLocation.Chat, true), true);
            assert.strictEqual(isModelSupportedForInlineChat(model, ChatAgentLocation.Terminal, true), true);
            assert.strictEqual(isModelSupportedForInlineChat(model, ChatAgentLocation.Notebook, true), true);
        });
        test('any model is supported in EditorInline when V2 is disabled', () => {
            const model = createModel('basic', 'Basic', { capabilities: undefined });
            assert.strictEqual(isModelSupportedForInlineChat(model, ChatAgentLocation.EditorInline, false), true);
        });
        test('model with tool calling is supported in EditorInline with V2', () => {
            const model = createModel('tools', 'Tools', {
                capabilities: { toolCalling: true },
            });
            assert.strictEqual(isModelSupportedForInlineChat(model, ChatAgentLocation.EditorInline, true), true);
        });
        test('model without tool calling is NOT supported in EditorInline with V2', () => {
            const model = createModel('no-tools', 'No-Tools', {
                capabilities: { toolCalling: false },
            });
            assert.strictEqual(isModelSupportedForInlineChat(model, ChatAgentLocation.EditorInline, true), false);
        });
        test('model with no capabilities is NOT supported in EditorInline with V2', () => {
            const model = createModel('no-caps', 'No-Caps', { capabilities: undefined });
            assert.strictEqual(isModelSupportedForInlineChat(model, ChatAgentLocation.EditorInline, true), false);
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
            const result = filterModelsForSession([gpt4o, claude, notSelectable], undefined, ChatModeKind.Ask, ChatAgentLocation.Chat, false);
            assert.deepStrictEqual(result.map(m => m.metadata.id), ['gpt-4o', 'claude']);
        });
        test('returns user-selectable general models for local session type', () => {
            const result = filterModelsForSession([gpt4o, claude, notSelectable], 'local', ChatModeKind.Ask, ChatAgentLocation.Chat, false);
            assert.deepStrictEqual(result.map(m => m.metadata.id), ['gpt-4o', 'claude']);
        });
        test('excludes models targeting a specific session type when in general session', () => {
            const result = filterModelsForSession([gpt4o, claude, cloudModel], undefined, ChatModeKind.Ask, ChatAgentLocation.Chat, false);
            assert.deepStrictEqual(result.map(m => m.metadata.id), ['gpt-4o', 'claude']);
        });
        test('returns only session-targeted models for a specific session type', () => {
            const result = filterModelsForSession([gpt4o, claude, cloudModel], 'cloud', ChatModeKind.Ask, ChatAgentLocation.Chat, false);
            assert.deepStrictEqual(result.map(m => m.metadata.id), ['cloud-gpt']);
        });
        test('filters out models incompatible with Agent mode in general session', () => {
            const result = filterModelsForSession([gpt4o, noToolsModel], undefined, ChatModeKind.Agent, ChatAgentLocation.Chat, false);
            assert.deepStrictEqual(result.map(m => m.metadata.id), ['gpt-4o']);
        });
        test.skip('filters by mode for session-targeted models', () => {
            const cloudNoTools = createSessionModel('cloud-basic', 'Cloud Basic', 'cloud', {
                capabilities: { toolCalling: false, agentMode: false },
            });
            const result = filterModelsForSession([gpt4o, cloudModel, cloudNoTools], 'cloud', ChatModeKind.Agent, ChatAgentLocation.Chat, false);
            // Session-type filtering also checks mode and inline chat support
            assert.deepStrictEqual(result.map(m => m.metadata.id), ['cloud-gpt']);
        });
        test('excludes non-selectable models from session-targeted results', () => {
            const cloudHidden = createSessionModel('cloud-hidden', 'Cloud Hidden', 'cloud', {
                isUserSelectable: false,
            });
            const result = filterModelsForSession([cloudModel, cloudHidden], 'cloud', ChatModeKind.Ask, ChatAgentLocation.Chat, false);
            assert.deepStrictEqual(result.map(m => m.metadata.id), ['cloud-gpt']);
        });
        test('falls back to general models when no models target the session type', () => {
            const result = filterModelsForSession([gpt4o, claude], 'cloud', ChatModeKind.Ask, ChatAgentLocation.Chat, false);
            assert.deepStrictEqual(result.map(m => m.metadata.id), ['gpt-4o', 'claude']);
        });
        test('filters inline chat incompatible models in EditorInline with V2', () => {
            const noToolsSelectable = createModel('no-tools-selectable', 'No-Tools-Selectable', {
                capabilities: { toolCalling: false },
            });
            const result = filterModelsForSession([gpt4o, noToolsSelectable], undefined, ChatModeKind.Ask, ChatAgentLocation.EditorInline, true);
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
            isInlineChatV2Enabled: false,
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
                isInlineChatV2Enabled: true,
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
                isInlineChatV2Enabled: false,
                sessionType: undefined,
            });
            assert.strictEqual(result.action, 'default');
        });
        test('returns default when state model does not support inline chat V2', () => {
            const current = createModel('gpt', 'GPT');
            const stateModel = createModel('no-tools', 'No-Tools', {
                capabilities: { toolCalling: false },
            });
            const result = resolveModelFromSyncState(stateModel, current, [current, stateModel], undefined, {
                location: ChatAgentLocation.EditorInline,
                currentModeKind: ChatModeKind.Ask,
                isInlineChatV2Enabled: true,
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
                isInlineChatV2Enabled: false,
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
            const result = mergeModelsWithCache([liveModel], [cachedOtherVendor], new Set(['copilot', 'other-vendor']));
            assert.strictEqual(result.length, 2);
            assert.deepStrictEqual(result.map(m => m.metadata.id).sort(), ['gpt', 'other-model']);
        });
        test('evicts cached models from vendors no longer contributed', () => {
            const liveModel = createModel('gpt', 'GPT');
            const cachedRemovedVendor = createModel('removed-model', 'Removed Model', { vendor: 'removed-vendor' });
            const result = mergeModelsWithCache([liveModel], [cachedRemovedVendor], new Set(['copilot']));
            assert.strictEqual(result.length, 1);
            assert.strictEqual(result[0].metadata.id, 'gpt');
        });
        test('does not duplicate models from same vendor', () => {
            const liveModel = createModel('gpt', 'GPT');
            const cachedSameVendor = createModel('cached-gpt', 'Cached GPT');
            const result = mergeModelsWithCache([liveModel], [cachedSameVendor], new Set(['copilot']));
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
            const result = mergeModelsWithCache([liveA], [cachedB, cachedC], new Set(['vendor-a', 'vendor-b']));
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
            assert.strictEqual(shouldResetModelToDefault(noToolsModel, allModels, {
                location: ChatAgentLocation.Chat,
                currentModeKind: ChatModeKind.Ask,
                isInlineChatV2Enabled: false,
                sessionType: undefined,
            }, allModels), false);
            // After switching to Agent mode, model should be reset
            assert.strictEqual(shouldResetModelToDefault(noToolsModel, allModels, {
                location: ChatAgentLocation.Chat,
                currentModeKind: ChatModeKind.Agent,
                isInlineChatV2Enabled: false,
                sessionType: undefined,
            }, allModels), true);
        });
        test('switching sessions should reject model from wrong session pool', () => {
            const cloudModel = createSessionModel('cloud-gpt', 'Cloud GPT', 'cloud');
            const generalModel = createModel('gpt', 'GPT');
            const allModels = [generalModel, cloudModel];
            // Cloud model is valid in cloud session
            assert.strictEqual(isModelValidForSession(cloudModel, allModels, 'cloud'), true);
            // Cloud model is NOT valid in general session (no session type)
            assert.strictEqual(isModelValidForSession(cloudModel, allModels, undefined), false);
            // General model is NOT valid in cloud session (when cloud models exist)
            assert.strictEqual(isModelValidForSession(generalModel, allModels, 'cloud'), false);
            // General model IS valid in general session
            assert.strictEqual(isModelValidForSession(generalModel, allModels, undefined), true);
        });
        test('model removal should trigger reset', () => {
            const gpt = createModel('gpt', 'GPT');
            const claude = createModel('claude', 'Claude');
            // Initially both available, GPT is selected
            assert.strictEqual(shouldResetModelToDefault(gpt, [gpt, claude], {
                location: ChatAgentLocation.Chat,
                currentModeKind: ChatModeKind.Ask,
                isInlineChatV2Enabled: false,
                sessionType: undefined,
            }, [gpt, claude]), false);
            // GPT is removed from available models
            assert.strictEqual(shouldResetModelToDefault(gpt, [claude], {
                location: ChatAgentLocation.Chat,
                currentModeKind: ChatModeKind.Ask,
                isInlineChatV2Enabled: false,
                sessionType: undefined,
            }, [claude]), true);
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
            assert.strictEqual(shouldResetModelToDefault(cloudToolModel, allCloudModels, {
                location: ChatAgentLocation.Chat,
                currentModeKind: ChatModeKind.Agent,
                isInlineChatV2Enabled: false,
                sessionType: 'cloud',
            }, allCloudModels), false);
            // The no-tool model should be reset in Agent mode
            // Both filterModelsForSession and shouldResetModelToDefault enforce mode support
            assert.strictEqual(shouldResetModelToDefault(cloudNoToolModel, allCloudModels, {
                location: ChatAgentLocation.Chat,
                currentModeKind: ChatModeKind.Agent,
                isInlineChatV2Enabled: false,
                sessionType: 'cloud',
            }, allCloudModels), true);
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
            assert.strictEqual(shouldRestoreLateArrivingModel('copilot/gpt', false, model, ChatAgentLocation.Chat), true);
        });
        test('restores model that was default and is still default for location', () => {
            const model = createDefaultModelForLocation('gpt', 'GPT', ChatAgentLocation.Chat);
            assert.strictEqual(shouldRestoreLateArrivingModel('copilot/gpt', true, model, ChatAgentLocation.Chat), true);
        });
        test('does NOT restore model that was default but is no longer default', () => {
            const model = createModel('gpt', 'GPT'); // not default for any location
            assert.strictEqual(shouldRestoreLateArrivingModel('copilot/gpt', true, model, ChatAgentLocation.Chat), false);
        });
        test('does NOT restore model that is not user-selectable', () => {
            const model = createModel('internal', 'Internal', { isUserSelectable: false });
            assert.strictEqual(shouldRestoreLateArrivingModel('copilot/internal', false, model, ChatAgentLocation.Chat), false);
        });
        test('does NOT restore model with isUserSelectable=undefined (treated as falsy)', () => {
            const model = createModel('undef-sel', 'Undef-Sel', { isUserSelectable: undefined });
            assert.strictEqual(shouldRestoreLateArrivingModel('copilot/undef-sel', false, model, ChatAgentLocation.Chat), false);
        });
        test('restores model arriving late at a different location where it is default', () => {
            const model = createDefaultModelForLocation('gpt', 'GPT', ChatAgentLocation.Terminal);
            // User is in Terminal — model is default there
            assert.strictEqual(shouldRestoreLateArrivingModel('copilot/gpt', true, model, ChatAgentLocation.Terminal), true);
            // But not in Chat
            assert.strictEqual(shouldRestoreLateArrivingModel('copilot/gpt', true, model, ChatAgentLocation.Chat), false);
        });
    });
    suite('full startup pipeline (computeAvailableModels)', () => {
        test('startup with only cached models returns filtered cache', () => {
            const cached = createModel('gpt', 'GPT');
            const result = computeAvailableModels([], // no live models yet
            [cached], new Set(['copilot']), undefined, ChatModeKind.Ask, ChatAgentLocation.Chat, false);
            assert.deepStrictEqual(result.map(m => m.metadata.id), ['gpt']);
        });
        test('startup with cached models from removed vendor still returns them (no live to compare)', () => {
            const cached = createModel('gpt', 'GPT');
            // When liveModels is empty, mergeModelsWithCache returns ALL cached
            // because it cannot tell startup-delay from vendor removal
            const result = computeAvailableModels([], // no live models
            [cached], new Set(), // vendor no longer contributed
            undefined, ChatModeKind.Ask, ChatAgentLocation.Chat, false);
            assert.deepStrictEqual(result.map(m => m.metadata.id), ['gpt']);
        });
        test('live models supersede cached models from same vendor', () => {
            const live = createModel('gpt-new', 'GPT New');
            const cached = createModel('gpt-old', 'GPT Old');
            const result = computeAvailableModels([live], [cached], new Set(['copilot']), undefined, ChatModeKind.Ask, ChatAgentLocation.Chat, false);
            assert.deepStrictEqual(result.map(m => m.metadata.id), ['gpt-new']);
        });
        test('partial vendor resolution keeps unresolved vendors from cache', () => {
            const liveA = createModel('a-model', 'A Model', { vendor: 'vendor-a' });
            const cachedB = createModel('b-model', 'B Model', { vendor: 'vendor-b' });
            const result = computeAvailableModels([liveA], [cachedB], new Set(['vendor-a', 'vendor-b']), undefined, ChatModeKind.Ask, ChatAgentLocation.Chat, false);
            assert.deepStrictEqual(result.map(m => m.metadata.id).sort(), ['a-model', 'b-model']);
        });
        test('results are sorted alphabetically by name', () => {
            const modelC = createModel('c', 'Charlie');
            const modelA = createModel('a', 'Alpha');
            const modelB = createModel('b', 'Bravo');
            const result = computeAvailableModels([modelC, modelA, modelB], [], new Set(['copilot']), undefined, ChatModeKind.Ask, ChatAgentLocation.Chat, false);
            assert.deepStrictEqual(result.map(m => m.metadata.name), ['Alpha', 'Bravo', 'Charlie']);
        });
        test('session-targeted models excluded from general session startup', () => {
            const general = createModel('gpt', 'GPT');
            const cloudOnly = createSessionModel('cloud', 'Cloud', 'cloud');
            const result = computeAvailableModels([general, cloudOnly], [], new Set(['copilot']), undefined, ChatModeKind.Ask, ChatAgentLocation.Chat, false);
            assert.deepStrictEqual(result.map(m => m.metadata.id), ['gpt']);
        });
        test('only session-targeted models returned for cloud session startup', () => {
            const general = createModel('gpt', 'GPT');
            const cloudOnly = createSessionModel('cloud', 'Cloud', 'cloud');
            const result = computeAvailableModels([general, cloudOnly], [], new Set(['copilot']), 'cloud', ChatModeKind.Ask, ChatAgentLocation.Chat, false);
            assert.deepStrictEqual(result.map(m => m.metadata.id), ['cloud']);
        });
        test('agent mode filters non-tool models during startup', () => {
            const toolModel = createModel('tool', 'Tool Model');
            const noToolModel = createModel('no-tool', 'No Tool', {
                capabilities: { toolCalling: false, agentMode: false },
            });
            const result = computeAvailableModels([toolModel, noToolModel], [], new Set(['copilot']), undefined, ChatModeKind.Agent, ChatAgentLocation.Chat, false);
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
            isInlineChatV2Enabled: false,
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
            const agentCompatibleModels = filterModelsForSession([askOnlyModel, agentModel], undefined, ChatModeKind.Agent, ChatAgentLocation.Chat, false);
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
            assert.strictEqual(shouldResetModelToDefault(result1, allModels, askContext, allModels), false);
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
            const cloudFiltered = filterModelsForSession(allModels, 'cloud', ChatModeKind.Ask, ChatAgentLocation.Chat, false);
            assert.deepStrictEqual(cloudFiltered.map(m => m.metadata.id), ['cloud-gpt']);
            const entFiltered = filterModelsForSession(allModels, 'enterprise', ChatModeKind.Ask, ChatAgentLocation.Chat, false);
            assert.deepStrictEqual(entFiltered.map(m => m.metadata.id), ['ent-gpt']);
            const generalFiltered = filterModelsForSession(allModels, undefined, ChatModeKind.Ask, ChatAgentLocation.Chat, false);
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
                isInlineChatV2Enabled: false,
                sessionType: 'cloud',
            }, allModels), false);
            // Switch to general session — cloud model should be reset
            assert.strictEqual(shouldResetModelToDefault(cloudModel, [generalModel], {
                location: ChatAgentLocation.Chat,
                currentModeKind: ChatModeKind.Ask,
                isInlineChatV2Enabled: false,
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
                isInlineChatV2Enabled: false,
                sessionType: undefined,
            }, [forcedModel]), true);
        });
    });
    suite('EditorInline + mode combined scenarios', () => {
        test('EditorInline + Agent + V2 requires both agentMode and toolCalling', () => {
            const partialModel = createModel('partial', 'Partial', {
                capabilities: { toolCalling: true, agentMode: false },
            });
            // Fails Agent mode check
            assert.strictEqual(isModelSupportedForMode(partialModel, ChatModeKind.Agent), false);
            // Passes inline chat check (has toolCalling)
            assert.strictEqual(isModelSupportedForInlineChat(partialModel, ChatAgentLocation.EditorInline, true), true);
            // Combined: should reset because Agent mode fails
            assert.strictEqual(shouldResetModelToDefault(partialModel, [partialModel], {
                location: ChatAgentLocation.EditorInline,
                currentModeKind: ChatModeKind.Agent,
                isInlineChatV2Enabled: true,
                sessionType: undefined,
            }, [partialModel]), true);
        });
        test('EditorInline + Ask + V2 only requires toolCalling', () => {
            const toolModel = createModel('tool', 'Tool');
            assert.strictEqual(shouldResetModelToDefault(toolModel, [toolModel], {
                location: ChatAgentLocation.EditorInline,
                currentModeKind: ChatModeKind.Ask,
                isInlineChatV2Enabled: true,
                sessionType: undefined,
            }, [toolModel]), false);
        });
        test('EditorInline + Ask + V2 rejects model without toolCalling', () => {
            const noToolModel = createModel('no-tool', 'No Tool', {
                capabilities: {},
            });
            assert.strictEqual(shouldResetModelToDefault(noToolModel, [noToolModel], {
                location: ChatAgentLocation.EditorInline,
                currentModeKind: ChatModeKind.Ask,
                isInlineChatV2Enabled: true,
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
            const cachedModels = computeAvailableModels([], [cachedGpt, cachedClaude], new Set(['copilot']), undefined, ChatModeKind.Ask, ChatAgentLocation.Chat, false);
            // GPT is in the cached list
            assert.strictEqual(shouldResetOnModelListChange('copilot/gpt', cachedModels), false);
            // Step 2: Live models arrive (same models)
            const liveModels = computeAvailableModels([cachedGpt, cachedClaude], [cachedGpt, cachedClaude], new Set(['copilot']), undefined, ChatModeKind.Ask, ChatAgentLocation.Chat, false);
            // GPT still in the list — no reset needed
            assert.strictEqual(shouldResetOnModelListChange('copilot/gpt', liveModels), false);
        });
        test('startup: no cache → models arrive late → persisted choice restored', () => {
            // Step 1: No models available at all
            const emptyModels = computeAvailableModels([], [], new Set(['copilot']), undefined, ChatModeKind.Ask, ChatAgentLocation.Chat, false);
            assert.strictEqual(emptyModels.length, 0);
            // initSelectedModel: model not found, enters _waitForPersistedLanguageModel path
            const restoreResult = shouldRestorePersistedModel('copilot/gpt', false, emptyModels, ChatAgentLocation.Chat);
            assert.strictEqual(restoreResult.shouldRestore, false);
            assert.strictEqual(restoreResult.model, undefined);
            // Step 2: Models arrive via onDidChangeLanguageModels
            const arrivedModel = createModel('gpt', 'GPT');
            assert.strictEqual(shouldRestoreLateArrivingModel('copilot/gpt', false, arrivedModel, ChatAgentLocation.Chat), true);
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
                isInlineChatV2Enabled: false,
                sessionType: undefined,
            }, allModels), false);
            // Switch to cloud session — general model should be reset
            assert.strictEqual(shouldResetModelToDefault(generalDefault, [cloudModel], {
                location: ChatAgentLocation.Chat,
                currentModeKind: ChatModeKind.Agent,
                isInlineChatV2Enabled: false,
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
                isInlineChatV2Enabled: false, sessionType: undefined,
            }, allModels), false);
            // → Agent mode: model has toolCalling, still fine
            assert.strictEqual(shouldResetModelToDefault(model, allModels, {
                location: ChatAgentLocation.Chat, currentModeKind: ChatModeKind.Agent,
                isInlineChatV2Enabled: false, sessionType: undefined,
            }, allModels), false);
            // → Back to Ask: still fine
            assert.strictEqual(shouldResetModelToDefault(model, allModels, {
                location: ChatAgentLocation.Chat, currentModeKind: ChatModeKind.Ask,
                isInlineChatV2Enabled: false, sessionType: undefined,
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
                isInlineChatV2Enabled: false, sessionType: undefined,
            }, allModels), false);
            // → Agent mode: noToolModel fails, reset picks default (toolModel)
            assert.strictEqual(shouldResetModelToDefault(noToolModel, allModels, {
                location: ChatAgentLocation.Chat, currentModeKind: ChatModeKind.Agent,
                isInlineChatV2Enabled: false, sessionType: undefined,
            }, allModels), true);
            const defaultAfterReset = findDefaultModel(allModels, ChatAgentLocation.Chat);
            assert.strictEqual(defaultAfterReset?.metadata.id, 'tool');
            // → Back to Ask: toolModel is fine in Ask mode, stays as toolModel
            // The original noToolModel is NOT restored — this is expected and matches ChatInputPart behavior
            assert.strictEqual(shouldResetModelToDefault(toolModel, allModels, {
                location: ChatAgentLocation.Chat, currentModeKind: ChatModeKind.Ask,
                isInlineChatV2Enabled: false, sessionType: undefined,
            }, allModels), false);
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdE1vZGVsU2VsZWN0aW9uTG9naWMudGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvdGVzdC9icm93c2VyL3dpZGdldC9pbnB1dC9jaGF0TW9kZWxTZWxlY3Rpb25Mb2dpYy50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUM1QixPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUN6RyxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSwrREFBK0QsQ0FBQztBQUNwRyxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsWUFBWSxFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFDbEYsT0FBTyxFQUFFLDBCQUEwQixFQUEyQyxNQUFNLHNDQUFzQyxDQUFDO0FBQzNILE9BQU8sRUFDTixzQkFBc0IsRUFDdEIsZ0JBQWdCLEVBQ2hCLHlCQUF5QixFQUN6Qiw2QkFBNkIsRUFDN0IsdUJBQXVCLEVBQ3ZCLHNCQUFzQixFQUN0QixvQkFBb0IsRUFDcEIseUJBQXlCLEVBQ3pCLHlCQUF5QixFQUN6Qiw0QkFBNEIsRUFDNUIsOEJBQThCLEVBQzlCLDJCQUEyQixHQUMzQixNQUFNLDZEQUE2RCxDQUFDO0FBRXJFOzs7R0FHRztBQUNILFNBQVMsc0JBQXNCLENBQzlCLFVBQXFELEVBQ3JELFlBQXVELEVBQ3ZELGtCQUErQixFQUMvQixXQUErQixFQUMvQixlQUE2QixFQUM3QixRQUEyQixFQUMzQixxQkFBOEI7SUFFOUIsTUFBTSxNQUFNLEdBQUcsb0JBQW9CLENBQUMsVUFBVSxFQUFFLFlBQVksRUFBRSxrQkFBa0IsQ0FBQyxDQUFDO0lBQ2xGLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FB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