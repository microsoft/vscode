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
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { escapeRegExpCharacters } from '../../../../../base/common/strings.js';
import { URI } from '../../../../../base/common/uri.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { matchesScheme } from '../../../../../base/common/network.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { convertLinkRangeToBuffer, getXtermLineContent } from './terminalLinkHelpers.js';
import { TERMINAL_CONFIG_SECTION } from '../../../terminal/common/terminal.js';
var Constants;
(function (Constants) {
    /**
     * The max line length to try extract word links from.
     */
    Constants[Constants["MaxLineLength"] = 2000] = "MaxLineLength";
})(Constants || (Constants = {}));
let TerminalWordLinkDetector = class TerminalWordLinkDetector extends Disposable {
    static { this.id = 'word'; }
    constructor(xterm, _configurationService, _productService) {
        super();
        this.xterm = xterm;
        this._configurationService = _configurationService;
        this._productService = _productService;
        // Word links typically search the workspace so it makes sense that their maximum link length is
        // quite small.
        this.maxLinkLength = 100;
        this._refreshSeparatorCodes();
        this._register(this._configurationService.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration("terminal.integrated.wordSeparators" /* TerminalSettingId.WordSeparators */)) {
                this._refreshSeparatorCodes();
            }
        }));
    }
    detect(lines, startLine, endLine) {
        const links = [];
        // Get the text representation of the wrapped line
        const text = getXtermLineContent(this.xterm.buffer.active, startLine, endLine, this.xterm.cols);
        if (text === '' || text.length > 2000 /* Constants.MaxLineLength */) {
            return [];
        }
        // Parse out all words from the wrapped line
        const words = this._parseWords(text);
        // Map the words to ITerminalLink objects
        for (const word of words) {
            if (word.text === '') {
                continue;
            }
            if (word.text.length > 0 && word.text.charAt(word.text.length - 1) === ':') {
                word.text = word.text.slice(0, -1);
                word.endIndex--;
            }
            const bufferRange = convertLinkRangeToBuffer(lines, this.xterm.cols, {
                startColumn: word.startIndex + 1,
                startLineNumber: 1,
                endColumn: word.endIndex + 1,
                endLineNumber: 1
            }, startLine);
            // Support this product's URL protocol
            if (matchesScheme(word.text, this._productService.urlProtocol)) {
                const uri = URI.parse(word.text);
                if (uri) {
                    links.push({
                        text: word.text,
                        uri,
                        bufferRange,
                        type: "Url" /* TerminalBuiltinLinkType.Url */
                    });
                }
                continue;
            }
            // Search links
            links.push({
                text: word.text,
                bufferRange,
                type: "Search" /* TerminalBuiltinLinkType.Search */,
                contextLine: text
            });
        }
        return links;
    }
    _parseWords(text) {
        const words = [];
        const splitWords = text.split(this._separatorRegex);
        let runningIndex = 0;
        for (let i = 0; i < splitWords.length; i++) {
            words.push({
                text: splitWords[i],
                startIndex: runningIndex,
                endIndex: runningIndex + splitWords[i].length
            });
            runningIndex += splitWords[i].length + 1;
        }
        return words;
    }
    _refreshSeparatorCodes() {
        const separators = this._configurationService.getValue(TERMINAL_CONFIG_SECTION).wordSeparators;
        let powerlineSymbols = '';
        for (let i = 0xe0b0; i <= 0xe0bf; i++) {
            powerlineSymbols += String.fromCharCode(i);
        }
        this._separatorRegex = new RegExp(`[${escapeRegExpCharacters(separators)}${powerlineSymbols}]`, 'g');
    }
};
TerminalWordLinkDetector = __decorate([
    __param(1, IConfigurationService),
    __param(2, IProductService)
], TerminalWordLinkDetector);
export { TerminalWordLinkDetector };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVybWluYWxXb3JkTGlua0RldGVjdG9yLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvdGVybWluYWxDb250cmliL2xpbmtzL2Jyb3dzZXIvdGVybWluYWxXb3JkTGlua0RldGVjdG9yLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUNyRSxPQUFPLEVBQUUsc0JBQXNCLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUMvRSxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDeEQsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sK0RBQStELENBQUM7QUFDdEcsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQ3RFLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSwwREFBMEQsQ0FBQztBQUczRixPQUFPLEVBQUUsd0JBQXdCLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSwwQkFBMEIsQ0FBQztBQUN6RixPQUFPLEVBQTBCLHVCQUF1QixFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFHdkcsSUFBVyxTQUtWO0FBTEQsV0FBVyxTQUFTO0lBQ25COztPQUVHO0lBQ0gsOERBQW9CLENBQUE7QUFDckIsQ0FBQyxFQUxVLFNBQVMsS0FBVCxTQUFTLFFBS25CO0FBUU0sSUFBTSx3QkFBd0IsR0FBOUIsTUFBTSx3QkFBeUIsU0FBUSxVQUFVO2FBQ2hELE9BQUUsR0FBRyxNQUFNLEFBQVQsQ0FBVTtJQVFuQixZQUNVLEtBQWUsRUFDRCxxQkFBNkQsRUFDbkUsZUFBaUQ7UUFFbEUsS0FBSyxFQUFFLENBQUM7UUFKQyxVQUFLLEdBQUwsS0FBSyxDQUFVO1FBQ2dCLDBCQUFxQixHQUFyQixxQkFBcUIsQ0FBdUI7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