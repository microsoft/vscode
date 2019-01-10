/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IExtensionManifest } from 'vs/platform/extensionManagement/common/extensionManagement';
import { getGalleryExtensionId } from 'vs/platform/extensionManagement/common/extensionManagementUtil';
import * as strings from 'vs/base/common/strings';
import { isNonEmptyArray } from 'vs/base/common/arrays';

export const MANIFEST_CACHE_FOLDER = 'CachedExtensions';
export const USER_MANIFEST_CACHE_FILE = 'user';
export const BUILTIN_MANIFEST_CACHE_FILE = 'builtin';

const uiExtensions = new Set<string>();
uiExtensions.add('msjsdiag.debugger-for-chrome');

export function isUIExtension(manifest: IExtensionManifest, configurationService: IConfigurationService): boolean {
	const extensionId = getGalleryExtensionId(manifest.publisher, manifest.name);
	const configuredUIExtensions = configurationService.getValue<string[]>('_workbench.uiExtensions') || [];
	if (configuredUIExtensions.length) {
		if (configuredUIExtensions.indexOf(extensionId) !== -1) {
			return true;
		}
		if (configuredUIExtensions.indexOf(`-${extensionId}`) !== -1) {
			return false;
		}
	}
	switch (manifest.extensionKind) {
		case 'ui': return true;
		case 'workspace': return false;
		default: {
			if (uiExtensions.has(extensionId)) {
				return true;
			}
			if (manifest.main) {
				return false;
			}
			if (manifest.contributes && isNonEmptyArray(manifest.contributes.debuggers)) {
				return false;
			}
			// Default is UI Extension
			return true;
		}
	}
}

/**
 * **!Do not construct directly!**
 *
 * **!Only static methods because it gets serialized!**
 *
 * This represents the "canonical" version for an extension identifier. Extension ids
 * have to be case-insensitive (due to the marketplace), but we must ensure case
 * preservation because the extension API is already public at this time.
 *
 * For example, given an extension with the publisher `"Hello"` and the name `"World"`,
 * its canonical extension identifier is `"Hello.World"`. This extension could be
 * referenced in some other extension's dependencies using the string `"hello.world"`.
 *
 * To make matters more complicated, an extension can optionally have an UUID. When two
 * extensions have the same UUID, they are considered equal even if their identifier is different.
 */
export class ExtensionIdentifier {
	public readonly value: string;
	private readonly _lower: string;

	constructor(value: string) {
		this.value = value;
		this._lower = value.toLowerCase();
	}

	public static equals(a: ExtensionIdentifier | string | null | undefined, b: ExtensionIdentifier | string | null | undefined) {
		if (typeof a === 'undefined' || a === null) {
			return (typeof b === 'undefined' || b === null);
		}
		if (typeof b === 'undefined' || b === null) {
			return false;
		}
		if (typeof a === 'string' || typeof b === 'string') {
			// At least one of the arguments is an extension id in string form,
			// so we have to use the string comparison which ignores case.
			let aValue = (typeof a === 'string' ? a : a.value);
			let bValue = (typeof b === 'string' ? b : b.value);
			return strings.equalsIgnoreCase(aValue, bValue);
		}

		// Now we know both arguments are ExtensionIdentifier
		return (a._lower === b._lower);
	}

	/**
	 * Gives the value by which to index (for equality).
	 */
	public static toKey(id: ExtensionIdentifier | string): string {
		if (typeof id === 'string') {
			return id.toLowerCase();
		}
		return id._lower;
	}
}
