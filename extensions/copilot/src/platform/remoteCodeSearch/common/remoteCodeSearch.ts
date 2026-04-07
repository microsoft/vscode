/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { GlobIncludeOptions } from '../../../util/common/glob';
import { FileChunkAndScore } from '../../chunking/common/chunk';

export enum RemoteCodeSearchIndexStatus {
	/** The repo index is built and ready to use */
	Ready = 'ready',

	/** The repo index is being built */
	BuildingIndex = 'building-index',

	/** The repo is not indexed but we can potentially index it */
	NotYetIndexed = 'not-yet-indexed',

	/** The repo is not indexed and we cannot trigger indexing */
	NotIndexable = 'not-indexable',
}

export type RemoteCodeSearchIndexState =
	| { readonly status: RemoteCodeSearchIndexStatus.Ready; readonly indexedCommit: string | undefined }
	| { readonly status: RemoteCodeSearchIndexStatus.BuildingIndex | RemoteCodeSearchIndexStatus.NotYetIndexed | RemoteCodeSearchIndexStatus.NotIndexable }
	;

export type RemoteCodeSearchError =
	| { readonly type: 'not-authorized' }
	| { readonly type: 'generic-error'; readonly error: Error }
	;

export interface CodeSearchResult {
	readonly chunks: readonly FileChunkAndScore[];

	/** Tracks if the commit sha code search used differs from the one we used to compute the local diff */
	readonly outOfSync: boolean;
}

export interface CodeSearchOptions {
	readonly globPatterns?: GlobIncludeOptions;
}
