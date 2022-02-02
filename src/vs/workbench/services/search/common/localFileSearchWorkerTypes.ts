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

export type SearchWorkerFileSystemHandle = ISearchWorkerFileSystemDirectoryHandle | ISearchWorkerFileSystemFileHandle;

// Minimal interface needed from DOM's FileSystemFileHandle, which is not available in this scope
export interface ISearchWorkerFileSystemFileHandle {
	name: string;
	kind: 'file';
	getFile(): Promise<{ arrayBuffer(): Promise<ArrayBuffer> }>;
}

// Minimal interface needed from DOM's FileSystemDirectoryHandle, which is not available in this scope
export interface ISearchWorkerFileSystemDirectoryHandle {
	name: string;
	kind: 'directory';
	getFileHandle(name: string): Promise<ISearchWorkerFileSystemFileHandle>;
	entries(): AsyncIterable<[string, SearchWorkerFileSystemHandle]>;
}

export interface ILocalFileSearchSimpleWorker {
	_requestHandlerBrand: any;

	cancelQuery(queryId: number): void;

	listDirectory(handle: ISearchWorkerFileSystemDirectoryHandle, queryProps: IFileQueryProps<UriComponents>, folderQuery: IFolderQuery, queryId: number): Promise<IWorkerFileSearchComplete>;
	searchDirectory(handle: ISearchWorkerFileSystemDirectoryHandle, queryProps: ITextQueryProps<UriComponents>, folderQuery: IFolderQuery, queryId: number): Promise<IWorkerTextSearchComplete>;
}

export interface ILocalFileSearchSimpleWorkerHost {
	sendTextSearchMatch(match: IFileMatch<UriComponents>, queryId: number): void;
}
