/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import Parser = require('web-tree-sitter');
import { ITextModel } from 'vs/editor/common/model';
import { runWhenIdle } from 'vs/base/common/async';
import { createTextModel } from 'vs/editor/test/common/testTextModel';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';

export interface ITreeSitterTokenizationService {
	parseTree(): Promise<Parser.Tree | void>;
	getTextMateCaptures(): void;
	dispose(): void
}

export class TreeSitterTokenizationService implements ITreeSitterTokenizationService {

	public readonly id: string;
	protected _content: string;
	protected readonly _parser: Parser;
	protected _edits: Parser.Edit[];
	protected _tree: Parser.Tree | undefined;
	protected _language: Parser.Language;
	protected _model: ITextModel;
	protected _captures: Parser.QueryCapture[];

	constructor(_model: ITextModel, _language: Parser.Language) {
		this._model = _model;
		this.id = this._model.id;
		this._edits = []
		this._parser = new Parser();
		this._language = _language;
		this._parser.setLanguage(this._language);
		this._captures = [];
		this._content = '';
	}

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
				that._runParse(textModel, resolve, tree);
			})
		}
	}

	public getTextMateCaptures(): void {
		if (!this._tree) {
			return;
		}
		const query = this._language.query(this._content);
		this._captures = query.captures(this._tree.rootNode);
		query.delete();
	}

	private getTree(): Parser.Tree | undefined {
		for (const edit of this._edits) {
			this._tree!.edit(edit);
		}
		this._edits.length = 0;
		return this._tree;
	}

	private _runParse(textModel: ITextModel, resolve: (value: Parser.Tree | PromiseLike<Parser.Tree>) => void, tree: Parser.Tree | undefined) {
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
						return this._runParse(textModel, resolve, tree);
					} else {
						resolve(result);
					}
				} catch (error) { }
			},
			1000
		);
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
		this._captures.length = 0;
		this._edits.length = 0;
	}
}
