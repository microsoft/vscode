/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { basename, dirname, joinPath } from '../../../../../base/common/resources.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { DisposableStore, IDisposable } from '../../../../../base/common/lifecycle.js';
import { ServicesAccessor } from '../../../../../editor/browser/editorExtensions.js';
import { localize, localize2 } from '../../../../../nls.js';
import { Action2, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { IFileDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { FileOperationResult, IFileService, toFileOperationResult } from '../../../../../platform/files/common/files.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { CHAT_CATEGORY } from './chatActions.js';
import { ChatViewPaneTarget, IChatWidgetService } from '../chat.js';
import { IChatEditorOptions } from '../widgetHosts/editor/chatEditor.js';
import { ChatEditorInput } from '../widgetHosts/editor/chatEditorInput.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { parseChatImport } from '../../common/model/chatModel.js';
import { exportChatBinaryData } from '../../common/model/chatSessionResources.js';
import { IChatService } from '../../common/chatService/chatService.js';
import { URI } from '../../../../../base/common/uri.js';
import { ACTIVE_GROUP, PreferredGroup } from '../../../../services/editor/common/editorService.js';

const defaultFileName = 'chat.json';
const filters = [{ name: localize('chat.file.label', "Chat Session"), extensions: ['json'] }];

/**
 * Target location for importing a chat session.
 * - 'chatViewPane': Opens in the chat view pane (sidebar/panel)
 * - 'default': Opens in the active editor group
 */
export type ChatImportTarget = 'chatViewPane' | 'default';

export interface ChatImportOptions {
	inputPath?: URI;
	target?: ChatImportTarget;
}

export function registerChatExportActions(): IDisposable {
	const registrations = new DisposableStore();
	registrations.add(registerAction2(class ExportChatAction extends Action2 {
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
			const logService = accessor.get(ILogService);

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
			const exported = exportChatBinaryData(model.toExport());
			const staging = joinPath(dirname(outputPath), `.${basename(outputPath)}.${generateUuid()}.tmp`);
			try {
				await fileService.writeFile(staging, exported.object);
				await fileService.move(staging, outputPath, true);
			} finally {
				exported.dispose();
				try {
					await fileService.del(staging);
				} catch (error) {
					if (toFileOperationResult(error) !== FileOperationResult.FILE_NOT_FOUND) {
						logService.error('Unable to remove staged chat export', error);
					}
				}
			}
		}
	}));

	registrations.add(registerAction2(class ImportChatAction extends Action2 {
		constructor() {
			super({
				id: 'workbench.action.chat.import',
				title: localize2('chat.import.label', "Import Chat..."),
				category: CHAT_CATEGORY,
				precondition: ChatContextKeys.enabled,
				f1: true,
			});
		}
		async run(accessor: ServicesAccessor, opts?: ChatImportOptions) {
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
				const importedData = parseChatImport(content.value.toString());

				let sessionResource: URI;
				let resolvedTarget: typeof ChatViewPaneTarget | PreferredGroup;
				let options: IChatEditorOptions;

				if (opts?.target === 'chatViewPane') {
					const modelRef = chatService.loadSessionFromData(importedData, 'ChatImportExport#importToChatView');
					try {
						sessionResource = modelRef.object.sessionResource;
						resolvedTarget = ChatViewPaneTarget;
						options = { pinned: true };
						await widgetService.openSession(sessionResource, resolvedTarget, options);
					} finally {
						modelRef.dispose();
					}
				} else {
					sessionResource = ChatEditorInput.getNewEditorUri();
					resolvedTarget = ACTIVE_GROUP;
					options = { target: { data: importedData }, pinned: true };
					await widgetService.openSession(sessionResource, resolvedTarget, options);
				}
			} catch (err) {
				throw err;
			}
		}
	}));
	return registrations;
}
