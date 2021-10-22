/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { UriComponents } from 'vs/base/common/uri';
import { IFileMatch, IFileQueryProps, IFolderQuery, ITextQueryProps } from 'vs/workbench/services/search/common/search';

export interface IWorkerTextSearchComplete {
	results: IFileMatch<UriComponents>[];
	limitHit?: boolean;
}

export interface IWorkerFileSearchComplete {
	results: string[];
	limitHit?: boolean;
}

export interface ILocalFileSearchSimpleWorker {
	_requestHandlerBrand: any;

	cancelQuery(queryId: number): void;

	listDirectory(handle: FileSystemDirectoryHandle, queryProps: IFileQueryProps<UriComponents>, folderQuery: IFolderQuery, queryId: number): Promise<IWorkerFileSearchComplete>
	searchDirectory(handle: FileSystemDirectoryHandle, queryProps: ITextQueryProps<UriComponents>, folderQuery: IFolderQuery, queryId: number): Promise<IWorkerTextSearchComplete>
}

export interface ILocalFileSearchSimpleWorkerHost {
	sendTextSearchMatch(match: IFileMatch<UriComponents>, queryId: number): void
}
