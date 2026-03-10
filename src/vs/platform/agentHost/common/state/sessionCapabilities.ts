/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Protocol version constants and capability derivation.
// See protocol.md -> Versioning for the full design.
//
// The authoritative version numbers and action-filtering logic live in
// versions/versionRegistry.ts. This file re-exports them and provides the
// capability-object API that client code uses to gate features.

export {
	ACTION_INTRODUCED_IN,
	isActionKnownToVersion,
	isNotificationKnownToVersion,
	MIN_PROTOCOL_VERSION,
	NOTIFICATION_INTRODUCED_IN,
	PROTOCOL_VERSION,
} from './versions/versionRegistry.js';

/**
 * Capabilities derived from a protocol version.
 * Core features (v1) are always-present literal `true`.
 * Features from later versions are optional `true | undefined`.
 */
export interface ProtocolCapabilities {
	// v1 — always present
	readonly sessions: true;
	readonly tools: true;
	readonly permissions: true;
}

/**
 * Derives the set of capabilities available at a given protocol version.
 * Newer clients use this to determine which features the server supports.
 */
export function capabilitiesForVersion(version: number): ProtocolCapabilities {
	if (version < 1) {
		throw new Error(`Unsupported protocol version: ${version}`);
	}

	return {
		sessions: true,
		tools: true,
		permissions: true,
		// Future versions add fields here:
		// ...(version >= 2 ? { reasoning: true as const } : {}),
	};
}
