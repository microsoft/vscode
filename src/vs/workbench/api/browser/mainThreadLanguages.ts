/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI, UriComponents } from '../../../base/common/uri.js';
import { ILanguageService } from '../../../editor/common/languages/language.js';
import { IModelService } from '../../../editor/common/services/model.js';
import { MainThreadLanguagesShape, MainContext, ExtHostContext, ExtHostLanguagesShape, ISyntaxHighlightingResultDto, ISyntaxHighlightingTokenDto } from '../common/extHost.protocol.js';
import { extHostNamedCustomer, IExtHostContext } from '../../services/extensions/common/extHostCustomers.js';
import { IPosition } from '../../../editor/common/core/position.js';
import { IRange, Range } from '../../../editor/common/core/range.js';
import { StandardTokenType, TokenMetadata, FontStyle } from '../../../editor/common/encodedTokenAttributes.js';
import { TokenizationRegistry } from '../../../editor/common/languages.js';
import { Color } from '../../../base/common/color.js';
import { ITextModelService } from '../../../editor/common/services/resolverService.js';
import { ILanguageStatus, ILanguageStatusService } from '../../services/languageStatus/common/languageStatusService.js';
import { Disposable, DisposableMap } from '../../../base/common/lifecycle.js';
import { ITextMateTokenizationService } from '../../services/textMate/browser/textMateTokenizationFeature.js';
import { IThemeService } from '../../../platform/theme/common/themeService.js';

@extHostNamedCustomer(MainContext.MainThreadLanguages)
export class MainThreadLanguages extends Disposable implements MainThreadLanguagesShape {

	private readonly _proxy: ExtHostLanguagesShape;

	private readonly _status = this._register(new DisposableMap<number>());

	constructor(
		_extHostContext: IExtHostContext,
		@ILanguageService private readonly _languageService: ILanguageService,
		@IModelService private readonly _modelService: IModelService,
		@ITextModelService private _resolverService: ITextModelService,
		@ILanguageStatusService private readonly _languageStatusService: ILanguageStatusService,
		@ITextMateTokenizationService private readonly _textMateService: ITextMateTokenizationService,
		@IThemeService themeService: IThemeService,
	) {
		super();
		this._proxy = _extHostContext.getProxy(ExtHostContext.ExtHostLanguages);

		this._proxy.$acceptLanguageIds(_languageService.getRegisteredLanguageIds());
		this._register(_languageService.onDidChange(_ => {
			this._proxy.$acceptLanguageIds(_languageService.getRegisteredLanguageIds());
		}));
		this._register(themeService.onDidColorThemeChange(() => {
			this._proxy.$acceptSyntaxHighlightingThemeChanged();
		}));
	}

	async $changeLanguage(resource: UriComponents, languageId: string): Promise<void> {

		if (!this._languageService.isRegisteredLanguageId(languageId)) {
			return Promise.reject(new Error(`Unknown language id: ${languageId}`));
		}

		const uri = URI.revive(resource);
		const ref = await this._resolverService.createModelReference(uri);
		try {
			ref.object.textEditorModel.setLanguage(this._languageService.createById(languageId));
		} finally {
			ref.dispose();
		}
	}

	async $tokensAtPosition(resource: UriComponents, position: IPosition): Promise<undefined | { type: StandardTokenType; range: IRange }> {
		const uri = URI.revive(resource);
		const model = this._modelService.getModel(uri);
		if (!model) {
			return undefined;
		}
		model.tokenization.tokenizeIfCheap(position.lineNumber);
		const tokens = model.tokenization.getLineTokens(position.lineNumber);
		const idx = tokens.findTokenIndexAtOffset(position.column - 1);
		return {
			type: tokens.getStandardTokenType(idx),
			range: new Range(position.lineNumber, 1 + tokens.getStartOffset(idx), position.lineNumber, 1 + tokens.getEndOffset(idx))
		};
	}

	async $computeFullSyntaxHighlighting(source: string, languageId: string): Promise<ISyntaxHighlightingResultDto> {
		const colorMap = (TokenizationRegistry.getColorMap() ?? []).map((c: Color | null) => c ? Color.Format.CSS.formatHexA(c) : '');
		const resolvedLanguageId = this._languageService.isRegisteredLanguageId(languageId)
			? languageId
			: this._languageService.getLanguageIdByLanguageName(languageId);
		const grammar = resolvedLanguageId
			? await this._textMateService.createTokenizer(resolvedLanguageId)
			: null;

		if (!grammar) {
			const tokens: ISyntaxHighlightingTokenDto[] = source.length === 0 ? [] : [{ length: source.length, foreground: 0, fontStyle: FontStyle.None }];
			return { tokens, colorMap };
		}

		const tokens: ISyntaxHighlightingTokenDto[] = [];
		const lines = source.split('\n');
		let state = null;
		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			const result = grammar.tokenizeLine2(line, state, 500);
			state = result.ruleStack;
			const binary = result.tokens;
			for (let j = 0; j < binary.length; j += 2) {
				const startOffset = binary[j];
				const metadata = binary[j + 1];
				const endOffset = j + 2 < binary.length ? binary[j + 2] : line.length;
				if (endOffset > startOffset) {
					tokens.push({
						length: endOffset - startOffset,
						foreground: TokenMetadata.getForeground(metadata),
						fontStyle: TokenMetadata.getFontStyle(metadata),
					});
				}
			}
			if (i < lines.length - 1) {
				tokens.push({ length: 1, foreground: 0, fontStyle: FontStyle.None }); // newline char
			}
		}
		return { tokens, colorMap };
	}

	// --- language status

	$setLanguageStatus(handle: number, status: ILanguageStatus): void {
		this._status.set(handle, this._languageStatusService.addStatus(status));
	}

	$removeLanguageStatus(handle: number): void {
		this._status.deleteAndDispose(handle);
	}
}
