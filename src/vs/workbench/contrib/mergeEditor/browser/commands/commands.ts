/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from 'vs/base/common/codicons';
import { URI, UriComponents } from 'vs/base/common/uri';
import { localize } from 'vs/nls';
import { ILocalizedString } from 'vs/platform/action/common/action';
import { Action2, IAction2Options, MenuId } from 'vs/platform/actions/common/actions';
import { ITextEditorOptions } from 'vs/platform/editor/common/editor';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { IResourceMergeEditorInput } from 'vs/workbench/common/editor';
import { MergeEditorInputData } from 'vs/workbench/contrib/mergeEditor/browser/mergeEditorInput';
import { MergeEditor } from 'vs/workbench/contrib/mergeEditor/browser/view/mergeEditor';
import { MergeEditorViewModel } from 'vs/workbench/contrib/mergeEditor/browser/view/viewModel';
import { ctxIsMergeEditor, ctxMergeEditorLayout } from 'vs/workbench/contrib/mergeEditor/common/mergeEditor';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';

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

export class OpenMergeEditor extends Action2 {
	constructor() {
		super({
			id: '_open.mergeEditor',
			title: { value: localize('title', "Open Merge Editor"), original: 'Open Merge Editor' },
		});
	}
	run(accessor: ServicesAccessor, ...args: unknown[]): void {
		const validatedArgs = IRelaxedOpenArgs.validate(args[0]);

		const input: IResourceMergeEditorInput = {
			base: { resource: validatedArgs.base },
			input1: { resource: validatedArgs.input1.uri, label: validatedArgs.input1.title, description: validatedArgs.input1.description, detail: validatedArgs.input1.detail },
			input2: { resource: validatedArgs.input2.uri, label: validatedArgs.input2.title, description: validatedArgs.input2.description, detail: validatedArgs.input2.detail },
			result: { resource: validatedArgs.output },
			options: { preserveFocus: true }
		};
		accessor.get(IEditorService).openEditor(input);
	}
}

namespace IRelaxedOpenArgs {
	export function validate(obj: unknown): {
		base: URI;
		input1: MergeEditorInputData;
		input2: MergeEditorInputData;
		output: URI;
	} {
		if (!obj || typeof obj !== 'object') {
			throw new TypeError('invalid argument');
		}

		const o = obj as IRelaxedOpenArgs;
		const base = toUri(o.base);
		const output = toUri(o.output);
		const input1 = toInputData(o.input1);
		const input2 = toInputData(o.input2);
		return { base, input1, input2, output };
	}

	function toInputData(obj: unknown): MergeEditorInputData {
		if (typeof obj === 'string') {
			return new MergeEditorInputData(URI.parse(obj, true), undefined, undefined, undefined);
		}
		if (!obj || typeof obj !== 'object') {
			throw new TypeError('invalid argument');
		}

		if (isUriComponents(obj)) {
			return new MergeEditorInputData(URI.revive(obj), undefined, undefined, undefined);
		}

		const o = obj as IRelaxedInputData;
		const title = o.title;
		const uri = toUri(o.uri);
		const detail = o.detail;
		const description = o.description;
		return new MergeEditorInputData(uri, title, detail, description);
	}

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
		const o = obj as UriComponents;
		return typeof o.scheme === 'string'
			&& typeof o.authority === 'string'
			&& typeof o.path === 'string'
			&& typeof o.query === 'string'
			&& typeof o.fragment === 'string';
	}
}

type IRelaxedInputData = { uri: UriComponents; title?: string; detail?: string; description?: string };

type IRelaxedOpenArgs = {
	base: UriComponents | string;
	input1: IRelaxedInputData | string;
	input2: IRelaxedInputData | string;
	output: UriComponents | string;
};

export class SetMixedLayout extends Action2 {
	constructor() {
		super({
			id: 'merge.mixedLayout',
			title: {
				value: localize('layout.mixed', 'Mixed Layout'),
				original: 'Mixed Layout',
			},
			toggled: ctxMergeEditorLayout.isEqualTo('mixed'),
			menu: [
				{
					id: MenuId.EditorTitle,
					when: ctxIsMergeEditor,
					group: '1_merge',
					order: 9,
				},
			],
			precondition: ctxIsMergeEditor,
		});
	}

	run(accessor: ServicesAccessor): void {
		const { activeEditorPane } = accessor.get(IEditorService);
		if (activeEditorPane instanceof MergeEditor) {
			activeEditorPane.setLayout('mixed');
		}
	}
}

