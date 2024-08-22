/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { UriComponents } from 'vs/base/common/uri';
import { IWorkerClient, IWorkerServer } from 'vs/base/common/worker/simpleWorker';
import { IFileMatch, IFileQueryProps, IFolderQuery, ITextQueryProps } from 'vs/workbench/services/search/common/search';

export interface IWorkerTextSearchComplete {
	results: IFileMatch<UriComponents>[];
	limitHit?: boolean;
}

export interface IWorkerFileSearchComplete {
	results: string[];
	limitHit?: boolean;
}

// Copied from lib.dom.ts, which is not available in this layer.
type IWorkerFileSystemHandleKind = 'directory' | 'file';

export interface IWorkerFileSystemHandle {
	readonly kind: IWorkerFileSystemHandleKind;
	readonly name: string;
	isSameEntry(other: IWorkerFileSystemHandle): Promise<boolean>;
}

export interface IWorkerFileSystemDirectoryHandle extends IWorkerFileSystemHandle {
	readonly kind: 'directory';
	getDirectoryHandle(name: string): Promise<IWorkerFileSystemDirectoryHandle>;
	getFileHandle(name: string): Promise<IWorkerFileSystemFileHandle>;
	resolve(possibleDescendant: IWorkerFileSystemHandle): Promise<string[] | null>;
	entries(): AsyncIterableIterator<[string, IWorkerFileSystemDirectoryHandle | IWorkerFileSystemFileHandle]>;
}

export interface IWorkerFileSystemFileHandle extends IWorkerFileSystemHandle {
	readonly kind: 'file';
	getFile(): Promise<{ arrayBuffer(): Promise<ArrayBuffer> }>;
}

export interface ILocalFileSearchSimpleWorker {
	_requestHandlerBrand: any;

	$cancelQuery(queryId: number): void;

	$listDirectory(handle: IWorkerFileSystemDirectoryHandle, queryProps: IFileQueryProps<UriComponents>, folderQuery: IFolderQuery, ignorePathCasing: boolean, queryId: number): Promise<IWorkerFileSearchComplete>;
	$searchDirectory(handle: IWorkerFileSystemDirectoryHandle, queryProps: ITextQueryProps<UriComponents>, folderQuery: IFolderQuery, ignorePathCasing: boolean, queryId: number): Promise<IWorkerTextSearchComplete>;
}

export abstract class LocalFileSearchSimpleWorkerHost {
	public static CHANNEL_NAME = 'localFileSearchWorkerHost';
	public static getChannel(workerServer: IWorkerServer): LocalFileSearchSimpleWorkerHost {
		return workerServer.getChannel<LocalFileSearchSimpleWorkerHost>(LocalFileSearchSimpleWorkerHost.CHANNEL_NAME);
	}
	public static setChannel(workerClient: IWorkerClient<any>, obj: LocalFileSearchSimpleWorkerHost): void {
		workerClient.setChannel<LocalFileSearchSimpleWorkerHost>(LocalFileSearchSimpleWorkerHost.CHANNEL_NAME, obj);
	}

	abstract $sendTextSearchMatch(match: IFileMatch<UriComponents>, queryId: number): void;
}
