/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from 'vs/base/common/buffer';
import { joinPath } from 'vs/base/common/resources';
import { ServicesAccessor } from 'vs/editor/browser/editorExtensions';
import { localize } from 'vs/nls';
import { Action2, registerAction2 } from 'vs/platform/actions/common/actions';
import { IFileDialogService } from 'vs/platform/dialogs/common/dialogs';
import { IFileService } from 'vs/platform/files/common/files';
import { INTERACTIVE_SESSION_CATEGORY } from 'vs/workbench/contrib/chat/browser/actions/chatActions';
import { IChatWidgetService } from 'vs/workbench/contrib/chat/browser/chat';
import { IChatEditorOptions } from 'vs/workbench/contrib/chat/browser/chatEditor';
import { ChatEditorInput } from 'vs/workbench/contrib/chat/browser/chatEditorInput';
import { isSerializableSessionData } from 'vs/workbench/contrib/chat/common/chatModel';
import { IChatService } from 'vs/workbench/contrib/chat/common/chatService';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';

const defaultFileName = 'chat.json';
const filters = [{ name: localize('interactiveSession.file.label', "Chat Session"), extensions: ['json'] }];

export function registerInteractiveSessionExportActions() {
	registerAction2(class ExportInteractiveSessionAction extends Action2 {
		constructor() {
			super({
				id: 'workbench.action.interactiveSession.export',
				category: INTERACTIVE_SESSION_CATEGORY,
				title: {
					value: localize('interactiveSession.export.label', "Export Session") + '...',
					original: 'Export Session...'
				},
				f1: true,
			});
		}
		async run(accessor: ServicesAccessor, ...args: any[]) {
			const widgetService = accessor.get(IChatWidgetService);
			const fileDialogService = accessor.get(IFileDialogService);
			const fileService = accessor.get(IFileService);
			const interactiveSessionService = accessor.get(IChatService);

			const widget = widgetService.lastFocusedWidget;
			if (!widget || !widget.viewModel) {
				return;
			}

			const defaultUri = joinPath(await fileDialogService.defaultFilePath(), defaultFileName);
			const result = await fileDialogService.showSaveDialog({
				defaultUri,
				filters
			});
			if (!result) {
				return;
			}

			const model = interactiveSessionService.getSession(widget.viewModel.sessionId);
			if (!model) {
				return;
			}

			// Using toJSON on the model
			const content = VSBuffer.fromString(JSON.stringify(model, undefined, 2));
			await fileService.writeFile(result, content);
		}
	});

	registerAction2(class ImportInteractiveSessionAction extends Action2 {
		constructor() {
			super({
				id: 'workbench.action.interactiveSession.import',
				title: {
					value: localize('interactiveSession.import.label', "Import Session") + '...',
					original: 'Export Session...'
				},
				category: INTERACTIVE_SESSION_CATEGORY,
				f1: true,
			});
		}
		async run(accessor: ServicesAccessor, ...args: any[]) {
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
				if (!isSerializableSessionData(data)) {
					throw new Error('Invalid chat session data');
				}

				await editorService.openEditor({ resource: ChatEditorInput.getNewEditorUri(), options: <IChatEditorOptions>{ target: { data }, pinned: true } });
			} catch (err) {
				throw err;
			}
		}
	});
}
