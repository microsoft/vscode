/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ILanguageIdCodec, ITreeSitterTokenizationSupport, TreeSitterTokenizationRegistry } from 'vs/editor/common/languages';
import { LineTokens } from 'vs/editor/common/tokens/lineTokens';
import { StandardTokenType } from 'vs/editor/common/encodedTokenAttributes';
import { TextModel } from 'vs/editor/common/model/textModel';
import { ITreeSitterParserService } from 'vs/editor/common/services/treeSitterParserService';
import { IModelContentChangedEvent } from 'vs/editor/common/textModelEvents';
import { AbstractTokens, AttachedViews } from 'vs/editor/common/model/tokens';
import { LineRange } from 'vs/editor/common/core/lineRange';
import { IPosition } from 'vs/editor/common/core/position';

export class TreeSitterTokens extends AbstractTokens {
	private _textModelTokens!: ITreeSitterTokenizationSupport | null;
	private _lastLanguageId: string | undefined;

	constructor(private readonly _treeSitterService: ITreeSitterParserService,
		languageIdCodec: ILanguageIdCodec,
		textModel: TextModel,
		languageId: () => string,
		attachedViews: AttachedViews) {
		super(languageIdCodec, textModel, languageId, attachedViews);

		this._initialize();
		this._register(this._textModel.onDidChangeLanguage(() => this._initialize()));
	}

	private _initialize() {
		const newLanguage = this.getLanguageId();
		if (!this._textModelTokens || this._lastLanguageId !== newLanguage) {
			const support = TreeSitterTokenizationRegistry.get(newLanguage);
			if (!support) {
				return;
			}
			this._lastLanguageId = newLanguage;
			this._textModelTokens = TreeSitterTokenizationRegistry.get(newLanguage);
		}
	}

	public getLineTokens(lineNumber: number): LineTokens {
		if (this._textModelTokens) {
			return new LineTokens(this._textModelTokens.tokenizeEncoded(lineNumber, this._textModel), this._textModel.getLineContent(lineNumber), this._languageIdCodec);
		}
		return LineTokens.createEmpty('', this._languageIdCodec);
	}

	public resetTokenization(fireTokenChangeEvent: boolean = true): void {
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
