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

	constructor(
		private readonly _model: ITextModel,
		@ITreeSitterService _treeSitterService: ITreeSitterService,
		@IThemeService _themeService: IThemeService,
	) {
		this.id = _model.id;
		this._colorThemeData = _themeService.getColorTheme() as ColorThemeData;
		this._contiguousMultilineToken = [];
		this._beginningCaptureIndex = 0;
		this._timeoutForRender = 0;
		this._startPositionRow = 0;
		this._endPositionRow = this._model.getLineCount() - 1;
		this._newEndPositionRow = this._model.getLineCount() - 1;

		this.setTimeoutForRenderingInMs(10);

		const uriString = FileAccess.asBrowserUri(`./treeSitterColorizationQueries.scm`, require).toString(true);
		fetch(uriString).then((response) => {
			response.text().then((query) => {
				_treeSitterService.fetchLanguage().then((language) => {
					_treeSitterService.getTreeSitterCaptures(this._model, query).then((queryCaptures) => {
						if (!queryCaptures) {
							return;
						}
						this.setTokensUsingQueryCaptures(queryCaptures).then(() => {
							this._disposableStore.add(this._model.onDidChangeContent((contentChangeEvent: IModelContentChangedEvent) => {
								this.updateRowIndices(contentChangeEvent);
								_treeSitterService.getTreeSitterCaptures(this._model, query, contentChangeEvent).then((queryCaptures) => {
									if (!queryCaptures) {
										return;
									}
									this.setTokensUsingQueryCaptures(queryCaptures)
								})
							}));
						})
					});
				})
			})
		})
	}

	public setTokensUsingQueryCaptures(queryCaptures: Parser.QueryCapture[]): Promise<void> {
		let that = this;
		this._contiguousMultilineToken.splice(this._startPositionRow, this._endPositionRow - this._startPositionRow + 1); //? Do I need +1 there?

		// Case 1: code was removed
		if (this._newEndPositionRow < this._endPositionRow) {
			this._contiguousMultilineToken.map(token => {
				if (token._startLineNumber >= this._endPositionRow + 2) {
					token._startLineNumber = token._startLineNumber - (this._endPositionRow - this._startPositionRow);
				}
			})
		}
		// Case 2: code was added
		else if (this._newEndPositionRow > this._endPositionRow) {
			this._contiguousMultilineToken.map(token => {
				if (token._startLineNumber >= this._endPositionRow + 2) {
					token._startLineNumber = token._startLineNumber + (this._newEndPositionRow - this._startPositionRow);
				}
			})
		}
		return new Promise(function (resolve, _reject) {
			that.runSetTokensWithThemeData(queryCaptures, resolve);
		})
	}

	private runSetTokensWithThemeData(queryCaptures: Parser.QueryCapture[], resolve: () => void): void {
		runWhenIdle(
			(arg) => {
				this.setTimeoutForRenderingInMs(arg.timeRemaining() * 1000);
				let result;
				try {
					result = this.setTokensWithThemeDataWhenIdle(queryCaptures);
					// Case 1: timeout in rendering
					if (!result) {
						return this.runSetTokensWithThemeData(queryCaptures, resolve);
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
		)
	}

	private setTokensWithThemeDataWhenIdle(queryCaptures: Parser.QueryCapture[]): boolean {
		let time1 = performance.now();
		let newBeginningIndexFound = true;
		let numberCaptures = queryCaptures.length;
		let beginningCaptureIndex = this._beginningCaptureIndex;

		for (let i = this._startPositionRow; i <= this._newEndPositionRow; i++) {
			const contiguousMultilineTokensArray: number[] = [];
			let j = beginningCaptureIndex;

			while (j < numberCaptures && queryCaptures[j].node.startPosition.row <= i) {
				if (i === queryCaptures[j].node.startPosition.row && i === queryCaptures[j].node.endPosition.row) {
					if (!newBeginningIndexFound) {
						newBeginningIndexFound = true;
						beginningCaptureIndex = queryCaptures[j].node.startPosition.row;
					}
					contiguousMultilineTokensArray.push(queryCaptures[j].node.endPosition.column, this.findMetadata(j, queryCaptures));
				}
				let time2 = performance.now();
				if (time2 - time1 >= this._timeoutForRender) {
					return false;
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
				let tokenStyleForeground = this._colorThemeData.getTokenColorIndex().get(tokenStyle?.foreground);
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
			};
			if (change.range.endLineNumber - 1 > this._endPositionRow) {
				this._endPositionRow = change.range.endLineNumber - 1;
			};
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
		this._contiguousMultilineToken.length === 0;
	}
}
