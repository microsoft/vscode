/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import { createServiceIdentifier } from '../../../util/common/services';
import { CancellationToken } from '../../../util/vs/base/common/cancellation';
import { URI } from '../../../util/vs/base/common/uri';

export interface IWorkspaceMutationOptions {
	/** User query. */
	query: string;
	/** Markdown file tree. Files in this tree should be rooted at the {@link baseURI} */
	fileTree: string;
	/** URI of the project on-disk, i.e. with the `file` scheme */
	baseURI: URI;
	/** A list of files in the tree. Can be derived using {@link listFilesInResponseFileTree} */
	files: string[];
}

export interface IWorkspaceMutation {
	/**
	 * Gets the contents of a file in the mutation. `file` should be a relative
	 * path as given in the initial file tree.
	 */
	get(file: string, token: CancellationToken): Promise<string>;

	/**
	 * Applies all mutations to the workspace.
	 * @throws if the edits have already beed applied
	 */
	apply(progress: undefined | vscode.Progress<{ message: string }>, token: vscode.CancellationToken): Promise<void>;
}

/**
 * Manager that handles a collection of mutations to the workspace. It tracks,
 * per-request, the file tree and query that the user has provided. It then
 * can generate new files or edits to existing files based on that request.
 */
export interface IWorkspaceMutationManager {
	_serviceBrand: undefined;

	/**
	 * Starts tracking a new mutation. This immediately will trigger a background
	 * prompt to collect preliminary information for the generation.
	 */
	create(requestId: string, options: IWorkspaceMutationOptions): IWorkspaceMutation;
	/**
	 * @throws if the mutation does not exist
	 */
	get(requestId: string): IWorkspaceMutation;
}

export const IWorkspaceMutationManager = createServiceIdentifier<IWorkspaceMutationManager>('IWorkspaceMutationManager');
