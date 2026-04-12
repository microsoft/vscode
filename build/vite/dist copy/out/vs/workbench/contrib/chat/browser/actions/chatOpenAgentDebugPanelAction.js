/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { joinPath } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize, localize2 } from '../../../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { Categories } from '../../../../../platform/action/common/actionCommonCategories.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { IDialogService, IFileDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { INotificationService, Severity } from '../../../../../platform/notification/common/notification.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { ActiveEditorContext } from '../../../../common/contextkeys.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { isChatViewTitleActionContext } from '../../common/actions/chatActions.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { IChatDebugService } from '../../common/chatDebugService.js';
import { ChatViewId, IChatWidgetService } from '../chat.js';
import { CHAT_CATEGORY, CHAT_CONFIG_MENU_ID } from './chatActions.js';
import { ChatConfiguration } from '../../common/constants.js';
import { ChatDebugEditorInput } from '../chatDebug/chatDebugEditorInput.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { LocalChatSessionUri } from '../../common/model/chatUri.js';
/**
 * Registers the Open Agent Debug Logs and Show Agent Debug Logs actions.
 */
export function registerChatOpenAgentDebugPanelAction() {
    registerAction2(class OpenAgentDebugPanelAction extends Action2 {
        constructor() {
            super({
                id: 'workbench.action.chat.openAgentDebugPanel',
                title: localize2('chat.openAgentDebugPanel.label', "Open Agent Debug Logs"),
                f1: true,
                category: Categories.Developer,
                precondition: ChatContextKeys.enabled,
            });
        }
        async run(accessor) {
            const editorService = accessor.get(IEditorService);
            const chatDebugService = accessor.get(IChatDebugService);
            // Clear active session so the editor shows the home view
            chatDebugService.activeSessionResource = undefined;
            const options = { pinned: true, viewHint: 'home' };
            await editorService.openEditor(ChatDebugEditorInput.instance, options);
        }
    });
    registerAction2(class OpenAgentDebugPanelForSessionAction extends Action2 {
        constructor() {
            super({
                id: 'workbench.action.chat.openAgentDebugPanelForSession',
                title: localize2('chat.openAgentDebugPanelForSession.label', "Show Agent Debug Logs"),
                f1: false,
                category: CHAT_CATEGORY,
                precondition: ChatContextKeys.enabled,
                menu: [{
                        id: CHAT_CONFIG_MENU_ID,
                        when: ContextKeyExpr.and(ChatContextKeys.enabled, ContextKeyExpr.equals('view', ChatViewId)),
                        order: 0,
                        group: '4_logs'
                    }, {
                        id: MenuId.ChatWelcomeContext,
                        group: '2_settings',
                        order: 0,
                        when: ChatContextKeys.inChatEditor.negate()
                    }, {
                        id: MenuId.ViewTitle,
                        when: ContextKeyExpr.and(ChatContextKeys.enabled, ContextKeyExpr.equals('view', ChatViewId), ContextKeyExpr.has(`config.${ChatConfiguration.ChatCustomizationMenuEnabled}`)),
                        order: 0,
                        group: '4_logs'
                    }]
            });
        }
        async run(accessor, context, filter) {
            const editorService = accessor.get(IEditorService);
            const chatWidgetService = accessor.get(IChatWidgetService);
            const chatDebugService = accessor.get(IChatDebugService);
            // Extract session resource from context — may be a URI directly
            // or an IChatViewTitleActionContext from the chat config menu
            let sessionResource;
            if (URI.isUri(context)) {
                sessionResource = context;
            }
            else if (isChatViewTitleActionContext(context)) {
                sessionResource = context.sessionResource;
            }
            // Fall back to the last focused widget
            if (!sessionResource) {
                const widget = chatWidgetService.lastFocusedWidget;
                sessionResource = widget?.viewModel?.sessionResource;
            }
            chatDebugService.activeSessionResource = sessionResource;
            const options = { pinned: true, sessionResource, viewHint: 'logs', filter };
            await editorService.openEditor(ChatDebugEditorInput.instance, options);
        }
    });
    const defaultDebugLogFileName = 'agent-debug-log.json';
    const debugLogFilters = [{ name: localize('chatDebugLog.file.label', "Agent Debug Log"), extensions: ['json'] }];
    registerAction2(class ExportAgentDebugLogAction extends Action2 {
        constructor() {
            super({
                id: 'workbench.action.chat.exportAgentDebugLog',
                title: localize2('chat.exportAgentDebugLog.label', "Export Agent Debug Log..."),
                icon: Codicon.chatExport,
                f1: true,
                category: Categories.Developer,
                precondition: ChatContextKeys.enabled,
                menu: [{
                        id: MenuId.EditorTitle,
                        group: 'navigation',
                        when: ActiveEditorContext.isEqualTo(ChatDebugEditorInput.ID),
                        order: 10
                    }],
            });
        }
        async run(accessor) {
            const chatDebugService = accessor.get(IChatDebugService);
            const fileDialogService = accessor.get(IFileDialogService);
            const fileService = accessor.get(IFileService);
            const notificationService = accessor.get(INotificationService);
            const openerService = accessor.get(IOpenerService);
            const telemetryService = accessor.get(ITelemetryService);
            const sessionResource = chatDebugService.activeSessionResource;
            if (!sessionResource) {
                notificationService.notify({ severity: Severity.Info, message: localize('chatDebugLog.noSession', "No active debug session to export. Navigate to a session first.") });
                return;
            }
            const localSessionId = LocalChatSessionUri.parseLocalSessionId(sessionResource);
            const rawIdentifier = localSessionId ?? (sessionResource.path.replace(/^\//, '') || sessionResource.authority);
            const sessionIdentifier = rawIdentifier?.replace(/[/\\:*?"<>|.]+/g, '_').replace(/^_+|_+$/g, '');
            const exportFileName = sessionIdentifier ? `agent-debug-log-${sessionIdentifier}.json` : defaultDebugLogFileName;
            const defaultUri = joinPath(await fileDialogService.defaultFilePath(), exportFileName);
            const outputPath = await fileDialogService.showSaveDialog({ defaultUri, filters: debugLogFilters });
            if (!outputPath) {
                return;
            }
            const data = await chatDebugService.exportLog(sessionResource);
            if (!data) {
                notificationService.notify({ severity: Severity.Warning, message: localize('chatDebugLog.exportFailed', "Export is not supported by the current provider.") });
                return;
            }
            await fileService.writeFile(outputPath, VSBuffer.wrap(data));
            telemetryService.publicLog2('chatDebugLogExported', {
                fileSizeBytes: data.byteLength,
            });
            notificationService.prompt(Severity.Info, localize('chatDebugLog.exportSuccess', "Agent debug log exported successfully."), [{
                    label: localize('chatDebugLog.openExportedFile', "Open File"),
                    run: () => openerService.open(outputPath)
                }]);
        }
    });
    registerAction2(class ImportAgentDebugLogAction extends Action2 {
        constructor() {
            super({
                id: 'workbench.action.chat.importAgentDebugLog',
                title: localize2('chat.importAgentDebugLog.label', "Import Agent Debug Log..."),
                icon: Codicon.chatImport,
                f1: true,
                category: Categories.Developer,
                precondition: ChatContextKeys.enabled,
                menu: [{
                        id: MenuId.EditorTitle,
                        group: 'navigation',
                        when: ActiveEditorContext.isEqualTo(ChatDebugEditorInput.ID),
                        order: 11
                    }],
            });
        }
        async run(accessor) {
            const chatDebugService = accessor.get(IChatDebugService);
            const dialogService = accessor.get(IDialogService);
            const editorService = accessor.get(IEditorService);
            const fileDialogService = accessor.get(IFileDialogService);
            const fileService = accessor.get(IFileService);
            const notificationService = accessor.get(INotificationService);
            const telemetryService = accessor.get(ITelemetryService);
            const defaultUri = joinPath(await fileDialogService.defaultFilePath(), defaultDebugLogFileName);
            const result = await fileDialogService.showOpenDialog({
                defaultUri,
                canSelectFiles: true,
                filters: debugLogFilters
            });
            if (!result) {
                return;
            }
            const maxImportSize = 50 * 1024 * 1024; // 50 MB
            const stat = await fileService.stat(result[0]);
            if (stat.size !== undefined && stat.size > maxImportSize) {
                telemetryService.publicLog2('chatDebugLogImported', {
                    fileSizeBytes: stat.size,
                    result: 'fileTooLarge',
                });
                await dialogService.warn(localize('chatDebugLog.fileTooLargeTitle', "File Too Large"), localize('chatDebugLog.fileTooLargeDetail', "The selected file ({0} MB) exceeds the 50 MB size limit for debug log imports.", (stat.size / (1024 * 1024)).toFixed(1)));
                return;
            }
            const content = await fileService.readFile(result[0]);
            const sessionUri = await chatDebugService.importLog(content.value.buffer);
            if (!sessionUri) {
                telemetryService.publicLog2('chatDebugLogImported', {
                    fileSizeBytes: content.value.byteLength,
                    result: 'providerFailed',
                });
                notificationService.notify({ severity: Severity.Warning, message: localize('chatDebugLog.importFailed', "Import is not supported by the current provider.") });
                return;
            }
            telemetryService.publicLog2('chatDebugLogImported', {
                fileSizeBytes: content.value.byteLength,
                result: 'success',
            });
            const options = { pinned: true, sessionResource: sessionUri, viewHint: 'overview' };
            await editorService.openEditor(ChatDebugEditorInput.instance, options);
        }
    });
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdE9wZW5BZ2VudERlYnVnUGFuZWxBY3Rpb24uanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9jaGF0L2Jyb3dzZXIvYWN0aW9ucy9jaGF0T3BlbkFnZW50RGVidWdQYW5lbEFjdGlvbi50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDaEUsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQ25FLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUV4RCxPQUFPLEVBQUUsUUFBUSxFQUFFLFNBQVMsRUFBRSxNQUFNLHVCQUF1QixDQUFDO0FBQzVELE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxFQUFFLGVBQWUsRUFBRSxNQUFNLG1EQUFtRCxDQUFDO0FBQ3JHLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxpRUFBaUUsQ0FBQztBQUM3RixPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0seURBQXlELENBQUM7QUFDekYsT0FBTyxFQUFFLGNBQWMsRUFBRSxrQkFBa0IsRUFBRSxNQUFNLG1EQUFtRCxDQUFDO0FBQ3ZHLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSwrQ0FBK0MsQ0FBQztBQUM3RSxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsUUFBUSxFQUFFLE1BQU0sNkRBQTZELENBQUM7QUFDN0csT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLGlEQUFpRCxDQUFDO0FBQ2pGLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLHVEQUF1RCxDQUFDO0FBQzFGLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQ3hFLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxxREFBcUQsQ0FBQztBQUNy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