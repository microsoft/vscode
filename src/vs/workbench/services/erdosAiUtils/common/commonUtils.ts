/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 by Lotas Inc.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export const ICommonUtils = createDecorator<ICommonUtils>('commonUtils');

export interface ICommonUtils {
	readonly _serviceBrand: undefined;

	getBasename(filePath: string): string;
	compareBasenames(basename1: string, basename2: string): boolean;
	splitNameAndExtension(filename: string): { name: string; extension: string };
	comparePathsWithCaseInsensitiveExtensions(path1: string, path2: string): boolean;
	resolveFile(filePath: string, context: any): Promise<any>;
	isAbsolutePath(path: string): boolean;
	isRelativePath(path: string): boolean;
	getRelativePath(absolutePath: string, baseDir: string): string;
	getDirname(filePath: string): string;
	getFileExtension(filePath: string): string;
	detectLanguage(filePath: string): string;
	getCommentSyntax(filePath: string): string;
	expandPath(path: string, workspaceRoot?: string): string;
	resolveFilePathToUri(filePath: string, context: any): Promise<any>;
	resolvePath(path: string, workspaceRoot?: string): string;
	formatFileSize(sizeInBytes: number): string;
	joinPath(...components: string[]): string;
	normalizePath(path: string): string;
	isKeyword(word: string, language: string): boolean;
	getUniqueDisplayName(filePath: string, allPaths: string[]): string;
}
