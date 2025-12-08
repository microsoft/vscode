/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from '../../../../../base/common/buffer.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { KeyCode, KeyMod } from '../../../../../base/common/keyCodes.js';
import { revive } from '../../../../../base/common/marshalling.js';
import { joinPath } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { ServicesAccessor } from '../../../../../editor/browser/editorExtensions.js';
import { localize, localize2 } from '../../../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { IDialogService, IFileDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { KeybindingWeight } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { IQuickInputService, IQuickPickItem } from '../../../../../platform/quickinput/common/quickInput.js';
import { IChatWidgetService } from '../chat.js';
import { IChatEditorOptions } from '../chatEditor.js';
import { ChatEditorInput } from '../chatEditorInput.js';
import { ChatContextKeys } from '../../common/chatContextKeys.js';
import { isExportableSessionData } from '../../common/chatModel.js';
import { IChatService } from '../../common/chatService.js';
import { CHAT_CATEGORY } from './chatActions.js';

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
		async run(accessor: ServicesAccessor, ...args: unknown[]) {
			const fileDialogService = accessor.get(IFileDialogService);
			const fileService = accessor.get(IFileService);
			const widgetService = accessor.get(IChatWidgetService);

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
				const data = revive(JSON.parse(content.value.toString()));
				if (!isExportableSessionData(data)) {
					throw new Error('Invalid chat session data');
				}

				const options: IChatEditorOptions = { target: { data }, pinned: true };
				await widgetService.openSession(ChatEditorInput.getNewEditorUri(), undefined, options);
			} catch (err) {
				throw err;
			}
		}
	});

	registerAction2(class SaveChatSessionAction extends Action2 {
		constructor() {
			super({
				id: 'workbench.action.chat.saveChatSession',
				title: localize2('chat.saveChatSession.label', "Save Chat Session as Cross-Workspace Artifact"),
				category: CHAT_CATEGORY,
				icon: Codicon.save,
				precondition: ContextKeyExpr.and(ChatContextKeys.enabled, ChatContextKeys.inChatSession),
				f1: true,
				keybinding: {
					weight: KeybindingWeight.WorkbenchContrib,
					primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyS,
					when: ContextKeyExpr.and(ChatContextKeys.inChatInput, ChatContextKeys.enabled)
				},
				menu: [
					{
						id: MenuId.ChatContext,
						group: 'navigation',
						order: 10,
						when: ContextKeyExpr.and(ChatContextKeys.enabled, ChatContextKeys.inChatSession)
					},
					{
						id: MenuId.ViewTitle,
						when: ContextKeyExpr.equals('view', 'workbench.panel.chat.view.panel'),
						group: 'navigation',
						order: -1
					}
				]
			});
		}

		async run(accessor: ServicesAccessor): Promise<void> {
			const widgetService = accessor.get(IChatWidgetService);
			const chatService = accessor.get(IChatService);
			const quickInputService = accessor.get(IQuickInputService);
			const dialogService = accessor.get(IDialogService);

			const widget = widgetService.lastFocusedWidget;
			if (!widget || !widget.viewModel) {
				return;
			}

			const model = chatService.getSession(widget.viewModel.sessionResource);
			if (!model) {
				return;
			}

			// Prompt for custom title and notes
			const title = await quickInputService.input({
				prompt: localize('chat.saveChatSession.titlePrompt', "Enter a title for this saved chat session"),
				value: model.title,
				placeHolder: localize('chat.saveChatSession.titlePlaceholder', "Chat session title")
			});

			if (!title) {
				return; // User cancelled
			}

			const notes = await quickInputService.input({
				prompt: localize('chat.saveChatSession.notesPrompt', "Add optional notes or description"),
				placeHolder: localize('chat.saveChatSession.notesPlaceholder', "Optional notes about this session...")
			});

			try {
				await chatService.saveChatSessionAsCrossWorkspace(model.sessionId, title, notes);
				dialogService.info(
					localize('chat.saveChatSession.success', "Chat session saved successfully"),
					localize('chat.saveChatSession.successDetail', "Session '{0}' has been saved and can now be used across workspaces.", title)
				);
			} catch (error) {
				dialogService.error(
					localize('chat.saveChatSession.error', "Failed to save chat session"),
					String(error)
				);
			}
		}
	});

	registerAction2(class LoadSavedChatSessionAction extends Action2 {
		constructor() {
			super({
				id: 'workbench.action.chat.loadSavedChatSession',
				title: localize2('chat.loadSavedChatSession.label', "Load Saved Chat Session"),
				category: CHAT_CATEGORY,
				icon: Codicon.folder,
				precondition: ChatContextKeys.enabled,
				f1: true
			});
		}

		async run(accessor: ServicesAccessor): Promise<void> {
			const chatService = accessor.get(IChatService);
			const quickInputService = accessor.get(IQuickInputService);

			const savedSessions = await chatService.getSavedChatSessions();
			const entries = Object.entries(savedSessions);

			if (entries.length === 0) {
				quickInputService.pick([], {
					placeHolder: localize('chat.loadSavedChatSession.noSessions', "No saved chat sessions available")
				});
				return;
			}

			interface SavedSessionPickItem extends IQuickPickItem {
				sessionId: string;
			}

			const picks: SavedSessionPickItem[] = entries.map(([id, metadata]) => ({
				label: metadata.title,
				description: metadata.notes || new Date(metadata.savedDate ?? 0).toLocaleString(),
				detail: localize('chat.loadSavedChatSession.detail', "Last updated: {0}",
					new Date(metadata.lastMessageDate).toLocaleString()
				),
				sessionId: id
			}));

			const selected = await quickInputService.pick(picks, {
				placeHolder: localize('chat.loadSavedChatSession.pick', "Select a saved chat session to load"),
				matchOnDescription: true,
				matchOnDetail: true
			});

			if (selected) {
				const sessionData = await chatService.readSavedChatSession(selected.sessionId);
				if (sessionData) {
					// Load the session using the same pattern as import
					const widgetService = accessor.get(IChatWidgetService);
					const options: IChatEditorOptions = { target: { data: sessionData }, pinned: true };
					await widgetService.openSession(ChatEditorInput.getNewEditorUri(), undefined, options);
				}
			}
		}
	});

	registerAction2(class ManageSavedChatSessionsAction extends Action2 {
		constructor() {
			super({
				id: 'workbench.action.chat.manageSavedChatSessions',
				title: localize2('chat.manageSavedChatSessions.label', "Manage Saved Chat Sessions"),
				category: CHAT_CATEGORY,
				icon: Codicon.library,
				precondition: ChatContextKeys.enabled,
				f1: true
			});
		}

		async run(accessor: ServicesAccessor): Promise<void> {
			const chatService = accessor.get(IChatService);
			const quickInputService = accessor.get(IQuickInputService);
			const dialogService = accessor.get(IDialogService);

			const savedSessions = await chatService.getSavedChatSessions();
			const entries = Object.entries(savedSessions);

			if (entries.length === 0) {
				quickInputService.pick([], {
					placeHolder: localize('chat.manageSavedChatSessions.noSessions', "No saved chat sessions to manage")
				});
				return;
			}

			interface ManageSessionPickItem extends IQuickPickItem {
				sessionId: string;
				action: 'delete' | 'rename';
			}

			const picks: ManageSessionPickItem[] = entries.flatMap(([id, metadata]) => [
				{
					label: `$(trash) Delete: ${metadata.title}`,
					description: metadata.notes,
					sessionId: id,
					action: 'delete' as const
				},
				{
					label: `$(edit) Rename: ${metadata.title}`,
					description: metadata.notes,
					sessionId: id,
					action: 'rename' as const
				}
			]);

			const selected = await quickInputService.pick(picks, {
				placeHolder: localize('chat.manageSavedChatSessions.pick', "Select an action"),
				matchOnDescription: true
			});

			if (!selected) {
				return;
			}

			if (selected.action === 'delete') {
				const confirmed = await dialogService.confirm({
					message: localize('chat.deleteSavedChatSession.confirm', "Are you sure you want to delete this saved chat session?"),
					detail: savedSessions[selected.sessionId].title,
					primaryButton: localize('chat.deleteSavedChatSession.delete', "Delete")
				});

				if (confirmed.confirmed) {
					await chatService.deleteSavedChatSession(selected.sessionId);
				}
			} else if (selected.action === 'rename') {
				const newTitle = await quickInputService.input({
					prompt: localize('chat.renameSavedChatSession.prompt', "Enter new title"),
					value: savedSessions[selected.sessionId].title,
					placeHolder: localize('chat.renameSavedChatSession.placeholder', "New title")
				});

				if (newTitle) {
					await chatService.updateSavedChatSessionTitle(selected.sessionId, newTitle);
				}
			}
		}
	});
}
