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
import { FileAccess } from 'vs/base/common/network';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { ColorThemeData } from 'vs/workbench/services/themes/common/colorThemeData';
import { SemanticTokensProviderStylingConstants } from 'vs/editor/common/services/semanticTokensProviderStyling';
import { FontStyle, MetadataConsts } from 'vs/editor/common/encodedTokenAttributes';
import { TokenStyle } from 'vs/platform/theme/common/tokenClassificationRegistry';
import { ITreeSitterService } from 'vs/editor/browser/services/treeSitterServices/treeSitterService';
import { IFileService } from 'vs/platform/files/common/files';
import { StopWatch } from 'vs/base/common/stopwatch';

export class TreeSitterColorizationTree {

	public id: string;
	private readonly _disposableStore: DisposableStore = new DisposableStore();
	private _contiguousMultilineToken: ContiguousMultilineTokens[];
	private _beginningCaptureIndex: number;
	private _timeoutForRender: number;
	private _startPositionRow: number;
	private _endPositionRow: number;
	private _newEndPositionRow: number;
	private _colorThemeData: ColorThemeData;
	private _fileService: IFileService;
	private _nCallsToRunSetTokensWithThemeData: number;

	constructor(
		private readonly _model: ITextModel,
		@ITreeSitterService _treeSitterService: ITreeSitterService,
		@IThemeService _themeService: IThemeService,
		@IFileService _fileService: IFileService,
		private readonly _asynchronous: boolean = true
	) {
		console.log('Inside TreeSitterColorizationTree for _asynchronous : ', _asynchronous);
		this.id = _model.id;
		this._fileService = _fileService;
		this._colorThemeData = _themeService.getColorTheme() as ColorThemeData;
		this._contiguousMultilineToken = [];
		this._beginningCaptureIndex = 0;
		this._timeoutForRender = 0;
		this._startPositionRow = 0;
		this._endPositionRow = this._model.getLineCount() - 1;
		this._newEndPositionRow = this._model.getLineCount() - 1;
		this._nCallsToRunSetTokensWithThemeData = 0;

		this.setTimeoutForRenderingInMs(10);
		this._fetchQueries().then((query) => {
			_treeSitterService.getTreeSitterCaptures(this._model, query, this._asynchronous).then((queryCaptures) => {
				if (!queryCaptures) {
					return;
				}
				const sw = StopWatch.create(true);
				this.setTokensUsingQueryCaptures(queryCaptures, this._asynchronous).then(() => {
					console.log('Time to set tokens : ', sw.elapsed());
					console.log('Number of calls to runSetTokensWithThemeData : ', this._nCallsToRunSetTokensWithThemeData);
					this._disposableStore.add(this._model.onDidChangeContent((contentChangeEvent: IModelContentChangedEvent) => {
						this.updateRowIndices(contentChangeEvent);
						_treeSitterService.getTreeSitterCaptures(this._model, query, this._asynchronous, this._startPositionRow).then((queryCaptures) => {
							if (!queryCaptures) {
								return;
							}
							this.setTokensUsingQueryCaptures(queryCaptures, this._asynchronous);
						});
					}));
				});
			});
		});
	}

	private async _fetchQueries(): Promise<string> {
		const query = await this._fileService.readFile(FileAccess.asFileUri(`./treeSitterColorizationQueries.scm`, require));
		return Promise.resolve(query.value.toString());
	}

	public setTokensUsingQueryCaptures(queryCaptures: Parser.QueryCapture[], asynchronous: boolean = true): Promise<void> {
		const that = this;
		this._contiguousMultilineToken.splice(this._startPositionRow, this._model.getLineCount() - this._startPositionRow + 1);

		// Case 1: code was removed
		if (this._newEndPositionRow < this._endPositionRow) {
			this._contiguousMultilineToken.map(token => {
				if (token._startLineNumber >= this._endPositionRow + 2) {
					token._startLineNumber = token._startLineNumber - (this._endPositionRow - this._startPositionRow);
				}
			});
		}
		// Case 2: code was added
		else if (this._newEndPositionRow > this._endPositionRow) {
			this._contiguousMultilineToken.map(token => {
				if (token._startLineNumber >= this._endPositionRow + 2) {
					token._startLineNumber = token._startLineNumber + (this._newEndPositionRow - this._startPositionRow);
				}
			});
		}
		this._nCallsToRunSetTokensWithThemeData = 0;
		return new Promise(function (resolve, _reject) {
			return that.runSetTokensWithThemeData(queryCaptures, resolve, asynchronous);
		});
	}

