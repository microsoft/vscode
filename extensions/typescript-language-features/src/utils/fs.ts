/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

/** Stats a resource, yielding `undefined` when nothing lives there. */
export async function tryStat(resource: vscode.Uri): Promise<vscode.FileStat | undefined> {
	try {
		return await vscode.workspace.fs.stat(resource);
	} catch {
		return undefined;
	}
}

export async function exists(resource: vscode.Uri): Promise<boolean> {
	const stat = await tryStat(resource);
	// stat.type is an enum flag
	return !!stat && !!(stat.type & vscode.FileType.File);
}

export function looksLikeAbsoluteWindowsPath(path: string): boolean {
	return /^[a-zA-Z]:[\/\\]/.test(path);
}

/**
 * Whether TypeScript would treat a value as a relative path rather than a
 * module or package name. Mirrors the compiler's `pathIsRelative`: `.`, `..`,
 * and anything under them, with either separator.
 */
export function looksLikeRelativePath(value: string): boolean {
	return /^\.\.?(?:$|[\\/])/.test(value);
}

/**
 * Whether a value is rooted on any platform, so the result does not depend on
 * the platform the extension host runs on. Mirrors the compiler's
 * `isRootedDiskPath`, minus URIs, which callers exclude where they accept them.
 *
 * Recognizing a value is only half of reading it the way the compiler does: a
 * value that reaches a URI must pass through {@link normalizeSlashes} first.
 */
export function looksLikeAbsolutePath(value: string): boolean {
	return value.startsWith('/') || value.startsWith('\\') || looksLikeAbsoluteWindowsPath(value);
}

/**
 * Rewrites Windows separators into the separator every platform accepts, the way
 * TypeScript's own `normalizeSlashes` does.
 *
 * A path written on Windows must resolve the same everywhere, and neither
 * `Uri.file` nor `Uri.joinPath` treats a backslash as a separator unless the
 * extension host itself runs on Windows.
 */
export function normalizeSlashes(path: string): string {
	return path.replace(/\\/g, '/');
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
