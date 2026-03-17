/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Protocol version constants and capability derivation.
// Re-exports from the synced protocol version registry.

export {
	ACTION_INTRODUCED_IN,
	isActionKnownToVersion,
	NOTIFICATION_INTRODUCED_IN,
	isNotificationKnownToVersion,
	MIN_PROTOCOL_VERSION,
	PROTOCOL_VERSION,
	capabilitiesForVersion,
} from './protocol/version/registry.js';

export type { ProtocolCapabilities } from './protocol/version/registry.js';
