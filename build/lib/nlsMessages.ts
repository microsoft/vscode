/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/** Serializes NLS JavaScript data as ASCII without changing its JSON-decoded value. */
export function serializeNlsData(data: readonly (string | undefined)[] | string): string {
	return JSON.stringify(data).replace(/[^\x00-\x7f]/g, character => `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`);
}
