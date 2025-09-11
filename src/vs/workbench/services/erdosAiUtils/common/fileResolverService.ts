/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 by Lotas Inc.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { URI } from '../../../../base/common/uri.js';

export const IFileResolverService = createDecorator<IFileResolverService>('fileResolverService');

export interface IResolverContext {
	getAllOpenDocuments(): Promise<Array<{
		path: string;
		content: string;
		isDirty: boolean;
		isActive: boolean;
		isSaved: boolean;
	}>>;
	getCurrentWorkingDirectory(): Promise<string>;
	fileExists(path: string): Promise<boolean>;
	joinPath(base: string, ...parts: string[]): string;
	getFileContent(uri: URI): Promise<string>;
}

export interface IFileResolverService {
	readonly _serviceBrand: undefined;
	
	createResolverContext(): IResolverContext;
	resolveFileForWidget(filename: string): Promise<{ uri?: any; found: boolean }>;
}
