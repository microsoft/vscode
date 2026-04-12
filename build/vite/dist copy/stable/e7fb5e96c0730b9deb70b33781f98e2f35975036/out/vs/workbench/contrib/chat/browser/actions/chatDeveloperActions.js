/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Codicon } from '../../../../../base/common/codicons.js';
import { fromNow } from '../../../../../base/common/date.js';
import { isUriComponents, URI } from '../../../../../base/common/uri.js';
import { localize2 } from '../../../../../nls.js';
import { Categories } from '../../../../../platform/action/common/actionCommonCategories.js';
import { Action2, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IAgentSessionsService } from '../agentSessions/agentSessionsService.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { IChatService } from '../../common/chatService/chatService.js';
import { ILanguageModelsService } from '../../common/languageModels.js';
import { IChatWidgetService } from '../chat.js';
function uriReplacer(_key, value) {
    if (URI.isUri(value)) {
        return value.toString();
    }
    if (isUriComponents(value)) {
        // This shouldn't be necessary but it seems that some URIs in ChatModels aren't properly revived
        return URI.from(value).toString();
    }
    return value;
}
export function registerChatDeveloperActions() {
    registerAction2(LogChatInputHistoryAction);
    registerAction2(LogChatIndexAction);
    registerAction2(InspectChatModelAction);
    registerAction2(InspectChatModelReferencesAction);
    registerAction2(ClearRecentlyUsedLanguageModelsAction);
}
function formatChatModelReferenceInspection(accessor) {
    const chatService = accessor.get(IChatService);
    const agentSessionsService = accessor.get(IAgentSessionsService);
    const debugInfo = chatService.getChatModelReferenceDebugInfo();
    const referencedModels = debugInfo.models.filter(model => model.referenceCount > 0);
    const pendingEditModels = debugInfo.models.filter(model => model.hasPendingEdits);
    const pendingDisposalModels = debugInfo.models.filter(model => model.pendingDisposal);
    let output = '# Chat Model References\n\n';
    output += `- Live models: ${debugInfo.totalModels}\n`;
    output += `- Live references: ${debugInfo.totalReferences}\n`;
    output += `- Models with active references: ${referencedModels.length}\n`;
    output += `- Models with pending edits: ${pendingEditModels.length}\n`;
    output += `- Models pending disposal: ${pendingDisposalModels.length}\n\n`;
    output += 'Created by shows who loaded or created the model. Holders shows who currently keeps the model alive.\n\n';
    if (!debugInfo.models.length) {
        output += 'No live chat models.\n';
        return output;
    }
    for (const model of debugInfo.models) {
        const liveModel = chatService.getSession(model.sessionResource);
        const agentSession = agentSessionsService.getSession(model.sessionResource);
        const archived = agentSession ? agentSession.isArchived() : 'unknown';
        const age = liveModel ? fromNow(liveModel.timing.created, true, true, true) : 'unknown';
        output += `## ${model.title || '(untitled)'}\n\n`;
        output += `- Session: ${model.sessionResource.toString()}\n`;
        output += `- Created by: ${model.createdBy}\n`;
        output += `- Archived: ${archived}\n`;
        output += `- Age: ${age}\n`;
        output += `- Initial location: ${model.initialLocation}\n`;
        output += `- Imported: ${model.isImported}\n`;
        output += `- Pending edits: ${model.hasPendingEdits}\n`;
        output += `- Background keep-alive enabled: ${model.willKeepAlive}\n`;
        output += `- Pending disposal: ${model.pendingDisposal}\n`;
        output += `- Reference count: ${model.referenceCount}\n`;
        if (model.holders.length) {
            output += '- Holders:\n';
            for (const holder of model.holders) {
                output += `  - ${holder.holder}: ${holder.count}\n`;
            }
        }
        else {
            output += '- Holders: none\n';
        }
        output += '\n';
    }
    return output;
}
class LogChatInputHistoryAction extends Action2 {
    static { this.ID = 'workbench.action.chat.logInputHistory'; }
    constructor() {
        super({
            id: LogChatInputHistoryAction.ID,
            title: localize2('workbench.action.chat.logInputHistory.label', "Log Chat Input History"),
            icon: Codicon.attach,
            category: Categories.Developer,
            f1: true,
            precondition: ChatContextKeys.enabled
        });
    }
    async run(accessor, ...args) {
        const chatWidgetService = accessor.get(IChatWidgetService);
        chatWidgetService.lastFocusedWidget?.logInputHistory();
    }
}
class LogChatIndexAction extends Action2 {
    static { this.ID = 'workbench.action.chat.logChatIndex'; }
    constructor() {
        super({
            id: LogChatIndexAction.ID,
            title: localize2('workbench.action.chat.logChatIndex.label', "Log Chat Index"),
            icon: Codicon.attach,
            category: Categories.Developer,
            f1: true,
            precondition: ChatContextKeys.enabled
        });
    }
    async run(accessor, ...args) {
        const chatService = accessor.get(IChatService);
        chatService.logChatIndex();
    }
}
class InspectChatModelAction extends Action2 {
    static { this.ID = 'workbench.action.chat.inspectChatModel'; }
    constructor() {
        super({
            id: InspectChatModelAction.ID,
            title: localize2('workbench.action.chat.inspectChatModel.label', "Inspect Chat Model"),
            icon: Codicon.inspect,
            category: Categories.Developer,
            f1: true,
            precondition: ChatContextKeys.enabled
        });
    }
    async run(accessor, ...args) {
        const chatWidgetService = accessor.get(IChatWidgetService);
        const editorService = accessor.get(IEditorService);
        const widget = chatWidgetService.lastFocusedWidget;
        if (!widget?.viewModel) {
            return;
        }
        const model = widget.viewModel.model;
        const modelData = model.toJSON();
        // Build markdown output with latest response at the top
        let output = '# Chat Model Inspection\n\n';
        // Show latest response first if it exists
        const requests = modelData.requests;
        if (requests && requests.length > 0) {
            const latestRequest = requests[requests.length - 1];
            if (latestRequest.response) {
                output += '## Latest Response\n\n';
                output += '```json\n' + JSON.stringify(latestRequest.response, uriReplacer, 2) + '\n```\n\n';
            }
        }
        // Show full model data
        output += '## Full Chat Model\n\n';
        output += '```json\n' + JSON.stringify(modelData, uriReplacer, 2) + '\n```\n';
        await editorService.openEditor({
            resource: undefined,
            contents: output,
            languageId: 'markdown',
            options: {
                pinned: true
            }
        });
    }
}
class InspectChatModelReferencesAction extends Action2 {
    static { this.ID = 'workbench.action.chat.inspectChatModelReferences'; }
    constructor() {
        super({
            id: InspectChatModelReferencesAction.ID,
            title: localize2('workbench.action.chat.inspectChatModelReferences.label', "Inspect Chat Model References"),
            icon: Codicon.inspect,
            category: Categories.Developer,
            f1: true,
            precondition: ChatContextKeys.enabled
        });
    }
    async run(accessor) {
        const instantiationService = accessor.get(IInstantiationService);
        const editorService = accessor.get(IEditorService);
        await editorService.openEditor({
            resource: undefined,
            contents: instantiationService.invokeFunction(formatChatModelReferenceInspection),
            languageId: 'markdown',
            options: {
                pinned: true
            }
        });
    }
}
class ClearRecentlyUsedLanguageModelsAction extends Action2 {
    static { this.ID = 'workbench.action.chat.clearRecentlyUsedLanguageModels'; }
    constructor() {
        super({
            id: ClearRecentlyUsedLanguageModelsAction.ID,
            title: localize2('workbench.action.chat.clearRecentlyUsedLanguageModels.label', "Clear Recently Used Language Models"),
            category: Categories.Developer,
            f1: true,
            precondition: ChatContextKeys.enabled
        });
    }
    run(accessor) {
        accessor.get(ILanguageModelsService).clearRecentlyUsedList();
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdERldmVsb3BlckFjdGlvbnMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9jaGF0L2Jyb3dzZXIvYWN0aW9ucy9jaGF0RGV2ZWxvcGVyQWN0aW9ucy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFDakUsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQzdELE9BQU8sRUFBRSxlQUFlLEVBQUUsR0FBRyxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFFekUsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLHVCQUF1QixDQUFDO0FBQ2xELE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxpRUFBaUUsQ0FBQztBQUM3RixPQUFPLEVBQUUsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLG1EQUFtRCxDQUFDO0FBQzdGLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLCtEQUErRCxDQUFDO0FBQ3RHLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxxREFBcUQsQ0FBQztBQUNyRixPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUNqRixPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDMUUsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQ3ZFLE9BQU8sRUFBRSxzQkFBc0IsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQ3hFLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLFlBQVksQ0FBQztBQUVoRCxTQUFTLFdBQVcsQ0FBQyxJQUFZLEVBQUUsS0FBYztJQUNoRCxJQUFJLEdBQUcsQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQztRQUN0QixPQUFP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