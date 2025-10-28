/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from '../../../../../base/common/buffer.js';
import { joinPath } from '../../../../../base/common/resources.js';
import { ServicesAccessor } from '../../../../../editor/browser/editorExtensions.js';
import { localize, localize2 } from '../../../../../nls.js';
import { Action2, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { IClipboardService } from '../../../../../platform/clipboard/common/clipboardService.js';
import { IFileDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { CHAT_CATEGORY } from './chatActions.js';
import { IChatWidgetService } from '../chat.js';
import { IChatEditorOptions } from '../chatEditor.js';
import { ChatEditorInput } from '../chatEditorInput.js';
import { ChatContextKeys } from '../../common/chatContextKeys.js';
import { isExportableSessionData } from '../../common/chatModel.js';
import { IChatService } from '../../common/chatService.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { URI } from '../../../../../base/common/uri.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';

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
		async run(accessor: ServicesAccessor, outputPath?: URI) {
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

			const model = chatService.getSession(widget.viewModel.sessionId);
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
		async run(accessor: ServicesAccessor, ...args: unknown[]) {
			const fileDialogService = accessor.get(IFileDialogService);
			const fileService = accessor.get(IFileService);
			const editorService = accessor.get(IEditorService);

			const defaultUri = joinPath(await fileDialogService.defaultFilePath(), defaultFileName);
			const result = await fileDialogService.showOpenDialog({
				defaultUri,
				canSelectFiles: true,
				filters
			});
			if (!result) {
				return;
			}

			const content = await fileService.readFile(result[0]);
			try {
				const data = JSON.parse(content.value.toString());
				if (!isExportableSessionData(data)) {
					throw new Error('Invalid chat session data');
				}

				const options: IChatEditorOptions = { target: { data }, pinned: true };
				await editorService.openEditor({ resource: ChatEditorInput.getNewEditorUri(), options });
			} catch (err) {
				throw err;
			}
		}
	});

	registerAction2(class ShareChatAction extends Action2 {
		constructor() {
			super({
				id: 'workbench.action.chat.share',
				category: CHAT_CATEGORY,
				title: localize2('chat.share.label', "Share Chat..."),
				precondition: ChatContextKeys.enabled,
				f1: true,
			});
		}
		async run(accessor: ServicesAccessor) {
			const widgetService = accessor.get(IChatWidgetService);
			const fileService = accessor.get(IFileService);
			const chatService = accessor.get(IChatService);
			const workspaceContextService = accessor.get(IWorkspaceContextService);
			const clipboardService = accessor.get(IClipboardService);
			const notificationService = accessor.get(INotificationService);
			const commandService = accessor.get(ICommandService);

			const widget = widgetService.lastFocusedWidget;
			if (!widget || !widget.viewModel) {
				notificationService.error(localize('chat.share.noChat', "No active chat to share"));
				return;
			}

			const model = chatService.getSession(widget.viewModel.sessionId);
			if (!model) {
				notificationService.error(localize('chat.share.noModel', "Unable to find chat session"));
				return;
			}

			// Get workspace folder
			const workspace = workspaceContextService.getWorkspace();
			if (!workspace.folders || workspace.folders.length === 0) {
				notificationService.error(localize('chat.share.noWorkspace', "Chat sharing requires an open workspace"));
				return;
			}

			const workspaceFolder = workspace.folders[0];

			// Create .github/chats directory
			const githubChatsDir = joinPath(workspaceFolder.uri, '.github', 'chats');
			try {
				await fileService.createFolder(githubChatsDir);
			} catch (err) {
				// Directory might already exist, that's fine
			}

			// Generate filename with timestamp
			const timestamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').split('.')[0];
			const fileName = `chat-${timestamp}.json`;
			const chatFilePath = joinPath(githubChatsDir, fileName);

			// Save chat to file
			const content = VSBuffer.fromString(JSON.stringify(model.toExport(), undefined, 2));
			await fileService.writeFile(chatFilePath, content);

			// Generate the relative path for the share URL
			const relativePath = `.github/chats/${fileName}`;
			
			// Create the share URL using the vscode:// protocol
			// Format: vscode://github.copilot-chat?open-chat=<path-or-URL>
			// For now, we use a relative path. In a future enhancement, this could be
			// a full GitHub blob URL after the file is committed and pushed.
			const shareUrl = `vscode://github.copilot-chat?open-chat=${encodeURIComponent(relativePath)}`;

			// Copy to clipboard
			await clipboardService.writeText(shareUrl);

			// Show success message with instructions
			const message = localize('chat.share.success', 
				"Chat saved to {0}.\n\nShare URL copied to clipboard. To share this chat:\n1. Commit and push the file to GitHub\n2. Share the URL with others who have the same repository", 
				relativePath);
			notificationService.info(message);
		}
	});
}
