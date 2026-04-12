/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { joinPath } from '../../../../../base/common/resources.js';
import { localize, localize2 } from '../../../../../nls.js';
import { Action2, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { IFileDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { INativeHostService } from '../../../../../platform/native/common/native.js';
import { INotificationService, Severity } from '../../../../../platform/notification/common/notification.js';
import { ChatEntitlementContextKeys } from '../../../../services/chat/common/chatEntitlementService.js';
import { CHAT_CATEGORY } from '../../browser/actions/chatActions.js';
import { IChatWidgetService } from '../../browser/chat.js';
import { captureRepoInfo } from '../../browser/chatRepoInfo.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { IChatService } from '../../common/chatService/chatService.js';
import { ISCMService } from '../../../scm/common/scm.js';
export function registerChatExportZipAction() {
    registerAction2(class ExportChatAsZipAction extends Action2 {
        constructor() {
            super({
                id: 'workbench.action.chat.exportAsZip',
                category: CHAT_CATEGORY,
                title: localize2('chat.exportAsZip.label', "Export Chat as Zip..."),
                precondition: ContextKeyExpr.and(ChatContextKeys.enabled, ChatEntitlementContextKeys.Entitlement.internal),
                f1: true,
            });
        }
        async run(accessor) {
            const widgetService = accessor.get(IChatWidgetService);
            const fileDialogService = accessor.get(IFileDialogService);
            const chatService = accessor.get(IChatService);
            const nativeHostService = accessor.get(INativeHostService);
            const notificationService = accessor.get(INotificationService);
            const scmService = accessor.get(ISCMService);
            const fileService = accessor.get(IFileService);
            const widget = widgetService.lastFocusedWidget;
            if (!widget || !widget.viewModel) {
                return;
            }
            const defaultUri = joinPath(await fileDialogService.defaultFilePath(), 'chat.zip');
            const result = await fileDialogService.showSaveDialog({
                defaultUri,
                filters: [{ name: 'Zip Archive', extensions: ['zip'] }]
            });
            if (!result) {
                return;
            }
            const model = chatService.getSession(widget.viewModel.sessionResource);
            if (!model) {
                return;
            }
            const files = [
                {
                    path: 'chat.json',
                    contents: JSON.stringify(model.toExport(), undefined, 2)
                }
            ];
            const hasMessages = model.getRequests().length > 0;
            if (hasMessages) {
                if (model.repoData) {
                    files.push({
                        path: 'chat.repo.begin.json',
                        contents: JSON.stringify(model.repoData, undefined, 2)
                    });
                }
                const currentRepoData = await captureRepoInfo(scmService, fileService);
                if (currentRepoData) {
                    files.push({
                        path: 'chat.repo.end.json',
                        contents: JSON.stringify(currentRepoData, undefined, 2)
                    });
                }
                if (!model.repoData && !currentRepoData) {
                    notificationService.notify({
                        severity: Severity.Warning,
                        message: localize('chatExportZip.noRepoData', "Exported chat without repository context. No Git repository was detected.")
                    });
                }
            }
            else {
                const currentRepoData = await captureRepoInfo(scmService, fileService);
                if (currentRepoData) {
                    files.push({
                        path: 'chat.repo.begin.json',
                        contents: JSON.stringify(currentRepoData, undefined, 2)
                    });
                }
                else {
                    notificationService.notify({
                        severity: Severity.Warning,
                        message: localize('chatExportZip.noRepoData', "Exported chat without repository context. No Git repository was detected.")
                    });
                }
            }
            try {
                await nativeHostService.createZipFile(result, files);
            }
            catch (error) {
                notificationService.notify({
                    severity: Severity.Error,
                    message: localize('chatExportZip.error', "Failed to export chat as zip: {0}", error instanceof Error ? error.message : String(error))
                });
            }
        }
    });
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdEV4cG9ydFppcC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvZWxlY3Ryb24tYnJvd3Nlci9hY3Rpb25zL2NoYXRFeHBvcnRaaXAudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBRW5FLE9BQU8sRUFBRSxRQUFRLEVBQUUsU0FBUyxFQUFFLE1BQU0sdUJBQXVCLENBQUM7QUFDNUQsT0FBTyxFQUFFLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxtREFBbUQsQ0FBQztBQUM3RixPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0seURBQXlELENBQUM7QUFDekYsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sbURBQW1ELENBQUM7QUFDdkYsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLCtDQUErQyxDQUFDO0FBQzdFLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLGlEQUFpRCxDQUFDO0FBQ3JGLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxRQUFRLEVBQUUsTUFBTSw2REFBNkQsQ0FBQztBQUM3RyxPQUFPLEVBQUUsMEJBQTBCLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUN4RyxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDckUsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sdUJBQXVCLENBQUM7QUFDM0QsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBQ2hFLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUMxRSxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDdkUsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLDRCQUE0QixDQUFDO0FBRXpELE1BQU0sVUFBVSwyQkFBMkI7SUFDMUMsZUFBZSxDQUFDLE1BQU0scUJBQXNCLFNBQVEsT0FBTztRQUMxRDtZQUNDLEtBQUssQ0FBQztnQkFDTCxFQUFFLEVBQUUsbUNBQW1DO2dCQUN2QyxRQUFRLEVBQUUsYUFBYTtnQkFDdkIsS0FBSyxFQUFFLFNBQVMsQ0FBQyx3QkFBd0IsRUFBRSx1QkFBdUIsQ0FBQztnQkFDbkUsWUFBWSxFQUFFLGNBQWMsQ0FBQyxHQUFHLENBQUMsZUFBZSxDQUFDLE9BQU8sRUFBRSwwQkFBMEIsQ0FBQyxXQUFXLENBQUMsUUFBUSxDQUFDO2dCQUMxRyxFQUFFLEVBQUUsSUFBSTthQUNSLENBQUMsQ0FBQztRQUNKLENBQUM7UUFFRCxLQUFLLENBQUMsR0FBRyxDQUFDLFFBQTBCO1lBQ25DLE1BQU0sYUFBYSxHQUFHLFFBQVEsQ0FBQyxHQUFHLENBQUMsa0JBQWtCLENBQUMsQ0FBQztZQUN2RCxNQUFNLGlCQUFpQixHQUFHLFFBQVEsQ0FBQyxHQUFHLENBQUMsa0JBQWtCLENBQUMsQ0FBQztZQUMzRCxNQUFNLFdBQVcsR0FBRyxRQUFRLENBQUMsR0FBRyxDQUFDLFlBQVksQ0FBQyxDQUFDO1lBQy9DLE1BQU0saUJBQWlCLEdBQUcsUUFBUSxDQUFDLEdBQUcsQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDO1lBQzNELE1BQU0sbUJBQW1CLEdBQUcsUUFBUSxDQUFDLEdBQUcsQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDO1lBQy9ELE1BQU0sVUFBVSxHQUFHLFFBQVEsQ0FBQyxHQUFHLENBQUMsV0FBVyxDQUFDLENBQUM7WUFDN0MsTUFBTSxXQUFXLEdBQUcsUUFBUSxDQUFDLEdBQUcsQ0FBQyxZQUFZLENBQUMsQ0FBQztZQUUvQyxNQUFNLE1BQU0sR0FBRyxhQUFhLENBQUMsaUJBQWlCLENBQUM7WUFDL0MsSUFBSSxDQUFDLE1BQU0sSUFBSSxDQUFDLE1BQU0sQ0FBQyxTQUFTLEVBQUUsQ0FBQztnQkFDbEMsT0FBTztZQUNSLENBQUM7WUFFRCxNQUFNLFVBQVUsR0FBRyxRQUFRLENBQUMsTUFBTSxpQkFBaUIsQ0FBQyxlQUFlLEVBQUUsRUFBRSxVQUFVLENBQUMsQ0FBQztZQUNuRixNQUFNLE1BQU0sR0FBRyxNQUFNLGlCQUFpQixDQUFDLGNBQWMsQ0FBQztnQkFDckQsVUFBVTtnQkFDVixPQUFPLEVBQUUsQ0FBQyxFQUFFLElBQUksRUFBRSxhQUFhLEVBQUUsVUFBVSxFQUFFLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQzthQUN2RCxDQUFDLENBQUM7WUFFSCxJQUFJLENBQUMsTUFBTSxFQUFFLENBQUM7Z0JBQ2IsT0FBTztZQUNSLENBQUM7WUFFRCxNQUFNLEtBQUssR0FBRyxXQUFXLENBQUMsVUFBVSxDQUFDLE1BQU0sQ0FBQyxTQUFTLENBQUMsZUFBZSxDQUFDLENBQUM7WUFDdkUsSUFBSSxDQUFDLEtBQUssRUFBRSxDQUFDO2dCQUNaLE9BQU87WUFDUixDQUFDO1lBRUQsTUFBTSxLQUFLLEdBQXlDO2dCQUNuRDtvQkFDQyxJQUFJLEVBQUUsV0FBVztvQkFDakIsUUFBUSxFQUFFLElBQUksQ0FBQyxTQUFTLENBQUMsS0FBSyxDQUFDLFFBQVEsRUFBRSxFQUFFLFNBQVMsRUFBRSxDQUFDLENBQUM7aUJBQ3hEO2FBQ0QsQ0FBQztZQUVGLE1BQU0sV0FBVyxHQUFHLEtBQUssQ0FBQyxXQUFXLEVBQUUsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDO1lBRW5ELElBQUksV0FBVyxFQUFFLENBQUM7Z0JBQ2pCLElBQUksS0FBSyxDQUFDLFFBQVEsRUFBRSxDQUFDO29CQUNwQixLQUFLLENBQUMsSUFBSSxDQUFDO3dCQUNWLElBQUksRUFBRSxzQkFBc0I7d0JBQzVCLFFBQVEsRUFBRSxJQUFJLENBQUMsU0FBUyxDQUFDLEtBQUssQ0FBQyxRQUFRLEVBQUUsU0FBUyxFQUFFLENBQUMsQ0FBQztxQkFDdEQsQ0FBQyxDQUFDO2dCQUNKLENBQUM7Z0JBRUQsTUFBTSxlQUFlLEdBQUcsTUFBTSxlQUFlLENBQUMsVUFBVSxFQUFFLFdBQVcsQ0FBQyxDQUFDO2dCQUN2RSxJQUFJLGVBQWUsRUFBRSxDQUFDO29CQUNyQixLQUFLLENBQUMsSUFBSSxDQUFDO3dCQUNWLElBQUksRUFBRSxvQkFBb0I7d0JBQzFCLFFBQVEsRUFBRSxJQUFJLENBQUMsU0FBUyxDQUFDLGVBQWUsRUFBRSxTQUFTLEVBQUUsQ0FBQyxDQUFDO3FCQUN2RCxDQUFDLENBQUM7Z0JBQ0osQ0FBQztnQkFFRCxJQUFJLENBQUMsS0FBSyxDQUFDLFFBQVEsSUFBSSxDQUFDLGVBQWUsRUFBRSxDQUFDO29CQUN6QyxtQkFBbUIsQ0FBQyxNQUFNLENBQUM7d0JBQzFCLFFBQVEsRUFBRSxRQUFRLENBQUMsT0FBTzt3QkFDMUIsT0FBTyxFQUFFLFFBQVEsQ0FBQywwQkFBMEIsRUFBRSwyRUFBMkUsQ0FBQztxQkFDMUgsQ0FBQyxDQUFDO2dCQUNKLENBQUM7WUFDRixDQUFDO2lCQUFNLENBQUM7Z0JBQ1AsTUFBTSxlQUFlLEdBQUcsTUFBTSxlQUFlLENBQUMsVUFBVSxFQUFFLFdBQVcsQ0FBQyxDQUFDO2dCQUN2RSxJQUFJLGVBQWUsRUFBRSxDQUFDO29CQUNyQixLQUFLLENBQUMsSUFBSSxDQUFDO3dCQUNWLElBQUksRUFBRSxzQkFBc0I7d0JBQzVCLFFBQVEsRUFBRSxJQUFJLENBQUMsU0FBUyxDQUFDLGVBQWUsRUFBRSxTQUFTLEVBQUUsQ0FBQyxDQUFDO3FCQUN2RCxDQUFDLENBQUM7Z0JBQ0osQ0FBQztxQkFBTSxDQUFDO29CQUNQLG1CQUFtQixDQUFDLE1BQU0sQ0FBQzt3QkFDMUIsUUFBUSxFQUFFLFFBQVEsQ0FBQyxPQUFPO3dCQUMxQixPQUFPLEVBQUUsUUFBUSxDQUFDLDBCQUEwQixFQUFFLDJFQUEyRSxDQUFDO3FCQUMxSCxDQUFDLENBQUM7Z0JBQ0osQ0FBQztZQUNGLENBQUM7WUFFRCxJQUFJLENBQUM7Z0JBQ0osTUFBTSxpQkFBaUIsQ0FBQyxhQUFhLENBQUMsTUFBTSxFQUFFLEtBQUssQ0FBQyxDQUFDO1lBQ3RELENBQUM7WUFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO2dCQUNoQixtQkFBbUIsQ0FBQyxNQUFNLENBQUM7b0JBQzFCLFFBQVEsRUFBRSxRQUFRLENBQUMsS0FBSztvQkFDeEIsT0FBTyxFQUFFLFFBQVEsQ0FBQyxxQkFBcUIsRUFBRSxtQ0FBbUMsRUFBRSxLQUFLLFlBQVksS0FBSyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLENBQUM7aUJBQ3JJLENBQUMsQ0FBQztZQUNKLENBQUM7UUFDRixDQUFDO0tBQ0QsQ0FBQyxDQUFDO0FBQ0osQ0FBQyJ9