// @ts-check

import { createTrustedTypesPolicy } from '../../../base/browser/trustedTypes.js';
import * as strings from '../../../base/common/strings.js';
import { ColorId, FontStyle, MetadataConsts } from '../../common/encodedTokenAttributes.js';
import { TokenizationRegistry } from '../../common/languages.js';
import { LineTokens } from '../../common/tokens/lineTokens.js';
import { RenderLineInput, renderViewLine2 as renderViewLine } from '../../common/viewLayout/viewLineRenderer.js';
import { ViewLineRenderingData } from '../../common/viewModel.js';
import { MonarchTokenizer } from '../common/monarch/monarchLexer.js';

const ttPolicy = createTrustedTypesPolicy('standaloneColorizer', {
	createHTML: value => value
});

const DEFAULT_TAB_SIZE = 4;

export class Colorizer {

	static async colorize(languageService, text, languageId, options = {}) {
		const tabSize = options.tabSize ?? DEFAULT_TAB_SIZE;
		const languageIdCodec = languageService.languageIdCodec;

		if (strings.startsWithUTF8BOM(text)) {
			text = text.slice(1);
		}

		const lines = strings.splitLines(text);

		// fallback if language not registered
		if (!languageService.isRegisteredLanguageId(languageId)) {
			return this._renderPlain(lines, tabSize, languageIdCodec);
		}

		const tokenizer = await TokenizationRegistry.getOrCreate(languageId);

		if (!tokenizer) {
			return this._renderPlain(lines, tabSize, languageIdCodec);
		}

		return this._renderWithTokenizer(lines, tabSize, tokenizer, languageIdCodec);
	}

	static async _renderWithTokenizer(lines, tabSize, tokenizer, codec) {
		let html = [];
		let state = tokenizer.getInitialState();

		for (const line of lines) {
			const result = tokenizer.tokenizeEncoded(line, true, state);
			state = result.endState;

			const tokens = this._buildLineTokens(result.tokens, line, codec);
			html.push(this._renderLine(line, tokens, tabSize));
			html.push('<br/>');
		}

		// handle async Monarch loading
		if (tokenizer instanceof MonarchTokenizer) {
			const status = tokenizer.getLoadStatus();
			if (!status.loaded) {
				await status.promise;
				return this._renderWithTokenizer(lines, tabSize, tokenizer, codec);
			}
		}

		return html.join('');
	}

	static _renderPlain(lines, tabSize, codec) {
		const defaultMetadata = (
			(FontStyle.None << MetadataConsts.FONT_STYLE_OFFSET) |
			(ColorId.DefaultForeground << MetadataConsts.FOREGROUND_OFFSET) |
			(ColorId.DefaultBackground << MetadataConsts.BACKGROUND_OFFSET)
		) >>> 0;

		let html = [];

		for (const line of lines) {
			const tokens = new Uint32Array([line.length, defaultMetadata]);
			const lineTokens = new LineTokens(tokens, line, codec);

			html.push(this._renderLine(line, lineTokens, tabSize));
			html.push('<br/>');
		}

		return html.join('');
	}

	static _buildLineTokens(encodedTokens, line, codec) {
		LineTokens.convertToEndOffset(encodedTokens, line.length);
		return new LineTokens(encodedTokens, line, codec).inflate();
	}

	static _renderLine(line, tokens, tabSize) {
		const isASCII = ViewLineRenderingData.isBasicASCII(line, true);
		const hasRTL = ViewLineRenderingData.containsRTL(line, isASCII, true);

		const result = renderViewLine(new RenderLineInput(
			false, true, line, false,
			isASCII, hasRTL,
			0, tokens, [],
			tabSize, 0, 0, 0, 0,
			-1, 'none', false, false,
			null, null, 0
		));

		return result.html;
	}

	static async colorizeElement(themeService, languageService, domNode, options = {}) {
		const theme = options.theme ?? 'vs';
		const mime = options.mimeType ?? domNode.getAttribute('lang') ?? domNode.getAttribute('data-lang');

		if (!mime) {
			console.error('Language not detected');
			return;
		}

		const languageId = languageService.getLanguageIdByMimeType(mime) || mime;
		const text = domNode.textContent ?? '';

		themeService.setTheme(theme);
		domNode.classList.add(theme);

		try {
			const html = await this.colorize(languageService, text, languageId, options);
			domNode.innerHTML = ttPolicy?.createHTML(html) ?? html;
		} catch (err) {
			console.error('Colorization failed:', err);
		}
	}
}
