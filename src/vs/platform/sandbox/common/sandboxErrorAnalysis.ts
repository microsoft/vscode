/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export const sandboxFilesystemErrorPattern = /(?:\b(?:EACCES|EPERM|ENOENT|EROFS|ENOTDIR|EISDIR|ELOOP|ENAMETOOLONG|EXDEV|ENODEV|ENOEXEC|EBUSY|ETXTBSY|EINVAL|ENOSYS)\b|permission denied|operation not permitted|not accessible|cannot access|failed to open|no such file|read[- ]only|deny file-|restricted|fatal:)/i;

/**
 * Returns whether a sandboxed process output line looks like a filesystem access failure.
 */
export function isSandboxFilesystemError(value: string): boolean {
	return sandboxFilesystemErrorPattern.test(value);
}
