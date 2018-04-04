/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

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

export function fromStatus(status: string): GitChangeType {
	switch (status) {
		case 'A': return GitChangeType.ADD;
		case 'C': return GitChangeType.COPY;
		case 'D': return GitChangeType.DELETE;
		case 'M': return GitChangeType.MODIFY;
		case 'R': return GitChangeType.RENAME;
		case 'T': return GitChangeType.TYPE;
		case 'X': return GitChangeType.UNKNOWN;
		case 'U': return GitChangeType.UNMERGED;
	}

	if (status.match(/R[0-9]+/)) { return GitChangeType.RENAME; }
	if (status.match(/C[0-9]+/)) { return GitChangeType.COPY; }

	return GitChangeType.MODIFY;
}

export class SlimFileChange {
	public originalContent: string;
	public content: string;

	constructor(
		public readonly filePath: string,
		public readonly originalFilePath: string,
		public readonly status: GitChangeType,
		public readonly fileName: string
	) { }
}

export class RichFileChange {
	constructor(
		public readonly filePath: string,
		public readonly originalFilePath: string,
		public readonly status: GitChangeType,
		public readonly fileName: string
	) { }
}