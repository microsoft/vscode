/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { ChatContextKeys } from './actions/chatContextKeys.js';
import { COPILOT_VENDOR_ID, ILanguageModelChatMetadata, ILanguageModelsService } from './languageModels.js';

/**
 * Storage key prefix for persisted model selections.
 * Full key format: `chat.currentLanguageModel.{location}[.{modelTarget}]`
 */
export const SELECTED_MODEL_STORAGE_KEY_PREFIX = 'chat.currentLanguageModel.';

export const SELECTED_MODEL_STORAGE_SCOPE = StorageScope.PROFILE;
export const SELECTED_MODEL_STORAGE_TARGET = StorageTarget.USER;

/**
 * Builds the storage key used to persist the selected language model for a
 * given chat location and optional model target.
 *
 * Shared by model-selection surfaces so they can read and write the explicit
 * remembered preference without depending on widget internals.
 */
export function getSelectedModelStorageKey(location: string, modelTarget?: string): string {
	if (modelTarget) {
		return `${SELECTED_MODEL_STORAGE_KEY_PREFIX}${location}.${modelTarget}`;
	}
	return `${SELECTED_MODEL_STORAGE_KEY_PREFIX}${location}`;
}

export function storeSelectedModel(
	storageService: IStorageService,
	location: string,
	modelTarget: string | undefined,
	identifier: string,
): void {
	storageService.store(getSelectedModelStorageKey(location, modelTarget), identifier, SELECTED_MODEL_STORAGE_SCOPE, SELECTED_MODEL_STORAGE_TARGET);
}

/** Reads the selected model and lazily migrates the previous application-scoped value. */
export function getStoredSelectedModel(
	storageService: IStorageService,
	location: string,
	modelTarget?: string,
): string | undefined {
	const key = getSelectedModelStorageKey(location, modelTarget);
	const isDefaultKey = `${key}.isDefault`;
	const identifier = storageService.get(key, SELECTED_MODEL_STORAGE_SCOPE);
	if (identifier) {
		const wasAutomaticDefault = storageService.getBoolean(isDefaultKey, SELECTED_MODEL_STORAGE_SCOPE);
		storageService.remove(isDefaultKey, SELECTED_MODEL_STORAGE_SCOPE);
		if (wasAutomaticDefault) {
			storageService.remove(key, SELECTED_MODEL_STORAGE_SCOPE);
			return undefined;
		}
		return identifier;
	}

	const legacyIdentifier = storageService.get(key, StorageScope.APPLICATION);
	if (!legacyIdentifier) {
		return undefined;
	}

	const wasAutomaticDefault = storageService.getBoolean(isDefaultKey, StorageScope.APPLICATION, true);
	storageService.remove(key, StorageScope.APPLICATION);
	storageService.remove(isDefaultKey, StorageScope.APPLICATION);
	if (wasAutomaticDefault) {
		return undefined;
	}

	storeSelectedModel(storageService, location, modelTarget, legacyIdentifier);
	return legacyIdentifier;
}

/**
 * Resolves the currently selected chat model identifier using a two-step
 * strategy:
 *
 * 1. Read the `chatModelId` context key (set when a chat widget is active).
 * 2. Fall back to the persisted explicit model preference.
 *
 * Returns the raw model identifier string (may include a vendor prefix like
 * `"copilot/gpt-4.1"` from storage, or a short id like `"gpt-4.1"` from
 * the context key), or `undefined` if no selection is available.
 */
export function getSelectedModelIdentifier(
	contextKeyService: IContextKeyService,
	storageService: IStorageService,
): string | undefined {
	// Step 1: Context key (live, widget-scoped)
	const contextKeyModelId = contextKeyService.getContextKeyValue<string>(ChatContextKeys.chatModelId.key);
	if (contextKeyModelId) {
		return contextKeyModelId;
	}

	// Step 2: Persisted explicit preference (survives reload)
	return getPersistedSelectedModelIdentifier(contextKeyService, storageService);
}

/**
 * Reads the persisted, fully-qualified model identifier written by a model
 * selection surface (e.g. `"copilot/gpt-4.1"` or `"customendpoint/ANT/gpt-4.1"`).
 *
 * Unlike the `chatModelId` context key (which holds only the short, lower-cased
 * model id), the persisted identifier carries the vendor and therefore
 * disambiguates the same model served via BYOK vs CAPI. Returns `undefined`
 * when no selection has been persisted.
 */
