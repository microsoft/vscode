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
import { ICodeEditorService } from '../../../../../editor/browser/services/codeEditorService.js';
import { EditOperation } from '../../../../../editor/common/core/editOperation.js';
import { ILanguageModelToolsService } from '../../common/tools/languageModelToolsService.js';
import { PromptHeaderAttributes } from '../../common/promptSyntax/promptFileParser.js';
import { IPromptsService } from '../../common/promptSyntax/service/promptsService.js';
import { formatArrayValue } from '../../common/promptSyntax/utils/promptEditHelper.js';
let PromptFileRewriter = class PromptFileRewriter {
    constructor(_codeEditorService, _promptsService, _languageModelToolsService) {
        this._codeEditorService = _codeEditorService;
        this._promptsService = _promptsService;
        this._languageModelToolsService = _languageModelToolsService;
    }
    async openAndRewriteTools(uri, newTools, token) {
        const editor = await this._codeEditorService.openCodeEditor({ resource: uri }, this._codeEditorService.getFocusedCodeEditor());
        if (!editor || !editor.hasModel()) {
            return;
        }
        const model = editor.getModel();
        const promptAST = this._promptsService.getParsedPromptFile(model);
        if (!promptAST.header) {
            return undefined;
        }
        const toolsAttr = promptAST.header.getAttribute(PromptHeaderAttributes.tools);
        if (!toolsAttr) {
            return undefined;
        }
        editor.setSelection(toolsAttr.range);
        if (newTools === undefined) {
            this.rewriteAttribute(model, '', toolsAttr.range);
            return;
        }
        else {
            this.rewriteTools(model, newTools, toolsAttr.value.range, toolsAttr.value.type === 'scalar');
        }
    }
    rewriteTools(model, newTools, range, isString) {
        const newToolNames = this._languageModelToolsService.toFullReferenceNames(newTools);
        const newEntries = newToolNames.map(toolName => formatArrayValue(toolName)).join(', ');
        const newValue = isString ? newEntries : `[${newEntries}]`;
        this.rewriteAttribute(model, newValue, range);
    }
    rewriteAttribute(model, newValue, range) {
        model.pushStackElement();
        model.pushEditOperations(null, [EditOperation.replaceMove(range, newValue)], () => null);
        model.pushStackElement();
    }
    async openAndRewriteName(uri, newName, token) {
        const editor = await this._codeEditorService.openCodeEditor({ resource: uri }, this._codeEditorService.getFocusedCodeEditor());
        if (!editor || !editor.hasModel()) {
            return;
        }
        const model = editor.getModel();
        const promptAST = this._promptsService.getParsedPromptFile(model);
        if (!promptAST.header) {
            return;
        }
        const nameAttr = promptAST.header.getAttribute(PromptHeaderAttributes.name);
        if (!nameAttr) {
            return;
        }
        if (nameAttr.value.type === 'scalar' && nameAttr.value.value === newName) {
            return;
        }
        editor.setSelection(nameAttr.range);
        this.rewriteAttribute(model, newName, nameAttr.value.range);
    }
};
PromptFileRewriter = __decorate([
    __param(0, ICodeEditorService),
    __param(1, IPromptsService),
    __param(2, ILanguageModelToolsService)
], PromptFileRewriter);
export { PromptFileRewriter };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHJvbXB0RmlsZVJld3JpdGVyLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9icm93c2VyL3Byb21wdFN5bnRheC9wcm9tcHRGaWxlUmV3cml0ZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFJaEcsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sNkRBQTZELENBQUM7QUFDakcsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLG9EQUFvRCxDQUFDO0FBR25GLE9BQU8sRUFBRSwwQkFBMEIsRUFBZ0MsTUFBTSxpREFBaUQsQ0FBQztBQUMzSCxPQUFPLEVBQUUsc0JBQXNCLEVBQUUsTUFBTSwrQ0FBK0MsQ0FBQztBQUN2RixPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0scURBQXFELENBQUM7QUFDdEYsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0scURBQXFELENBQUM7QUFFaEYsSUFBTSxrQkFBa0IsR0FBeEIsTUFBTSxrQkFBa0I7SUFDOUIsWUFDc0Msa0JBQXNDLEVBQ3pDLGVBQWdDLEVBQ3JCLDBCQUFzRDtRQUY5RCx1QkFBa0IsR0FBbEIsa0JBQWtCLENBQW9CO1FBQ3pDLG9CQUFlLEdBQWYsZUFBZSxDQUFpQjtRQUNyQiwrQkFBMEIsR0FBMUIsMEJBQTBCLENBQTRCO0lBRXBHLENBQUM7SUFFTSxLQUFLLENBQUMsbUJBQW1CLENBQUMsR0FBUSxFQUFFLFFBQWtELEVBQUUsS0FBd0I7UUFDdEgsTUFBTSxNQUFNLEdBQUcsTUFBTSxJQUFJLENBQUMsa0JBQWtCLENBQUMsY0FBYyxDQUFDLEVBQUUsUUFBUSxFQUFFLEdBQUcsRUFBRSxFQUFFLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxvQkFBb0IsRUFBRSxDQUFDLENBQUM7UUFDL0gsSUFBSSxDQUFDLE1BQU0sSUFBSSxDQUFDLE1BQU0s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