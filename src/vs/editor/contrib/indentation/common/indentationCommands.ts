/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {Range} from 'vs/editor/common/core/range';
import {ICommand, ICursorStateComputerData, IEditOperationBuilder, IEditorSelection, ITokenizedModel} from 'vs/editor/common/editorCommon';

function getIndentationEditOperations(model: ITokenizedModel, builder: IEditOperationBuilder, tabSize: number, tabsToSpaces: boolean): void {
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
		let lastIndentationColumn = model.getLineFirstNonWhitespaceColumn(i + 1);
		if (lastIndentationColumn === 0) {
			lastIndentationColumn = model.getLineMaxColumn(i + 1);
		}

		const text = (tabsToSpaces ? content[i].substr(0, lastIndentationColumn).replace(/\t/ig, spaces) :
			content[i].substr(0, lastIndentationColumn).replace(new RegExp(spaces, 'gi'), '\t')) +
			content[i].substr(lastIndentationColumn);

		builder.addEditOperation(new Range(i + 1, 1, i + 1, model.getLineMaxColumn(i + 1)), text);
	}
}

export class IndentationToSpacesCommand implements ICommand {

	private selectionId: string;

	constructor(private selection: IEditorSelection, private tabSize: number) { }

	public getEditOperations(model: ITokenizedModel, builder: IEditOperationBuilder): void {
		this.selectionId = builder.trackSelection(this.selection);
		getIndentationEditOperations(model, builder, this.tabSize, true);
	}

	public computeCursorState(model: ITokenizedModel, helper: ICursorStateComputerData): IEditorSelection {
		return helper.getTrackedSelection(this.selectionId);
	}
}

export class IndentationToTabsCommand implements ICommand {

	private selectionId: string;

	constructor(private selection: IEditorSelection, private tabSize: number) { }

	public getEditOperations(model: ITokenizedModel, builder: IEditOperationBuilder): void {
		this.selectionId = builder.trackSelection(this.selection);
		getIndentationEditOperations(model, builder, this.tabSize, false);
	}

	public computeCursorState(model: ITokenizedModel, helper: ICursorStateComputerData): IEditorSelection {
		return helper.getTrackedSelection(this.selectionId);
	}
}
