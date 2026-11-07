/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { matchesSomeScheme, Schemas } from '../../../base/common/network.js';
import { isWindows } from '../../../base/common/platform.js';

/**
 * Rewrites Windows `file:` URLs so that the operating system shell can open them.
 *
 * Browser-serialized file URLs percent-encode the colon of a Windows drive letter
 * (`file:///c%3A/foo.html`). On Windows, `shell.openExternal` (ShellExecute) cannot
 * resolve such URLs. Only that drive-letter colon is rewritten (`file:///c:/foo.html`);
 * every other percent escape is preserved verbatim so the target file stays the same
 * (see #337525).
 *
 * @param isWin Test seam for the platform check; defaults to the current platform.
 */
export function toShellExternalUrl(url: string, isWin: boolean = isWindows): string {
	if (!isWin || !matchesSomeScheme(url, Schemas.file)) {
		return url;
	}
	return url.replace(/^(file:\/\/\/[A-Za-z])%3[aA](?=\/)/, '$1:');
}
