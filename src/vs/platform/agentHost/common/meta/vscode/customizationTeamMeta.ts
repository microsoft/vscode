/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const key = 'vscode.customizationTeam';

/**
 * Whether the host reports that the signed-in account's GitHub Team provides this customization.
 * This is provenance only and doesn't restrict enablement. False when absent or malformed.
 */
export function readCustomizationTeamProvided(customization: { readonly _meta?: Record<string, unknown> }): boolean {
	return customization._meta?.[key] === true;
}

/**
 * Returns `meta` with Team provenance set when `team` is true, and removed otherwise.
 * Returns `undefined` only when there is nothing to publish.
 */
export function withCustomizationTeamProvided(meta: Record<string, unknown>, team: boolean | undefined): Record<string, unknown>;
export function withCustomizationTeamProvided(meta: Record<string, unknown> | undefined, team: boolean | undefined): Record<string, unknown> | undefined;
export function withCustomizationTeamProvided(meta: Record<string, unknown> | undefined, team: boolean | undefined): Record<string, unknown> | undefined {
	if (team === true) {
		return { ...meta, [key]: true };
	}
	if (!meta) {
		return undefined;
	}
	const result = { ...meta };
	delete result[key];
	return result;
}
