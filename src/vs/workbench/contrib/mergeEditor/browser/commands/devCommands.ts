/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from 'vs/base/common/buffer';
import { Codicon } from 'vs/base/common/codicons';
import { ITextModelService } from 'vs/editor/common/services/resolverService';
import { localize } from 'vs/nls';
import { Action2 } from 'vs/platform/actions/common/actions';
import { IClipboardService } from 'vs/platform/clipboard/common/clipboardService';
import { InMemoryFileSystemProvider } from 'vs/platform/files/common/inMemoryFilesystemProvider';
import { IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { IQuickInputService } from 'vs/platform/quickinput/common/quickInput';
import { MergeEditor } from 'vs/workbench/contrib/mergeEditor/browser/view/mergeEditor';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IWorkbenchFileService } from 'vs/workbench/services/files/common/files';
import { URI } from 'vs/base/common/uri';
import { MergeEditorInput } from 'vs/workbench/contrib/mergeEditor/browser/mergeEditorInput';
import { ctxIsMergeEditor } from 'vs/workbench/contrib/mergeEditor/common/mergeEditor';

interface MergeEditorContents {
	languageId: string;
	base: string;
	input1: string;
	input2: string;
	result: string;
}

export class MergeEditorCopyContentsToJSON extends Action2 {

	constructor() {
		super({
			id: 'merge.dev.copyContents',
			category: 'Merge Editor (Dev)',
			title: {
				value: localize(
					'merge.dev.copyContents',
					'Copy Contents of Inputs, Base and Result as JSON'
				),
				original: 'Copy Contents of Inputs, Base and Result as JSON',
			},
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
			languageId: model.result.getLanguageId(),
			base: model.base.getValue(),
			input1: model.input1.getValue(),
			input2: model.input2.getValue(),
			result: model.result.getValue(),
		};
		const jsonStr = JSON.stringify(contents, undefined, 4);
		clipboardService.writeText(jsonStr);

		notificationService.info({
			name: localize('mergeEditor.name', 'Merge Editor'),
			message: localize('mergeEditor.successfullyCopiedMergeEditorContents', "Successfully copied merge editor contents"),
		});
	}
}

export class MergeEditorOpenContents extends Action2 {

	constructor() {
		super({
			id: 'merge.dev.openContents',
			category: 'Merge Editor (Dev)',
			title: {
				value: localize(
					'merge.dev.openContents',
					'Open Contents of Inputs, Base and Result from JSON'
				),
				original: 'Open Contents of Inputs, Base and Result from JSON',
			},
			icon: Codicon.layoutCentered,
			f1: true,
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const service = accessor.get(IWorkbenchFileService);
		const instaService = accessor.get(IInstantiationService);
		const editorService = accessor.get(IEditorService);
		const inputService = accessor.get(IQuickInputService);
		const clipboardService = accessor.get(IClipboardService);
		const textModelService = accessor.get(ITextModelService);

		const result = await inputService.input({
			prompt: localize('mergeEditor.enterJSON', 'Enter JSON'),
			value: await clipboardService.readText(),
		});
		if (!result) {
			return;
		}

		const content: MergeEditorContents = JSON.parse(result);

		const scheme = 'merge-editor-dev';

		let provider = service.getProvider(scheme) as InMemoryFileSystemProvider | undefined;
		if (!provider) {
			provider = new InMemoryFileSystemProvider();
			service.registerProvider(scheme, provider);
		}

		const baseUri = URI.from({ scheme, path: '/ancestor' });
		const input1Uri = URI.from({ scheme, path: '/input1' });
		const input2Uri = URI.from({ scheme, path: '/input2' });
		const resultUri = URI.from({ scheme, path: '/result' });

		function writeFile(uri: URI, content: string): Promise<void> {
			return provider!.writeFile(uri, VSBuffer.fromString(content).buffer, { create: true, overwrite: true, unlock: true });
		}

		await Promise.all([
			writeFile(baseUri, content.base),
			writeFile(input1Uri, content.input1),
			writeFile(input2Uri, content.input2),
			writeFile(resultUri, content.result),
		]);

		async function setLanguageId(uri: URI, languageId: string): Promise<void> {
			const ref = await textModelService.createModelReference(uri);
			ref.object.textEditorModel.setMode(languageId);
		}

		await Promise.all([
			setLanguageId(baseUri, content.languageId),
			setLanguageId(input1Uri, content.languageId),
			setLanguageId(input2Uri, content.languageId),
			setLanguageId(resultUri, content.languageId),
		]);

		const input = instaService.createInstance(
			MergeEditorInput,
			baseUri,
			{ uri: input1Uri, title: 'Input 1', description: 'Input 1', detail: '(from JSON)' },
			{ uri: input2Uri, title: 'Input 2', description: 'Input 2', detail: '(from JSON)' },
			resultUri,
		);
		editorService.openEditor(input);
	}
}
