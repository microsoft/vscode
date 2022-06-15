/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


import { localize } from 'vs/nls';
import { URI, UriComponents } from 'vs/base/common/uri';
import { Action2, MenuId, registerAction2 } from 'vs/platform/actions/common/actions';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { Registry } from 'vs/platform/registry/common/platform';
import { EditorPaneDescriptor, IEditorPaneRegistry } from 'vs/workbench/browser/editor';
import { EditorExtensions, IEditorFactoryRegistry } from 'vs/workbench/common/editor';
import { ctxIsMergeEditor, ctxUsesColumnLayout, MergeEditor } from 'vs/workbench/contrib/mergeEditor/browser/mergeEditor';
import { MergeEditorInput, MergeEditorInputData } from 'vs/workbench/contrib/mergeEditor/browser/mergeEditorInput';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { MergeEditorSerializer } from './mergeEditorSerializer';
import { Codicon } from 'vs/base/common/codicons';
import { IWorkbenchFileService } from 'vs/workbench/services/files/common/files';
import { InMemoryFileSystemProvider } from 'vs/platform/files/common/inMemoryFilesystemProvider';
import { VSBuffer } from 'vs/base/common/buffer';
import { IClipboardService } from 'vs/platform/clipboard/common/clipboardService';
import { IQuickInputService } from 'vs/platform/quickinput/common/quickInput';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { ITextModelService } from 'vs/editor/common/services/resolverService';
import './colors';

Registry.as<IEditorPaneRegistry>(EditorExtensions.EditorPane).registerEditorPane(
	EditorPaneDescriptor.create(
		MergeEditor,
		MergeEditor.ID,
		localize('name', "Merge Editor")
	),
	[
		new SyncDescriptor(MergeEditorInput)
	]
);

Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).registerEditorSerializer(
	MergeEditorInput.ID,
	MergeEditorSerializer
);

registerAction2(class ToggleLayout extends Action2 {

	constructor() {
		super({
			id: 'merge.toggleLayout',
			title: localize('toggle.title', "Switch to column view"),
			icon: Codicon.layoutCentered,
			toggled: {
				condition: ctxUsesColumnLayout,
				icon: Codicon.layoutPanel,
				title: localize('toggle.title2', "Switch to 2 by 1 view"),
			},
			menu: [{
				id: MenuId.EditorTitle,
				when: ctxIsMergeEditor,
				group: 'navigation'
			}]
		});
	}

	run(accessor: ServicesAccessor): void {
		const { activeEditorPane } = accessor.get(IEditorService);
		if (activeEditorPane instanceof MergeEditor) {
			activeEditorPane.toggleLayout();
		}
	}
});

registerAction2(class Open extends Action2 {

	constructor() {
		super({
			id: '_open.mergeEditor',
			title: localize('title', "Open Merge Editor"),
		});
	}
	run(accessor: ServicesAccessor, ...args: any[]): void {
		const validatedArgs = IRelaxedOpenArgs.validate(args[0]);

		const instaService = accessor.get(IInstantiationService);
		const input = instaService.createInstance(
			MergeEditorInput,
			validatedArgs.ancestor,
			validatedArgs.input1,
			validatedArgs.input2,
			validatedArgs.output,
		);
		accessor.get(IEditorService).openEditor(input);
	}

});

namespace IRelaxedOpenArgs {
	function toUri(obj: unknown): URI {
		if (typeof obj === 'string') {
			return URI.parse(obj, true);
		} else if (obj && typeof obj === 'object') {
			return URI.revive(<UriComponents>obj);
		}
		throw new TypeError('invalid argument');
	}

	function isUriComponents(obj: unknown): obj is UriComponents {
		if (!obj || typeof obj !== 'object') {
			return false;
		}
		return typeof (<UriComponents>obj).scheme === 'string'
			&& typeof (<UriComponents>obj).authority === 'string'
			&& typeof (<UriComponents>obj).path === 'string'
			&& typeof (<UriComponents>obj).query === 'string'
			&& typeof (<UriComponents>obj).fragment === 'string';
	}

	function toInputResource(obj: unknown): MergeEditorInputData {
		if (typeof obj === 'string') {
			return new MergeEditorInputData(URI.parse(obj, true), undefined, undefined);
		}
		if (!obj || typeof obj !== 'object') {
			throw new TypeError('invalid argument');
		}

		if (isUriComponents(obj)) {
			return new MergeEditorInputData(URI.revive(obj), undefined, undefined);
		}

		const uri = toUri((<IRelaxedInputData>obj).uri);
		const detail = (<IRelaxedInputData>obj).detail;
		const description = (<IRelaxedInputData>obj).description;
		return new MergeEditorInputData(uri, detail, description);
	}

	export function validate(obj: unknown): IOpenEditorArgs {
		if (!obj || typeof obj !== 'object') {
			throw new TypeError('invalid argument');
		}
		const ancestor = toUri((<IRelaxedOpenArgs>obj).ancestor);
		const output = toUri((<IRelaxedOpenArgs>obj).output);
		const input1 = toInputResource((<IRelaxedOpenArgs>obj).input1);
		const input2 = toInputResource((<IRelaxedOpenArgs>obj).input2);
		return { ancestor, input1, input2, output };
	}
}

type IRelaxedInputData = { uri: UriComponents; detail?: string; description?: string };

type IRelaxedOpenArgs = {
	ancestor: UriComponents | string;
	input1: IRelaxedInputData | string;
	input2: IRelaxedInputData | string;
	output: UriComponents | string;
};

interface IOpenEditorArgs {
	ancestor: URI;
	input1: MergeEditorInputData;
	input2: MergeEditorInputData;
	output: URI;
}

registerAction2(class extends Action2 {

	constructor() {
		super({
			id: 'merge.dev.copyContents',
			title: localize('merge.dev.copyContents', "Developer Merge Editor: Copy Contents of Inputs, Base and Result as JSON"),
			icon: Codicon.layoutCentered,
			f1: true,
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
});

registerAction2(class extends Action2 {

	constructor() {
		super({
			id: 'merge.dev.openContents',
			title: localize('merge.dev.openContents', "Developer Merge Editor: Open Contents of Inputs, Base and Result from JSON"),
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
			ref.dispose();
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
			{ uri: input1Uri, description: 'Input 1', detail: '(from JSON)' },
			{ uri: input2Uri, description: 'Input 2', detail: '(from JSON)' },
			resultUri,
		);
		editorService.openEditor(input);
	}
});

interface MergeEditorContents {
	languageId: string;
	base: string;
	input1: string;
	input2: string;
	result: string;
}
