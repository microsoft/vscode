/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/
import { isValidBasename } from '../../../../../base/common/extpath.js';
import { OS, OperatingSystem } from '../../../../../base/common/platform.js';
import { basename } from '../../../../../base/common/resources.js';
import { truncateMiddle } from '../../../../../base/common/strings.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { IFileService } from '../../../../../platform/files/common/files.js';

interface PathValidatorOptions {
	noAbsolutePaths?: boolean;
	parentPath?: string;
}

export function checkIfPathValid(path: string | number, opts: PathValidatorOptions = {}): string | undefined {
	path = path.toString();

	if (path === '') {
		return undefined;
	}

	if (opts.noAbsolutePaths && (path[0] === '/' || path[0] === '\\')) {
		return localize('fileNameStartsWithSlashError', "A file or folder name cannot start with a slash.");
	}

	const pathLength = path.length + (opts.parentPath ? opts.parentPath.length + 1 : 0);
	if (pathLength > 256) {
		return localize('fileNameTooLongError', "File path is too long, must be under 256 characters.");
	}

	const isWindows = OS === OperatingSystem.Windows;

	let pathUri: URI;
	try {
		pathUri = URI.file(path);
	} catch (e) {
		return localize('unableToConvertToUriError', "Can't parse file name. Check for invalid characters.");
	}

	const pathBase = basename(pathUri);
	if (!isValidBasename(pathBase, isWindows)) {
		return localize('invalidFileNameError', "{0} is not valid as a file or folder name. Please choose a different name.", sanitizePathForDisplay(pathBase));
	}

	if (/^\s|\s$/.test(path)) {
		return localize('fileNameWhitespaceWarning', "Leading or trailing whitespace detected in file or folder name.");
	}

	return undefined;
}

export async function checkIfPathExists(path: string | number, fileService: IFileService): Promise<string | undefined> {
	path = path.toString();
	try {
		const pathUri = URI.file(path);
		const pathExists = await fileService.exists(pathUri);

		if (!pathExists) {
			return localize('pathDoesNotExistError', "The path {0} does not exist.", sanitizePathForDisplay(path));
		}
	} catch (e) {
		return localize('errorCheckingIfPathExists', "An error occurred while checking if the path {0} exists.", sanitizePathForDisplay(path));
	}

	return undefined;
}

export async function checkIfURIExists(path: URI, fileService: IFileService): Promise<string | undefined> {
	try {
		const pathExists = await fileService.exists(path);

		if (!pathExists) {
			return localize('pathDoesNotExistError', "The path {0} does not exist.", sanitizePathForDisplay(path.path));
		}
	} catch (e) {
		return localize('errorCheckingIfPathExists', "An error occurred while checking if the path {0} exists.", sanitizePathForDisplay(path.path));
	}

	return undefined;
}

export function isInputEmpty(input: string | number): boolean {
	return typeof input === 'number' ? false : input.trim() === '';
}

function sanitizePathForDisplay(path: string): string {
	const sanitizedPath = path.replace(/\*/g, '\\*');

	return truncateMiddle(sanitizedPath, 55);
}
