/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {Range} from 'vs/editor/common/core/range';
import {ICommand, ICursorStateComputerData, IEditOperationBuilder, ITokenizedModel} from 'vs/editor/common/editorCommon';
import {Selection} from 'vs/editor/common/core/selection';

function getIndentationEditOperations(model: ITokenizedModel, builder: IEditOperationBuilder, tabSize: number, tabsToSpaces: boolean, selection: Selection): void {
	if (model.getLineCount() === 1 && model.getLineMaxColumn(1) === 1) {
		// Model is empty
		return;
	}

	let spaces = '';
	for (let i = 0; i < tabSize; i++) {
		spaces += ' ';
	}
	let doForAllLines = selection.isEmpty();

	const content = model.getLinesContent();
	const selectionStartLine = selection.startLineNumber - 1;
	const selectionStartColumn = selection.startColumn - 1;
	const selectionEndLine = selection.endLineNumber - 1;
	const selectionEndColumn = selection.endColumn - 1;
	for (let i = 0; i < content.length; i++) {
		let editedRange = new Range(i + 1, 1, i + 1, model.getLineMaxColumn(i + 1));
		if (doForAllLines || (selection.intersectRanges(editedRange))) {

			let replaceStart = !doForAllLines && i === selectionStartLine ? selectionStartColumn : 0;
			let replaceEnd = !doForAllLines && i === selectionEndLine ? selectionEndColumn : model.getLineMaxColumn(i + 1);

			let leftText = content[i].substring(0, replaceStart);
			let middleText;
			let endText = content[i].substring(replaceEnd);

			if (tabsToSpaces) {
				middleText = content[i].substring(replaceStart, replaceEnd).replace(/\t/ig, spaces);
			} else {
				middleText = content[i].substring(replaceStart, replaceEnd).replace(new RegExp(spaces, 'gi'), '\t');
			}

			const text = leftText + middleText + endText;
			builder.addEditOperation(editedRange, text);
		}
	}
}

export class IndentationToSpacesCommand implements ICommand {

	private selectionId: string;

	constructor(private selection: Selection, private tabSize: number) { }

	public getEditOperations(model: ITokenizedModel, builder: IEditOperationBuilder): void {
		this.selectionId = builder.trackSelection(this.selection);
		getIndentationEditOperations(model, builder, this.tabSize, true, this.selection);
	}

	public computeCursorState(model: ITokenizedModel, helper: ICursorStateComputerData): Selection {
		return helper.getTrackedSelection(this.selectionId);
	}
}

export class IndentationToTabsCommand implements ICommand {

	private selectionId: string;

	constructor(private selection: Selection, private tabSize: number) { }

	public getEditOperations(model: ITokenizedModel, builder: IEditOperationBuilder): void {
		this.selectionId = builder.trackSelection(this.selection);
		getIndentationEditOperations(model, builder, this.tabSize, false, this.selection);
	}

	public computeCursorState(model: ITokenizedModel, helper: ICursorStateComputerData): Selection {
		return helper.getTrackedSelection(this.selectionId);
	}
}
