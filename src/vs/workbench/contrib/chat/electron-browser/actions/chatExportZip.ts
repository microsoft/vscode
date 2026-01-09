/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { joinPath } from '../../../../../base/common/resources.js';
import { ServicesAccessor } from '../../../../../editor/browser/editorExtensions.js';
import { localize, localize2 } from '../../../../../nls.js';
import { Action2, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { IFileDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { INativeHostService } from '../../../../../platform/native/common/native.js';
import { INotificationService, Severity } from '../../../../../platform/notification/common/notification.js';
import { ChatEntitlementContextKeys } from '../../../../services/chat/common/chatEntitlementService.js';
import { CHAT_CATEGORY } from '../../browser/actions/chatActions.js';
import { IChatWidgetService } from '../../browser/chat.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { IChatService } from '../../common/chatService/chatService.js';

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

		async run(accessor: ServicesAccessor) {
			const widgetService = accessor.get(IChatWidgetService);
			const fileDialogService = accessor.get(IFileDialogService);
			const chatService = accessor.get(IChatService);
			const nativeHostService = accessor.get(INativeHostService);
			const notificationService = accessor.get(INotificationService);

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

			const files: { path: string; contents: string }[] = [
				{
					path: 'chat.json',
					contents: JSON.stringify(model.toExport(), undefined, 2)
				}
			];

			if (model.repoData) {
				files.push({
					path: 'chat.repo.json',
					contents: JSON.stringify(model.repoData, undefined, 2)
				});

				if (!model.repoData.headCommitHash) {
					notificationService.notify({
						severity: Severity.Warning,
						message: localize('chatExportZip.noCommitHash', "Exported chat without commit hash. Git history may not have been available when the session started.")
					});
				}
			} else {
				notificationService.notify({
					severity: Severity.Warning,
					message: localize('chatExportZip.noRepoData', "Exported chat without repository context. No Git repository was detected when the session started.")
				});
			}

			await nativeHostService.createZipFile(result.fsPath, files);
		}
	});
}
