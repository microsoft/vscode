/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/** Compatibility capability restricted to the extension notification and progress bridges. */
export const legacyExtensionLinkParsing = Symbol('legacyExtensionLinkParsing');

export type LegacyExtensionLinkParsing = typeof legacyExtensionLinkParsing;

export function isLegacyExtensionLinkParsing(value: unknown): value is LegacyExtensionLinkParsing {
	return value === legacyExtensionLinkParsing;
}
