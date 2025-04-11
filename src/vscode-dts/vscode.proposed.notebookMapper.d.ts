/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


declare module 'vscode' {

	export enum NotebookCellPart {
		SOURCE = 1,
		METADATA = 2,
	}

	export class NotebookRange2 extends Range {
		readonly cell: number;
		readonly part?: NotebookCellPart;

		constructor(cell: number, part?: NotebookCellPart, range?: Range);
	}

	export interface NotebookMapper {
		toNotebookRange(range: Range): NotebookRange2 | undefined;
	}

	export interface NotebookData {
		mapper?: NotebookMapper;
	}
}
