/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface WebviewKeyForwardingEvent {
	readonly keyEventId: string;
	readonly isTrusted: boolean;
}

/**
 * Accepts a key event only when the shell-issued id matches. Renderer-supplied `isTrusted` is not authorization.
 */
export function shouldForwardWebviewKeyEvent(expectedKeyEventId: string | undefined, event: WebviewKeyForwardingEvent, forwardUntrustedKeypressEvents: boolean): boolean {
	if (!expectedKeyEventId || event.keyEventId !== expectedKeyEventId) {
		return false;
	}
	return event.isTrusted || forwardUntrustedKeypressEvents;
}

export interface WebviewReadyAcceptance {
	readonly expectedReadyId: string | undefined;
	readonly readyId: unknown;
	readonly keyEventId: unknown;
	readonly source: MessageEventSource | null;
	readonly contentWindow: Window | null;
	readonly hasMessagePort: boolean;
}

/**
 * Accepts `webview-ready` only from the current shell document and mount.
 */
export function isAcceptedWebviewReady(ready: WebviewReadyAcceptance): boolean {
	if (!ready.expectedReadyId || ready.readyId !== ready.expectedReadyId) {
		return false;
	}
	if (typeof ready.keyEventId !== 'string' || ready.keyEventId.length === 0) {
		return false;
	}
	if (!ready.hasMessagePort || !ready.contentWindow || ready.source !== ready.contentWindow) {
		return false;
	}
	return true;
}
