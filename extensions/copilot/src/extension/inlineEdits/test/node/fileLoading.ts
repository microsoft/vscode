/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { readFile } from 'fs/promises';
import { join } from '../../../../util/vs/base/common/path';

type FileRef = { filePath: string | { fullPath: string } } | {/** Relative */ fileName: string; fileContents: string };

export interface ILoadedFile {
	fileContents: string;
	fileName?: string; // relative
	filePath?: string; // absolute
}

/**
 * This function allows [tools](https://github.com/microsoft/vscode-ts-file-path-support/tree/main) to inline/extract the file content.
 */
export async function loadFile(data: FileRef): Promise<ILoadedFile> {
	let fileName: string | undefined = undefined;
	let filePath: string | undefined = undefined;
	let fileContents: string;

	if ('fileContents' in data) {
		fileName = data.fileName;
		fileContents = data.fileContents;
	} else {
		if (typeof data.filePath === 'string') {
			filePath = data.filePath;
			filePath = filePath;
		} else {
			filePath = data.filePath.fullPath;
		}

		fileContents = await readFile(filePath, 'utf8');
	}

	return { fileContents, fileName, filePath };
}

export async function loadJSON<T>(data: FileRef): Promise<T> {
	const { fileContents } = await loadFile(data);
	return JSON.parse(fileContents);
}

/** See https://github.com/microsoft/vscode-ts-file-path-support */
export type RelativeFilePath<T extends string> = string & { baseDir?: T }; export interface IInlineEditBaseFile {
	fileContents: string;

	/** Relative or absolute */
	virtualFileName: string;
}

export function relativeFile(relativePath: RelativeFilePath<'$dir'>): { fullPath: string } {
	const fullPath = join(__dirname, relativePath);
	return { fullPath };
}
