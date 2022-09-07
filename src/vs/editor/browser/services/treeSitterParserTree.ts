/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { readFileSync } from 'fs';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { ITextModel } from 'vs/editor/common/model';
import { IModelContentChangedEvent } from 'vs/editor/common/textModelEvents';
import { ContiguousMultilineTokens } from 'vs/editor/common/tokens/contiguousMultilineTokens';
import { runWhenIdle } from 'vs/base/common/async';
import { createTextModel } from 'vs/editor/test/common/testTextModel';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import Parser = require('web-tree-sitter');

// ! KNOWN COLORIZATION PROBLEMS !
// 1. for pairs where the value is an arrow function, the key should be yellow not blue

// TODO: take into account the case when we remove instead of adding, be able to detect it (see how newEndPosition can be used for that)
const mapWordToColor = new Map(Object.entries({
	'comment': 33686849,
	'other': 33588289,
	'keywords1': 33719361,
	'keywords2': 34112577,
	'function': 34047041,
	'string': 33916481,
	'type': 34079809,
	'variable': 33850433,
	'number': 33752129,
}));

const exceptions = {
	FUNCTION_DECLARATION: 'function_declaration',
	METHOD_DEFINITION: 'method_definition',
	AWAIT_EXPRESSION: 'await_expression',
	AS_EXPRESSION: 'as_expression'
}

export class TreeSitterParseTree {

	private readonly _parser: Parser;
	private _tree: Parser.Tree | undefined;
	private readonly _disposableStore: DisposableStore = new DisposableStore();
	private _captures: Parser.QueryCapture[];
	private _matches: Parser.QueryMatch[];
	private _captureNames: string[];
	private _captureNameToNodeMap: Map<string, Parser.SyntaxNode[]>;
	private _edits: Parser.Edit[];
	public readonly id: string;

	// Variables for asynchronous parsing and color rendering
	private _contiguousMultilineToken: ContiguousMultilineTokens[];
	private _beginningCaptureIndex: number;
	private _timeoutForRender: number;
	private _startPositionRow: number;
	private _endPositionRow: number;

	constructor(
		private readonly _model: ITextModel,
		private readonly _language: Parser.Language
	) {
		this.id = this._model.id;
		this._parser = new Parser();
		this._parser.setLanguage(this._language);

		this._captures = [];
		this._matches = [];
		this._captureNames = [];
		this._captureNameToNodeMap = new Map<string, Parser.SyntaxNode[]>();
		this._edits = [];
		this._contiguousMultilineToken = [];
		this._beginningCaptureIndex = 0;
		this._timeoutForRender = 0;
		this._startPositionRow = 0;
		this._endPositionRow = this._model.getLineCount() - 1;
		this.setTimeoutForRender(10);

		// Note: Parse the tree at least once before adding a listener on the model content change event
		this.parseTree().then((tree) => {
			if (!tree) {
				return;
			}
			this._tree = tree;
			this.getCaptures();
			this.setTokens().then(() => {
				this._disposableStore.add(this._model.onDidChangeContent((e: IModelContentChangedEvent) => {
					this._startPositionRow = Infinity;
					this._endPositionRow = -Infinity;

					const changes = e.changes;
					for (const change of changes) {
						const newEndPositionFromModel = this._model.getPositionAt(change.rangeOffset + change.text.length);
						// TODO: console.log('newEndPositionFromModel : ', newEndPositionFromModel);
						this._edits.push({
							startPosition: { row: change.range.startLineNumber - 1, column: change.range.startColumn - 1 },
							oldEndPosition: { row: change.range.endLineNumber - 1, column: change.range.endColumn - 1 },
							newEndPosition: { row: newEndPositionFromModel.lineNumber - 1, column: newEndPositionFromModel.column - 1 },
							startIndex: change.rangeOffset,
							oldEndIndex: change.rangeOffset + change.rangeLength,
							newEndIndex: change.rangeOffset + change.text.length
						} as Parser.Edit);

						if (change.range.startLineNumber - 1 < this._startPositionRow) {
							this._startPositionRow = change.range.startLineNumber - 1;
							this._beginningCaptureIndex = 0;
							//TODO: console.log('this._startPositionRow : ', this._startPositionRow);
						};
						if (change.range.endLineNumber - 1 > this._endPositionRow) {
							this._endPositionRow = change.range.endLineNumber - 1;
							//TODO: console.log('this._endPositionRow : ', this._endPositionRow);
						};
					}
					// Note: currently parsing on ever single content change event. The parse is asynchronous.
					this.parseTree().then((tree) => {
						// Note: once parsing is done we need to rerender the tokens
						if (!tree) {
							return;
						}
						this._tree = tree;
						this.getCaptures();
						this.setTokens();
					})
				}));
			})
		})
	}

	public setTimeoutForRender(timeoutInMs: number) {
		this._timeoutForRender = timeoutInMs;
	}

