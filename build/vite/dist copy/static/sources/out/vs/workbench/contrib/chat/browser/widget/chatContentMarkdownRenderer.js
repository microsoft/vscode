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
import { $ } from '../../../../../base/browser/dom.js';
import { getDefaultHoverDelegate } from '../../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { IMarkdownRendererService } from '../../../../../platform/markdown/browser/markdownRenderer.js';
import { ILanguageService } from '../../../../../editor/common/languages/language.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import product from '../../../../../platform/product/common/product.js';
import { Schemas } from '../../../../../base/common/network.js';
const _remoteImageDisallowed = () => false;
export const allowedChatMarkdownHtmlTags = Object.freeze([
    'b',
    'blockquote',
    'br',
    'code',
    'del',
    'em',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'hr',
    'i',
    'ins',
    'li',
    'ol',
    'p',
    'pre',
    's',
    'strong',
    'sub',
    'sup',
    'table',
    'tbody',
    'td',
    'th',
    'thead',
    'tr',
    'ul',
    'a',
    'img',
    // TODO@roblourens when we sanitize attributes in markdown source, we can ban these elements at that step. microsoft/vscode-copilot#5091
    // Not in the official list, but used for codicons and other vscode markdown extensions
    'span',
    'div',
    'input', // Allowed for rendering checkboxes. Other types of inputs are removed and the inputs are always disabled
]);
/**
 * This wraps the MarkdownRenderer and applies sanitizer options needed for chat content.
 */
let ChatContentMarkdownRenderer = class ChatContentMarkdownRenderer {
    constructor(languageService, openerService, configurationService, hoverService, markdownRendererService) {
        this.hoverService = hoverService;
        this.markdownRendererService = markdownRendererService;
    }
    render(markdown, options, outElement) {
        options = {
            ...options,
            sanitizerConfig: {
                replaceWithPlaintext: true,
                allowedTags: {
                    override: allowedChatMarkdownHtmlTags,
                },
                ...options?.sanitizerConfig,
                allowedLinkSchemes: { augment: [product.urlProtocol, 'copilot-skill', Schemas.vscodeBrowser] },
                remoteImageIsAllowed: _remoteImageDisallowed,
            }
        };
        const mdWithBody = (markdown && markdown.supportHtml) ?
            {
                ...markdown,
                // dompurify uses DOMParser, which strips leading comments. Wrapping it all in 'body' prevents this.
                // The \n\n prevents marked.js from parsing the body contents as just text in an 'html' token, instead of actual markdown.
                value: `<body>\n\n${markdown.value}</body>`,
            }
            : markdown;
        const result = this.markdownRendererService.render(mdWithBody, options, outElement);
        // In some cases, the renderer can return top level text nodes  but our CSS expects
        // all text to be in a <p> for margin to be applied properly.
        // So just normalize it.
        result.element.normalize();
        for (const child of result.element.childNodes) {
            if (child.nodeType === Node.TEXT_NODE && child.textContent?.trim()) {
                child.replaceWith($('p', undefined, child.textContent));
            }
        }
        return this.attachCustomHover(result);
    }
    attachCustomHover(result) {
        const store = new DisposableStore();
        // eslint-disable-next-line no-restricted-syntax
        result.element.querySelectorAll('a').forEach((element) => {
            if (element.title) {
                const title = element.title;
                element.title = '';
                store.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate('element'), element, title));
            }
        });
        return {
            element: result.element,
            dispose: () => {
                result.dispose();
                store.dispose();
            }
        };
    }
};
ChatContentMarkdownRenderer = __decorate([
    __param(0, ILanguageService),
    __param(1, IOpenerService),
    __param(2, IConfigurationService),
    __param(3, IHoverService),
    __param(4, IMarkdownRendererService)
], ChatContentMarkdownRenderer);
export { ChatContentMarkdownRenderer };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdENvbnRlbnRNYXJrZG93blJlbmRlcmVyLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9icm93c2VyL3dpZGdldC9jaGF0Q29udGVudE1hcmtkb3duUmVuZGVyZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLENBQUMsRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBRXZELE9BQU8sRUFBRSx1QkFBdUIsRUFBRSxNQUFNLDhEQUE4RCxDQUFDO0FBRXZHLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUMxRSxPQUFPLEVBQXFCLHdCQUF3QixFQUFFLE1BQU0sOERBQThELENBQUM7QUFDM0gsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sb0RBQW9ELENBQUM7QUFDdEYsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sK0RBQStELENBQUM7QUFDdEcsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQy9FLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxpREFBaUQsQ0FBQztBQUNqRixPQUFPLE9BQU8sTUFBTSxtREFBbUQsQ0FBQztBQUN4RSxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFFaEUsTUFBTSxzQkFBc0IsR0FBRyxHQUFHLEVBQUUsQ0FBQyxLQUFLLENBQUM7QUFFM0MsTUFBTSxDQUFDLE1BQU0sMkJBQTJCLEdBQUcsTUFBTSxDQUFDLE1BQU0sQ0FBQztJQUN4RCxHQUFHO0lBQ0gsWUFBWTtJQUNaLElBQUk7SUFDSixNQUFNO0lBQ04sS0FBSztJQUNMLElBQUk7SUFDSixJQUFJO0lBQ0osSUFBSTtJQUNKLElBQUk7SUFDSixJQUFJO0lBQ0osSUFBSTtJQUNKLElBQUk7SUFDSixJQUFJ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