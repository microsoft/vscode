/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { readFileSync } from 'fs';
import { join } from 'path/posix';
import { getFixturesDir } from '../stestUtil';

/**
 * Rewrites fileName.[ext].txt to fileName.[ext] if no virtualFileName is given!
 *
 * This function allows [tools](https://github.com/microsoft/vscode-ts-file-path-support/tree/main) to inline/extract the file content.
 */

type FileInfo = { filePath: string | { fullPath: string; pathWithinFixturesDir?: string } } | {/** Relative */ fileName: string; fileContents: string };

export interface ILoadedFile {
	fileContents: string;
	fileName?: string; // relative
	filePath?: string; // absolute
	pathWithinFixturesDir?: string; // relative
}

/**
 * This function allows [tools](https://github.com/microsoft/vscode-ts-file-path-support/tree/main) to inline/extract the file content.
 */
export function loadFile(data: FileInfo): ILoadedFile {
	let fileName: string | undefined = undefined;
	let filePath: string | undefined = undefined;
	let pathWithinFixturesDir: string | undefined = undefined;
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
			pathWithinFixturesDir = data.filePath.pathWithinFixturesDir;
		}

		fileContents = readFileSync(filePath, 'utf8');
	}

	return { fileContents, fileName, filePath, pathWithinFixturesDir };
}

export function inlineEditsFixture(pathWithinFixturesDir: RelativeFilePath<'$dir/../fixtures/inlineEdits'>): { fullPath: string; pathWithinFixturesDir: string } {
	const fullPath = join(getFixturesDir(), 'inlineEdits', pathWithinFixturesDir);
	return {
		fullPath,
		pathWithinFixturesDir,
	};
}

/** See https://github.com/microsoft/vscode-ts-file-path-support */
type RelativeFilePath<T extends string> = string & { baseDir?: T }; export interface IInlineEditBaseFile {
	fileContents: string;

	/** Relative or absolute */
	virtualFileName: string;
}
