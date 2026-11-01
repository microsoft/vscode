/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/microsoft/vscode/issues/340039

	export namespace LanguageModelError {

		/**
		 * The provider is rate limiting requests. When set, `retryAfter` is how many
		 * milliseconds to wait before retrying; convert HTTP `Retry-After` seconds.
		 */
		export function RateLimited(message?: string, retryAfter?: number): LanguageModelError;
	}

	export interface LanguageModelError {

		/** Milliseconds to wait before retrying; only set on {@link LanguageModelError.RateLimited RateLimited} errors. */
		readonly retryAfter?: number;
	}
}
