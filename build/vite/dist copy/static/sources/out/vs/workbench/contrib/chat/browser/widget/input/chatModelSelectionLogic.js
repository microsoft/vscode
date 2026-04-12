/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { ChatAgentLocation, ChatModeKind } from '../../../common/constants.js';
import { ILanguageModelChatMetadata } from '../../../common/languageModels.js';
/**
 * Filter models based on session type.
 * When a session has a specific type (and it's not 'local'), only models targeting that
 * session type are returned. Otherwise, general-purpose models are returned.
 */
export function filterModelsForSession(models, sessionType, currentModeKind, location, isInlineChatV2Enabled) {
    if (sessionType && sessionType !== 'local' && hasModelsTargetingSession(models, sessionType)) {
        return models.filter(entry => entry.metadata?.targetChatSessionType === sessionType &&
            entry.metadata?.isUserSelectable);
    }
    return models.filter(entry => !entry.metadata?.targetChatSessionType &&
        entry.metadata?.isUserSelectable &&
        isModelSupportedForMode(entry, currentModeKind) &&
        isModelSupportedForInlineChat(entry, location, isInlineChatV2Enabled));
}
/**
 * Check if a model is suitable for the current chat mode (e.g., agent mode requires tool calling).
 */
export function isModelSupportedForMode(model, currentModeKind) {
    if (currentModeKind === ChatModeKind.Agent) {
        return ILanguageModelChatMetadata.suitableForAgentMode(model.metadata);
    }
    return true;
}
/**
 * Check if a model is suitable for inline chat (editor inline) usage.
 */
export function isModelSupportedForInlineChat(model, location, isInlineChatV2Enabled) {
    if (location !== ChatAgentLocation.EditorInline || !isInlineChatV2Enabled) {
        return true;
    }
    return !!model.metadata.capabilities?.toolCalling;
}
/**
 * Check if any models in the pool target a specific session type.
 */
export function hasModelsTargetingSession(allModels, sessionType) {
    if (!sessionType) {
        return false;
    }
    return allModels.some(m => m.metadata.targetChatSessionType === sessionType);
}
/**
 * Check if a model is valid for the current session's model pool.
 * If the session has targeted models, the model must target that session type.
 * If no models target this session, the model must not be session-specific.
 */
export function isModelValidForSession(model, allModels, sessionType) {
    if (hasModelsTargetingSession(allModels, sessionType)) {
        return model.metadata.targetChatSessionType === sessionType;
    }
    return !model.metadata.targetChatSessionType;
}
/**
 * Find the default model for a given location from a list of models.
 * Prefers the model marked as default for the location, falls back to the first model.
 */
export function findDefaultModel(models, location) {
    return models.find(m => m.metadata.isDefaultForLocation[location]) || models[0];
}
/**
 * Determine whether a persisted model selection should be restored.
 *
 * A persisted model should be restored if:
 * 1. The model still exists in the available models list
 * 2. Either the model wasn't the default at the time it was persisted,
 *    OR it is currently the default for the location
 *
 * This prevents scenarios where a user's explicit model choice gets overridden
 * when the default model changes, while still tracking default model changes
 * for users who never explicitly chose a model.
 */
export function shouldRestorePersistedModel(persistedModelId, persistedAsDefault, availableModels, location) {
    const model = availableModels.find(m => m.identifier === persistedModelId);
    if (!model) {
        return { shouldRestore: false, model: undefined };
    }
    if (!persistedAsDefault || model.metadata.isDefaultForLocation[location]) {
        return { shouldRestore: true, model };
    }
    return { shouldRestore: false, model };
}
/**
 * Determines whether the current model should be reset because it is no longer
 * compatible with the current mode, session, or availability.
 *
 * Returns true if the model should be reset to default.
 */
export function shouldResetModelToDefault(currentModel, availableModels, context, allModels) {
    if (!currentModel) {
        return true;
    }
    // Model is no longer in the available list
    if (!availableModels.some(m => m.identifier === currentModel.identifier)) {
        return true;
    }
    // Model not supported for current mode
    if (!isModelSupportedForMode(currentModel, context.currentModeKind)) {
        return true;
    }
    // Model not supported for inline chat
    if (!isModelSupportedForInlineChat(currentModel, context.location, context.isInlineChatV2Enabled)) {
        return true;
    }
    // Model not valid for current session
    if (!isModelValidForSession(currentModel, allModels, context.sessionType)) {
        return true;
    }
    return false;
}
/**
 * Determines whether a model from a sync state should be applied to the current view.
 *
 * Returns an action:
 * - `'keep'`    - the view already has the same model; no change needed.
 * - `'apply'`   - the state model is valid; the caller should switch to it.
 * - `'default'` - the state model is incompatible (wrong session pool, unsupported
 *                 mode, or missing inline-chat capability); the caller should fall
 *                 back to the default model for the current location.
 *
 * @param context Optional because some callers (e.g. unit tests, or code paths
 *   that only care about session-pool validation) don't have a full UI context
 *   available. When omitted, mode and inline-chat checks are skipped and only
 *   session-pool membership is validated.
 */
