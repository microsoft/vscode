/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { SessionConfigPropertySchema } from './state/protocol/commands.js';

/**
 * Compose a session-config chip label from an optional title and a resolved value label.
 */
export function formatSessionConfigChipLabel(chipLabel: string | undefined, valueLabel: string): string {
	if (!chipLabel) {
		return valueLabel;
	}

	return `${chipLabel}: ${valueLabel}`;
}

/**
 * Read an optional `chipLabel` display extension from a session config schema.
 */
export function getSessionConfigChipLabel(schema: SessionConfigPropertySchema): string | undefined {
	const value = (schema as unknown as { chipLabel?: unknown }).chipLabel;
	return typeof value === 'string' ? value : undefined;
}
