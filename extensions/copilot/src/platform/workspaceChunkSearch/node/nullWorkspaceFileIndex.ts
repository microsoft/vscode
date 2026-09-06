/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { GlobIncludeOptions } from '../../../util/common/glob';
import { CancellationToken } from '../../../util/vs/base/common/cancellation';
import { Event } from '../../../util/vs/base/common/event';
import { URI } from '../../../util/vs/base/common/uri';
import { FileRepresentation, IWorkspaceFileIndex } from './workspaceFileIndex';

export class NullWorkspaceFileIndex implements IWorkspaceFileIndex {
	declare readonly _serviceBrand: undefined;

	private _fileCount = 0;

	get fileCount(): number {
		return this._fileCount;
	}

	set fileCount(value: number) {
		this._fileCount = value;
	}

	readonly onDidCreateFiles = Event.None;
	readonly onDidChangeFiles = Event.None;
	readonly onDidDeleteFiles = Event.None;

	async initialize(): Promise<void> {
		return;
	}

	values(_globPatterns?: GlobIncludeOptions): Iterable<FileRepresentation> {
		return [];
	}

	get(_resource: URI): FileRepresentation | undefined {
		return undefined;
	}

	async tryLoad(_file: URI): Promise<FileRepresentation | undefined> {
		return undefined;
	}

	async tryRead(_file: URI): Promise<string | undefined> {
		return undefined;
	}

	async shouldIndexWorkspaceFile(_resource: URI, _token: CancellationToken): Promise<boolean> {
		return false;
	}

	dispose(): void {
		return;
	}
}
