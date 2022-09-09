/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import Parser = require('web-tree-sitter');
import { DisposableStore } from 'vs/base/common/lifecycle';
import { ITextModel } from 'vs/editor/common/model';
import { IModelContentChangedEvent } from 'vs/editor/common/textModelEvents';
import { ContiguousMultilineTokens } from 'vs/editor/common/tokens/contiguousMultilineTokens';
import { runWhenIdle } from 'vs/base/common/async';
import { createTextModel } from 'vs/editor/test/common/testTextModel';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { FileAccess } from 'vs/base/common/network';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { ColorThemeData } from 'vs/workbench/services/themes/common/colorThemeData';
import { SemanticTokensProviderStylingConstants } from 'vs/editor/common/services/semanticTokensProviderStyling';
import { FontStyle, MetadataConsts } from 'vs/editor/common/encodedTokenAttributes';
import { TokenStyle } from 'vs/platform/theme/common/tokenClassificationRegistry';

export class TreeSitterParseTree {
	public readonly id: string;
	private readonly _parser: Parser;
	private readonly _disposableStore: DisposableStore = new DisposableStore();

	private _content;
	private _contiguousMultilineToken: ContiguousMultilineTokens[];
	private _beginningCaptureIndex: number;
	private _timeoutForRender: number;
	private _startPositionRow: number;
	private _endPositionRow: number;
	private _newEndPositionRow: number;
	private _edits: Parser.Edit[];
	private _colorThemeData: ColorThemeData;
	private _tree: Parser.Tree | undefined;
	private _captures: Parser.QueryCapture[];

