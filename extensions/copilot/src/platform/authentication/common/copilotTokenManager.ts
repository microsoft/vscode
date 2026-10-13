/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createServiceIdentifier } from '../../../util/common/services';
import { Event } from '../../../util/vs/base/common/event';
import { CopilotToken, TokenError, TokenErrorReason } from './copilotToken';

export const ICopilotTokenManager = createServiceIdentifier<ICopilotTokenManager>('ICopilotTokenManager');

/**
 * @deprecated Use `IAuthenticationService` instead
 */
export interface ICopilotTokenManager {

	readonly _serviceBrand: undefined;

	/**
	 * Event emitter that will fire an event every time a token refresh is requested.
	 *
	 * This is used for example in the repo enablement code (lib/src/enablement.ts),
	 * where we need to clear the list of cached repos whenever we request a new token.
	 */
	readonly onDidCopilotTokenRefresh: Event<void>;

	/**
	 * Return a currently valid Copilot token, retrieving a fresh one if
	 * necessary.
	 *
	 * Note that a Copilot token manager should not provide a Copilot token unless
	 * telemetry consent has been obtained. If this is not checked by the token manager
	 * implementation itself, then anything constructing or initialising it should not
	 * do so without checking this. force will force a refresh of the token, even not expired
	 */
	getCopilotToken(force?: boolean): Promise<CopilotToken>;

	/**
	 * Drop the current Copilot token as we received an HTTP error while trying
	 * to use it that indicates it's no longer valid.
	 */
	resetCopilotToken(httpError?: number): void;
}

export function nowSeconds(): number {
	return Math.floor(Date.now() / 1000);
}

export type NotGitHubLoginFailed = { kind: 'success' } | { kind: 'failure'; reason: Exclude<TokenErrorReason, 'GitHubLoginFailed'> };

//#region Testing Copilot Token Mangers

/** Intended for use as an add-on to `CopilotTokenManager`,
 *  that checks that a valid Copilot token is available. For tests.
 */
export interface CheckCopilotToken {
	/** Check that the object has access to a valid Copilot token. */
	checkCopilotToken(): Promise<{ status: 'OK' } | (TokenError & { reason: Exclude<TokenErrorReason, 'GitHubLoginFailed'> })>;
}
