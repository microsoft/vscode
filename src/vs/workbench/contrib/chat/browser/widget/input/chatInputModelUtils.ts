/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ChatAgentLocation, ChatModeKind } from '../../../common/constants.js';
import { ILanguageModelChatMetadata, ILanguageModelChatMetadataAndIdentifier, isLanguageModelVendorAbsenceConclusive } from '../../../common/languageModels.js';
import { resolveModelIdentifier } from '../../../common/modelSelection.js';

/**
 * Describes the context needed for model selection decisions.
 */
interface IModelSelectionContext {
	readonly location: ChatAgentLocation;
	readonly currentModeKind: ChatModeKind;
	readonly sessionType: string | undefined;
}

/**
 * Filter models based on session type.
 * When a session has a specific type (and it's not 'local'), only models targeting that
 * session type are returned. Otherwise, general-purpose models are returned.
 *
 * `isUserSelectable` defaults to `true` when omitted: only an explicit `false` hides
 * the model from the picker and this model-selection flow.
 */
export function filterModelsForSession(
	models: ILanguageModelChatMetadataAndIdentifier[],
	sessionType: string | undefined,
	currentModeKind: ChatModeKind,
	location: ChatAgentLocation,
): ILanguageModelChatMetadataAndIdentifier[] {
	if (sessionType && sessionType !== 'local' && hasModelsTargetingSession(models, sessionType)) {
		return models.filter(entry =>
			entry.metadata?.targetChatSessionType === sessionType &&
			entry.metadata?.isUserSelectable !== false
		);
	}

	return models.filter(entry =>
		!entry.metadata?.targetChatSessionType &&
		entry.metadata?.isUserSelectable !== false &&
		isModelSupportedForMode(entry, currentModeKind) &&
		isModelSupportedForInlineChat(entry, location)
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
): boolean {
	if (location !== ChatAgentLocation.EditorInline) {
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
 * Reconstructs the "Manage Models" identifier that an agent-host copy of an
 * extension-provided BYOK model is toggled under, or `undefined` when the model
 * is not such a copy. Re-exported from the shared `ILanguageModelChatMetadata`
 * namespace (which also backs the `common` model-visibility layer) so picker and
 * management code reconstruct the identifier the same way.
 */
export const getAgentHostByokManageModelsIdentifier = ILanguageModelChatMetadata.getAgentHostByokManageModelsIdentifier;

/**
 * Whether a model should be hidden from the picker given the user's Manage Models
 * visibility toggles. Matches the model by its own identifier and, for agent-host
 * copies of extension BYOK models, additionally by the reconstructed original
 * identifier (see {@link getAgentHostByokManageModelsIdentifier}) — which includes
 * any user-configured provider group carried across the bridge — so a BYOK model
 * hidden in Manage Models is also hidden in the agent-host picker.
 */
export function isModelHiddenInPicker(
	model: ILanguageModelChatMetadataAndIdentifier,
	isModelHidden: (identifier: string) => boolean,
): boolean {
	if (isModelHidden(model.identifier)) {
		return true;
	}
	const manageModelsIdentifier = getAgentHostByokManageModelsIdentifier(model.metadata);
	return manageModelsIdentifier !== undefined && isModelHidden(manageModelsIdentifier);
}

/**
 * Whether the selected model carried by the shared, session-type-agnostic untitled draft
 * (`chat.untitledInputState`) must be dropped before the draft is applied to an empty session
 * that is being opened.
 *
 * The draft is shared across all session types, so its `selectedModel` can belong to a
 * different pool in either direction — e.g. a `copilot/*` model leaking into an agent-host
 * session, or an `agent-host-*` model leaking into a general/local session. Applying such a
 * cross-pool model while the session is opening lets the sync resolve it to (and persist) a
 * wrong default over the destination pool's persisted model. Dropped when present but not valid
 * for `sessionType`; an in-pool draft model is kept. See
 * `chatInputPart._getPersistedEmptyInputState`.
 */
export function shouldDropAgnosticDraftModel(
	draftModel: ILanguageModelChatMetadataAndIdentifier | undefined,
	allModels: ILanguageModelChatMetadataAndIdentifier[],
	sessionType: string | undefined,
): boolean {
	return !!draftModel && !isModelValidForSession(draftModel, allModels, sessionType);
}

/**
 * Whether an {@link ILanguageModelChatMetadataAndIdentifier} selection should be written to the
 * persisted per-(location, sessionType) model storage key.
 *
 * A model selection is only persisted for an explicit request (`storeSelection`) that is NOT
 * happening while the input is switching to a session (`suppressDuringSessionSwitch`). While
 * switching, the model may be set in-memory (for the picker) and restored from the key, but must
 * never WRITE the key — only an explicit user action may. This is the single guard on
 * `chatInputPart`'s sole storage writer (`setCurrentLanguageModel`).
 */
export function shouldPersistModelSelection(storeSelection: boolean, suppressDuringSessionSwitch: boolean): boolean {
	return storeSelection && !suppressDuringSessionSwitch;
}

/**
 * Whether model-selection persistence must be suppressed while the input switches to a session.
 *
 * True for every empty session of an own-pool (agent-host) session type: the per-type key holds
 * the user's last explicit pick, and switching to the session must not clobber it via any of the
 * paths that run during the switch (draft sync, empty-state seeding, autorun default).
 * General/local (no own pool) is unaffected.
 */
export function shouldSuppressModelPersistenceOnSessionSwitch(isEmpty: boolean, sessionOwnsPool: boolean): boolean {
	return isEmpty && sessionOwnsPool;
}

/**
 * Whether the persisted per-session-type model should be restored (into the picker) when the
 * input switches to a session.
 *
 * True only for a FRESH untitled own-pool session — one with no incoming `selectedModel` in its
 * own input state. A session that already carries its own model (a transferred/handoff or
 * startup-restored draft) keeps that model in-memory and is left alone. Distinct from
 * {@link shouldSuppressModelPersistenceOnSessionSwitch}, which suppresses the STORAGE write for
 * ALL empty own-pool sessions regardless.
 */
export function shouldRestorePerTypeModelOnSessionSwitch(isEmpty: boolean, sessionOwnsPool: boolean, hadIncomingModel: boolean): boolean {
	return isEmpty && sessionOwnsPool && !hadIncomingModel;
}

/**
 * Whether the input should WAIT for a restored session's own remembered model to be contributed,
 * instead of falling back to the pool default.
 *
 * True when the session's remembered `desiredModel` belongs to this session's own pool (it
 * targets `sessionType`) but is not yet present in `allModels` — i.e. the session-type pool has
 * not finished loading at restore time (cold or partial). Waiting avoids persisting a transient
 * pool default (e.g. Haiku) over the session's remembered model (e.g. Opus) while the pool
 * settles. A model that does not belong to this session's pool returns false, so the caller
 * defaults instead of waiting forever.
 */
export function shouldWaitForSessionModel(
	desiredModel: ILanguageModelChatMetadataAndIdentifier,
	sessionType: string | undefined,
	allModels: ILanguageModelChatMetadataAndIdentifier[],
): boolean {
	if (!sessionType || desiredModel.metadata.targetChatSessionType !== sessionType) {
		return false;
	}
	return !allModels.some(m => m.identifier === desiredModel.identifier);
}

/**
 * Find a model in `pool` that matches `previous` by id, then family, then
 * name (case-insensitive). Used to carry a selection across model pools
 * (e.g. `copilot/claude-sonnet-4.6` → `agent-host-copilotcli:claude-sonnet-4.6`).
 * Returns `undefined` when no candidate matches.
 */
export function findBestMatchingModel(
	previous: ILanguageModelChatMetadataAndIdentifier | undefined,
	pool: readonly ILanguageModelChatMetadataAndIdentifier[],
): ILanguageModelChatMetadataAndIdentifier | undefined {
	if (!previous || pool.length === 0) {
		return undefined;
	}
	const id = previous.metadata.id?.trim().toLowerCase();
	const family = previous.metadata.family?.trim().toLowerCase();
	const name = previous.metadata.name?.trim().toLowerCase();
	return (id ? pool.find(m => m.metadata.id?.trim().toLowerCase() === id) : undefined)
		?? (family ? pool.find(m => m.metadata.family?.trim().toLowerCase() === family) : undefined)
		?? (name ? pool.find(m => m.metadata.name?.trim().toLowerCase() === name) : undefined);
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

export function findReplacementForProvisionalModel(
	currentModelId: string | undefined,
	provisionalModelId: string | undefined,
	models: readonly ILanguageModelChatMetadataAndIdentifier[],
	location: ChatAgentLocation,
): ILanguageModelChatMetadataAndIdentifier | undefined {
	if (!provisionalModelId || currentModelId !== provisionalModelId) {
		return undefined;
	}
	return models.find(model => model.metadata.isDefaultForLocation[location]);
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
	const resolution = resolveModelIdentifier(availableModels, persistedModelId, true);
	if (resolution.kind !== 'available') {
		return { shouldRestore: false, model: undefined };
	}
	const model = resolution.model;

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
	if (!isModelSupportedForInlineChat(currentModel, context.location)) {
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
	// Validate the state model belongs to this session's model pool first.
	if (!isModelValidForSession(stateModel, allModels, sessionType)) {
		return { action: 'default' };
	}

	// Already the same model and valid for the new pool — nothing to do
	if (currentModel && currentModel.identifier === stateModel.identifier) {
		return { action: 'keep' };
	}

	// When a UI context is available, also validate mode and inline-chat compatibility
	if (context) {
		if (!isModelSupportedForMode(stateModel, context.currentModeKind)) {
			return { action: 'default' };
		}
		if (!isModelSupportedForInlineChat(stateModel, context.location)) {
			return { action: 'default' };
		}
	}

	return { action: 'apply' };
}

/**
 * Merges live models with cached models per-vendor, evicting cache for vendors no longer contributed.
 *
 * - `resolvedVendors`: vendors that have finished resolving. An empty live list for these is authoritative
 *   (e.g. BYOK key removed), so their cache is dropped.
 * - Copilot is the exception: its models are gated on an async token that can resolve slower than fast/local BYOK
 *   providers, so an early empty resolution is transient. Keeping its cache avoids resetting (and persisting) a
 *   restored Copilot selection to a BYOK default, which also preserves the selection across sign-out/in (see #321037).
 * - When nothing is contributed yet and there are no live models (startup / reload), the full cache is returned to
 *   avoid flickering the picker to empty.
 */
export function mergeModelsWithCache(
	liveModels: ILanguageModelChatMetadataAndIdentifier[],
	cachedModels: ILanguageModelChatMetadataAndIdentifier[],
	contributedVendors: Set<string>,
	resolvedVendors?: ReadonlySet<string>,
): ILanguageModelChatMetadataAndIdentifier[] {
	if (contributedVendors.size === 0 && liveModels.length === 0) {
		return cachedModels;
	}
	const liveVendors = new Set(liveModels.map(m => m.metadata.vendor));
	const usableCached = cachedModels.filter(m => {
		const vendor = m.metadata.vendor;
		if (!contributedVendors.has(vendor) || liveVendors.has(vendor)) {
			return false;
		}
		if (isLanguageModelVendorAbsenceConclusive(vendor, liveVendors.has(vendor), resolvedVendors?.has(vendor) ?? false)) {
			return false;
		}
		return true;
	});
	return [...liveModels, ...usableCached];
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

