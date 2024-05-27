/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { AppResourcePath, FileAccess } from 'vs/base/common/network';
import { ILanguageIdCodec } from 'vs/editor/common/languages';
import { LineTokens } from 'vs/editor/common/tokens/lineTokens';
import { IFileService } from 'vs/platform/files/common/files';
import { Parser } from 'vs/base/common/web-tree-sitter/tree-sitter-web';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { FontStyle, MetadataConsts, StandardTokenType } from 'vs/editor/common/encodedTokenAttributes';
import { TokenStyle } from 'vs/platform/theme/common/tokenClassificationRegistry';
import { ColorThemeData } from 'vs/workbench/services/themes/common/colorThemeData';
import { TextModel } from 'vs/editor/common/model/textModel';
import { ITreeSitterParserService } from 'vs/editor/common/services/treeSitterParserService';
import { IModelContentChangedEvent } from 'vs/editor/common/textModelEvents';
import { AbstractTokens, AttachedViews } from 'vs/editor/common/model/tokens';
import { LineRange } from 'vs/editor/common/core/lineRange';
import { IPosition } from 'vs/editor/common/core/position';

export class TreeSitterTokens extends AbstractTokens {
	private _colorThemeData: ColorThemeData;
	private _queries: string | undefined;
	private _tokens: TextModelTokens | undefined;
	private _lastLanguageId: string | undefined;

	constructor(private readonly _fileService: IFileService,
		private readonly _themeService: IThemeService,
		private readonly _treeSitterService: ITreeSitterParserService,
		languageIdCodec: ILanguageIdCodec,
		textModel: TextModel,
		languageId: () => string,
		attachedViews: AttachedViews) {
		super(languageIdCodec, textModel, languageId, attachedViews);
		// TODO @alexr00 respond to language changes
		this._initialize();

		// TODO @alexr00 remove the cast
		this._colorThemeData = this._themeService.getColorTheme() as ColorThemeData;
		this._register(this._themeService.onDidColorThemeChange(() => {
			this._colorThemeData = this._themeService.getColorTheme() as ColorThemeData;
			this._tokens?.reset(this._colorThemeData);
		}));
	}

	private async _initialize() {
		const newLanguage = this.getLanguageId();
		const queries = await this._getQueries(newLanguage);
		if (!this._tokens || this._lastLanguageId !== newLanguage) {
			this._tokens?.dispose();
			this._tokens = new TextModelTokens(this._treeSitterService, this._textModel, queries, this._colorThemeData);
		}
	}

	private async _getQueries(newLanguage: string): Promise<string> {
		if (!this._queries || this._lastLanguageId !== newLanguage) {
			this._queries = await this._fetchQueries(newLanguage);
		}
		return this._queries;
	}

	private async _fetchQueries(newLanguage: string): Promise<string> {
		const languageLocation = this._treeSitterService.getLanguageLocation(newLanguage);
		if (!languageLocation) {
			throw new Error(`No language location for ${newLanguage}`);
		}
		const scmPath: AppResourcePath = `${languageLocation}/highlights.scm`;
		const query = await this._fileService.readFile(FileAccess.asFileUri(scmPath));
		return query.value.toString();
	}

	public getLineTokens(lineNumber: number): LineTokens {
		if (this._tokens) {
			return new LineTokens(this._tokens.lineTokens(lineNumber), this._textModel.getLineContent(lineNumber), this._languageIdCodec);
		}
		return LineTokens.createEmpty('', this._languageIdCodec);
	}

	public resetTokenization(fireTokenChangeEvent: boolean = true): void {
		this._tokens?.reset();
		if (fireTokenChangeEvent) {
			this._onDidChangeTokens.fire({
				semanticTokensApplied: false,
				ranges: [
					{
						fromLineNumber: 1,
						toLineNumber: this._textModel.getLineCount(),
					},
				],
			});
		}
	}

	public override handleDidChangeAttached(): void {
		// TODO @alexr00 implement for background tokenization
	}

	public override handleDidChangeContent(e: IModelContentChangedEvent): void {
		if (e.isFlush) {
			// Don't fire the event, as the view might not have got the text change event yet
			this.resetTokenization(false);
		}
	}
	protected override refreshRanges(ranges: readonly LineRange[]): void {
		// TODO @alexr00 implement
	}

	public override forceTokenization(lineNumber: number): void {
		// TODO @alexr00 implement
	}

	public override hasAccurateTokensForLine(lineNumber: number): boolean {
		// TODO @alexr00 update for background tokenization
		return true;
	}

	public override isCheapToTokenize(lineNumber: number): boolean {
		// TODO @alexr00 update for background tokenization
		return true;
	}

	public override getTokenTypeIfInsertingCharacter(lineNumber: number, column: number, character: string): StandardTokenType {
		// TODO @alexr00 implement once we have custom parsing and don't just feed in the whole text model value
		return StandardTokenType.Other;
	}
	public override tokenizeLineWithEdit(position: IPosition, length: number, newText: string): LineTokens | null {
		// TODO @alexr00 understand what this is for and implement
		return null;
	}
	public override get hasTokens(): boolean {
		// TODO @alexr00 once we have a token store, implement properly
		const hasTree = this._treeSitterService.getTree(this._textModel) !== undefined;
		return hasTree;
	}

}