	private runSetTokensWithThemeData(queryCaptures: Parser.QueryCapture[], resolve: () => void, asynchronous: boolean = true): void {
		this._nCallsToRunSetTokensWithThemeData += 1;
		if (asynchronous) {
			runWhenIdle(
				(arg) => {
					this.setTimeoutForRenderingInMs(arg.timeRemaining() * 1000);
					let result;
					try {
						result = this.setTokensWithThemeDataWhenIdle(queryCaptures, asynchronous);
						// Case 1: timeout in rendering
						if (!result) {
							return this.runSetTokensWithThemeData(queryCaptures, resolve, asynchronous);
						}
						// Case 2: rendering finished
						else {
							resolve();
							return;
						}
					} catch (e) {
						return;
					}
				},
				10
			);
		} else {
			this.setTokensWithThemeDataWhenIdle(queryCaptures, asynchronous);
			resolve();
			return;
		}
	}

	private setTokensWithThemeDataWhenIdle(queryCaptures: Parser.QueryCapture[], asynchronous: boolean = true): boolean {
		const time1 = performance.now();
		let newBeginningIndexFound = true;
		const numberCaptures = queryCaptures.length;
		let beginningCaptureIndex = this._beginningCaptureIndex;

		for (let i = this._startPositionRow; i <= this._model.getLineCount() - 1; i++) {
			const contiguousMultilineTokensArray: number[] = [];
			let j = beginningCaptureIndex;

			while (j < numberCaptures && queryCaptures[j].node.startPosition.row <= i) {
				if (i === queryCaptures[j].node.startPosition.row && i === queryCaptures[j].node.endPosition.row ||
					queryCaptures[j].name === 'comment.block.ts' && i >= queryCaptures[j].node.startPosition.row && i <= queryCaptures[j].node.endPosition.row
				) {
					if (!newBeginningIndexFound) {
						newBeginningIndexFound = true;
						beginningCaptureIndex = j;
					}
					contiguousMultilineTokensArray.push(queryCaptures[j].node.endPosition.column, this.findMetadata(j, queryCaptures));
				}
				if (asynchronous) {
					const time2 = performance.now();
					if (time2 - time1 >= this._timeoutForRender) {
						this._model.tokenization.setTokens(this._contiguousMultilineToken);
						return false;
					}
				}
				j++;
			}
			newBeginningIndexFound = false;
			this._contiguousMultilineToken.splice(i, 0, new ContiguousMultilineTokens(i + 1, [new Uint32Array(contiguousMultilineTokensArray)]));
			// this._model.tokenization.setTokens(this._contiguousMultilineToken);
			this._beginningCaptureIndex = beginningCaptureIndex;
			this._startPositionRow = i + 1;
		}
		this._model.tokenization.setTokens(this._contiguousMultilineToken);
		return true;
	}

	private findMetadata(index: number, queryCaptures: Parser.QueryCapture[]): number {
		const tokenStyle: TokenStyle | undefined = this._colorThemeData.resolveScopes([[queryCaptures![index].name]], {});
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
				const tokenStyleForeground = this._colorThemeData.getTokenColorIndex().get(tokenStyle?.foreground);
				const foregroundBits = tokenStyleForeground << MetadataConsts.FOREGROUND_OFFSET;
				metadata |= foregroundBits | MetadataConsts.SEMANTIC_USE_FOREGROUND;
			}
			if (metadata === 0) {
				metadata = SemanticTokensProviderStylingConstants.NO_STYLING;
			}
		}
		return metadata;
	}

	private updateRowIndices(e: IModelContentChangedEvent): void {

		this._startPositionRow = Infinity;
		this._endPositionRow = -Infinity;
		this._newEndPositionRow = -Infinity;

		for (const change of e.changes) {
			const newEndPositionFromModel = this._model.getPositionAt(change.rangeOffset + change.text.length);
			if (change.range.startLineNumber - 1 < this._startPositionRow) {
				this._startPositionRow = change.range.startLineNumber - 1;
				this._beginningCaptureIndex = 0;
			}
			if (change.range.endLineNumber - 1 > this._endPositionRow) {
				this._endPositionRow = change.range.endLineNumber - 1;
			}
			if (newEndPositionFromModel.lineNumber - 1 > this._newEndPositionRow) {
				this._newEndPositionRow = newEndPositionFromModel.lineNumber - 1;
			}
		}
	}

	private setTimeoutForRenderingInMs(timeoutInMs: number) {
		this._timeoutForRender = timeoutInMs;
	}

	public dispose() {
		this._disposableStore.clear();
		this._contiguousMultilineToken.length = 0;
	}
}
