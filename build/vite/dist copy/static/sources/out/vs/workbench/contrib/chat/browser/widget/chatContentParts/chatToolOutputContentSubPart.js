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
import * as dom from '../../../../../../base/browser/dom.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { MarkdownString } from '../../../../../../base/common/htmlContent.js';
import { IMarkdownRendererService } from '../../../../../../platform/markdown/browser/markdownRenderer.js';
import { CodeBlockPart } from './codeBlockPart.js';
import { ChatResourceGroupWidget } from './chatResourceGroupWidget.js';
/**
 * A reusable component for rendering tool output consisting of code blocks and/or resources.
 * This is used by both ChatCollapsibleInputOutputContentPart and ChatToolPostExecuteConfirmationPart.
 */
let ChatToolOutputContentSubPart = class ChatToolOutputContentSubPart extends Disposable {
    constructor(context, parts, _instantiationService, contextKeyService, _markdownRendererService) {
        super();
        this.context = context;
        this.parts = parts;
        this._instantiationService = _instantiationService;
        this.contextKeyService = contextKeyService;
        this._markdownRendererService = _markdownRendererService;
        this._editorReferences = [];
        this.codeblocks = [];
        this.domNode = this.createOutputContents();
    }
    toMdString(value) {
        if (typeof value === 'string') {
            return new MarkdownString('').appendText(value);
        }
        return new MarkdownString(value.value, { isTrusted: value.isTrusted });
    }
    createOutputContents() {
        const container = dom.$('div');
        for (let i = 0; i < this.parts.length; i++) {
            const part = this.parts[i];
            if (part.kind === 'code') {
                // Collect adjacent code parts and combine their contents
                const codeParts = [part];
                while (i + 1 < this.parts.length && this.parts[i + 1].kind === 'code') {
                    codeParts.push(this.parts[++i]);
                }
                this.addCodeBlock(codeParts, container);
                continue;
            }
            const group = [];
            for (let k = i; k < this.parts.length; k++) {
                const part = this.parts[k];
                if (part.kind !== 'data') {
                    break;
                }
                group.push(part);
            }
            this.addResourceGroup(group, container);
            i += group.length - 1; // Skip the parts we just added
        }
        return container;
    }
    addResourceGroup(parts, container) {
        const widget = this._register(this._instantiationService.createInstance(ChatResourceGroupWidget, parts));
        container.appendChild(widget.domNode);
    }
    addCodeBlock(parts, container) {
        const firstPart = parts[0];
        if (firstPart.title) {
            const title = dom.$('div.chat-confirmation-widget-title');
            const renderedTitle = this._register(this._markdownRendererService.render(this.toMdString(firstPart.title)));
            title.appendChild(renderedTitle.element);
            container.appendChild(title);
        }
        // Combine text from all adjacent code parts
        const combinedText = parts.map(p => p.data).join('\n');
        const data = {
            languageId: firstPart.languageId,
            text: combinedText,
            codeBlockIndex: firstPart.codeBlockIndex,
            element: this.context.element,
            parentContextKeyService: this.contextKeyService,
            renderOptions: firstPart.options,
            chatSessionResource: this.context.element.sessionResource,
        };
        const key = CodeBlockPart.poolKey(this.context.element.id, firstPart.codeBlockIndex);
        const editorReference = this._register(this.context.editorPool.get(key));
        editorReference.object.render(data, this.context.currentWidth.get());
        container.appendChild(editorReference.object.element);
        this._editorReferences.push(editorReference);
        // Track the codeblock
        this.codeblocks.push({
            ownerMarkdownPartId: firstPart.ownerMarkdownPartId,
            codeBlockIndex: firstPart.codeBlockIndex,
            elementId: this.context.element.id,
            uri: editorReference.object.uri,
            codemapperUri: undefined,
            chatSessionResource: this.context.element.sessionResource,
            focus: () => { }
        });
    }
    layout(width) {
        this._editorReferences.forEach(r => r.object.layout(width));
    }
};
ChatToolOutputContentSubPart = __decorate([
    __param(2, IInstantiationService),
    __param(3, IContextKeyService),
    __param(4, IMarkdownRendererService)
], ChatToolOutputContentSubPart);
export { ChatToolOutputContentSubPart };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdFRvb2xPdXRwdXRDb250ZW50U3ViUGFydC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci93aWRnZXQvY2hhdENvbnRlbnRQYXJ0cy9jaGF0VG9vbE91dHB1dENvbnRlbnRTdWJQYXJ0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sS0FBSyxHQUFHLE1BQU0sdUNBQXVDLENBQUM7QUFDN0QsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBQ3hFLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLGtFQUFrRSxDQUFDO0FBQ3pHLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBQ2hHLE9BQU8sRUFBbUIsY0FBYyxFQUFFLE1BQU0sOENBQThDLENBQUM7QUFDL0YsT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0saUVBQWlFLENBQUM7QUFFM0csT0FBTyxFQUFFLGFBQWEsRUFBa0IsTUFBTSxvQkFBb0IsQ0FBQztBQUluRSxPQUFPLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSw4QkFBOEIsQ0FBQztBQUV2RTs7O0dBR0c7QUFDSSxJQUFNLDRCQUE0QixHQUFsQyxNQUFNLDRCQUE2QixTQUFRLFVBQVU7SUFLM0QsWUFDa0IsT0FBc0MsRUFDdEMsS0FBOEIsRUFDeEIscUJBQTZELEVBQ2hFLGlCQUFzRCxFQUNoRCx3QkFBbUU7UUFFN0YsS0FBSyxFQUFFLENBQUM7UUFOUyxZQUFPLEdBQVAsT0FBTyxDQUErQjtRQUN0QyxVQUFLLEdBQUwsS0FBSyxDQUF5QjtRQUNQLDBCQUFxQixHQUFyQixxQkFBcUIsQ0FBdUI7UUFDL0Msc0JBQWlCLEdBQWpCLGlCQUFpQixDQUFvQjtRQUMvQiw2QkFBd0IsR0FBeEIsd0JBQXdCLENB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