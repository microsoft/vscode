/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IConfigurationService } from '../../configuration/common/configurationService';

export const CHAT_EMBEDDING_MODEL_CONFIG_KEY = 'chat.embeddingModel';

/** Sentinel auth token used for local BYOK chunking (no GitHub session required). */
export const BYOK_CHUNKING_AUTH_TOKEN = 'byok';

export function getByokEmbeddingModelOverride(configurationService: IConfigurationService): string | undefined {
	const raw = configurationService.getNonExtensionConfig<string>(CHAT_EMBEDDING_MODEL_CONFIG_KEY);
	if (typeof raw === 'string' && raw.length > 0 && !raw.startsWith('copilot.')) {
		return raw;
	}
	return undefined;
}

export function isByokEmbeddingModelConfigured(configurationService: IConfigurationService): boolean {
	return getByokEmbeddingModelOverride(configurationService) !== undefined;
}
