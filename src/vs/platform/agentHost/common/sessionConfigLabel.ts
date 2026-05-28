/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { SessionConfigPropertySchema } from './state/protocol/commands.js';

/**
 * Compose a session-config chip label from a schema title and a resolved value label.
 */
export function formatSessionConfigChipLabel(showChipTitle: boolean | undefined, title: string, valueLabel: string): string {
	if (!showChipTitle) {
		return valueLabel;
	}

	return `${title}: ${valueLabel}`;
}

/**
 * Read whether a session config schema should render its title in compact chips.
 */
export function shouldShowSessionConfigChipTitle(schema: SessionConfigPropertySchema): boolean {
	const value = (schema as unknown as { showChipTitle?: unknown }).showChipTitle;
	return value === true;
}
