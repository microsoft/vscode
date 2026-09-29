/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createServiceIdentifier } from '../../../../../util/common/services';

/**
 * `FileType` identifies the type of a file. `SymbolicLink` may be combined
 * with other types, e.g. `FileType.Directory | FileType.SymbolicLink`.
 */
export enum FileType {
	/** The file type is not known. */
	Unknown = 0,
	/** The file is a regular file. */
	File = 1,
	/** The file is a directory. */
	Directory = 2,
	/** The file is a symbolic link. */
	SymbolicLink = 64,
}

/**
 * The `FileStat`-type represents metadata about a file
 */
export interface FileStat {
	/**
	 * The creation timestamp in milliseconds elapsed since January 1, 1970 00:00:00 UTC.
	 */
	ctime: number;

	/**
	 * The modification timestamp in milliseconds elapsed since January 1, 1970 00:00:00 UTC.
	 *
	 * *Note:* If the file changed, it is important to provide an updated `mtime` that advanced
	 * from the previous value. Otherwise there may be optimizations in place that will not show
	 * the updated file contents in an editor for example.
	 */

	mtime: number;
	/**
	 * The size in bytes.
	 *
	 * *Note:* If the file changed, it is important to provide an updated `size`. Otherwise there
	 * may be optimizations in place that will not show the updated file contents in an editor for
	 * example.
	 */
	size: number;
	/**
	 * The type of file.
	 *
	 * *Note:* This is a bit field. Multiple flags may be set on it, e.g.
	 * `FileType.File | FileType.SymbolicLink`.
	 */
	type: FileType;
}

export type FileIdentifier = string | { readonly uri: string };

export const ICompletionsFileSystemService = createServiceIdentifier<ICompletionsFileSystemService>('ICompletionsFileSystemService');
export interface ICompletionsFileSystemService {
	readonly _serviceBrand: undefined;

	readFileString(uri: FileIdentifier): Promise<string>;
	stat(uri: FileIdentifier): Promise<FileStat>;
	readDirectory(uri: FileIdentifier): Promise<[string, FileType][]>;
}