export function getPersistedSelectedModelIdentifier(
	contextKeyService: IContextKeyService,
	storageService: IStorageService,
): string | undefined {
	const location = contextKeyService.getContextKeyValue<string>(ChatContextKeys.location.key) ?? 'panel';
	const sessionType = contextKeyService.getContextKeyValue<string>(ChatContextKeys.chatSessionType.key) ?? '';
	const candidateKeys = sessionType
		? [sessionType, undefined]
		: [undefined];

	for (const modelTarget of candidateKeys) {
		const persisted = getStoredSelectedModel(storageService, location, modelTarget);
		if (persisted) {
			return persisted;
		}
	}

	return undefined;
}

/**
 * Resolves the registered metadata of the currently selected chat model.
 *
 * The selected identifier may be a fully-qualified id (e.g. `"copilot/gpt-4.1"`
 * from persisted storage) or a short, lower-cased model id (e.g. `"gpt-4.1"`
 * from the `chatModelId` context key, which is set to `metadata.id`). The short
 * id cannot disambiguate the same model served via BYOK vs CAPI, so when a
 * direct registry lookup fails we fall back to the persisted, fully-qualified
 * identifier (which carries the vendor) rather than matching on the short id.
 *
 * Returns `undefined` when no model is selected or the selection cannot be
 * resolved to a registered model (e.g. the provider has not been activated
 * yet); callers that only need the vendor can fall back to
 * {@link getSelectedModelVendor}.
 */
export function getSelectedModelMetadata(
	contextKeyService: IContextKeyService,
	storageService: IStorageService,
	languageModelsService: ILanguageModelsService,
): ILanguageModelChatMetadata | undefined {
	const modelId = getSelectedModelIdentifier(contextKeyService, storageService);
	if (!modelId) {
		return undefined;
	}

	// Direct registry lookup (handles fully-qualified identifiers).
	const direct = languageModelsService.lookupLanguageModel(modelId);
	if (direct) {
		return direct;
	}

	// The selected id was likely the short, lower-cased model id from the
	// `chatModelId` context key, which cannot distinguish a BYOK-served model
	// from the same model served via CAPI. Fall back to the persisted,
	// fully-qualified identifier which carries the vendor.
	const persistedId = getPersistedSelectedModelIdentifier(contextKeyService, storageService);
	if (persistedId && persistedId !== modelId) {
		return languageModelsService.lookupLanguageModel(persistedId);
	}

	return undefined;
}

/**
 * Resolves the vendor of the currently selected chat model.
 *
 * Tries the language model registry first (authoritative when models are
 * registered), then falls back to extracting the vendor prefix from the
 * persisted model identifier (e.g. `"copilot/gpt-4.1"` → `"copilot"`).
 *
 * Returns `undefined` if no model selection is available.
 */
export function getSelectedModelVendor(
	contextKeyService: IContextKeyService,
	storageService: IStorageService,
	languageModelsService: ILanguageModelsService,
): string | undefined {
	const metadata = getSelectedModelMetadata(contextKeyService, storageService, languageModelsService);
	if (metadata) {
		return metadata.vendor;
	}

	// Fall back to vendor prefix from the persisted identifier
	// (e.g. "copilot/gpt-4.1" or "customendpoint/ANT/claude-sonnet-4-6")
	const modelId = getSelectedModelIdentifier(contextKeyService, storageService);
	if (modelId?.includes('/')) {
		return modelId.split('/')[0];
	}

	return undefined;
}

/**
 * Returns whether the given model is a "bring your own key" (BYOK) model.
 *
 * BYOK models are served using user-supplied credentials and are flagged as
 * such by their provider via {@link ILanguageModelChatMetadata.isBYOK}. All
 * other models (built-in Copilot, Copilot/Claude CLI, and agent-host models)
 * are served through the Copilot (CAPI) service and are therefore not BYOK.
 */
export function isByokModel(metadata: ILanguageModelChatMetadata): boolean {
	return metadata.isBYOK === true;
}

/**
 * Returns whether the currently selected chat model is a Copilot model
 * (i.e. not BYOK).
 *
 * When the selection resolves to registered metadata this is the inverse of
 * {@link isByokModel}, so agent-host (CAPI-backed) models count as Copilot.
 * When no model is selected yet (widget not initialized) this returns `true`
 * so quota-style surfaces treat the unknown case as Copilot. As a last
 * resort, an unregistered selection is classified by its vendor prefix.
 */
export function isSelectedModelCopilot(
	contextKeyService: IContextKeyService,
	storageService: IStorageService,
	languageModelsService: ILanguageModelsService,
): boolean {
	const metadata = getSelectedModelMetadata(contextKeyService, storageService, languageModelsService);
	if (metadata) {
		return !isByokModel(metadata);
	}

	const vendor = getSelectedModelVendor(contextKeyService, storageService, languageModelsService);
	if (!vendor) {
		return true; // no selection → treat as Copilot
	}
	return vendor === COPILOT_VENDOR_ID;
}
