/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 by Lotas Inc.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export const IFileSystemUtils = createDecorator<IFileSystemUtils>('fileSystemUtils');

export interface IFileSystemUtils {
	readonly _serviceBrand: undefined;

	getCurrentWorkingDirectory(): Promise<string>;
	fileExists(filePath: string): Promise<boolean>;
	isDirectory(filePath: string): Promise<boolean>;
	getFileSize(filePath: string): Promise<number>;
	getFileStats(filePath: string): Promise<{ size?: number; isDirectory: boolean; }>;
	listFiles(directoryPath: string, options?: any): Promise<string[]>;
	listAllFiles(directoryPath: string): Promise<string[]>;
	directoryExists(directoryPath: string): Promise<boolean>;
	getFileInfo(directoryPath: string, files: string[]): Promise<Array<{ name: string; size?: number; isdir?: boolean; is_dir?: boolean; }>>;
	resolveAbsolutePath(filePath: string): Promise<string>;
	validatePathSecurity(filePath: string, allowedBaseDir?: string): Promise<{ isValid: boolean; errorMessage?: string; }>;
	readFileContent(filePath: string): Promise<string | null>;
	writeFileContent(filePath: string, content: string): Promise<boolean>;
	createDirectory(directoryPath: string): Promise<boolean>;
}