class TextModelTokens extends Disposable {
	private _query: Parser.Query | undefined;

	constructor(
		private readonly _treeSitterService: ITreeSitterParserService,
		private readonly _textModel: TextModel,
		private readonly _queries: string,
		private _colorThemeData: ColorThemeData) {
		super();
	}

	private _getTree(): Parser.Tree | undefined {
		return this._treeSitterService.getTree(this._textModel);
	}

	private _ensureQuery() {
		if (!this._query) {
			const language = this._treeSitterService.getLanguage(this._textModel);
			if (!language) {
				return;
			}
			this._query = language.query(this._queries);
		}
		return this._query;
	}

	public reset(colorThemeData?: ColorThemeData) {
		if (colorThemeData) {
			this._colorThemeData = colorThemeData;
		}
	}

	/**
	 * Gets the tokens for a given line.
	 * Each token takes 2 elements in the array. The first element is the offset of the end of the token *in the line, not in the document*, and the second element is the metadata.
	 *
	 * @param lineNumber
	 * @returns
	 */
	public lineTokens(lineNumber: number): Uint32Array {
		const tree = this._getTree();
		const query = this._ensureQuery();
		if (!tree || !query) {
			return new Uint32Array([0, 0]);
		}
		const lineLength = this._textModel.getLineMaxColumn(lineNumber);
		const captures = query.captures(tree.rootNode, { startPosition: { row: lineNumber - 1, column: 0 }, endPosition: { row: lineNumber - 1, column: lineLength } });
		if (captures.length === 0 && lineLength > 0) {
			// No captures, but we always want to return at least one token for each line
			return new Uint32Array([lineLength, 0]);
		}

		let tokens: Uint32Array = new Uint32Array(captures.length * 2);
		let tokenIndex = 0;
		const lineStartOffset = this._textModel.getOffsetAt({ lineNumber: lineNumber, column: 0 });

		for (let captureIndex = 0; captureIndex < captures.length; captureIndex++) {
			const capture = captures[captureIndex];
			const metadata = this.findMetadata(capture.name);

			const offset = capture.node.endIndex - lineStartOffset;
			// Not every character will get captured, so we need to make sure that our current capture doesn't bleed toward the start of the line and cover characters that it doesn't apply to.
			// We do this by creating a new token in the array if the previous token ends before the current token starts.
			if (captureIndex > 0) {
				const previousTokenEnd = tokens[(tokenIndex - 1) * 2];
				const currentTokenLength = capture.node.endIndex - capture.node.startIndex;
				const intermediateTokenOffset = offset - currentTokenLength;
				if (previousTokenEnd < intermediateTokenOffset) {
					tokens[tokenIndex * 2] = intermediateTokenOffset;
					tokens[tokenIndex * 2 + 1] = 0;
					tokenIndex++;
					const newTokens = new Uint32Array(tokens.length + 2);
					newTokens.set(tokens);
					tokens = newTokens;
				}
			}
			tokens[tokenIndex * 2] = offset;
			tokens[tokenIndex * 2 + 1] = metadata;
			tokenIndex++;
		}

		if (captures[captures.length - 1].node.endPosition.column + 1 < lineLength) {
			const newTokens = new Uint32Array(tokens.length + 2);
			newTokens.set(tokens);
			tokens = newTokens;
			tokens[tokenIndex * 2] = lineLength;
			tokens[tokenIndex * 2 + 1] = 0;
		}
		return tokens;
	}

	private findMetadata(captureName: string): number {
		const tokenStyle: TokenStyle | undefined = this._colorThemeData.resolveScopes([[captureName]]);
		if (!tokenStyle) {
			return 0;
		}

		let metadata = 0;
		if (typeof tokenStyle.italic !== 'undefined') {
			const italicBit = (tokenStyle.italic ? FontStyle.Italic : 0);
			metadata |= italicBit | MetadataConsts.ITALIC_MASK;
		}
		if (typeof tokenStyle.bold !== 'undefined') {
			const boldBit = (tokenStyle.bold ? FontStyle.Bold : 0);
			metadata |= boldBit | MetadataConsts.BOLD_MASK;
		}
		if (typeof tokenStyle.underline !== 'undefined') {
			const underlineBit = (tokenStyle.underline ? FontStyle.Underline : 0);
			metadata |= underlineBit | MetadataConsts.UNDERLINE_MASK;
		}
		if (typeof tokenStyle.strikethrough !== 'undefined') {
			const strikethroughBit = (tokenStyle.strikethrough ? FontStyle.Strikethrough : 0);
			metadata |= strikethroughBit | MetadataConsts.STRIKETHROUGH_MASK;
		}
		if (tokenStyle.foreground) {
			const tokenStyleForeground = this._colorThemeData.getTokenColorIndex().get(tokenStyle?.foreground);
			const foregroundBits = tokenStyleForeground << MetadataConsts.FOREGROUND_OFFSET;
			metadata |= foregroundBits;
		}

		return metadata;
	}

	override dispose() {
		super.dispose();
		this._query?.delete();
		this._query = undefined;
	}
}
