/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var EditorMarkdownCodeBlockRenderer_1;
import { isHTMLElement } from '../../../../../base/browser/dom.js';
import { createTrustedTypesPolicy } from '../../../../../base/browser/trustedTypes.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { createBareFontInfoFromRawSettings } from '../../../../common/config/fontInfoFromSettings.js';
import { ILanguageService } from '../../../../common/languages/language.js';
import { PLAINTEXT_LANGUAGE_ID } from '../../../../common/languages/modesRegistry.js';
import { tokenizeToString } from '../../../../common/languages/textToHtmlTokenizer.js';
import { applyFontInfo } from '../../../config/domFontInfo.js';
import { isCodeEditor } from '../../../editorBrowser.js';
import './renderedMarkdown.css';
/**
 * Renders markdown code blocks using the editor's tokenization and font settings.
 */
let EditorMarkdownCodeBlockRenderer = class EditorMarkdownCodeBlockRenderer {
    static { EditorMarkdownCodeBlockRenderer_1 = this; }
    static { this._ttpTokenizer = createTrustedTypesPolicy('tokenizeToString', {
        createHTML(html) {
            return html;
        }
    }); }
    constructor(_configurationService, _languageService) {
        this._configurationService = _configurationService;
        this._languageService = _languageService;
    }
    async renderCodeBlock(languageAlias, value, options) {
        const editor = isCodeEditor(options.context) ? options.context : undefined;
        // In markdown, it is possible that we stumble upon language aliases (e.g.js instead of javascript).
        // it is possible no alias is given in which case we fall back to the current editor lang
        let languageId;
        if (languageAlias) {
            languageId = this._languageService.getLanguageIdByLanguageName(languageAlias);
        }
        else if (editor) {
            languageId = editor.getModel()?.getLanguageId();
        }
        if (!languageId) {
            languageId = PLAINTEXT_LANGUAGE_ID;
        }
        const html = await tokenizeToString(this._languageService, value, languageId);
        const content = EditorMarkdownCodeBlockRenderer_1._ttpTokenizer ? EditorMarkdownCodeBlockRenderer_1._ttpTokenizer.createHTML(html) ?? html : html;
        const root = document.createElement('span');
        root.innerHTML = content;
        // eslint-disable-next-line no-restricted-syntax
        const codeElement = root.querySelector('.monaco-tokenized-source');
        if (!isHTMLElement(codeElement)) {
            return document.createElement('span');
        }
        applyFontInfo(codeElement, this.getFontInfo(editor));
        return root;
    }
    getFontInfo(editor) {
        // Use editor's font if we have one
        if (editor) {
            return editor.getOption(59 /* EditorOption.fontInfo */);
        }
        else {
            // Otherwise use the global font settings.
            // Pass in fake pixel ratio of 1 since we only need the font info to apply font family
            return createBareFontInfoFromRawSettings({
                fontFamily: this._configurationService.getValue('editor').fontFamily
            }, 1);
        }
    }
};
EditorMarkdownCodeBlockRenderer = EditorMarkdownCodeBlockRenderer_1 = __decorate([
    __param(0, IConfigurationService),
    __param(1, ILanguageService)
], EditorMarkdownCodeBlockRenderer);
export { EditorMarkdownCodeBlockRenderer };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZWRpdG9yTWFya2Rvd25Db2RlQmxvY2tSZW5kZXJlci5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2VkaXRvci9icm93c2VyL3dpZGdldC9tYXJrZG93blJlbmRlcmVyL2Jyb3dzZXIvZWRpdG9yTWFya2Rvd25Db2RlQmxvY2tSZW5kZXJlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQ25FLE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBQ3ZGLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLCtEQUErRCxDQUFDO0FBSXRHLE9BQU8sRUFBRSxpQ0FBaUMsRUFBRSxNQUFNLG1EQUFtRCxDQUFDO0FBQ3RHLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBQzVFLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLCtDQUErQyxDQUFDO0FBQ3RGLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLHFEQUFxRCxDQUFDO0FBQ3ZGLE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUMvRCxPQUFPLEVBQWUsWUFBWSxFQUFFLE1BQU0sMkJBQTJCLENBQUM7QUFDdEUsT0FBTyx3QkFBd0IsQ0FBQztBQUVoQzs7R0FFRztBQUNJLElBQU0sK0JBQStCLEdBQXJDLE1BQU0sK0JBQStCOzthQUU1QixrQkFBYSxHQUFHLHdCQUF3QixDQUFDLGtCQUFrQixFQUFFO1FBQzNFLFVBQVUsQ0FBQyxJQUFZO1lBQ3RCLE9BQU8sSUFBSSxDQUFDO1FBQ2IsQ0FBQztLQUNELENBQUMsQUFKMEIsQ0FJekI7SUFFSCxZQUN5QyxxQkFBNEMsRUFDakQsZ0JBQWtDO1FBRDdCLDBCQUFxQixHQUFyQixxQkFBcUIsQ0FBdUI7UUFDakQscUJBQWdCLEdBQWhCLGdCQUFnQixDQUFrQjtJQUNsRSxDQUFDO0lBRUUsS0FBSyxDQUFDLGVBQWUsQ0FBQyxhQUFpQyxFQUFFLEtBQWEsRUFBRSxPQUFzQztRQUNwSCxNQUFNLE1BQU0sR0FBRyxZQUFZLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUM7UUFFM0Usb0dBQW9HO1FBQ3BHLHlGQUF5RjtRQUN6RixJQUFJLFVBQXFDLENBQUM7UUFDMUMsSUFBSSxhQUFhLEVBQUUsQ0FBQztZQUNuQixVQUFVLEdBQUcsSUFBSSxDQUFDLGdCQUFnQixDQUFDLDJCQUEyQixDQUFDLGFBQWEsQ0FBQyxDQUFDO1FBQy9FLENBQUM7YUFBTSxJQUFJLE1BQU0sRUFBRSxDQUFDO1lBQ25CLFVBQVUsR0FBRyxNQUFNLENBQUMsUUFBUSxFQUFFLEVBQUUsYUFBYSxFQUFFLENBQUM7UUFDakQsQ0FBQztRQUNELElBQUksQ0FBQyxVQUFVLEVBQUUsQ0FBQztZQUNqQixVQUFVLEdBQUcscUJBQXFCLENBQUM7UUFDcEMsQ0FBQztRQUNELE1BQU0sSUFBSSxHQUFHLE1BQU0sZ0JBQWdCLENBQUMsSUFBSSxDQUFDLGdCQUFnQixFQUFFLEtBQUssRUFBRSxVQUFVLENBQUMsQ0FBQztRQUU5RSxNQUFNLE9BQU8sR0FBRyxpQ0FBK0IsQ0FBQyxhQUFhLENBQUMsQ0FBQyxDQUFDLGlDQUErQixDQUFDLGFBQWEsQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLElBQUksSUFBSSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUM7UUFFOUksTUFBTSxJQUFJLEdBQUcsUUFBUSxDQUFDLGFBQWEsQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUM1QyxJQUFJLENBQUMsU0FBUyxHQUFHLE9BQWlCLENBQUM7UUFDbkMsZ0RBQWdEO1FBQ2hELE1BQU0sV0FBVyxHQUFHLElBQUksQ0FBQyxhQUFhLENBQUMsMEJBQTBCLENBQUMsQ0FBQztRQUNuRSxJQUFJLENBQUMsYUFBYSxDQUFDLFdBQVcsQ0FBQyxFQUFFLENBQUM7WUFDakMsT0FBTyxRQUFRLENBQUMsYUFBYSxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBQ3ZDLENBQUM7UUFFRCxhQUFhLENBQUMsV0FBVyxFQUFFLElBQUksQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQztRQUVyRCxPQUFPLElBQUksQ0FBQztJQUNiLENBQUM7SUFFTyxXQUFXLENBQUMsTUFBK0I7UUFDbEQsbUNBQW1DO1FBQ25DLElBQUksTUFBTSxFQUFFLENBQUM7WUFDWixPQUFPLE1BQU0sQ0FBQyxTQUFTLGdDQUF1QixDQUFDO1FBQ2hELENBQUM7YUFBTSxDQUFDO1lBQ1AsMENBQTBDO1lBQzFDLHNGQUFzRjtZQUN0RixPQUFPLGlDQUFpQyxDQUFDO2dCQUN4QyxVQUFVLEVBQUUsSUFBSSxDQUFDLHFCQUFxQixDQUFDLFFBQVEsQ0FBaUIsUUFBUSxDQUFDLENBQUMsVUFBVTthQUNwRixFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQ1AsQ0FBQztJQUNGLENBQUM7O0FBdkRXLCtCQUErQjtJQVN6QyxXQUFBLHFCQUFxQixDQUFBO0lBQ3JCLFdBQUEsZ0JBQWdCLENBQUE7R0FWTiwrQkFBK0IsQ0F3RDNDIn0=