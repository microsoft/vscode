/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IExtension } from './extensions.js';
import * as semver from '../../../../base/common/semver/semver.js';

/**
 * This is the single source of truth for all deprecation UI decisions.
 *
 * Returns true only if:
 * 1. Extension has deprecation info, AND
 * 2. Current version is less than or equal to the deprecated version (or no version specified)
 */
export function isExtensionDeprecated(extension: IExtension): boolean {
	if (!extension.deprecationInfo) {
		return false;
	}

	// If no deprecated version specified, treat as deprecated (backward compatibility)
	const deprecatedVersion = extension.deprecationInfo.deprecatedVersion;
	if (!deprecatedVersion) {
		return true;
	}

	// Get current version from local extension or gallery
	const currentVersion = extension.local?.manifest.version || extension.version;
	if (!currentVersion) {
		return true; // If we can't determine version, assume deprecated for safety
	}

	// Check if current version is less than or equal to deprecated version
	return semver.lte(currentVersion, deprecatedVersion);
}
