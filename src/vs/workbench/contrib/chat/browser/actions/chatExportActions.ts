/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize2 } from '../../../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { IFileDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { joinPath } from '../../../../../base/common/resources.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { isChatViewTitleActionContext } from '../../common/chatActions.js';
import { ChatContextKeys } from '../../common/chatContextKeys.js';
import { ChatViewId, IChatWidgetService } from '../chat.js';
import { CHAT_CATEGORY } from './chatActions.js';
import { ActiveEditorContext } from '../../../../common/contextkeys.js';
import { ChatEditorInput } from '../chatEditorInput.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';

export function registerExportActions(): void {
	registerAction2(
		class ExportChatToJSONAction extends Action2 {
			constructor() {
				super({
					id: 'workbench.action.chat.exportToJSON',
					title: localize2('chat.exportToJSON.label', 'Export Chat to JSON'),
					category: CHAT_CATEGORY,
					precondition: ChatContextKeys.enabled,
					f1: true,
					menu: [
						{
							id: MenuId.ViewTitle,
							when: ContextKeyExpr.equals('view', ChatViewId),
							group: 'z_export',
							order: 1
						},
						{
							id: MenuId.EditorTitle,
							when: ActiveEditorContext.isEqualTo(ChatEditorInput.EditorID),
							group: 'z_export',
							order: 1
						}
					]
				});
			}

			async run(accessor: ServicesAccessor, ...args: unknown[]): Promise<void> {
				const context = args[0];
				const chatWidgetService: IChatWidgetService = accessor.get(IChatWidgetService);
				const fileDialogService: IFileDialogService = accessor.get(IFileDialogService);
				const fileService: IFileService = accessor.get(IFileService);
				const notificationService: INotificationService = accessor.get(INotificationService);

				const widget =
					isChatViewTitleActionContext(context) && context.sessionId
						? chatWidgetService.getWidgetBySessionId(context.sessionId)
						: chatWidgetService.lastFocusedWidget;

				if (!widget || !widget.viewModel) {
					notificationService.error(
						localize2('chat.export.noWidget', 'No chat session available to export').value
					);
					return;
				}

				const viewModel = widget.viewModel;
				const chatData = JSON.stringify(
					viewModel.model.toJSON(),
					null,
					4
				);
				const sessionId = viewModel.model.sessionId;

				const defaultName = `Github-Copilot-Chat-${sessionId}.json`;
				const defaultUri = joinPath(await fileDialogService.defaultFilePath(), defaultName);

				const targetUri = await fileDialogService.showSaveDialog({
					title: localize2('chat.exportToJSON.save.title', 'Export Chat to JSON').value,
					filters: [{ name: 'JSON', extensions: ['json'] }],
					defaultUri
				});

				if (!targetUri) {
					// User cancelled the save dialog
					return;
				}

				try {
					await fileService.writeFile(targetUri, VSBuffer.fromString(chatData));

					notificationService.info(
						localize2(
							'chat.export.success',
							'Chat exported successfully to {0}',
							targetUri.fsPath
						).value
					);
				} catch (err: unknown) {
					notificationService.error(
						localize2(
							'chat.export.writeError',
							"Couldn't export chat: {0}",
							String(err)
						).value
					);
				}
			}
		}
	);
}
