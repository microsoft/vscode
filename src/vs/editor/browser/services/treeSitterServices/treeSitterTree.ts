/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// eslint-disable-next-line local/code-import-patterns
import type Parser = require('web-tree-sitter');
import { ITextModel } from 'vs/editor/common/model';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { IModelContentChangedEvent } from 'vs/editor/common/textModelEvents';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { IModelService } from 'vs/editor/common/services/model';
import { setTimeout0 } from 'vs/base/common/platform';
import { importAMDNodeModule } from 'vs/amdX';

export class TreeSitterTree {

	private _tree: Parser.Tree | undefined;
	private _edits: Parser.Edit[];
	private _nCallsParseTree: number;
	private _nCallsParseAsync: number;
	private readonly _modelService: IModelService;
	private readonly _store: DisposableStore = new DisposableStore();

	constructor(
		private readonly _model: ITextModel,
		_language: Parser.Language,
		_modelService: IModelService,
		private readonly _asynchronous: boolean = true,
		private readonly _parser: Parser
	) {
		this._modelService = _modelService;
		this._parser.setLanguage(_language);
		this._edits = [];
		this._nCallsParseTree = 0;
		this._nCallsParseAsync = 0;
		this._store.add(this._model.onDidChangeContent((contentChangeEvent: IModelContentChangedEvent) => {
			this.registerTreeEdits(contentChangeEvent);
		}));
	}

	public static async create(model: ITextModel, language: Parser.Language, modelService: IModelService, asynchronous: boolean = true): Promise<TreeSitterTree> {
		const Parser = await importAMDNodeModule<typeof import('web-tree-sitter')>('web-tree-sitter', 'tree-sitter.js');
		return new TreeSitterTree(model, language, modelService, asynchronous, new Parser());
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
		this._nCallsParseTree = 0;
		return this._parseTree();
	}

	public async parseTreeAndCountCalls(): Promise<number> {
		this._nCallsParseTree = 0;
		return this._parseTree().then(() => {
			return Promise.resolve(this._nCallsParseTree);
		});
	}

	private _currentParseOperation: Promise<Parser.Tree> | undefined;

	private async _parseTree(): Promise<Parser.Tree> {
		await this._currentParseOperation;
		// Case 1: Either there is no tree yet or there are edits to parse
		if (!this._tree || this._edits.length !== 0) {
			const myParseOperation = this._tryParseSync();
			this._currentParseOperation = myParseOperation;
			myParseOperation.then((tree) => {
				if (this._currentParseOperation === myParseOperation) {
					this._currentParseOperation = undefined;
				}
				if (this._edits.length !== 0) {
					return this._parseTree();
				}
				this._nCallsParseTree += 1;
				return tree;
			});
			this._nCallsParseTree += 1;
			return this._currentParseOperation;
		}
		// Case 2: Else
		else {
			this._nCallsParseTree += 1;
			return this._tree;
		}
	}

	private async _tryParseSync(): Promise<Parser.Tree> {
		if (this._asynchronous) {
			this._parser.setTimeoutMicros(10000);
		}
		const tree = this.updateAndGetTree();
		// Initially synchronous
		try {
			const result = this._parser.parse(
				(startIndex: number, startPoint: Parser.Point | undefined) =>
					this._retrieveTextAtPosition(this._model, startIndex, startPoint),
				tree
			);
			this._tree = result;
			return result;
		}
		// Else if parsing failed, asynchronous
		catch (error) {
			const model = this._modelService.createModel('', null);
			model.setValue(this._model.createSnapshot());
			this._nCallsParseAsync = 0;
			return new Promise((resolve, _reject) => {
				this._parseAsync(model, tree).then((tree) => {
					this._tree = tree;
					resolve(tree);
				});
			});
		}
	}

	private updateAndGetTree(): Parser.Tree | undefined {
		if (!this._tree) {
			return undefined;
		}
		for (const edit of this._edits) {
			this._tree.edit(edit);
		}
		this._edits.length = 0;
		return this._tree;
	}

	private _parseAsync(textModel: ITextModel, tree: Parser.Tree | undefined): Promise<Parser.Tree> {
		this._nCallsParseAsync += 1;
		return new Promise((resolve, _reject) => {
			setTimeout0(async () => {
				this._parser.setTimeoutMicros(15 * 1000);
				let result: Parser.Tree;
				try {
					result = this._parser.parse(
						(startIndex: number, startPoint: Parser.Point | undefined) =>
							this._retrieveTextAtPosition(textModel, startIndex, startPoint),
						tree
					);
					// Case 1: Either we obtain the result this iteration in which case we resolve
					this._tree = result;
					console.log('Number of calls to _parseAsync : ', this._nCallsParseAsync);
					resolve(result);
				}
				// Case 2: Here in the catch block treat the case when the parse has failed, then rerun the method
				catch (error) {
					return this._parseAsync(textModel, tree).then((tree) => {
						resolve(tree);
					});
				}
			});
		});
	}

	private _retrieveTextAtPosition(model: ITextModel, startIndex: number, _startPoint: Parser.Point | undefined) {
		const startPosition: Position = model.getPositionAt(startIndex);
		// TODO: @alexr00 what do use as an actual end index? It used to come from the parser
		const endIndex = startIndex + 5000;

		const endPosition: Position = model.getPositionAt(endIndex);
		return model.getValueInRange(Range.fromPositions(startPosition, endPosition));
	}

	public dispose() {
		this._store.dispose();
		this._tree?.delete();
		this._parser.delete();
		this._edits.length = 0;
	}
}