export function resolveModelFromSyncState(stateModel, currentModel, allModels, sessionType, context) {
    // Already the same model — nothing to do
    if (currentModel && currentModel.identifier === stateModel.identifier) {
        return { action: 'keep' };
    }
    // Validate the state model belongs to this session's model pool
    if (!isModelValidForSession(stateModel, allModels, sessionType)) {
        return { action: 'default' };
    }
    // When a UI context is available, also validate mode and inline-chat compatibility
    if (context) {
        if (!isModelSupportedForMode(stateModel, context.currentModeKind)) {
            return { action: 'default' };
        }
        if (!isModelSupportedForInlineChat(stateModel, context.location, context.isInlineChatV2Enabled)) {
            return { action: 'default' };
        }
    }
    return { action: 'apply' };
}
/**
 * Merges live models with cached models per-vendor.
 * For vendors whose models have resolved, uses live data.
 * For vendors that are contributed but haven't resolved yet (startup race), keeps cached models.
 * Vendors no longer contributed are evicted from cache.
 */
export function mergeModelsWithCache(liveModels, cachedModels, contributedVendors) {
    if (liveModels.length > 0) {
        const liveVendors = new Set(liveModels.map(m => m.metadata.vendor));
        return [
            ...liveModels,
            ...cachedModels.filter(m => !liveVendors.has(m.metadata.vendor) && contributedVendors.has(m.metadata.vendor)),
        ];
    }
    return cachedModels;
}
/**
 * Determines whether the currently selected model should be reset to default
 * when the language model list changes.
 *
 * Returns true if the model should be reset to default (i.e., the selected model
 * is no longer in the available models list).
 */
export function shouldResetOnModelListChange(currentModelId, availableModels) {
    if (!currentModelId) {
        return true;
    }
    return !availableModels.some(m => m.identifier === currentModelId);
}
/**
 * Determines whether a late-arriving persisted model should be restored.
 * This handles the startup race where the model wasn't available during
 * `initSelectedModel` but arrives later via `onDidChangeLanguageModels`.
 *
 * The model must pass both the persisted-default check and the `isUserSelectable` check.
 */
export function shouldRestoreLateArrivingModel(persistedModelId, persistedAsDefault, model, location) {
    if (!model.metadata.isUserSelectable) {
        return false;
    }
    const result = shouldRestorePersistedModel(persistedModelId, persistedAsDefault, [model], location);
    return result.shouldRestore;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdE1vZGVsU2VsZWN0aW9uTG9naWMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9jaGF0L2Jyb3dzZXIvd2lkZ2V0L2lucHV0L2NoYXRNb2RlbFNlbGVjdGlvbkxvZ2ljLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxZQUFZLEVBQUUsTUFBTSw4QkFBOEIsQ0FBQztBQUMvRSxPQUFPLEVBQUUsMEJBQTBCLEVBQTJDLE1BQU0sbUNBQW1DLENBQUM7QUFZeEg7Ozs7R0FJRztBQUNILE1BQU0sVUFBVSxzQkFBc0IsQ0FDckMsTUFBaUQsRUFDakQsV0FBK0IsRUFDL0IsZUFBNkIsRUFDN0IsUUFBMkIsRUFDM0IscUJBQThCO0lBRTlCLElBQUksV0FBVyxJQUFJLFdBQVcsS0FBSyxPQUFPLElBQUkseUJBQXlCLENBQUMsTUFBTSxFQUFFLFdBQVcsQ0FBQyxFQUFFLENBQUM7UUFDOUYsT0FBTyxNQUFNLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQzVCLEtBQUssQ0FBQyxRQUFRLEVBQUUscUJBQXFCLEtBQUssV0FBVztZQUNyRCxLQUFLLENBQUMsUUFBUSxFQUFFLGdCQUFnQixDQUNoQyxDQUFDO0lBQ0gsQ0FBQztJQUVELE9BQU8sTUFBTSxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUM1QixDQUFDLEtBQUssQ0FBQyxRQUFRLEVBQUUscUJBQXFCO1FBQ3RDLEtBQUssQ0FBQyxRQUFRLEVBQUUsZ0JBQWdCO1FBQ2hDLHVCQUF1QixDQUFDLEtBQUssRUFBRSxlQUFlLENBQUM7UUFDL0MsNkJBQTZCLENBQUMsS0FBSyxFQUFFLFFBQVEsRUFBRSxxQkFBcUIsQ0FBQyxDQUNyRSxDQUFDO0FBQ0gsQ0FBQztBQUVEOztHQUVHO0FBQ0gsTUFBTSxV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