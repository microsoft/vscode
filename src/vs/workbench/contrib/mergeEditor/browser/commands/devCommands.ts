/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from '../../../../../base/common/buffer.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { URI } from '../../../../../base/common/uri.js';
import { ILanguageService } from '../../../../../editor/common/languages/language.js';
import { localize, localize2 } from '../../../../../nls.js';
import { ILocalizedString } from '../../../../../platform/action/common/action.js';
import { Action2 } from '../../../../../platform/actions/common/actions.js';
import { IClipboardService } from '../../../../../platform/clipboard/common/clipboardService.js';
import { IFileDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IQuickInputService } from '../../../../../platform/quickinput/common/quickInput.js';
import { IResourceMergeEditorInput } from '../../../../common/editor.js';
import { MergeEditor } from '../view/mergeEditor.js';
import { ctxIsMergeEditor, MergeEditorContents } from '../../common/mergeEditor.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';

const MERGE_EDITOR_CATEGORY: ILocalizedString = localize2('mergeEditor', 'Merge Editor (Dev)');

export class MergeEditorCopyContentsToJSON extends Action2 {
	constructor() {
		super({
			id: 'merge.dev.copyContentsJson',
			category: MERGE_EDITOR_CATEGORY,
			title: localize2('merge.dev.copyState', "Copy Merge Editor State as JSON"),
			icon: Codicon.layoutCentered,
			f1: true,
			precondition: ctxIsMergeEditor,
		});
	}

	run(accessor: ServicesAccessor): void {
		const { activeEditorPane } = accessor.get(IEditorService);
		const clipboardService = accessor.get(IClipboardService);
		const notificationService = accessor.get(INotificationService);

		if (!(activeEditorPane instanceof MergeEditor)) {
			notificationService.info({
				name: localize('mergeEditor.name', 'Merge Editor'),
				message: localize('mergeEditor.noActiveMergeEditor', "No active merge editor")
			});
			return;
		}
		const model = activeEditorPane.model;
		if (!model) {
			return;
		}
		const contents: MergeEditorContents = {
			languageId: model.resultTextModel.getLanguageId(),
			base: model.base.getValue(),
			input1: model.input1.textModel.getValue(),
			input2: model.input2.textModel.getValue(),
			result: model.resultTextModel.getValue(),
			initialResult: model.getInitialResultValue(),
		};
		const jsonStr = JSON.stringify(contents, undefined, 4);
		clipboardService.writeText(jsonStr);

		notificationService.info({
			name: localize('mergeEditor.name', 'Merge Editor'),
			message: localize('mergeEditor.successfullyCopiedMergeEditorContents', "Successfully copied merge editor state"),
		});
	}
}

export class MergeEditorSaveContentsToFolder extends Action2 {
	constructor() {
		super({
			id: 'merge.dev.saveContentsToFolder',
			category: MERGE_EDITOR_CATEGORY,
			title: localize2('merge.dev.saveContentsToFolder', "Save Merge Editor State to Folder"),
			icon: Codicon.layoutCentered,
			f1: true,
			precondition: ctxIsMergeEditor,
		});
	}

	async run(accessor: ServicesAccessor) {
		const { activeEditorPane } = accessor.get(IEditorService);
		const notificationService = accessor.get(INotificationService);
		const dialogService = accessor.get(IFileDialogService);
		const fileService = accessor.get(IFileService);
		const languageService = accessor.get(ILanguageService);

		if (!(activeEditorPane instanceof MergeEditor)) {
			notificationService.info({
				name: localize('mergeEditor.name', 'Merge Editor'),
				message: localize('mergeEditor.noActiveMergeEditor', "No active merge editor")
			});
			return;
		}
		const model = activeEditorPane.model;
		if (!model) {
			return;
		}

		const result = await dialogService.showOpenDialog({
			canSelectFiles: false,
			canSelectFolders: true,
			canSelectMany: false,
			title: localize('mergeEditor.selectFolderToSaveTo', 'Select folder to save to')
		});
		if (!result) {
			return;
		}
		const targetDir = result[0];

		const extension = languageService.getExtensions(model.resultTextModel.getLanguageId())[0] || '';

		async function write(fileName: string, source: string) {
			await fileService.writeFile(URI.joinPath(targetDir, fileName + extension), VSBuffer.fromString(source), {});
		}

		await Promise.all([
			write('base', model.base.getValue()),
			write('input1', model.input1.textModel.getValue()),
			write('input2', model.input2.textModel.getValue()),
			write('result', model.resultTextModel.getValue()),
			write('initialResult', model.getInitialResultValue()),
		]);

		notificationService.info({
			name: localize('mergeEditor.name', 'Merge Editor'),
			message: localize('mergeEditor.successfullySavedMergeEditorContentsToFolder', "Successfully saved merge editor state to folder"),
		});
	}
}

export class MergeEditorLoadContentsFromFolder extends Action2 {
	constructor() {
		super({
			id: 'merge.dev.loadContentsFromFolder',
			category: MERGE_EDITOR_CATEGORY,
			title: localize2('merge.dev.loadContentsFromFolder', "Load Merge Editor State from Folder"),
			icon: Codicon.layoutCentered,
			f1: true
		});
	}

	async run(accessor: ServicesAccessor, args?: { folderUri?: URI; resultState?: 'initial' | 'current' }) {
		const dialogService = accessor.get(IFileDialogService);
		const editorService = accessor.get(IEditorService);
		const fileService = accessor.get(IFileService);
		const quickInputService = accessor.get(IQuickInputService);

		if (!args) {
			args = {};
		}

		let targetDir: URI;
		if (!args.folderUri) {
			const result = await dialogService.showOpenDialog({
				canSelectFiles: false,
				canSelectFolders: true,
				canSelectMany: false,
				title: localize('mergeEditor.selectFolderToSaveTo', 'Select folder to save to')
			});
			if (!result) {
				return;
			}
			targetDir = result[0];
		} else {
			targetDir = args.folderUri;
		}

		const targetDirInfo = await fileService.resolve(targetDir);

		function findFile(name: string) {
			return targetDirInfo.children!.find(c => c.name.startsWith(name))?.resource!;
		}

		const shouldOpenInitial = await promptOpenInitial(quickInputService, args.resultState);

		const baseUri = findFile('base');
		const input1Uri = findFile('input1');
		const input2Uri = findFile('input2');
		const resultUri = findFile(shouldOpenInitial ? 'initialResult' : 'result');

		const input: IResourceMergeEditorInput = {
			base: { resource: baseUri },
			input1: { resource: input1Uri, label: 'Input 1', description: 'Input 1', detail: '(from file)' },
			input2: { resource: input2Uri, label: 'Input 2', description: 'Input 2', detail: '(from file)' },
			result: { resource: resultUri },
		};
		editorService.openEditor(input);
	}
}

async function promptOpenInitial(quickInputService: IQuickInputService, resultStateOverride?: 'initial' | 'current') {
	if (resultStateOverride) {
		return resultStateOverride === 'initial';
	}
	const result = await quickInputService.pick([{ label: 'result', result: false }, { label: 'initial result', result: true }], { canPickMany: false });
	return result?.result;
}