export class SetColumnLayout extends Action2 {
	constructor() {
		super({
			id: 'merge.columnLayout',
			title: { value: localize('layout.column', "Column Layout"), original: 'Column Layout' },
			toggled: ctxMergeEditorLayout.isEqualTo('columns'),
			menu: [{
				id: MenuId.EditorTitle,
				when: ctxIsMergeEditor,
				group: '1_merge',
				order: 10,
			}],
			precondition: ctxIsMergeEditor,
		});
	}

	run(accessor: ServicesAccessor): void {
		const { activeEditorPane } = accessor.get(IEditorService);
		if (activeEditorPane instanceof MergeEditor) {
			activeEditorPane.setLayout('columns');
		}
	}
}

const mergeEditorCategory: ILocalizedString = {
	value: localize('mergeEditor', 'Merge Editor'),
	original: 'Merge Editor',
};

export class OpenResultResource extends MergeEditorAction {
	constructor() {
		super({
			id: 'merge.openResult',
			icon: Codicon.goToFile,
			title: {
				value: localize('openfile', 'Open File'),
				original: 'Open File',
			},
			category: mergeEditorCategory,
			menu: [{
				id: MenuId.EditorTitle,
				when: ctxIsMergeEditor,
				group: 'navigation',
				order: 1,
			}],
			precondition: ctxIsMergeEditor,
		});
	}

	override runWithViewModel(viewModel: MergeEditorViewModel, accessor: ServicesAccessor): void {
		const editorService = accessor.get(IEditorService);
		editorService.openEditor({ resource: viewModel.model.resultTextModel.uri });
	}
}

export class GoToNextUnhandledConflict extends MergeEditorAction {
	constructor() {
		super({
			id: 'merge.goToNextUnhandledConflict',
			category: mergeEditorCategory,
			title: {
				value: localize('merge.goToNextUnhandledConflict', 'Go to Next Unhandled Conflict'),
				original: 'Go to Next Unhandled Conflict',
			},
			icon: Codicon.arrowDown,
			menu: [
				{
					id: MenuId.EditorTitle,
					when: ctxIsMergeEditor,
					group: 'navigation',
					order: 3
				},
			],
			f1: true,
			precondition: ctxIsMergeEditor,
		});
	}

	override runWithViewModel(viewModel: MergeEditorViewModel): void {
		viewModel.goToNextModifiedBaseRange(r => !viewModel.model.isHandled(r).get());
	}
}

export class GoToPreviousUnhandledConflict extends MergeEditorAction {
	constructor() {
		super({
			id: 'merge.goToPreviousUnhandledConflict',
			category: mergeEditorCategory,
			title: {
				value: localize(
					'merge.goToPreviousUnhandledConflict',
					'Go to Previous Unhandled Conflict'
				),
				original: 'Go to Previous Unhandled Conflict',
			},
			icon: Codicon.arrowUp,
			menu: [
				{
					id: MenuId.EditorTitle,
					when: ctxIsMergeEditor,
					group: 'navigation',
					order: 2
				},
			],
			f1: true,
			precondition: ctxIsMergeEditor,
		});
	}

	override runWithViewModel(viewModel: MergeEditorViewModel): void {
		viewModel.goToPreviousModifiedBaseRange(r => !viewModel.model.isHandled(r).get());
	}
}

export class ToggleActiveConflictInput1 extends MergeEditorAction {
	constructor() {
		super({
			id: 'merge.toggleActiveConflictInput1',
			category: mergeEditorCategory,
			title: {
				value: localize(
					'merge.toggleCurrentConflictFromLeft',
					'Toggle Current Conflict from Left'
				),
				original: 'Toggle Current Conflict from Left',
			},
			f1: true,
			precondition: ctxIsMergeEditor,
		});
	}

	override runWithViewModel(viewModel: MergeEditorViewModel): void {
		viewModel.toggleActiveConflict(1);
	}
}

export class ToggleActiveConflictInput2 extends MergeEditorAction {
	constructor() {
		super({
			id: 'merge.toggleActiveConflictInput2',
			category: mergeEditorCategory,
			title: {
				value: localize(
					'merge.toggleCurrentConflictFromRight',
					'Toggle Current Conflict from Right'
				),
				original: 'Toggle Current Conflict from Right',
			},
			f1: true,
			precondition: ctxIsMergeEditor,
		});
	}

