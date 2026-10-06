/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/microsoft/vscode/issues/340039

	export namespace LanguageModelError {

		/**
		 * The language model provider is rate limiting requests. Consumers should wait before sending
		 * more requests, honoring {@link LanguageModelError.retryAfter retryAfter} when it is set.
		 *
		 * @param message A human-readable message describing the rate limit.
		 * @param retryAfter How long to wait before retrying, in milliseconds, if the provider knows.
		 */
		export function RateLimited(message?: string, retryAfter?: number): LanguageModelError;
	}

	export interface LanguageModelError {

		/**
		 * How long to wait before retrying, in milliseconds. Only set for
		 * {@link LanguageModelError.RateLimited RateLimited} errors whose provider supplied retry guidance.
		 * Providers that receive an HTTP `Retry-After` header, which is in seconds, convert it.
		 */
		readonly retryAfter?: number;
	}
}
