/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { runWhenIdle } from 'vs/base/common/async';
import { ITextModel } from 'vs/editor/common/model';
import { createTextModel } from 'vs/editor/test/common/testTextModel';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import Parser = require('web-tree-sitter');
import { IModelContentChangedEvent } from 'vs/editor/common/textModelEvents';

export class TreeSitterTree {

	private _parser: Parser;
	private _tree: Parser.Tree | undefined;
	private _edits: Parser.Edit[];

	constructor(
		private readonly _model: ITextModel,
		private readonly _language: Parser.Language
	) {
		this._parser = new Parser();
		this._parser.setLanguage(_language);
		this._edits = [];
		this.parseTree().then((tree) => {
			if (tree) {
				this._tree = tree;
			}
		})
	}

	public registerTreeEdits(contentChangeEvent: IModelContentChangedEvent): void {
		for (const change of contentChangeEvent.changes) {
			const newEndPositionFromModel = this._model.getPositionAt(change.rangeOffset + change.text.length);
			this._edits.push({
				startPosition: { row: change.range.startLineNumber - 1, column: change.range.startColumn - 1 },
				oldEndPosition: { row: change.range.endLineNumber - 1, column: change.range.endColumn - 1 },
				newEndPosition: { row: newEndPositionFromModel.lineNumber - 1, column: newEndPositionFromModel.column - 1 },
				startIndex: change.rangeOffset,
				oldEndIndex: change.rangeOffset + change.rangeLength,
				newEndIndex: change.rangeOffset + change.text.length
			} as Parser.Edit);
		}
	}

	public async parseTree(): Promise<Parser.Tree> {
		this._parser.setTimeoutMicros(10000);
		let tree = this.getTree();
		// Initially synchronous
		try {
			let result = this._parser.parse(
				(startIndex: number, startPoint: Parser.Point | undefined, endIndex: number | undefined) =>
					this._retrieveTextAtPosition(this._model, startIndex, startPoint, endIndex),
				tree
			);
			if (result) {
				let that = this;
				return new Promise(function (resolve, _reject) {
					that._tree = result;
					return resolve(result);
				})
			}
			else {
				throw new Error();
			}
		}
		// Else if parsing failed, asynchronous
		catch (error) {
			this._parser.reset();
			tree = this.getTree();
			const textModel = createTextModel('');
			textModel.setValue(this._model.createSnapshot());
			let that = this;
			return new Promise(async function (resolve, _reject) {
				that._runParse(textModel, tree).then((tree) => {
					that._tree = tree;
					resolve(tree);
				})
				// return that._runParse(textModel, resolve, tree);
			})
		}
	}

	private getTree(): Parser.Tree | undefined {
		for (const edit of this._edits) {
			this._tree!.edit(edit);
		}
		this._edits.length = 0;
		return this._tree;
	}

	private _runParse(textModel: ITextModel, tree: Parser.Tree | undefined): Promise<Parser.Tree> {
		let that = this;
		return new Promise(function (resolve, _reject) {
			runWhenIdle(
				(arg) => {
					that._parser.setTimeoutMicros(arg.timeRemaining() * 1000);
					let result: Parser.Tree;
					try {
						result = that._parser.parse(
							(startIndex: number, startPoint: Parser.Point | undefined, endIndex: number | undefined) =>
								that._retrieveTextAtPosition(textModel, startIndex, startPoint, endIndex),
							tree
						);
						// Case 1: Either we obtain the result this iteration in which case we resolve
						if (result) {
							that._tree = result;
							resolve(result);
						}
						// Case 2: Else throw an error and treat the case in the catch block
						else {
							throw new Error();
						}
					}
					// Case 3: Here in the catch block treat the case when the parse has failed, then rerun the method
					catch (error) {
						return that._runParse(textModel, tree).then((tree) => {
							resolve(tree);
						})
					}
				},
				1000
			);
		})
	}

	private _retrieveTextAtPosition(model: ITextModel, startIndex: number, _startPoint: Parser.Point | undefined, endIndex: number | undefined) {
		const startPosition: Position = model.getPositionAt(startIndex);
		let endPosition: Position;
		if (typeof endIndex !== 'number') {
			endIndex = startIndex + 5000;
		}
		endPosition = model.getPositionAt(endIndex);
		return model.getValueInRange(Range.fromPositions(startPosition, endPosition));
	}

	public dispose() {
		this._tree?.delete();
		this._parser.delete();
		this._edits.length = 0;
	}
}
