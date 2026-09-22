/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CancellationToken } from 'vscode';
import { ILogService } from '../../../platform/log/common/logService';
import { createServiceIdentifier } from '../../../util/common/services';
import { CancellationError, isCancellationError } from '../../../util/vs/base/common/errors';
import { IDisposable, toDisposable } from '../../../util/vs/base/common/lifecycle';
import { mergeRequestHeaders } from './requestHeaders';

export const ILanguageModelRequestMiddlewareRegistry = createServiceIdentifier<ILanguageModelRequestMiddlewareRegistry>('ILanguageModelRequestMiddlewareRegistry');

/**
 * Describes the language model request that middleware is being invoked for.
 */
export interface LanguageModelRequestContext {
	/** The BYOK provider id the request is sent through, e.g. `customendpoint` or `openai`. */
	readonly vendor: string;
	/** The id of the selected model. */
	readonly modelId: string;
	/** The fully resolved URL the request is sent to, e.g. `https://gateway.example.com/v1/chat/completions`. */
	readonly url: string;
	/** The name of the provider group the model was configured in; `undefined` for models requested without a group. */
	readonly providerGroup: string | undefined;
	/** Who initiated the request, e.g. `core` for chat or an extension id for `vscode.lm` callers. */
	readonly requestInitiator: string;
	/** Cancelled when the language model request is cancelled. */
	readonly cancellationToken: CancellationToken;
}

/**
 * Limits which requests a middleware is invoked for. Every property that is set
 * must match; a property that is left `undefined` matches everything.
 */
export interface LanguageModelRequestMiddlewareSelector {
	readonly vendors?: readonly string[];
	readonly modelIds?: readonly string[];
	readonly providerGroups?: readonly string[];
}

/**
 * Contributes request-scoped headers to language model requests.
 */
export interface LanguageModelRequestMiddleware {
	readonly selector?: LanguageModelRequestMiddlewareSelector;
	/**
	 * `continue` (the default) drops this middleware's headers when it throws or
	 * times out. `fail` fails the language model request instead.
	 */
	readonly errorBehavior?: 'continue' | 'fail';
	readonly provideRequestHeaders: (context: LanguageModelRequestContext) => Promise<Readonly<Record<string, string>>>;
}

/**
 * Collects request-scoped headers from registered middleware for outgoing
 * language model requests.
 */
export interface ILanguageModelRequestMiddlewareRegistry {
	readonly _serviceBrand: undefined;

	/**
	 * Registers middleware. Disposing the result unregisters it; the outcome of
	 * an invocation that is still in flight at that point, headers or error, is
	 * discarded.
	 */
	register(middleware: LanguageModelRequestMiddleware): IDisposable;

	/**
	 * Invokes every middleware whose selector matches `context`, concurrently,
	 * each with its own frozen copy of `context` so that no middleware can alter
	 * what another one sees, and merges the results in registration order. Later registrations win
	 * for headers with the same name (compared case-insensitively). Header
	 * names are not filtered here: the endpoint sanitises them with the same
	 * rules it applies to `requestHeaders` from the model configuration.
	 *
	 * @throws {CancellationError} when `context.cancellationToken` is cancelled.
	 * @throws the middleware's error when a middleware with `errorBehavior: 'fail'` fails or times out.
	 */
	provideRequestHeaders(context: LanguageModelRequestContext): Promise<Record<string, string>>;
}

/**
 * How long a single middleware may take to provide its headers.
 */
export const languageModelRequestMiddlewareTimeoutMs = 10_000;

interface RegisteredMiddleware {
	readonly middleware: LanguageModelRequestMiddleware;
	disposed: boolean;
}

export class LanguageModelRequestMiddlewareRegistry implements ILanguageModelRequestMiddlewareRegistry {
	declare readonly _serviceBrand: undefined;

	private readonly _middleware: RegisteredMiddleware[] = [];

	constructor(
		@ILogService private readonly _logService: ILogService,
	) { }

