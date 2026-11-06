/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Prefix of a model id that names the provider it is reached through. Harnesses
 * that offer one model through several providers (Codex, Claude) qualify their
 * model ids with it, so each provider's copy is a separately selectable model.
 */
const PROVIDER_QUALIFIED_MODEL_ID_PREFIX = '@provider=';

/**
 * Encodes a provider and model id as `@provider=<provider>:<modelId>`. Both halves
 * are url-encoded so names containing `:` or `/` round-trip cleanly.
 */
export function toProviderQualifiedModelId(provider: string, modelId: string): string {
	return `${PROVIDER_QUALIFIED_MODEL_ID_PREFIX}${encodeURIComponent(provider)}:${encodeURIComponent(modelId)}`;
}

/**
 * Splits an id made by {@link toProviderQualifiedModelId} into its provider and
 * model id. Returns `undefined` for a bare id, a prefixed id without a `:`
 * separator, or one whose halves fail to url-decode.
 */
export function parseProviderQualifiedModelId(id: string): { readonly provider: string; readonly modelId: string } | undefined {
	if (!id.startsWith(PROVIDER_QUALIFIED_MODEL_ID_PREFIX)) {
		return undefined;
	}
	const separator = id.indexOf(':', PROVIDER_QUALIFIED_MODEL_ID_PREFIX.length);
	if (separator === -1) {
		return undefined;
	}
	try {
		return {
			provider: decodeURIComponent(id.slice(PROVIDER_QUALIFIED_MODEL_ID_PREFIX.length, separator)),
			modelId: decodeURIComponent(id.slice(separator + 1)),
		};
	} catch {
		return undefined;
	}
}
