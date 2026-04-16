/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ChatAgentLocation, ChatModeKind } from '../../../common/constants.js';
import { ILanguageModelChatMetadata, ILanguageModelChatMetadataAndIdentifier } from '../../../common/languageModels.js';

/**
 * Describes the context needed for model selection decisions.
 */
interface IModelSelectionContext {
	readonly location: ChatAgentLocation;
	readonly currentModeKind: ChatModeKind;
	readonly isInlineChatV2Enabled: boolean;
	readonly sessionType: string | undefined;
}

/**
 * Filter models based on session type.
 * When a session has a specific type (and it's not 'local'), only models targeting that
 * session type are returned. Otherwise, general-purpose models are returned.
 */
export function filterModelsForSession(
	models: ILanguageModelChatMetadataAndIdentifier[],
	sessionType: string | undefined,
	currentModeKind: ChatModeKind,
	location: ChatAgentLocation,
	isInlineChatV2Enabled: boolean,
): ILanguageModelChatMetadataAndIdentifier[] {
	if (sessionType && sessionType !== 'local' && hasModelsTargetingSession(models, sessionType)) {
		return models.filter(entry =>
			entry.metadata?.targetChatSessionType === sessionType &&
			entry.metadata?.isUserSelectable
		);
	}

	return models.filter(entry =>
		!entry.metadata?.targetChatSessionType &&
		entry.metadata?.isUserSelectable &&
		isModelSupportedForMode(entry, currentModeKind) &&
		isModelSupportedForInlineChat(entry, location, isInlineChatV2Enabled)
	);
}

/**
 * Check if a model is suitable for the current chat mode (e.g., agent mode requires tool calling).
 */
export function isModelSupportedForMode(
	model: ILanguageModelChatMetadataAndIdentifier,
	currentModeKind: ChatModeKind,
): boolean {
	if (currentModeKind === ChatModeKind.Agent) {
		return ILanguageModelChatMetadata.suitableForAgentMode(model.metadata);
	}
	return true;
}

/**
 * Check if a model is suitable for inline chat (editor inline) usage.
 */
export function isModelSupportedForInlineChat(
	model: ILanguageModelChatMetadataAndIdentifier,
	location: ChatAgentLocation,
	isInlineChatV2Enabled: boolean,
): boolean {
	if (location !== ChatAgentLocation.EditorInline || !isInlineChatV2Enabled) {
		return true;
	}
	return !!model.metadata.capabilities?.toolCalling;
}

/**
 * Check if any models in the pool target a specific session type.
 */
export function hasModelsTargetingSession(
	allModels: ILanguageModelChatMetadataAndIdentifier[],
	sessionType: string | undefined,
): boolean {
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
export function isModelValidForSession(
	model: ILanguageModelChatMetadataAndIdentifier,
	allModels: ILanguageModelChatMetadataAndIdentifier[],
	sessionType: string | undefined,
): boolean {
	if (hasModelsTargetingSession(allModels, sessionType)) {
		return model.metadata.targetChatSessionType === sessionType;
	}
	return !model.metadata.targetChatSessionType;
}

/**
 * Find the default model for a given location from a list of models.
 * Prefers the model marked as default for the location, falls back to the first model.
 */
export function findDefaultModel(
	models: ILanguageModelChatMetadataAndIdentifier[],
	location: ChatAgentLocation,
): ILanguageModelChatMetadataAndIdentifier | undefined {
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
export function shouldRestorePersistedModel(
	persistedModelId: string,
	persistedAsDefault: boolean,
	availableModels: ILanguageModelChatMetadataAndIdentifier[],
	location: ChatAgentLocation,
): { shouldRestore: boolean; model: ILanguageModelChatMetadataAndIdentifier | undefined } {
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
export function shouldResetModelToDefault(
	currentModel: ILanguageModelChatMetadataAndIdentifier | undefined,
	availableModels: ILanguageModelChatMetadataAndIdentifier[],
	context: IModelSelectionContext,
	allModels: ILanguageModelChatMetadataAndIdentifier[],
): boolean {
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
export function resolveModelFromSyncState(
	stateModel: ILanguageModelChatMetadataAndIdentifier,
	currentModel: ILanguageModelChatMetadataAndIdentifier | undefined,
	allModels: ILanguageModelChatMetadataAndIdentifier[],
	sessionType: string | undefined,
	context?: IModelSelectionContext,
): { action: 'keep' | 'apply' | 'default' } {
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
export function mergeModelsWithCache(
	liveModels: ILanguageModelChatMetadataAndIdentifier[],
	cachedModels: ILanguageModelChatMetadataAndIdentifier[],
	contributedVendors: Set<string>,
): ILanguageModelChatMetadataAndIdentifier[] {
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
export function shouldResetOnModelListChange(
	currentModelId: string | undefined,
	availableModels: ILanguageModelChatMetadataAndIdentifier[],
): boolean {
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
export function shouldRestoreLateArrivingModel(
	persistedModelId: string,
	persistedAsDefault: boolean,
	model: ILanguageModelChatMetadataAndIdentifier,
	location: ChatAgentLocation,
): boolean {
	if (!model.metadata.isUserSelectable) {
		return false;
	}
	const result = shouldRestorePersistedModel(
		persistedModelId,
		persistedAsDefault,
		[model],
		location,
	);
	return result.shouldRestore;
}
