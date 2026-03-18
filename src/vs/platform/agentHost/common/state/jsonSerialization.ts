/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Shared JSON serialization helpers for the sessions protocol.
// Used by both the server-side (Node `ws`) and client-side (browser WebSocket)
// transports to ensure consistent wire format.

import { URI } from '../../../../base/common/uri.js';

/**
 * JSON.stringify replacer that serializes {@link URI} instances
 * into a wire-friendly format.
 */
export function protocolReplacer(_key: string, value: unknown): unknown {
	if (value instanceof URI) {
		return value.toJSON();
	}
	return value;
}

/**
 * JSON.parse reviver that restores {@link URI} instances from their
 * serialized format.
 */
export function protocolReviver(_key: string, value: unknown): unknown {
	if (value && typeof value === 'object') {
		const obj = value as Record<string, unknown>;
		if (obj.$mid === 1) {
			return URI.revive(value as URI);
		}
	}
	return value;
}
