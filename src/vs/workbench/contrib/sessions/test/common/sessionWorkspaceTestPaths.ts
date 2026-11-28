/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isWindows } from '../../../../../base/common/platform.js';
import { URI } from '../../../../../base/common/uri.js';

/** The drive that a workspace file names in front of an absolute {@link localFile} path. */
export const localDrive = isWindows ? 'C:' : '';

/**
 * A local file on drive `C:` on Windows. A Windows path without a drive resolves against the drive of the current
 * directory, which differs between test runners.
 */
export function localFile(path: string): URI {
	return URI.file(`${localDrive}${path}`);
}

/** The path of a {@link localFile}, without the drive, so that the expected paths are the same on every OS. */
export function pathOf(uri: URI): string {
	return isWindows ? uri.path.replace(/^\/[a-zA-Z]:/, '') : uri.path;
}
