/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { ChatContextKeys } from './actions/chatContextKeys.js';
import { ILanguageModelChatMetadata } from './languageModels.js';

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
 * Returns whether the given model is "bring your own key", i.e. served with the user's own
 * credentials. Agent-host copies carry `byokModelIdentifier` instead of setting `isBYOK`.
 */
export function isByokModel(metadata: ILanguageModelChatMetadata): boolean {
	return metadata.isBYOK === true || metadata.byokModelIdentifier !== undefined;
}
