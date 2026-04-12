/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { joinPath } from '../../../../../base/common/resources.js';
import { localize, localize2 } from '../../../../../nls.js';
import { Action2, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { IFileDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { CHAT_CATEGORY } from './chatActions.js';
import { ChatViewPaneTarget, IChatWidgetService } from '../chat.js';
import { ChatEditorInput } from '../widgetHosts/editor/chatEditorInput.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { isExportableSessionData } from '../../common/model/chatModel.js';
import { IChatService } from '../../common/chatService/chatService.js';
import { revive } from '../../../../../base/common/marshalling.js';
import { ACTIVE_GROUP } from '../../../../services/editor/common/editorService.js';
const defaultFileName = 'chat.json';
const filters = [{ name: localize('chat.file.label', "Chat Session"), extensions: ['json'] }];
export function registerChatExportActions() {
    registerAction2(class ExportChatAction extends Action2 {
        constructor() {
            super({
                id: 'workbench.action.chat.export',
                category: CHAT_CATEGORY,
                title: localize2('chat.export.label', "Export Chat..."),
                precondition: ChatContextKeys.enabled,
                f1: true,
            });
        }
        async run(accessor, outputPath) {
            const widgetService = accessor.get(IChatWidgetService);
            const fileDialogService = accessor.get(IFileDialogService);
            const fileService = accessor.get(IFileService);
            const chatService = accessor.get(IChatService);
            const widget = widgetService.lastFocusedWidget;
            if (!widget || !widget.viewModel) {
                return;
            }
            if (!outputPath) {
                const defaultUri = joinPath(await fileDialogService.defaultFilePath(), defaultFileName);
                const result = await fileDialogService.showSaveDialog({
                    defaultUri,
                    filters
                });
                if (!result) {
                    return;
                }
                outputPath = result;
            }
            const model = chatService.getSession(widget.viewModel.sessionResource);
            if (!model) {
                return;
            }
            // Using toJSON on the model
            const content = VSBuffer.fromString(JSON.stringify(model.toExport(), undefined, 2));
            await fileService.writeFile(outputPath, content);
        }
    });
    registerAction2(class ImportChatAction extends Action2 {
        constructor() {
            super({
                id: 'workbench.action.chat.import',
                title: localize2('chat.import.label', "Import Chat..."),
                category: CHAT_CATEGORY,
                precondition: ChatContextKeys.enabled,
                f1: true,
            });
        }
        async run(accessor, opts) {
            const fileService = accessor.get(IFileService);
            const widgetService = accessor.get(IChatWidgetService);
            const chatService = accessor.get(IChatService);
            const fileDialogService = accessor.get(IFileDialogService);
            let inputPath = opts?.inputPath;
            if (!inputPath) {
                const defaultUri = joinPath(await fileDialogService.defaultFilePath(), defaultFileName);
                const result = await fileDialogService.showOpenDialog({
                    defaultUri,
                    canSelectFiles: true,
                    filters
                });
                if (!result) {
                    return;
                }
                inputPath = result[0];
            }
            const content = await fileService.readFile(inputPath);
            try {
                const data = revive(JSON.parse(content.value.toString()));
                if (!isExportableSessionData(data)) {
                    throw new Error('Invalid chat session data');
                }
                let sessionResource;
                let resolvedTarget;
                let options;
                if (opts?.target === 'chatViewPane') {
                    const modelRef = chatService.loadSessionFromData(data, 'ChatImportExport#importToChatView');
                    try {
                        sessionResource = modelRef.object.sessionResource;
                        resolvedTarget = ChatViewPaneTarget;
                        options = { pinned: true };
                        await widgetService.openSession(sessionResource, resolvedTarget, options);
                    }
                    finally {
                        modelRef.dispose();
                    }
                }
                else {
                    sessionResource = ChatEditorInput.getNewEditorUri();
                    resolvedTarget = ACTIVE_GROUP;
                    options = { target: { data }, pinned: true };
                    await widgetService.openSession(sessionResource, resolvedTarget, options);
                }
            }
            catch (err) {
                throw err;
            }
        }
    });
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdEltcG9ydEV4cG9ydC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9hY3Rpb25zL2NoYXRJbXBvcnRFeHBvcnQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ2hFLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUVuRSxPQUFPLEVBQUUsUUFBUSxFQUFFLFNBQVMsRUFBRSxNQUFNLHVCQUF1QixDQUFDO0FBQzVELE9BQU8sRUFBRSxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sbURBQW1ELENBQUM7QUFDN0YsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sbURBQW1ELENBQUM7QUFDdkYsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLCtDQUErQyxDQUFDO0FBQzdFLE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSxrQkFBa0IsQ0FBQztBQUNqRCxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSxZQUFZLENBQUM7QUFFcEUsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBQzNFLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUMxRSxPQUFPLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUMxRSxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFFdkUsT0FBTyxFQUFFLE1BQU0sRUFBRSxNQUFNLDJDQUEyQyxDQUFDO0FBQ25FLE9BQU8sRUFBRSxZQUFZLEVBQWtCLE1BQU0scURBQXFELENBQUM7QUFFbkcsTUFBTSxlQUFlLEdBQUcsV0FBVyxDQUFDO0FBQ3BDLE1BQU0sT0FBTyxHQUFH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