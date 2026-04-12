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
import { IChatWidgetService } from '../chat.js';
import { ChatDynamicVariableModel } from './chatDynamicVariables.js';
import { Range } from '../../../../../editor/common/core/range.js';
export function getDynamicVariablesForWidget(widget) {
    if (!widget.viewModel || !widget.supportsFileReferences) {
        return [];
    }
    const model = widget.getContrib(ChatDynamicVariableModel.ID);
    if (!model) {
        return [];
    }
    // track for editing state
    if (widget.viewModel.editing && model.variables.length > 0) {
        return model.variables;
    }
    if (widget.input.attachmentModel.attachments.length > 0 && widget.viewModel.editing) {
        const references = [];
        const editorModel = widget.inputEditor.getModel();
        const modelTextLength = editorModel?.getValueLength() ?? 0;
        for (const attachment of widget.input.attachmentModel.attachments) {
            // If the attachment has a range, it is a dynamic variable
            if (attachment.range) {
                if (attachment.range.start >= attachment.range.endExclusive) {
                    continue;
                }
                if (attachment.range.start < 0 || attachment.range.endExclusive > modelTextLength) {
                    continue;
                }
                if (!editorModel) {
                    continue;
                }
                const startPos = editorModel.getPositionAt(attachment.range.start);
                const endPos = editorModel.getPositionAt(attachment.range.endExclusive);
                const referenceObj = {
                    id: attachment.id,
                    fullName: attachment.name,
                    modelDescription: attachment.modelDescription,
                    range: new Range(startPos.lineNumber, startPos.column, endPos.lineNumber, endPos.column),
                    icon: attachment.icon,
                    isFile: attachment.kind === 'file',
                    isDirectory: attachment.kind === 'directory',
                    data: attachment.value
                };
                references.push(referenceObj);
            }
        }
        return references.length > 0 ? references : model.variables;
    }
    return model.variables;
}
export function getSelectedToolAndToolSetsForWidget(widget) {
    return widget.input.selectedToolsModel.entriesMap.get();
}
let ChatVariablesService = class ChatVariablesService {
    constructor(chatWidgetService) {
        this.chatWidgetService = chatWidgetService;
    }
    getDynamicVariables(sessionResource) {
        const widget = this.chatWidgetService.getWidgetBySessionResource(sessionResource);
        if (!widget) {
            return [];
        }
        return getDynamicVariablesForWidget(widget);
    }
    getSelectedToolAndToolSets(sessionResource) {
        const widget = this.chatWidgetService.getWidgetBySessionResource(sessionResource);
        if (!widget) {
            return new Map();
        }
        return getSelectedToolAndToolSetsForWidget(widget);
    }
};
ChatVariablesService = __decorate([
    __param(0, IChatWidgetService)
], ChatVariablesService);
export { ChatVariablesService };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdFZhcmlhYmxlcy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9hdHRhY2htZW50cy9jaGF0VmFyaWFibGVzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBSWhHLE9BQU8sRUFBZSxrQkFBa0IsRUFBRSxNQUFNLFlBQVksQ0FBQztBQUM3RCxPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSwyQkFBMkIsQ0FBQztBQUNyRSxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFHbkUsTUFBTSxVQUFVLDRCQUE0QixDQUFDLE1BQW1CO0lBQy9ELElBQUksQ0FBQyxNQUFNLENBQUMsU0FBUyxJQUFJLENBQUMsTUFBTSxDQUFDLHNCQUFzQixFQUFFLENBQUM7UUFDekQsT0FBTyxFQUFFLENBQUM7SUFDWCxDQUFDO0lBRUQsTUFBTSxLQUFLLEdBQUcsTUFBTSxDQUFDLFVBQVUsQ0FBMkIsd0JBQXdCLENBQUMsRUFBRSxDQUFDLENBQUM7SUFDdkYsSUFBSSxDQUFDLEtBQUssRUFBRSxDQUFDO1FBQ1osT0FBTyxFQUFFLENBQUM7SUFDWCxDQUFDO0lBRUQsMEJBQTBCO0lBQzFCLElBQUksTUFBTSxDQUFDLFNBQVMsQ0FBQyxPQUFPLElBQUksS0FBSyxDQUFDLFNBQVMsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxFQUFFLENBQUM7UUFDNUQsT0FBTyxLQUFLLENBQUMsU0FBUyxDQUFDO0lBQ3hCLENBQUM7SUFFRCxJQUFJLE1BQU0sQ0FBQyxLQUFLLENBQUMsZUFBZSxDQUFDLFdBQVcsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxJQUFJLE1BQU0sQ0FBQyxTQUFTLENBQUMsT0FBTyxFQUFFLENBQUM7UUFDckYsTUFBTSxVQUFVLEdBQXVCLEVBQUUsQ0FBQztRQUMxQyxNQUFNLFdB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