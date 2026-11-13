/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Gets how terminal auto-approve rule keys are written, for telemetry that must
 * not contain rule text: `regex` for `/pattern/flags` keys, `path` for keys
 * containing a path separator and `plain` otherwise. This mirrors how the
 * auto-approvers convert keys to regular expressions.
 *
 * @returns The distinct key forms as a sorted, comma-separated list, or
 * `undefined` when there are no keys.
 */
export function getTerminalAutoApproveRuleKeyForms(keys: readonly string[]): string | undefined {
	if (keys.length === 0) {
		return undefined;
	}
	const keyForms = new Set(keys.map(key => {
		if (/^\/.+\/[dgimsuvy]*$/.test(key)) {
			return 'regex';
		}
		return key.includes('/') || key.includes('\\') ? 'path' : 'plain';
	}));
	return [...keyForms].sort().join(',');
}
