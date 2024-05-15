/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { AppResourcePath, FileAccess } from 'vs/base/common/network';
import { ILanguageIdCodec, TreeSitterTokenizationRegistry } from 'vs/editor/common/languages';
import { LineTokens } from 'vs/editor/common/tokens/lineTokens';
import { IFileService } from 'vs/platform/files/common/files';
import { Parser } from 'vs/base/common/web-tree-sitter/tree-sitter-web';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { FontStyle, MetadataConsts } from 'vs/editor/common/encodedTokenAttributes';
import { TokenStyle } from 'vs/platform/theme/common/tokenClassificationRegistry';
import { ColorThemeData } from 'vs/workbench/services/themes/common/colorThemeData';
import { TextModel } from 'vs/editor/common/model/textModel';
import { ITreeSitterTokenizationService } from 'vs/editor/browser/services/treeSitter/treeSitterTokenizationFeature';

export class TreeSitterTokens extends Disposable {
	private _colorThemeData: ColorThemeData;
	private _parser: Parser | undefined;
	private _language: Parser.Language | undefined;
	private _queries: string | undefined;
	private _tokens: TextModelTokens | undefined;
	private _lastLanguageId: string | undefined;

	constructor(private readonly _fileService: IFileService,
		private readonly _themeService: IThemeService,
		private readonly _treeSitterService: ITreeSitterTokenizationService,
		private readonly _languageIdCoded: ILanguageIdCodec,
		private readonly _textModel: TextModel,
		private readonly _languageId: () => string) {
		super();
		// TODO @alexr00 respond to language changes
		this._initialize();

		// TODO @alexr00 remove the cast
		this._colorThemeData = this._themeService.getColorTheme() as ColorThemeData;
		// TODO @alexr00 respond to theme changes
	}

	private async _initialize() {
		const parser = await this._getParser();
		const newLanguage = this._languageId();
		const [language, queries] = await Promise.all([this._getLanguage(newLanguage), this._getQueries(newLanguage)]);
		parser.setLanguage(language);
		if (!this._tokens || this._lastLanguageId !== newLanguage) {
			this._tokens?.dispose();
			this._tokens = new TextModelTokens(this._textModel, parser, queries, language, this._colorThemeData);
		}

	}

	private async _getParser(): Promise<Parser> {
		if (!this._parser) {
			await this._treeSitterService.initTreeSitter();
			this._parser = new Parser();
		}
		return this._parser;
	}

	private async _getLanguage(newLanguage: string): Promise<Parser.Language> {
		if (!this._language || this._lastLanguageId !== newLanguage) {
			this._language = await this._fetchLanguage();
		}
		return this._language;
	}

	private async _fetchLanguage() {
		const grammarName = TreeSitterTokenizationRegistry.get(this._languageId());
		const wasmPath: AppResourcePath = `vs/base/common/treeSitterLanguages/${grammarName?.name}/${grammarName?.name}.wasm`;
		const languageFile = await (this._fileService.readFile(FileAccess.asFileUri(wasmPath)));
		return Parser.Language.load(languageFile.value.buffer);
	}

	private async _getQueries(newLanguage: string): Promise<string> {
		if (!this._queries || this._lastLanguageId !== newLanguage) {
			this._queries = await this._fetchQueries(newLanguage);
		}
		return this._queries;
	}

	private async _fetchQueries(newLanguage: string): Promise<string> {
		const grammarName = TreeSitterTokenizationRegistry.get(newLanguage);
		const scmPath: AppResourcePath = `vs/base/common/treeSitterLanguages/${grammarName?.name}/highlights.scm`;
		const query = await this._fileService.readFile(FileAccess.asFileUri(scmPath));
		return query.value.toString();
	}


	public getLineTokens(lineNumber: number): LineTokens {
		if (this._tokens) {
			return new LineTokens(this._tokens.lineTokens(lineNumber), this._textModel.getLineContent(lineNumber), this._languageIdCoded);
		}
		// placeholder for now
		return LineTokens.createEmpty('', this._languageIdCoded);
	}

	public resetTokenization(fireTokenChangeEvent: boolean = true): void {
		// placeholder for now
	}

}


/**
 * For handling the text model changes.
 */
class TextModelTokens extends Disposable {
	private _tree: Parser.Tree | undefined;
	private _query: Parser.Query | undefined;

	constructor(private readonly _textModel: TextModel,
		private readonly _parser: Parser,
		private readonly _queries: string,
		private readonly _language: Parser.Language,
		private readonly _colorThemeData: ColorThemeData) {
		super();
	}

	private _ensureTree() {
		if (!this._tree) {
			this._tree = this._parser.parse(this._textModel.getValue());
		}
		return this._tree;
	}

	private _ensureQuery() {
		if (!this._query) {
			this._query = this._language.query(this._queries);
		}
		return this._query;
	}

	/**
	 * Gets the tokens for a given line.
	 * Each token takes 2 elements in the array. The first element is the offset of the token *in the line, not in the document*, and the second element is the metadata.
	 *
	 * @param lineNumber
	 * @returns
	 */
	public lineTokens(lineNumber: number): Uint32Array {
		const tree = this._ensureTree();
		const query = this._ensureQuery();
		const captures = query.captures(tree.rootNode, { startPosition: { row: lineNumber - 1, column: 0 }, endPosition: { row: lineNumber - 1, column: this._textModel.getLineMaxColumn(lineNumber) - 1 } });

		const tokens: Uint32Array = new Uint32Array(captures.length * 2);
		for (let i = 0; i < captures.length; i++) {
			const capture = captures[i];
			const metadata = this.findMetadata(capture.name);
			const lineStartOffset = this._textModel.getOffsetAt({ lineNumber: lineNumber, column: 0 });
			const offset = this._textModel.getOffsetAt({ lineNumber: capture.node.endPosition.row + 1, column: capture.node.endPosition.column + 1 }) - lineStartOffset;
			tokens[i * 2] = offset;
			tokens[i * 2 + 1] = metadata;
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
		this._tree?.delete();
		this._query?.delete();
		this._tree = undefined;
		this._query = undefined;
	}

}
