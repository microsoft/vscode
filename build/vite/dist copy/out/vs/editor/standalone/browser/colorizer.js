/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { createTrustedTypesPolicy } from '../../../base/browser/trustedTypes.js';
import * as strings from '../../../base/common/strings.js';
import { TokenizationRegistry } from '../../common/languages.js';
import { LineTokens } from '../../common/tokens/lineTokens.js';
import { RenderLineInput, renderViewLine2 as renderViewLine } from '../../common/viewLayout/viewLineRenderer.js';
import { ViewLineRenderingData } from '../../common/viewModel.js';
import { MonarchTokenizer } from '../common/monarch/monarchLexer.js';
const ttPolicy = createTrustedTypesPolicy('standaloneColorizer', { createHTML: value => value });
export class Colorizer {
    static colorizeElement(themeService, languageService, domNode, options) {
        options = options || {};
        const theme = options.theme || 'vs';
        const mimeType = options.mimeType || domNode.getAttribute('lang') || domNode.getAttribute('data-lang');
        if (!mimeType) {
            console.error('Mode not detected');
            return Promise.resolve();
        }
        const languageId = languageService.getLanguageIdByMimeType(mimeType) || mimeType;
        themeService.setTheme(theme);
        const text = domNode.firstChild ? domNode.firstChild.nodeValue : '';
        domNode.className += ' ' + theme;
        const render = (str) => {
            const trustedhtml = ttPolicy?.createHTML(str) ?? str;
            domNode.innerHTML = trustedhtml;
        };
        return this.colorize(languageService, text || '', languageId, options).then(render, (err) => console.error(err));
    }
    static async colorize(languageService, text, languageId, options) {
        const languageIdCodec = languageService.languageIdCodec;
        let tabSize = 4;
        if (options && typeof options.tabSize === 'number') {
            tabSize = options.tabSize;
        }
        if (strings.startsWithUTF8BOM(text)) {
            text = text.substr(1);
        }
        const lines = strings.splitLines(text);
        if (!languageService.isRegisteredLanguageId(languageId)) {
            return _fakeColorize(lines, tabSize, languageIdCodec);
        }
        const tokenizationSupport = await TokenizationRegistry.getOrCreate(languageId);
        if (tokenizationSupport) {
            return _colorize(lines, tabSize, tokenizationSupport, languageIdCodec);
        }
        return _fakeColorize(lines, tabSize, languageIdCodec);
    }
    static colorizeLine(line, mightContainNonBasicASCII, mightContainRTL, tokens, tabSize = 4) {
        const isBasicASCII = ViewLineRenderingData.isBasicASCII(line, mightContainNonBasicASCII);
        const containsRTL = ViewLineRenderingData.containsRTL(line, isBasicASCII, mightContainRTL);
        const renderResult = renderViewLine(new RenderLineInput(false, true, line, false, isBasicASCII, containsRTL, 0, tokens, [], tabSize, 0, 0, 0, 0, -1, 'none', false, false, null, null, 0));
        return renderResult.html;
    }
    static colorizeModelLine(model, lineNumber, tabSize = 4) {
        const content = model.getLineContent(lineNumber);
        model.tokenization.forceTokenization(lineNumber);
        const tokens = model.tokenization.getLineTokens(lineNumber);
        const inflatedTokens = tokens.inflate();
        return this.colorizeLine(content, model.mightContainNonBasicASCII(), model.mightContainRTL(), inflatedTokens, tabSize);
    }
}
function _colorize(lines, tabSize, tokenizationSupport, languageIdCodec) {
    return new Promise((c, e) => {
        const execute = () => {
            const result = _actualColorize(lines, tabSize, tokenizationSupport, languageIdCodec);
            if (tokenizationSupport instanceof MonarchTokenizer) {
                const status = tokenizationSupport.getLoadStatus();
                if (status.loaded === false) {
                    status.promise.then(execute, e);
                    return;
                }
            }
            c(result);
        };
        execute();
    });
}
function _fakeColorize(lines, tabSize, languageIdCodec) {
    let html = [];
    const defaultMetadata = ((0 /* FontStyle.None */ << 11 /* MetadataConsts.FONT_STYLE_OFFSET */)
        | (1 /* ColorId.DefaultForeground */ << 15 /* MetadataConsts.FOREGROUND_OFFSET */)
        | (2 /* ColorId.DefaultBackground */ << 24 /* MetadataConsts.BACKGROUND_OFFSET */)) >>> 0;
    const tokens = new Uint32Array(2);
    tokens[0] = 0;
    tokens[1] = defaultMetadata;
    for (let i = 0, length = lines.length; i < length; i++) {
        const line = lines[i];
        tokens[0] = line.length;
        const lineTokens = new LineTokens(tokens, line, languageIdCodec);
        const isBasicASCII = ViewLineRenderingData.isBasicASCII(line, /* check for basic ASCII */ true);
        const containsRTL = ViewLineRenderingData.containsRTL(line, isBasicASCII, /* check for RTL */ true);
        const renderResult = renderViewLine(new RenderLineInput(false, true, line, false, isBasicASCII, containsRTL, 0, lineTokens, [], tabSize, 0, 0, 0, 0, -1, 'none', false, false, null, null, 0));
        html = html.concat(renderResult.html);
        html.push('<br/>');
    }
    return html.join('');
}
function _actualColorize(lines, tabSize, tokenizationSupport, languageIdCodec) {
    let html = [];
    let state = tokenizationSupport.getInitialState();
    for (let i = 0, length = lines.length; i < length; i++) {
        const line = lines[i];
        const tokenizeResult = tokenizationSupport.tokenizeEncoded(line, true, state);
        LineTokens.convertToEndOffset(tokenizeResult.tokens, line.length);
        const lineTokens = new LineTokens(tokenizeResult.tokens, line, languageIdCodec);
        const isBasicASCII = ViewLineRenderingData.isBasicASCII(line, /* check for basic ASCII */ true);
        const containsRTL = ViewLineRenderingData.containsRTL(line, isBasicASCII, /* check for RTL */ true);
        const renderResult = renderViewLine(new RenderLineInput(false, true, line, false, isBasicASCII, containsRTL, 0, lineTokens.inflate(), [], tabSize, 0, 0, 0, 0, -1, 'none', false, false, null, null, 0));
        html = html.concat(renderResult.html);
        html.push('<br/>');
        state = tokenizeResult.endState;
    }
    return html.join('');
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29sb3JpemVyLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvZWRpdG9yL3N0YW5kYWxvbmUvYnJvd3Nlci9jb2xvcml6ZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFDakYsT0FBTyxLQUFLLE9BQU8sTUFBTSxpQ0FBaUMsQ0FBQztBQUUzRCxPQUFPLEVBQTBDLG9CQUFvQixFQUFFLE1BQU0sMkJBQTJCLENBQUM7QUFHekcsT0FBTyxFQUFtQixVQUFVLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUNoRixPQUFPLEVBQUUsZUFBZSxFQUFFLGVBQWUsSUFBSSxjQUFjLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUNqSCxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSwyQkFBMkIsQ0FBQztBQUNsRSxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUdyRSxNQUFNLFFBQVEsR0FBRyx3QkFBd0IsQ0FBQyxxQkFBcUIsRUFBRSxFQUFFLFVBQVUsRUFBRSxLQUFLLENBQUMsRUFBRSxDQUFDLEtBQUssRUFBRSxDQUFDLENBQUM7QUFXakcsTUFBTSxPQUFPLFNBQVM7SUFFZCxNQUFNLENBQUMsZUFBZSxDQUFDLFlBQXFDLEVBQUUsZUFBaUMsRUFBRSxPQUFvQixFQUFFLE9BQWlDO1FBQzlKLE9BQU8sR0FBRyxPQUFPLElBQUksRUFBRSxDQUFDO1FBQ3hCLE1BQU0sS0FBSyxHQUFHLE9BQU8sQ0FBQyxLQUFLLElBQUksSUFBSSxDQUFDO1FBQ3BDLE1BQU0sUUFBUSxHQUFHLE9BQU8sQ0FBQyxRQUFRLElBQUksT0FBTyxDQUFDLFlBQVksQ0FBQyxNQUFNLENBQUMsSUFBSSxPQUFPLENBQUMsWUFBWSxDQUFDLFdBQVcsQ0FBQyxDQUFDO1FBQ3ZHLElB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