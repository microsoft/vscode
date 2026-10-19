/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { matchesSomeScheme, Schemas } from '../../../base/common/network.js';
import { isWindows } from '../../../base/common/platform.js';
import { URI } from '../../../base/common/uri.js';

/**
 * Rewrites `file:` URLs so that the operating system shell can open them.
 *
 * Browser-serialized file URLs percent-encode the colon of a Windows drive letter
 * (`file:///c%3A/foo.html`). On Windows, `shell.openExternal` (ShellExecute) cannot
 * resolve such URLs, so they are re-serialized without encoding
 * (`file:///c:/foo.html`), which the shell accepts (see #337525).
 *
 * @param isWin Test seam for the platform check; defaults to the current platform.
 */
export function toShellExternalUrl(url: string, isWin: boolean = isWindows): string {
	if (!isWin || !matchesSomeScheme(url, Schemas.file)) {
		return url;
	}
	try {
		return URI.parse(url).toString(true);
	} catch {
		// Unparseable URL: leave it as-is, the shell will report the error.
		return url;
	}
}
