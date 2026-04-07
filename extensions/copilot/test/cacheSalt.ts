/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// These values are used as input for computing sha256 hashes for caching.
// Bump them to regenerate new cache entries or when the cache object shape changes.

/**
 * Used for all ChatML requests (all models).
 */
export const CHAT_ML_CACHE_SALT_PER_MODEL: Record<string, string> = {
	'DEFAULT': '2024-07-04T07:37:00Z',
	'copilot-nes-oct': '2026-02-10T12:14:18.526Z',
};

/**
 * Used for all NES requests.
 */
export const OPENAI_FETCHER_CACHE_SALT: { getByUrl: (url: string) => string } = new class {
	private readonly _cacheSaltByUrl: Record<string, string> = Object.freeze({
		// Other endpoints
		'DEFAULT': '2024-09-25T11:25:00Z',
	});

	getByUrl(url: string): string {
		if (url in this._cacheSaltByUrl) {
			return this._cacheSaltByUrl[url];
		} else {
			return this._cacheSaltByUrl['DEFAULT'];
		}
	}
};

/**
 * Used for all Code Search requests.
 */
export const CODE_SEARCH_CACHE_SALT = '';

/**
 * Used for all diagnostics providers.
 */
export const CACHING_DIAGNOSTICS_PROVIDER_CACHE_SALT = 4;

/**
 * Used by the clang diagnostics provider.
 */
export const CLANG_DIAGNOSTICS_PROVIDER_CACHE_SALT = 5;

/**
 * Used by the TS diagnostics provider.
 */
export const TS_SERVER_DIAGNOSTICS_PROVIDER_CACHE_SALT = 5;

/**
 * Used by `isValidPythonFile`.
 */
export const PYTHON_VALID_SYNTAX_CACHE_SALT = 2;

/**
 * Used by `canExecutePythonCodeWithoutErrors`.
 */
export const PYTHON_EXECUTES_WITHOUT_ERRORS = 2;

/**
 * Used by `isValidNotebookCell`.
 */
export const NOTEBOOK_CELL_VALID_CACHE_SALT = 1;


/**
 * Used for all Chunking Endpoint requests.
 */
export const CHUNKING_ENDPOINT_CACHE_SALT = '';
