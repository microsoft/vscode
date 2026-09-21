/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken, Disposable, TextEditor } from 'vscode';

/**
 * The API provided by the Copilot extension.
 */
export interface CopilotExtensionApi {
	/**
	 * Registers middleware that contributes request-scoped HTTP headers to language
	 * model requests sent by the OpenAI-compatible "bring your own key" providers
	 * (`openai`, `azure`, `ollama`, `openrouter`, `xai`, `customoai` and
	 * `customendpoint`). Typical uses are proxy routing, tracing and session
	 * correlation headers for gateways such as LiteLLM.
	 *
	 * Every registered middleware whose {@link LanguageModelRequestMiddleware.selector selector}
	 * matches a request is invoked once per request, concurrently with the other
	 * matching middleware. Results are merged in registration order, so a later
	 * registration wins when two middleware set the same header (header names are
	 * compared case-insensitively). Middleware headers also override headers with
	 * the same name from the user's model configuration.
	 *
	 * Middleware may set the same headers as the model's `requestHeaders`
	 * configuration, and they pass through the same sanitiser. For the
	 * `customendpoint` provider that includes `Authorization` and `api-key`,
	 * which replace the configured credential; the other providers keep their
	 * own credential. Headers owned by the transport are always dropped and
	 * logged: `Content-Type`, request identification headers such as
	 * `X-Request-Id`, forbidden request headers such as `Host` or `Cookie`, and
	 * any `Proxy-*` or `Sec-*` header. At most 20 headers per request are
	 * applied.
	 *
	 * Available since API version 2, i.e. `getAPI(2)`.
	 *
	 * @param middleware The middleware to register.
	 * @returns A disposable that unregisters the middleware.
	 */
	registerLanguageModelRequestMiddleware: (middleware: LanguageModelRequestMiddleware) => Disposable;

	/**
	 *
	 * @param editor - The optional text editor to select the scope in. If not provided, the active text editor will be used.
	 * @param options - Additional options for selecting the scope.
	 * @param options.reason - The reason for selecting the scope. Will be used in the placeholder hint.
	 * @returns A promise that resolves to the selected scope as a `Selection` object, or `undefined` if no scope was selected.
	 */
	selectScope: (editor?: TextEditor, options?: { reason?: string }) => Promise<Selection | undefined>;
}

/**
 * Describes the language model request that a
 * {@link LanguageModelRequestMiddleware} is invoked for.
 */
export interface LanguageModelRequestContext {
	/**
	 * The id of the provider the request is sent through, e.g. `openai` or
	 * `customendpoint`. Matches the `vendor` of the corresponding
	 * `vscode.LanguageModelChat`.
	 */
	readonly vendor: string;
	/**
	 * The id of the model the request is sent to, as configured for the provider.
	 */
	readonly modelId: string;
	/**
	 * Who initiated the request: `core` for requests made by chat itself, or the
	 * id of the extension that called `vscode.lm`.
	 */
	readonly requestInitiator: string;
	/**
	 * Cancelled when the language model request is cancelled. Middleware should
	 * stop work and may reject when this fires.
	 */
	readonly cancellationToken: CancellationToken;
}

/**
 * Limits the requests a {@link LanguageModelRequestMiddleware} is invoked for.
 * All properties that are set must match; a property that is left out matches
 * every request.
 */
export interface LanguageModelRequestMiddlewareSelector {
	/**
	 * Provider ids to match, see {@link LanguageModelRequestContext.vendor}.
	 */
	readonly vendors?: readonly string[];
	/**
	 * Model ids to match, see {@link LanguageModelRequestContext.modelId}.
	 */
	readonly modelIds?: readonly string[];
}

/**
 * Contributes request-scoped HTTP headers to language model requests, see
 * {@link CopilotExtensionApi.registerLanguageModelRequestMiddleware}.
 */
export interface LanguageModelRequestMiddleware {
	/**
	 * Which requests to contribute to. When omitted, the middleware is invoked
	 * for every request of every participating provider.
	 */
	readonly selector?: LanguageModelRequestMiddlewareSelector;
	/**
	 * What happens when {@link provideRequestHeaders} rejects, throws or does not
	 * settle within 10 seconds:
	 * - `continue` (the default): the headers of this middleware are dropped, a
	 *   warning is logged, and the request proceeds.
	 * - `fail`: the language model request fails with the middleware's error.
	 */
	readonly errorBehavior?: 'continue' | 'fail';
	/**
	 * Provides the headers to add to the request. Called once per matching
	 * request. Values must be strings without control characters; invalid
	 * entries and protected header names are dropped and logged.
	 */
	readonly provideRequestHeaders: (context: LanguageModelRequestContext) => Thenable<Readonly<Record<string, string>>>;
}
