/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { joinPath } from '../../../../../base/common/resources.js';
import { ServicesAccessor } from '../../../../../editor/browser/editorExtensions.js';
import { localize, localize2 } from '../../../../../nls.js';
import { Action2, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
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
import { ChatConfiguration } from '../../common/constants.js';
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

		async run(accessor: ServicesAccessor) {
			const widgetService = accessor.get(IChatWidgetService);
			const fileDialogService = accessor.get(IFileDialogService);
			const chatService = accessor.get(IChatService);
			const nativeHostService = accessor.get(INativeHostService);
			const notificationService = accessor.get(INotificationService);
			const scmService = accessor.get(ISCMService);
			const fileService = accessor.get(IFileService);
			const configurationService = accessor.get(IConfigurationService);

			const repoInfoEnabled = configurationService.getValue<boolean>(ChatConfiguration.RepoInfoEnabled) ?? true;

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

			const hasMessages = model.getRequests().length > 0;

			if (hasMessages) {
				if (model.repoData) {
					files.push({
						path: 'chat.repo.begin.json',
						contents: JSON.stringify(model.repoData, undefined, 2)
					});
				}

				if (repoInfoEnabled) {
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
			} else {
				if (repoInfoEnabled) {
					const currentRepoData = await captureRepoInfo(scmService, fileService);
					if (currentRepoData) {
						files.push({
							path: 'chat.repo.begin.json',
							contents: JSON.stringify(currentRepoData, undefined, 2)
						});
					} else {
						notificationService.notify({
							severity: Severity.Warning,
							message: localize('chatExportZip.noRepoData', "Exported chat without repository context. No Git repository was detected.")
						});
					}
				}
			}

			try {
				await nativeHostService.createZipFile(result, files);
			} catch (error) {
				notificationService.notify({
					severity: Severity.Error,
					message: localize('chatExportZip.error', "Failed to export chat as zip: {0}", error instanceof Error ? error.message : String(error))
				});
			}
		}
	});
}
