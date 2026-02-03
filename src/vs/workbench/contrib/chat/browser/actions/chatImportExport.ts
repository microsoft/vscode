/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from '../../../../../base/common/buffer.js';
import { joinPath } from '../../../../../base/common/resources.js';
import { ServicesAccessor } from '../../../../../editor/browser/editorExtensions.js';
import { localize, localize2 } from '../../../../../nls.js';
import { Action2, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { IFileDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { CHAT_CATEGORY } from './chatActions.js';
import { ChatViewPaneTarget, IChatWidgetService } from '../chat.js';
import { IChatEditorOptions } from '../widgetHosts/editor/chatEditor.js';
import { ChatEditorInput } from '../widgetHosts/editor/chatEditorInput.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { isExportableSessionData } from '../../common/model/chatModel.js';
import { IChatService } from '../../common/chatService/chatService.js';
import { URI } from '../../../../../base/common/uri.js';
import { revive } from '../../../../../base/common/marshalling.js';
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
				const data = revive(JSON.parse(content.value.toString()));
				if (!isExportableSessionData(data)) {
					throw new Error('Invalid chat session data');
				}

				let sessionResource: URI;
				let resolvedTarget: typeof ChatViewPaneTarget | PreferredGroup;
				let options: IChatEditorOptions;

				if (opts?.target === 'chatViewPane') {
					const modelRef = chatService.loadSessionFromContent(data);
					if (!modelRef) {
						return;
					}
					sessionResource = modelRef.object.sessionResource;
					resolvedTarget = ChatViewPaneTarget;
					options = { pinned: true };
				} else {
					sessionResource = ChatEditorInput.getNewEditorUri();
					resolvedTarget = ACTIVE_GROUP;
					options = { target: { data }, pinned: true };
				}

				await widgetService.openSession(sessionResource, resolvedTarget, options);
			} catch (err) {
				throw err;
			}
		}
	});
}