	override runWithViewModel(viewModel: MergeEditorViewModel): void {
		viewModel.toggleActiveConflict(2);
	}
}

export class CompareInput1WithBaseCommand extends MergeEditorAction {
	constructor() {
		super({
			id: 'mergeEditor.compareInput1WithBase',
			category: mergeEditorCategory,
			title: {
				value: localize(
					'mergeEditor.compareInput1WithBase',
					'Compare Input 1 With Base'
				),
				original: 'Compare Input 1 With Base',
			},
			shortTitle: localize('mergeEditor.compareWithBase', 'Compare With Base'),
			f1: true,
			precondition: ctxIsMergeEditor,
			menu: { id: MenuId.MergeInput1Toolbar }
		});
	}

	override runWithViewModel(viewModel: MergeEditorViewModel, accessor: ServicesAccessor): void {
		const editorService = accessor.get(IEditorService);
		mergeEditorCompare(viewModel, editorService, 1);
	}
}

export class CompareInput2WithBaseCommand extends MergeEditorAction {
	constructor() {
		super({
			id: 'mergeEditor.compareInput2WithBase',
			category: mergeEditorCategory,
			title: {
				value: localize(
					'mergeEditor.compareInput2WithBase',
					'Compare Input 2 With Base'
				),
				original: 'Compare Input 2 With Base',
			},
			shortTitle: localize('mergeEditor.compareWithBase', 'Compare With Base'),
			f1: true,
			precondition: ctxIsMergeEditor,
			menu: { id: MenuId.MergeInput2Toolbar }
		});
	}

	override runWithViewModel(viewModel: MergeEditorViewModel, accessor: ServicesAccessor): void {
		const editorService = accessor.get(IEditorService);
		mergeEditorCompare(viewModel, editorService, 2);
	}
}

async function mergeEditorCompare(viewModel: MergeEditorViewModel, editorService: IEditorService, inputNumber: 1 | 2) {
	const model = viewModel.model;
	const base = model.base;
	const input = inputNumber === 1 ? viewModel.inputCodeEditorView1.editor : viewModel.inputCodeEditorView2.editor;

	const lineNumber = input.getPosition()!.lineNumber;
	await editorService.openEditor({
		original: { resource: base.uri },
		modified: { resource: input.getModel()!.uri },
		options: {
			selection: {
				startLineNumber: lineNumber,
				startColumn: 1,
			},
			revealIfOpened: true,
			revealIfVisible: true,
		} as ITextEditorOptions
	});
}

export class OpenBaseFile extends MergeEditorAction {
	constructor() {
		super({
			id: 'merge.openBaseEditor',
			category: mergeEditorCategory,
			title: {
				value: localize('merge.openBaseEditor', 'Open Base File'),
				original: 'Open Base File',
			},
			f1: true,
			precondition: ctxIsMergeEditor,
		});
	}

	override runWithViewModel(viewModel: MergeEditorViewModel, accessor: ServicesAccessor): void {
		const openerService = accessor.get(IOpenerService);
		openerService.open(viewModel.model.base.uri);
	}
}

export class AcceptAllInput1 extends MergeEditorAction {
	constructor() {
		super({
			id: 'merge.acceptAllInput1',
			category: mergeEditorCategory,
			title: {
				value: localize(
					'merge.acceptAllInput1',
					'Accept All Changes from Left'
				),
				original: 'Accept All Changes from Left',
			},
			f1: true,
			precondition: ctxIsMergeEditor,
			menu: [
				{ id: MenuId.MergeInput1Toolbar, }
			]
		});
	}

	override runWithViewModel(viewModel: MergeEditorViewModel): void {
		viewModel.acceptAll(1);
	}
}

export class AcceptAllInput2 extends MergeEditorAction {
	constructor() {
		super({
			id: 'merge.acceptAllInput2',
			category: mergeEditorCategory,
			title: {
				value: localize(
					'merge.acceptAllInput2',
					'Accept All Changes from Right'
				),
				original: 'Accept All Changes from Right',
			},
			f1: true,
			precondition: ctxIsMergeEditor,
			menu: [
				{ id: MenuId.MergeInput2Toolbar, }
			]
		});
	}

	override runWithViewModel(viewModel: MergeEditorViewModel): void {
		viewModel.acceptAll(2);
	}
}
