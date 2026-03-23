/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Version registry: re-exports protocol version constants and provides
// runtime action-filtering helpers using the local action union types.

import type { INotification, IStateAction } from '../sessionActions.js';

// Re-export version constants from the protocol.
export { MIN_PROTOCOL_VERSION, PROTOCOL_VERSION } from '../protocol/version/registry.js';

// ---- Runtime action → version map -------------------------------------------

/** Maps every action type string to the protocol version that introduced it. */
export const ACTION_INTRODUCED_IN: { readonly [K in IStateAction['type']]: number } = {
	// Root actions (v1)
	'root/agentsChanged': 1,
	'root/activeSessionsChanged': 1,
	// Session lifecycle (v1)
	'session/ready': 1,
	'session/creationFailed': 1,
	// Turn lifecycle (v1)
	'session/turnStarted': 1,
	'session/delta': 1,
	'session/responsePart': 1,
	// Tool calls (v1)
	'session/toolCallStart': 1,
	'session/toolCallDelta': 1,
	'session/toolCallReady': 1,
	'session/toolCallConfirmed': 1,
	'session/toolCallComplete': 1,
	'session/toolCallResultConfirmed': 1,
	// Permissions (v1)
	'session/permissionRequest': 1,
	'session/permissionResolved': 1,
	// Turn completion (v1)
	'session/turnComplete': 1,
	'session/turnCancelled': 1,
	'session/error': 1,
	// Metadata & informational (v1)
	'session/titleChanged': 1,
	'session/usage': 1,
	'session/reasoning': 1,
	'session/modelChanged': 1,
	// Server tools & active client (v1)
	'session/serverToolsChanged': 1,
	'session/activeClientChanged': 1,
	'session/activeClientToolsChanged': 1,
};

/** Maps every notification type string to the protocol version that introduced it. */
export const NOTIFICATION_INTRODUCED_IN: { readonly [K in INotification['type']]: number } = {
	'notify/sessionAdded': 1,
	'notify/sessionRemoved': 1,
	'notify/authRequired': 1,
};

// ---- Runtime filtering helpers ----------------------------------------------

/**
 * Returns `true` if the given action type is known to a client at `clientVersion`.
 */
export function isActionKnownToVersion(action: IStateAction, clientVersion: number): boolean {
	return ACTION_INTRODUCED_IN[action.type] <= clientVersion;
}

/**
 * Returns `true` if the given notification type is known to a client at `clientVersion`.
 */
export function isNotificationKnownToVersion(notification: INotification, clientVersion: number): boolean {
	return NOTIFICATION_INTRODUCED_IN[notification.type] <= clientVersion;
}