	register(middleware: LanguageModelRequestMiddleware): IDisposable {
		const registered: RegisteredMiddleware = { middleware, disposed: false };
		this._middleware.push(registered);
		this._logService.info(`[LanguageModelRequestMiddleware] Registered middleware for ${describeSelector(middleware.selector)} (errorBehavior: ${middleware.errorBehavior ?? 'continue'}).`);

		return toDisposable(() => {
			registered.disposed = true;
			const index = this._middleware.indexOf(registered);
			if (index !== -1) {
				this._middleware.splice(index, 1);
			}
		});
	}

	async provideRequestHeaders(context: LanguageModelRequestContext): Promise<Record<string, string>> {
		const matching = this._middleware.filter(registered => matchesSelector(registered.middleware.selector, context));
		if (matching.length === 0) {
			return {};
		}

		const results = await Promise.allSettled(matching.map(registered => this._invoke(registered.middleware, context)));
		if (context.cancellationToken.isCancellationRequested) {
			throw new CancellationError();
		}

		const headers: Record<string, string> = {};
		for (let i = 0; i < matching.length; i++) {
			const registered = matching[i];
			const result = results[i];
			if (registered.disposed) {
				continue;
			}
			if (result.status === 'rejected') {
				if (isCancellationError(result.reason) || registered.middleware.errorBehavior === 'fail') {
					throw result.reason;
				}
				this._logService.warn(`[LanguageModelRequestMiddleware] Middleware for ${describeSelector(registered.middleware.selector)} failed for ${context.vendor}/${context.modelId}; its headers are dropped: ${toErrorMessage(result.reason)}`);
				continue;
			}
			mergeRequestHeaders(headers, result.value);
		}

		const names = Object.keys(headers);
		if (names.length > 0) {
			this._logService.debug(`[LanguageModelRequestMiddleware] Contributed headers for ${context.vendor}/${context.modelId} (${context.requestInitiator}): ${names.join(', ')}`);
		}
		return headers;
	}

	private async _invoke(middleware: LanguageModelRequestMiddleware, context: LanguageModelRequestContext): Promise<Readonly<Record<string, string>>> {
		if (context.cancellationToken.isCancellationRequested) {
			throw new CancellationError();
		}

		let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
		let cancellationListener: IDisposable | undefined;
		try {
			const timeout = new Promise<never>((_, reject) => {
				timeoutHandle = setTimeout(() => reject(new Error(`Language model request middleware timed out after ${languageModelRequestMiddlewareTimeoutMs}ms.`)), languageModelRequestMiddlewareTimeoutMs);
			});
			const cancellation = new Promise<never>((_, reject) => {
				cancellationListener = context.cancellationToken.onCancellationRequested(() => reject(new CancellationError()));
			});
			// Each middleware gets its own frozen copy: a shared object would let one
			// registration change the URL another one validates before returning a credential.
			const ownContext = Object.freeze({ ...context });
			// Promise.resolve guards against providers that throw synchronously.
			return await Promise.race([Promise.resolve().then(() => middleware.provideRequestHeaders(ownContext)), timeout, cancellation]);
		} finally {
			if (timeoutHandle !== undefined) {
				clearTimeout(timeoutHandle);
			}
			cancellationListener?.dispose();
		}
	}
}

function matchesSelector(selector: LanguageModelRequestMiddlewareSelector | undefined, context: LanguageModelRequestContext): boolean {
	if (!selector) {
		return true;
	}

	return (selector.vendors === undefined || selector.vendors.includes(context.vendor))
		&& (selector.modelIds === undefined || selector.modelIds.includes(context.modelId))
		&& (selector.providerGroups === undefined || (context.providerGroup !== undefined && selector.providerGroups.includes(context.providerGroup)));
}

function describeSelector(selector: LanguageModelRequestMiddlewareSelector | undefined): string {
	const vendors = selector?.vendors?.join(', ') ?? '*';
	const modelIds = selector?.modelIds?.join(', ') ?? '*';
	const providerGroups = selector?.providerGroups?.join(', ') ?? '*';
	return `vendors [${vendors}] models [${modelIds}] groups [${providerGroups}]`;
}

function toErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
