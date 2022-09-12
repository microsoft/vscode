/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import Parser = require('web-tree-sitter');
import { DisposableStore } from 'vs/base/common/lifecycle';
import { IModelDeltaDecoration, ITextModel } from 'vs/editor/common/model';
import { IModelContentChangedEvent } from 'vs/editor/common/textModelEvents';
import { runWhenIdle } from 'vs/base/common/async';
import { createTextModel } from 'vs/editor/test/common/testTextModel';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { FileAccess } from 'vs/base/common/network';
import { FoldingDecorationProvider } from 'vs/editor/contrib/folding/browser/foldingDecorations';

export class TreeSitterForFolding {
	public readonly id: string;
	private readonly _parser: Parser;
	private readonly _disposableStore: DisposableStore = new DisposableStore();

	private _content;
	private _edits: Parser.Edit[];
	private _tree: Parser.Tree | undefined;
	private _captures: Parser.QueryCapture[];

	constructor(
		private readonly _model: ITextModel,
		private readonly _language: Parser.Language,
		private readonly _foldingDecorationProvider: FoldingDecorationProvider
	) {
		this.id = this._model.id;
		this._parser = new Parser();
		this._parser.setLanguage(this._language);
		this._content = '';

		this._captures = [];
		this._edits = [];

		const uriString = FileAccess.asBrowserUri(`./treeSitterForFolding.scm`, require).toString(true);

		fetch(uriString).then((response) => {
			response.text().then((content) => {
				this._content = content;

				this.parseTree().then((tree) => {
					if (!tree) {
						return;
					}
					this._tree = tree;

					this.updateFoldingRegions();
					this._disposableStore.add(this._model.onDidChangeContent((e: IModelContentChangedEvent) => {
						for (const change of e.changes) {
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
						this.parseTree().then((tree) => {
							if (!tree) {
								return;
							}
							this._tree = tree;
							this.updateFoldingRegions();
						})
					}));

				})
			})
		})
	}

	public updateFoldingRegions() {
		// TODO: Completed the code
		const newEditorDecorations: IModelDeltaDecoration[] = [];
		/*
		let lastHiddenLine = -1;
		for (let index = 0, limit = newRegions.length; index < limit; index++) {
			const startLineNumber = newRegions.getStartLineNumber(index);
			const endLineNumber = newRegions.getEndLineNumber(index);
			const isCollapsed = newRegions.isCollapsed(index);
			const isManual = newRegions.getSource(index) !== FoldSource.provider;
			const decorationRange = {
				startLineNumber: startLineNumber,
				startColumn: this._textModel.getLineMaxColumn(startLineNumber),
				endLineNumber: endLineNumber,
				endColumn: this._textModel.getLineMaxColumn(endLineNumber) + 1
			};
			newEditorDecorations.push({ range: decorationRange, options: this._decorationProvider.getDecorationOption(isCollapsed, endLineNumber <= lastHiddenLine, isManual) });
			if (isCollapsed && endLineNumber > lastHiddenLine) {
				lastHiddenLine = endLineNumber;
			}
		}
		this._decorationProvider.changeDecorations(accessor => this._editorDecorationIds = accessor.deltaDecorations(this._editorDecorationIds, newEditorDecorations));
		this._regions = newRegions;
		this._updateEventEmitter.fire({ model: this });
		*/
	}

	public getTree() {
		for (const edit of this._edits) {
			this._tree!.edit(edit);
		}
		this._edits.length = 0;
		return this._tree;
	}

	private runParse(textModel: ITextModel, resolve: (value: Parser.Tree | PromiseLike<Parser.Tree>) => void, tree: Parser.Tree | undefined) {
		runWhenIdle(
			(arg) => {
				this._parser.setTimeoutMicros(arg.timeRemaining() * 1000);
				let result;
				try {
					result = this._parser.parse(
						(startIndex: number, startPoint: Parser.Point | undefined, endIndex: number | undefined) =>
							this._retrieveTextAtPosition(textModel, startIndex, startPoint, endIndex),
						tree
					);
					if (!result) {
						return this.runParse(textModel, resolve, tree);
					} else {
						resolve(result);
					}
				} catch (error) { }
			},
			1000
		);
	}

	// TODO: Since it is common with the other file, take it out of this folder
	public async parseTree(): Promise<Parser.Tree | void> {
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
				return new Promise(function (resolve, _reject) {
					resolve(result);
				})
			}
		}
		// Else if parsing failed, asynchronous
		catch (error) {
			this._parser.reset();
			tree = this.getTree();
			const textModel = createTextModel('');
			textModel.setValue(this._model.createSnapshot());
			let that = this;
			return new Promise(function (resolve, _reject) {
				that.runParse(textModel, resolve, tree);
			})
		}
	}

	public getTextMateCaptures() {
		if (!this._tree) {
			return;
		}
		const query = this._language.query(this._content);
		this._captures = query.captures(this._tree.rootNode);
		query.delete();
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
	}
}
