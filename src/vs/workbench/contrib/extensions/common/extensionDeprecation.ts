/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IExtension } from './extensions.js';
import * as semver from '../../../../base/common/semver/semver.js';

export const IExtensionDeprecationService = createDecorator<IExtensionDeprecationService>('extensionDeprecationService');


export interface IExtensionDeprecationService {
	readonly _serviceBrand: undefined;

	/**
	 * This is the single source of truth for all deprecation UI decisions.
	 *
	 * Returns true only if:
	 * 1. Extension has deprecation info, AND
	 * 2. Current version falls within deprecated version ranges (or no ranges specified)
	 */
	isExtensionDeprecated(extension: IExtension): boolean;

}

// Maybe this should just be a function..
export class ExtensionDeprecationService implements IExtensionDeprecationService {
	declare readonly _serviceBrand: undefined;

	isExtensionDeprecated(extension: IExtension): boolean {
		if (!extension.deprecationInfo) {
			console.log(`[DEPRECATION] isExtensionDeprecated(${extension.identifier.id}): No deprecationInfo`);
			return false;
		}
		console.log(`[DEPRECATION] isExtensionDeprecated(${extension.identifier.id}): Has deprecationInfo:`, extension.deprecationInfo);

		// If no version ranges specified, treat as deprecated (backward compatibility)
		const versionRanges = extension.deprecationInfo.versionRanges;
		if (!versionRanges || versionRanges.length === 0) {
			return true;
		}

		// Get current version from local extension or gallery
		const currentVersion = extension.local?.manifest.version || extension.version;
		if (!currentVersion) {
			return true; // If we can't determine version, assume deprecated for safety
		}

		// Check if current version falls within any deprecated range
		return versionRanges.some(range => {
			if (range === '*') {
				return true;
			}
			try {
				return semver.satisfies(currentVersion, range);
			} catch {
				return range === currentVersion; // Fallback to exact match
			}
		});
	}
}
