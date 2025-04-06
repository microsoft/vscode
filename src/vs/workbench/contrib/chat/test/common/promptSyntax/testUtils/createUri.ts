/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../../../../base/common/uri.js';
import { isWindows } from '../../../../../../../base/common/platform.js';

/**
 * Creates cross-platform `URI` for testing purposes.
 * On `Windows`, absolute paths are prefixed with the disk name.
 */
export const createURI = (linkPath: string): URI => {
	return URI.file(createPath(linkPath));
};

/**
 * Creates cross-platform `string` for testing purposes.
 * On `Windows`, absolute paths are prefixed with the disk name.
 */
export const createPath = (linkPath: string): string => {
	if (isWindows && linkPath.startsWith('/')) {
		return `/d:${linkPath}`;
	}

	return linkPath;
};
