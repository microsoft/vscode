/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {Range} from 'vs/editor/common/core/range';
import * as EditorCommon from 'vs/editor/common/editorCommon';

function getIndentationEditOperations(model: EditorCommon.ITokenizedModel, builder: EditorCommon.IEditOperationBuilder, tabSize: number, tabsToSpaces: boolean): void {
	if (model.getLineCount() === 1 && model.getLineMaxColumn(1) === 1) {
		// Model is empty
		return;
	}

	let spaces = '';
	for (let i = 0; i < tabSize; i++) {
		spaces += ' ';
	}

	const content = model.getLinesContent();
	for (let i = 0; i < content.length; i++) {
		const nonWhitespaceColumn = model.getLineFirstNonWhitespaceColumn(i + 1);
		const text = (tabsToSpaces ? content[i].substr(0, nonWhitespaceColumn).replace(/\t/ig, spaces) :
			content[i].substr(0, nonWhitespaceColumn).replace(new RegExp(spaces, 'gi'), '\t')) +
			content[i].substr(nonWhitespaceColumn);

		builder.addEditOperation(new Range(i + 1, 1, i + 1, model.getLineMaxColumn(i + 1)), text);
	}
}

export class IndentationToSpacesCommand implements EditorCommon.ICommand {

	private selectionId: string;

	constructor(private selection: EditorCommon.IEditorSelection, private tabSize: number) { }

	public getEditOperations(model: EditorCommon.ITokenizedModel, builder: EditorCommon.IEditOperationBuilder): void {
		this.selectionId = builder.trackSelection(this.selection);
		getIndentationEditOperations(model, builder, this.tabSize, true);
	}

	public computeCursorState(model: EditorCommon.ITokenizedModel, helper: EditorCommon.ICursorStateComputerData): EditorCommon.IEditorSelection {
		return helper.getTrackedSelection(this.selectionId);
	}
}

export class IndentationToTabsCommand implements EditorCommon.ICommand {

	private selectionId: string;

	constructor(private selection: EditorCommon.IEditorSelection, private tabSize: number) { }

	public getEditOperations(model: EditorCommon.ITokenizedModel, builder: EditorCommon.IEditOperationBuilder): void {
		this.selectionId = builder.trackSelection(this.selection);
		getIndentationEditOperations(model, builder, this.tabSize, false);
	}

	public computeCursorState(model: EditorCommon.ITokenizedModel, helper: EditorCommon.ICursorStateComputerData): EditorCommon.IEditorSelection {
		return helper.getTrackedSelection(this.selectionId);
	}
}