	public getMatches() {
		if (!this._tree) {
			return;
		}
		const contents = readFileSync(__dirname + '\\..\\..\\..\\..\\..\\src\\vs\\editor\\browser\\services\\tokens.scm', { encoding: 'utf8' });
		const query = this._language.query(contents);
		this._matches = query.matches(this._tree.rootNode);
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
				} catch (error) { }
				if (!result) {
					return this.runParse(textModel, resolve, tree);
				} else {
					resolve(result);
				}
			},
			1000 // the time after which to actually run the parse, here it is one second
		);
	}

	public async parseTree(): Promise<Parser.Tree | void> {
		let tree = this.getTree();
		// Note: time out of 10 milliseconds is 10000 microseconds
		this._parser.setTimeoutMicros(10000);
		let result: Parser.Tree;
		try {
			result = this._parser.parse(
				(startIndex: number, startPoint: Parser.Point | undefined, endIndex: number | undefined) =>
					this._retrieveTextAtPosition(this._model, startIndex, startPoint, endIndex),
				tree
			);
			if (result) {
				return new Promise(function (resolve, _reject) {
					resolve(result);
				})
			}
		} catch (error) {
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

	public getCaptures() {
		if (!this._tree) {
			return;
		}
		const contents = readFileSync(__dirname + '\\..\\..\\..\\..\\..\\src\\vs\\editor\\browser\\services\\tokens.scm', { encoding: 'utf8' });
		const query = this._language.query(contents);
		this._captures = query.captures(this._tree.rootNode);
		this._captureNames = query.captureNames;
		// const testCaptures = this._captures.groupBy(capture => capture.node.startPosition.row);
		// console.log('this._captures : ', testCaptures);

		for (const captureName of this._captureNames) {
			const syntaxNodes: Parser.SyntaxNode[] = this._captures.filter(node => node.name === captureName).map(capture => capture.node);
			this._captureNameToNodeMap.set(captureName, syntaxNodes);
		}
		query.delete();
	}

	public setTokens(): Promise<boolean> {
		let that = this;
		this._contiguousMultilineToken = this._contiguousMultilineToken.splice(this._startPositionRow, this._endPositionRow - this._startPositionRow + 1);
		return new Promise(function (resolve, reject) {
			that.runSetTokens(resolve, reject);
		})
	}

	public runSetTokens(resolve: (value: boolean | PromiseLike<boolean>) => void, reject: (reason?: any) => void): void {
		runWhenIdle(
			() => {
				let result;
				try {
					result = this.setTokensWhenIdle();
				} catch (e) {
					reject(e);
					return;
				}
				if (!result) {
					return this.runSetTokens(resolve, resolve);
				} else {
					resolve(result);
					return;
				}
			},
			10
		)
	}

	private setTokensWhenIdle(): boolean | undefined {
		let time1 = performance.now();
		let numberCaptures = this._captures.length;

		let beginningCaptureIndex = this._beginningCaptureIndex;
		let newBeginningIndexFound = true;

		for (let i = this._startPositionRow; i <= this._endPositionRow; i++) {
			const array: Uint32Array[] = [];
			const arrayOfTokens: number[] = [];
			const line = this._model.getLineContent(i + 1);
			let j = beginningCaptureIndex;

			while (j < numberCaptures && this._captures[j].node.startPosition.row <= i) {
				if (this._captures[j].node.startPosition.row <= i && i <= this._captures[j].node.endPosition.row) {

					if (!newBeginningIndexFound) {
						newBeginningIndexFound = true;
						beginningCaptureIndex = this._captures[j].node.startPosition.row;
					}

					let endColumn;
					switch (this._captures[j].name) {

						case exceptions.FUNCTION_DECLARATION:
							endColumn = line.indexOf('function') + ('function').length + 1;
							arrayOfTokens.push(endColumn, mapWordToColor.get('keywords1') as number);
							break;
						case exceptions.METHOD_DEFINITION:
							endColumn = line.indexOf('async');
							if (endColumn > 0) {
								endColumn += ('async').length + 1;
								arrayOfTokens.push(endColumn, mapWordToColor.get('keywords1') as number);
							}
							break;
						case exceptions.AWAIT_EXPRESSION:
							endColumn = line.indexOf('await');
							if (endColumn > 0) {
								endColumn += ('await').length + 1;
								arrayOfTokens.push(endColumn, mapWordToColor.get('keywords2') as number);
							}
							break;
						case exceptions.AS_EXPRESSION:
							/*
							* endColumn = line.indexOf('as');
							* if (endColumn > 0) {
							*	endColumn += ('as').length + 1;
							*	queueOfTokens.push({ line: i + 1, column: endColumn, color: mapWordToColor.get('keywords2') as number })
							* }
							*/
							break;
						default:
							let color;
							if (mapWordToColor.has(this._captures[j].name)) {
								color = mapWordToColor.get(this._captures[j].name);
							} else {
								color = mapWordToColor.get('other');
							}
							endColumn = this._captures[j].node.endPosition.column;
							arrayOfTokens.push(endColumn, color as number);
							break;
					}
				}
				let time2 = performance.now();
				if (time2 - time1 > this._timeoutForRender) {
					return;
				}
				j++;
			}
			newBeginningIndexFound = false;
			array.push(new Uint32Array(arrayOfTokens));
			this._contiguousMultilineToken.splice(i, 0, new ContiguousMultilineTokens(i + 1, array));
			this._model.tokenization.setTokens(this._contiguousMultilineToken);
			this._startPositionRow = i + 1;
			this._beginningCaptureIndex = beginningCaptureIndex;
		}

		this._model.tokenization.setTokens(this._contiguousMultilineToken);
		return true;
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
		this._disposableStore.clear();
	}
}
