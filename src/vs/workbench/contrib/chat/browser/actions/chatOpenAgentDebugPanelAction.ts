/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from '../../../../../base/common/buffer.js';
import { joinPath } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { ServicesAccessor } from '../../../../../editor/browser/editorExtensions.js';
import { localize, localize2 } from '../../../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { Categories } from '../../../../../platform/action/common/actionCommonCategories.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { IFileDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { INotificationService, Severity } from '../../../../../platform/notification/common/notification.js';
import { ActiveEditorContext } from '../../../../common/contextkeys.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { isChatViewTitleActionContext } from '../../common/actions/chatActions.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { IChatDebugService } from '../../common/chatDebugService.js';
import { ChatViewId, IChatWidgetService } from '../chat.js';
import { CHAT_CATEGORY, CHAT_CONFIG_MENU_ID } from './chatActions.js';
import { ChatDebugEditorInput } from '../chatDebug/chatDebugEditorInput.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { IChatDebugEditorOptions } from '../chatDebug/chatDebugTypes.js';

/**
 * Registers the Open Agent Debug Panel and Show Agent Logs actions.
 */
export function registerChatOpenAgentDebugPanelAction() {
	registerAction2(class OpenAgentDebugPanelAction extends Action2 {
		constructor() {
			super({
				id: 'workbench.action.chat.openAgentDebugPanel',
				title: localize2('chat.openAgentDebugPanel.label', "Open Agent Debug Panel"),
				f1: true,
				category: Categories.Developer,
				precondition: ChatContextKeys.enabled,
			});
		}

		async run(accessor: ServicesAccessor): Promise<void> {
			const editorService = accessor.get(IEditorService);
			const chatDebugService = accessor.get(IChatDebugService);

			// Clear active session so the editor shows the home view
			chatDebugService.activeSessionResource = undefined;

			const options: IChatDebugEditorOptions = { pinned: true, viewHint: 'home' };
			await editorService.openEditor(ChatDebugEditorInput.instance, options);
		}
	});

	registerAction2(class OpenAgentDebugPanelForSessionAction extends Action2 {
		constructor() {
			super({
				id: 'workbench.action.chat.openAgentDebugPanelForSession',
				title: localize2('chat.openAgentDebugPanelForSession.label', "Show Agent Logs"),
				f1: false,
				category: CHAT_CATEGORY,
				precondition: ContextKeyExpr.and(ChatContextKeys.enabled, ChatContextKeys.chatSessionHasDebugData),
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
				}]
			});
		}

		async run(accessor: ServicesAccessor, context?: URI | unknown, filter?: string): Promise<void> {
			const editorService = accessor.get(IEditorService);
			const chatWidgetService = accessor.get(IChatWidgetService);
			const chatDebugService = accessor.get(IChatDebugService);

			// Extract session resource from context — may be a URI directly
			// or an IChatViewTitleActionContext from the chat config menu
			let sessionResource: URI | undefined;
			if (URI.isUri(context)) {
				sessionResource = context;
			} else if (isChatViewTitleActionContext(context)) {
				sessionResource = context.sessionResource;
			}

			// Fall back to the last focused widget
			if (!sessionResource) {
				const widget = chatWidgetService.lastFocusedWidget;
				sessionResource = widget?.viewModel?.sessionResource;
			}
			chatDebugService.activeSessionResource = sessionResource;

			const options: IChatDebugEditorOptions = { pinned: true, sessionResource, viewHint: 'logs', filter };
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
				icon: Codicon.desktopDownload,
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

		async run(accessor: ServicesAccessor): Promise<void> {
			const chatDebugService = accessor.get(IChatDebugService);
			const fileDialogService = accessor.get(IFileDialogService);
			const fileService = accessor.get(IFileService);
			const notificationService = accessor.get(INotificationService);

			const sessionResource = chatDebugService.activeSessionResource;
			if (!sessionResource) {
				notificationService.notify({ severity: Severity.Info, message: localize('chatDebugLog.noSession', "No active debug session to export. Navigate to a session first.") });
				return;
			}

			const defaultUri = joinPath(await fileDialogService.defaultFilePath(), defaultDebugLogFileName);
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
		}
	});

	registerAction2(class ImportAgentDebugLogAction extends Action2 {
		constructor() {
			super({
				id: 'workbench.action.chat.importAgentDebugLog',
				title: localize2('chat.importAgentDebugLog.label', "Import Agent Debug Log..."),
				icon: Codicon.cloudUpload,
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

		async run(accessor: ServicesAccessor): Promise<void> {
			const chatDebugService = accessor.get(IChatDebugService);
			const editorService = accessor.get(IEditorService);
			const fileDialogService = accessor.get(IFileDialogService);
			const fileService = accessor.get(IFileService);
			const notificationService = accessor.get(INotificationService);

			const defaultUri = joinPath(await fileDialogService.defaultFilePath(), defaultDebugLogFileName);
			const result = await fileDialogService.showOpenDialog({
				defaultUri,
				canSelectFiles: true,
				filters: debugLogFilters
			});
			if (!result) {
				return;
			}

			const content = await fileService.readFile(result[0]);
			const sessionUri = await chatDebugService.importLog(content.value.buffer);
			if (!sessionUri) {
				notificationService.notify({ severity: Severity.Warning, message: localize('chatDebugLog.importFailed', "Import is not supported by the current provider.") });
				return;
			}

			const options: IChatDebugEditorOptions = { pinned: true, sessionResource: sessionUri, viewHint: 'overview' };
			await editorService.openEditor(ChatDebugEditorInput.instance, options);
		}
	});
}
