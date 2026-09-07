/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

export async function exists(resource: vscode.Uri): Promise<boolean> {
	try {
		const stat = await vscode.workspace.fs.stat(resource);
		// stat.type is an enum flag
		return !!(stat.type & vscode.FileType.File);
	} catch {
		return false;
	}
}

export function looksLikeAbsoluteWindowsPath(path: string): boolean {
	return /^[a-zA-Z]:[\/\\]/.test(path);
}

/**
 * Whether a value begins with a URI scheme, such as `https:` or `vscode-file:`.
 *
 * An absolute Windows path also matches, so callers that accept paths must
 * exclude it with {@link looksLikeAbsoluteWindowsPath}.
 */
export function looksLikeUri(value: string): boolean {
	return /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(value);
}

/**
 * Whether a value should be read as a URI rather than as a local path.
 *
 * A drive letter reads as a one character URI scheme, so an absolute Windows
 * path is a path even though it satisfies {@link looksLikeUri}.
 */
export function looksLikeUriNotPath(value: string): boolean {
	return looksLikeUri(value) && !looksLikeAbsoluteWindowsPath(value);
}
