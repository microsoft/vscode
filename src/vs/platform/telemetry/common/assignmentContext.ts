/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const MAX_ASSIGNMENT_CONTEXT_LENGTH = 8 * 1024;
const ASSIGNMENT_CONTEXT_ENTRY_PATTERN = /^[^:;\s\x00-\x1F\x7F]+:[^;\x00-\x1F\x7F]+$/;

/**
 * Validates an experiment assignment context before it is trusted onto telemetry events.
 */
export function isValidAssignmentContext(value: string): boolean {
	if (value.length === 0 || value.length > MAX_ASSIGNMENT_CONTEXT_LENGTH) {
		return false;
	}

	const entries = value.endsWith(';') ? value.slice(0, -1).split(';') : value.split(';');
	return entries.length > 0 && entries.every(entry => ASSIGNMENT_CONTEXT_ENTRY_PATTERN.test(entry));
}
