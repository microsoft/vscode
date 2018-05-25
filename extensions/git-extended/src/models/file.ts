/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DiffHunk } from './diffHunk';

export enum GitChangeType {
	ADD,
	COPY,
	DELETE,
	MODIFY,
	RENAME,
	TYPE,
	UNKNOWN,
	UNMERGED
}

export class RichFileChange {
	public blobUrl: string;
	constructor(
		public readonly filePath: string,
		public readonly originalFilePath: string,
		public readonly status: GitChangeType,
		public readonly fileName: string,
		public readonly diffHunks: DiffHunk[]
	) { }
}