	constructor(
		private readonly _model: ITextModel,
		private readonly _language: Parser.Language,
		@IThemeService _themeService: IThemeService,
	) {
		this.id = this._model.id;
		this._parser = new Parser();
		this._parser.setLanguage(this._language);
		this._content = '';
		this._colorThemeData = _themeService.getColorTheme() as ColorThemeData;

		this._captures = [];
		this._edits = [];
		this._contiguousMultilineToken = [];

		this._beginningCaptureIndex = 0;
		this._timeoutForRender = 0;
		this._startPositionRow = 0;
		this._endPositionRow = this._model.getLineCount() - 1;
		this._newEndPositionRow = this._model.getLineCount() - 1;

		this.setTimeoutForRender(10);
		const uriString = FileAccess.asBrowserUri(`./textMateBasedTokens.scm`, require).toString(true);

		fetch(uriString).then((response) => {
			response.text().then((content) => {
				this._content = content;

				this.parseTree().then((tree) => {
					if (!tree) {
						return;
					}
					this._tree = tree;

					this.setTokensWithThemeData().then(() => {
						this._disposableStore.add(this._model.onDidChangeContent((e: IModelContentChangedEvent) => {
							this._startPositionRow = Infinity;
							this._endPositionRow = -Infinity;
							this._newEndPositionRow = -Infinity;

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

								if (change.range.startLineNumber - 1 < this._startPositionRow) {
									this._startPositionRow = change.range.startLineNumber - 1;
									this._beginningCaptureIndex = 0;
								};
								if (change.range.endLineNumber - 1 > this._endPositionRow) {
									this._endPositionRow = change.range.endLineNumber - 1;
								};
								if (newEndPositionFromModel.lineNumber - 1 > this._newEndPositionRow) {
									this._newEndPositionRow = newEndPositionFromModel.lineNumber - 1;
								}
							}
							this.parseTree().then((tree) => {
								if (!tree) {
									return;
								}
								this._tree = tree;
								this.setTokensWithThemeData();
							})
						}));
					})
				})
			})
		})
	}

	public setTokensWithThemeData(): Promise<boolean> {
		this.getTextMateCaptures();
		let that = this;
		this._contiguousMultilineToken.splice(this._startPositionRow, this._endPositionRow - this._startPositionRow + 1); //? Do I need +1 there?

		// Case 1: we removed code
		if (this._newEndPositionRow < this._endPositionRow) {
			this._contiguousMultilineToken.map(token => {
				if (token._startLineNumber >= this._endPositionRow + 2) {
					token._startLineNumber = token._startLineNumber - (this._endPositionRow - this._startPositionRow);
				}
			})
		}
		// Case 2: we added code
		else if (this._newEndPositionRow > this._endPositionRow) {
			this._contiguousMultilineToken.map(token => {
				if (token._startLineNumber >= this._endPositionRow + 2) {
					token._startLineNumber = token._startLineNumber + (this._newEndPositionRow - this._startPositionRow);
				}
			})
		}
		return new Promise(function (resolve, reject) {
			that.runSetTokensWithThemeData(resolve, reject);
		})
	}

	public runSetTokensWithThemeData(resolve: (value: boolean | PromiseLike<boolean>) => void, reject: (reason?: any) => void): void {
		runWhenIdle(
			(arg) => {
				this._parser.setTimeoutMicros(arg.timeRemaining() * 1000);
				let result;
				try {
					result = this.setTokensWithThemeDataWhenIdle();
					if (!result) {
						return this.runSetTokensWithThemeData(resolve, resolve);
					} else {
						resolve(result);
						return;
					}
				} catch (e) {
					reject(e);
					return;
				}
			},
			10
		)
	}

	private setTokensWithThemeDataWhenIdle(): boolean | undefined {
		let time1 = performance.now();
		let newBeginningIndexFound = true;
		let numberCaptures = this._captures.length;
		let beginningCaptureIndex = this._beginningCaptureIndex;

		for (let i = this._startPositionRow; i <= this._newEndPositionRow; i++) {
			const contiguousMultilineTokensArray: number[] = [];
			let j = beginningCaptureIndex;

			while (j < numberCaptures && this._captures[j].node.startPosition.row <= i) {

				if (i === this._captures[j].node.startPosition.row && i === this._captures[j].node.endPosition.row) {
					if (!newBeginningIndexFound) {
						newBeginningIndexFound = true;
						beginningCaptureIndex = this._captures[j].node.startPosition.row;
					}

					const tokenStyle: TokenStyle | undefined = this._colorThemeData.resolveScopes([[this._captures[j].name]], {});
					let metadata: number;

					if (typeof tokenStyle === 'undefined') {
						metadata = SemanticTokensProviderStylingConstants.NO_STYLING;
					} else {
						metadata = 0;
						if (typeof tokenStyle.italic !== 'undefined') {
							const italicBit = (tokenStyle.italic ? FontStyle.Italic : 0) << MetadataConsts.FONT_STYLE_OFFSET;
							metadata |= italicBit | MetadataConsts.SEMANTIC_USE_ITALIC;
						}
						if (typeof tokenStyle.bold !== 'undefined') {
							const boldBit = (tokenStyle.bold ? FontStyle.Bold : 0) << MetadataConsts.FONT_STYLE_OFFSET;
							metadata |= boldBit | MetadataConsts.SEMANTIC_USE_BOLD;
						}
						if (typeof tokenStyle.underline !== 'undefined') {
							const underlineBit = (tokenStyle.underline ? FontStyle.Underline : 0) << MetadataConsts.FONT_STYLE_OFFSET;
							metadata |= underlineBit | MetadataConsts.SEMANTIC_USE_UNDERLINE;
						}
						if (typeof tokenStyle.strikethrough !== 'undefined') {
							const strikethroughBit = (tokenStyle.strikethrough ? FontStyle.Strikethrough : 0) << MetadataConsts.FONT_STYLE_OFFSET;
							metadata |= strikethroughBit | MetadataConsts.SEMANTIC_USE_STRIKETHROUGH;
						}
						if (tokenStyle.foreground) {
							let tokenStyleForeground = this._colorThemeData.getTokenColorIndex().get(tokenStyle?.foreground);
							const foregroundBits = tokenStyleForeground << MetadataConsts.FOREGROUND_OFFSET;
							metadata |= foregroundBits | MetadataConsts.SEMANTIC_USE_FOREGROUND;
						}
						if (metadata === 0) {
							metadata = SemanticTokensProviderStylingConstants.NO_STYLING;
						}
					}
					contiguousMultilineTokensArray.push(this._captures[j].node.endPosition.column, metadata);
				}
				let time2 = performance.now();
				if (time2 - time1 >= this._timeoutForRender) {
					return;
				}
				j++;
			}
			newBeginningIndexFound = false;

			this._contiguousMultilineToken.splice(i, 0, new ContiguousMultilineTokens(i + 1, [new Uint32Array(contiguousMultilineTokensArray)]));
			this._model.tokenization.setTokens(this._contiguousMultilineToken);
			this._beginningCaptureIndex = beginningCaptureIndex;
			this._startPositionRow = i + 1;
		}

		this._model.tokenization.setTokens(this._contiguousMultilineToken);
		return true;
	}

	public setTimeoutForRender(timeoutInMs: number) {
		this._timeoutForRender = timeoutInMs;
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
		this._tree?.delete();
		this._parser.delete();
		this._disposableStore.clear();
		this._captures.length = 0;
		this._edits.length = 0;
		this._contiguousMultilineToken.length === 0;
	}
}
