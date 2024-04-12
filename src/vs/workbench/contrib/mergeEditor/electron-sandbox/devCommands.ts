/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from 'vs/base/common/buffer';
import { Codicon } from 'vs/base/common/codicons';
import { randomPath } from 'vs/base/common/extpath';
import { URI } from 'vs/base/common/uri';
import { ILanguageService } from 'vs/editor/common/languages/language';
import { localize, localize2 } from 'vs/nls';
import { ILocalizedString } from 'vs/platform/action/common/action';
import { Action2, IAction2Options } from 'vs/platform/actions/common/actions';
import { IClipboardService } from 'vs/platform/clipboard/common/clipboardService';
import { INativeEnvironmentService } from 'vs/platform/environment/common/environment';
import { IFileService } from 'vs/platform/files/common/files';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { IQuickInputService } from 'vs/platform/quickinput/common/quickInput';
import { IResourceMergeEditorInput } from 'vs/workbench/common/editor';
import { MergeEditor } from 'vs/workbench/contrib/mergeEditor/browser/view/mergeEditor';
import { MergeEditorViewModel } from 'vs/workbench/contrib/mergeEditor/browser/view/viewModel';
import { MergeEditorContents } from 'vs/workbench/contrib/mergeEditor/common/mergeEditor';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';

const MERGE_EDITOR_CATEGORY: ILocalizedString = localize2('mergeEditor', 'Merge Editor (Dev)');

export class MergeEditorOpenContentsFromJSON extends Action2 {
	constructor() {
		super({
			id: 'merge.dev.openContentsJson',
			category: MERGE_EDITOR_CATEGORY,
			title: localize2('merge.dev.openState', "Open Merge Editor State from JSON"),
			icon: Codicon.layoutCentered,
			f1: true,
		});
	}

	async run(accessor: ServicesAccessor, args?: { data?: MergeEditorContents; resultState?: 'initial' | 'current' }): Promise<void> {
		const quickInputService = accessor.get(IQuickInputService);
		const clipboardService = accessor.get(IClipboardService);
		const editorService = accessor.get(IEditorService);
		const languageService = accessor.get(ILanguageService);
		const env = accessor.get(INativeEnvironmentService);
		const fileService = accessor.get(IFileService);

		if (!args) {
			args = {};
		}

		let content: MergeEditorContents;
		if (!args.data) {
			const result = await quickInputService.input({
				prompt: localize('mergeEditor.enterJSON', 'Enter JSON'),
				value: await clipboardService.readText(),
			});
			if (result === undefined) {
				return;
			}
			content =
				result !== ''
					? JSON.parse(result)
					: { base: '', input1: '', input2: '', result: '', languageId: 'plaintext' };
		} else {
			content = args.data;
		}

		const targetDir = URI.joinPath(env.tmpDir, randomPath());

		const extension = languageService.getExtensions(content.languageId)[0] || '';

		const baseUri = URI.joinPath(targetDir, `/base${extension}`);
		const input1Uri = URI.joinPath(targetDir, `/input1${extension}`);
		const input2Uri = URI.joinPath(targetDir, `/input2${extension}`);
		const resultUri = URI.joinPath(targetDir, `/result${extension}`);
		const initialResultUri = URI.joinPath(targetDir, `/initialResult${extension}`);

		async function writeFile(uri: URI, content: string): Promise<void> {
			await fileService.writeFile(uri, VSBuffer.fromString(content));
		}

		const shouldOpenInitial = await promptOpenInitial(quickInputService, args.resultState);

		await Promise.all([
			writeFile(baseUri, content.base),
			writeFile(input1Uri, content.input1),
			writeFile(input2Uri, content.input2),
			writeFile(resultUri, shouldOpenInitial ? (content.initialResult || '') : content.result),
			writeFile(initialResultUri, content.initialResult || ''),
		]);

		const input: IResourceMergeEditorInput = {
			base: { resource: baseUri },
			input1: { resource: input1Uri, label: 'Input 1', description: 'Input 1', detail: '(from JSON)' },
			input2: { resource: input2Uri, label: 'Input 2', description: 'Input 2', detail: '(from JSON)' },
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

abstract class MergeEditorAction extends Action2 {
	constructor(desc: Readonly<IAction2Options>) {
		super(desc);
	}

	run(accessor: ServicesAccessor): void {
		const { activeEditorPane } = accessor.get(IEditorService);
		if (activeEditorPane instanceof MergeEditor) {
			const vm = activeEditorPane.viewModel.get();
			if (!vm) {
				return;
			}
			this.runWithViewModel(vm, accessor);
		}
	}

	abstract runWithViewModel(viewModel: MergeEditorViewModel, accessor: ServicesAccessor): void;
}

export class OpenSelectionInTemporaryMergeEditor extends MergeEditorAction {
	constructor() {
		super({
			id: 'merge.dev.openSelectionInTemporaryMergeEditor',
			category: MERGE_EDITOR_CATEGORY,
			title: localize2('merge.dev.openSelectionInTemporaryMergeEditor', "Open Selection In Temporary Merge Editor"),
			icon: Codicon.layoutCentered,
			f1: true,
		});
	}

	override async runWithViewModel(viewModel: MergeEditorViewModel, accessor: ServicesAccessor) {
		const rangesInBase = viewModel.selectionInBase.get()?.rangesInBase;
		if (!rangesInBase || rangesInBase.length === 0) {
			return;
		}

		const base = rangesInBase
			.map((r) =>
				viewModel.model.base.getValueInRange(
					r
				)
			)
			.join('\n');

		const input1 = rangesInBase
			.map((r) =>
				viewModel.inputCodeEditorView1.editor.getModel()!.getValueInRange(
					viewModel.model.translateBaseRangeToInput(1, r)
				)
			)
			.join('\n');

		const input2 = rangesInBase
			.map((r) =>
				viewModel.inputCodeEditorView2.editor.getModel()!.getValueInRange(
					viewModel.model.translateBaseRangeToInput(2, r)
				)
			)
			.join('\n');

		const result = rangesInBase
			.map((r) =>
				viewModel.resultCodeEditorView.editor.getModel()!.getValueInRange(
					viewModel.model.translateBaseRangeToResult(r)
				)
			)
			.join('\n');

		new MergeEditorOpenContentsFromJSON().run(accessor, {
			data: {
				base,
				input1,
				input2,
				result,
				languageId: viewModel.resultCodeEditorView.editor.getModel()!.getLanguageId()
			}
		});
	}
}
