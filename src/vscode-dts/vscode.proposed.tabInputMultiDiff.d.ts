/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// https://github.com/microsoft/vscode/issues/206411

declare module 'vscode' {

	export class TabInputTextMultiDiff {

		readonly textDiffs: TabInputTextDiff[];

		constructor(textDiffs: TabInputTextDiff[]);
	}

	export interface Tab {

		readonly input: TabInputText | TabInputTextDiff | TabInputTextMultiDiff | TabInputCustom | TabInputWebview | TabInputNotebook | TabInputNotebookDiff | TabInputTerminal | unknown;

	}
}
