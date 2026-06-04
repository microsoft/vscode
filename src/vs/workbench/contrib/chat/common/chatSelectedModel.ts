/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IStorageService, StorageScope } from '../../../../platform/storage/common/storage.js';
import { ChatContextKeys } from './actions/chatContextKeys.js';
import { ILanguageModelsService } from './languageModels.js';

/**
 * Storage key prefix for persisted model selections.
 * Full key format: `chat.currentLanguageModel.{location}[.{sessionType}]`
 */
export const SELECTED_MODEL_STORAGE_KEY_PREFIX = 'chat.currentLanguageModel.';

/**
 * Builds the storage key used to persist the selected language model for a
 * given chat location and optional session type.
 *
 * Matches the keys written by `chatInputPart.ts` so that other consumers
 * can read the persisted model selection without depending on widget internals.
 */
export function getSelectedModelStorageKey(location: string, sessionType?: string): string {
	if (sessionType) {
		return `${SELECTED_MODEL_STORAGE_KEY_PREFIX}${location}.${sessionType}`;
	}
	return `${SELECTED_MODEL_STORAGE_KEY_PREFIX}${location}`;
}

/**
 * Resolves the currently selected chat model identifier using a two-step
 * strategy:
 *
 * 1. Read the `chatModelId` context key (set when a chat widget is active).
 * 2. Fall back to the persisted storage value written by `chatInputPart`.
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

	// Step 2: Persisted storage (survives reload, written by chatInputPart)
	const location = contextKeyService.getContextKeyValue<string>(ChatContextKeys.location.key) ?? 'panel';
	const sessionType = contextKeyService.getContextKeyValue<string>(ChatContextKeys.chatSessionType.key) ?? '';
	const candidateKeys = sessionType
		? [getSelectedModelStorageKey(location, sessionType), getSelectedModelStorageKey(location)]
		: [getSelectedModelStorageKey(location)];

	for (const key of candidateKeys) {
		const persisted = storageService.get(key, StorageScope.APPLICATION);
		if (persisted) {
			return persisted;
		}
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
	const modelId = getSelectedModelIdentifier(contextKeyService, storageService);
	if (!modelId) {
		return undefined;
	}

	// Try registry lookup first (handles both short and qualified IDs)
	const shortId = modelId.includes('/') ? modelId.split('/').pop()! : modelId;
	const metadata = languageModelsService.lookupLanguageModel(shortId)
		?? languageModelsService.lookupLanguageModel(modelId);
	if (metadata) {
		return metadata.vendor;
	}

	// Fall back to vendor prefix from the persisted identifier
	// (e.g. "copilot/gpt-4.1" or "customendpoint/ANT/claude-sonnet-4-6")
	if (modelId.includes('/')) {
		return modelId.split('/')[0];
	}

	return undefined;
}
