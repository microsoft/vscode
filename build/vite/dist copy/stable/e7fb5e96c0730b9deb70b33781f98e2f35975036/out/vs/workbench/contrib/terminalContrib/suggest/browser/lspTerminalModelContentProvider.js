var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var LspTerminalModelContentProvider_1;
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Disposable, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { IModelService } from '../../../../../editor/common/services/model.js';
import { ILanguageService } from '../../../../../editor/common/languages/language.js';
import { ITextModelService } from '../../../../../editor/common/services/resolverService.js';
import { URI } from '../../../../../base/common/uri.js';
import { Schemas } from '../../../../../base/common/network.js';
import { VSCODE_LSP_TERMINAL_PROMPT_TRACKER } from './lspTerminalUtil.js';
let LspTerminalModelContentProvider = class LspTerminalModelContentProvider extends Disposable {
    static { LspTerminalModelContentProvider_1 = this; }
    static { this.scheme = Schemas.vscodeTerminal; }
    constructor(capabilityStore, terminalId, virtualTerminalDocument, shellType, textModelService, _modelService, _languageService) {
        super();
        this._modelService = _modelService;
        this._languageService = _languageService;
        this._onCommandFinishedListener = this._register(new MutableDisposable());
        this._register(textModelService.registerTextModelContentProvider(LspTerminalModelContentProvider_1.scheme, this));
        this._capabilitiesStore = capabilityStore;
        this._commandDetection = this._capabilitiesStore.get(2 /* TerminalCapability.CommandDetection */);
        this._registerTerminalCommandFinishedListener();
        this._virtualTerminalDocumentUri = virtualTerminalDocument;
        this._shellType = shellType;
    }
    // Listens to onDidChangeShellType event from `terminal.suggest.contribution.ts`
    shellTypeChanged(shellType) {
        this._shellType = shellType;
    }
    /**
     * Sets or updates content for a terminal virtual document.
     * This is when user has executed succesful command in terminal.
     * Transfer the content to virtual document, and relocate delimiter to get terminal prompt ready for next prompt.
     */
    setContent(content) {
        const model = this._modelService.getModel(this._virtualTerminalDocumentUri);
        if (this._shellType) {
            if (model) {
                const existingContent = model.getValue();
                if (existingContent === '') {
                    model.setValue(VSCODE_LSP_TERMINAL_PROMPT_TRACKER);
                }
                else {
                    // If we are appending to existing content, remove delimiter, attach new content, and re-add delimiter
                    const delimiterIndex = existingContent.lastIndexOf(VSCODE_LSP_TERMINAL_PROMPT_TRACKER);
                    const sanitizedExistingContent = delimiterIndex !== -1 ?
                        existingContent.substring(0, delimiterIndex) :
                        existingContent;
                    const newContent = sanitizedExistingContent + '\n' + content + '\n' + VSCODE_LSP_TERMINAL_PROMPT_TRACKER;
                    model.setValue(newContent);
                }
            }
        }
    }
    /**
     * Real-time conversion of terminal input to virtual document happens here.
     * This is when user types in terminal, and we want to track the input.
     * We want to track the input and update the virtual document.
     * Note: This is for non-executed command.
    */
    trackPromptInputToVirtualFile(content) {
        this._commandDetection = this._capabilitiesStore.get(2 /* TerminalCapability.CommandDetection */);
        const model = this._modelService.getModel(this._virtualTerminalDocumentUri);
        if (this._shellType) {
            if (model) {
                const existingContent = model.getValue();
                const delimiterIndex = existingContent.lastIndexOf(VSCODE_LSP_TERMINAL_PROMPT_TRACKER);
                // Keep content only up to delimiter
                const sanitizedExistingContent = delimiterIndex !== -1 ?
                    existingContent.substring(0, delimiterIndex) :
                    existingContent;
                // Combine base content with new content
                const newContent = sanitizedExistingContent + VSCODE_LSP_TERMINAL_PROMPT_TRACKER + content;
                model.setValue(newContent);
            }
        }
    }
    _registerTerminalCommandFinishedListener() {
        const attachListener = () => {
            if (this._onCommandFinishedListener.value) {
                return;
            }
            // Inconsistent repro: Covering case where commandDetection is available but onCommandFinished becomes available later
            if (this._commandDetection && this._commandDetection.onCommandFinished) {
                this._onCommandFinishedListener.value = this._register(this._commandDetection.onCommandFinished((e) => {
                    if (e.exitCode === 0 && this._shellType) {
                        this.setContent(e.command);
                    }
                }));
            }
        };
        attachListener();
        // Listen to onDidAddCapabilityType because command detection is not available until later
        this._register(this._capabilitiesStore.onDidAddCommandDetectionCapability(e => {
            this._commandDetection = e;
            attachListener();
        }));
    }
    async provideTextContent(resource) {
        const existing = this._modelService.getModel(resource);
        if (existing && !existing.isDisposed()) {
            return existing;
        }
        const languageId = this._languageService.guessLanguageIdByFilepathOrFirstLine(resource);
        const languageSelection = languageId ?
            this._languageService.createById(languageId) :
            this._languageService.createById('plaintext');
        return this._modelService.createModel('', languageSelection, resource, false);
    }
};
LspTerminalModelContentProvider = LspTerminalModelContentProvider_1 = __decorate([
    __param(4, ITextModelService),
    __param(5, IModelService),
    __param(6, ILanguageService)
], LspTerminalModelContentProvider);
export { LspTerminalModelContentProvider };
/**
 * Creates a terminal language virtual URI.
 */
// TODO: Make this [OS generic](https://github.com/microsoft/vscode/issues/249477)
export function createTerminalLanguageVirtualUri(terminalId, languageExtension) {
    return URI.from({
        scheme: Schemas.vscodeTerminal,
        path: `/terminal${terminalId}.${languageExtension}`,
    });
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibHNwVGVybWluYWxNb2RlbENvbnRlbnRQcm92aWRlci5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL3Rlcm1pbmFsQ29udHJpYi9zdWdnZXN0L2Jyb3dzZXIvbHNwVGVybWluYWxNb2RlbENvbnRlbnRQcm92aWRlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7O0FBQUE7OztnR0FHZ0c7QUFDaEcsT0FBTyxFQUFFLFVBQVUsRUFBRSxpQkFBaUIsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQ3hGLE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUMvRSxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSxvREFBb0QsQ0FBQztBQUN0RixPQUFPLEVBQTZCLGlCQUFpQixFQUFFLE1BQU0sMERBQTBELENBQUM7QUFDeEgsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBRXhELE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUdoRSxPQUFPLEVBQUUsa0NBQWtDLEVBQUUsTUFBTSxzQkFBc0IsQ0FBQztBQU9uRSxJQUFNLCtCQUErQixHQUFyQyxNQUFNLCtCQUFnQyxTQUFRLFVBQVU7O2FBQzlDLFdBQU0sR0FBRyxPQUFPLENBQUMsY0FBYyxBQUF6QixDQUEwQjtJQU9oRCxZQUNDLGVBQXlDLEVBQ3pDLFVBQWtCLEVBQ2xCLHVCQUE0QixFQUM1QixTQUF3QyxFQUNyQixnQkFBbUMsRUFDdkMsYUFBNkMsRUFDMUMsZ0JBQW1EO1FBR3JFLEtBQUssRUFBRSxDQUFDO1FBSndCLGtCQUFhLEdBQWIsYUFBYSxDQUFlO1FBQ3pCLHFCQUFnQixHQUFoQixnQkFBZ0IsQ0FBa0I7UUFUckQsK0JBQTBCLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLGlCQUFpQixFQUFFLENB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