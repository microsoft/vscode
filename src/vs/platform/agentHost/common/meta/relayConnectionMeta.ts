/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/** Connection-scoped relay metadata; absence preserves the ordinary host behavior. */
export function isPassiveRelayConnection(result: { readonly _meta?: Record<string, unknown> } | undefined): boolean {
	return result?._meta?.['copilot.passive'] === true;
}

/** A positive advertised inbound-idle window, not the client's response timeout. */
export function readRelayKeepAliveTimeout(result: { readonly _meta?: Record<string, unknown> } | undefined): number | undefined {
	const value = result?._meta?.['copilot.keepAliveTimeoutMs'];
	return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : undefined;
}
