/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../../base/common/codicons.js';
import { basename } from '../../../../../base/common/resources.js';
import { URI, UriComponents } from '../../../../../base/common/uri.js';
import { localize, localize2 } from '../../../../../nls.js';
import { ILocalizedString } from '../../../../../platform/action/common/action.js';
import { Action2, IAction2Options, MenuId } from '../../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { ITextEditorOptions } from '../../../../../platform/editor/common/editor.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { IStorageService, StorageScope } from '../../../../../platform/storage/common/storage.js';
import { IEditorIdentifier, IResourceMergeEditorInput } from '../../../../common/editor.js';
import { MergeEditorInput, MergeEditorInputData } from '../mergeEditorInput.js';
import { IMergeEditorInputModel } from '../mergeEditorInputModel.js';
import { MergeEditor } from '../view/mergeEditor.js';
import { MergeEditorViewModel } from '../view/viewModel.js';
import { ctxIsMergeEditor, ctxMergeEditorLayout, ctxMergeEditorShowBase, ctxMergeEditorShowBaseAtTop, ctxMergeEditorShowNonConflictingChanges, StorageCloseWithConflicts } from '../../common/mergeEditor.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';

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

interface MergeEditorAction2Args {
	inputModel: IMergeEditorInputModel;
	viewModel: MergeEditorViewModel;
	input: MergeEditorInput;
	editorIdentifier: IEditorIdentifier;
}

abstract class MergeEditorAction2 extends Action2 {
	constructor(desc: Readonly<IAction2Options>) {
		super(desc);
	}

	override run(accessor: ServicesAccessor, ...args: any[]): void {
		const { activeEditorPane } = accessor.get(IEditorService);
		if (activeEditorPane instanceof MergeEditor) {
			const vm = activeEditorPane.viewModel.get();
			if (!vm) {
				return;
			}

			return this.runWithMergeEditor({
				viewModel: vm,
				inputModel: activeEditorPane.inputModel.get()!,
				input: activeEditorPane.input as MergeEditorInput,
				editorIdentifier: {
					editor: activeEditorPane.input,
					groupId: activeEditorPane.group.id,
				}
			}, accessor, ...args) as any;
		}
	}

	abstract runWithMergeEditor(context: MergeEditorAction2Args, accessor: ServicesAccessor, ...args: any[]): unknown;
}

export class OpenMergeEditor extends Action2 {
	constructor() {
		super({
			id: '_open.mergeEditor',
			title: localize2('title', 'Open Merge Editor'),
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
			title: localize2('layout.mixed', "Mixed Layout"),
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
			activeEditorPane.setLayoutKind('mixed');
		}
	}
}

export class SetColumnLayout extends Action2 {
	constructor() {
		super({
			id: 'merge.columnLayout',
			title: localize2('layout.column', 'Column Layout'),
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
			activeEditorPane.setLayoutKind('columns');
		}
	}
}

export class ShowNonConflictingChanges extends Action2 {
	constructor() {
		super({
			id: 'merge.showNonConflictingChanges',
			title: localize2('showNonConflictingChanges', "Show Non-Conflicting Changes"),
			toggled: ctxMergeEditorShowNonConflictingChanges.isEqualTo(true),
			menu: [
				{
					id: MenuId.EditorTitle,
					when: ctxIsMergeEditor,
					group: '3_merge',
					order: 9,
				},
			],
			precondition: ctxIsMergeEditor,
		});
	}

	run(accessor: ServicesAccessor): void {
		const { activeEditorPane } = accessor.get(IEditorService);
		if (activeEditorPane instanceof MergeEditor) {
			activeEditorPane.toggleShowNonConflictingChanges();
		}
	}
}

export class ShowHideBase extends Action2 {
	constructor() {
		super({
			id: 'merge.showBase',
			title: localize2('layout.showBase', "Show Base"),
			toggled: ctxMergeEditorShowBase.isEqualTo(true),
			menu: [
				{
					id: MenuId.EditorTitle,
					when: ContextKeyExpr.and(ctxIsMergeEditor, ctxMergeEditorLayout.isEqualTo('columns')),
					group: '2_merge',
					order: 9,
				},
			]
		});
	}

	run(accessor: ServicesAccessor): void {
		const { activeEditorPane } = accessor.get(IEditorService);
		if (activeEditorPane instanceof MergeEditor) {
			activeEditorPane.toggleBase();
		}
	}
}

export class ShowHideTopBase extends Action2 {
	constructor() {
		super({
			id: 'merge.showBaseTop',
			title: localize2('layout.showBaseTop', "Show Base Top"),
			toggled: ContextKeyExpr.and(ctxMergeEditorShowBase, ctxMergeEditorShowBaseAtTop),
			menu: [
				{
					id: MenuId.EditorTitle,
					when: ContextKeyExpr.and(ctxIsMergeEditor, ctxMergeEditorLayout.isEqualTo('mixed')),
					group: '2_merge',
					order: 10,
				},
			],
		});
	}

	run(accessor: ServicesAccessor): void {
		const { activeEditorPane } = accessor.get(IEditorService);
		if (activeEditorPane instanceof MergeEditor) {
			activeEditorPane.toggleShowBaseTop();
		}
	}
}

export class ShowHideCenterBase extends Action2 {
	constructor() {
		super({
			id: 'merge.showBaseCenter',
			title: localize2('layout.showBaseCenter', "Show Base Center"),
			toggled: ContextKeyExpr.and(ctxMergeEditorShowBase, ctxMergeEditorShowBaseAtTop.negate()),
			menu: [
				{
					id: MenuId.EditorTitle,
					when: ContextKeyExpr.and(ctxIsMergeEditor, ctxMergeEditorLayout.isEqualTo('mixed')),
					group: '2_merge',
					order: 11,
				},
			],
		});
	}

	run(accessor: ServicesAccessor): void {
		const { activeEditorPane } = accessor.get(IEditorService);
		if (activeEditorPane instanceof MergeEditor) {
			activeEditorPane.toggleShowBaseCenter();
		}
	}
}

const mergeEditorCategory: ILocalizedString = localize2('mergeEditor', "Merge Editor");

export class OpenResultResource extends MergeEditorAction {
	constructor() {
		super({
			id: 'merge.openResult',
			icon: Codicon.goToFile,
			title: localize2('openfile', "Open File"),
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
			title: localize2('merge.goToNextUnhandledConflict', "Go to Next Unhandled Conflict"),
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
		viewModel.model.telemetry.reportNavigationToNextConflict();
		viewModel.goToNextModifiedBaseRange(r => !viewModel.model.isHandled(r).get());
	}
}

export class GoToPreviousUnhandledConflict extends MergeEditorAction {
	constructor() {
		super({
			id: 'merge.goToPreviousUnhandledConflict',
			category: mergeEditorCategory,
			title: localize2('merge.goToPreviousUnhandledConflict', "Go to Previous Unhandled Conflict"),
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
		viewModel.model.telemetry.reportNavigationToPreviousConflict();
		viewModel.goToPreviousModifiedBaseRange(r => !viewModel.model.isHandled(r).get());
	}
}

export class ToggleActiveConflictInput1 extends MergeEditorAction {
	constructor() {
		super({
			id: 'merge.toggleActiveConflictInput1',
			category: mergeEditorCategory,
			title: localize2('merge.toggleCurrentConflictFromLeft', "Toggle Current Conflict from Left"),
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
			title: localize2('merge.toggleCurrentConflictFromRight', "Toggle Current Conflict from Right"),
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
			title: localize2('mergeEditor.compareInput1WithBase', "Compare Input 1 With Base"),
			shortTitle: localize('mergeEditor.compareWithBase', 'Compare With Base'),
			f1: true,
			precondition: ctxIsMergeEditor,
			menu: { id: MenuId.MergeInput1Toolbar, group: 'primary' },
			icon: Codicon.compareChanges,
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
			title: localize2('mergeEditor.compareInput2WithBase', "Compare Input 2 With Base"),
			shortTitle: localize('mergeEditor.compareWithBase', 'Compare With Base'),
			f1: true,
			precondition: ctxIsMergeEditor,
			menu: { id: MenuId.MergeInput2Toolbar, group: 'primary' },
			icon: Codicon.compareChanges,
		});
	}

	override runWithViewModel(viewModel: MergeEditorViewModel, accessor: ServicesAccessor): void {
		const editorService = accessor.get(IEditorService);
		mergeEditorCompare(viewModel, editorService, 2);
	}
}

async function mergeEditorCompare(viewModel: MergeEditorViewModel, editorService: IEditorService, inputNumber: 1 | 2) {

	editorService.openEditor(editorService.activeEditor!, { pinned: true });

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
		} satisfies ITextEditorOptions
	});
}

export class OpenBaseFile extends MergeEditorAction {
	constructor() {
		super({
			id: 'merge.openBaseEditor',
			category: mergeEditorCategory,
			title: localize2('merge.openBaseEditor', "Open Base File"),
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
			title: localize2('merge.acceptAllInput1', "Accept All Changes from Left"),
			f1: true,
			precondition: ctxIsMergeEditor,
			menu: { id: MenuId.MergeInput1Toolbar, group: 'primary' },
			icon: Codicon.checkAll,
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
			title: localize2('merge.acceptAllInput2', "Accept All Changes from Right"),
			f1: true,
			precondition: ctxIsMergeEditor,
			menu: { id: MenuId.MergeInput2Toolbar, group: 'primary' },
			icon: Codicon.checkAll,
		});
	}

	override runWithViewModel(viewModel: MergeEditorViewModel): void {
		viewModel.acceptAll(2);
	}
}

export class ResetToBaseAndAutoMergeCommand extends MergeEditorAction {
	constructor() {
		super({
			id: 'mergeEditor.resetResultToBaseAndAutoMerge',
			category: mergeEditorCategory,
			title: localize2('mergeEditor.resetResultToBaseAndAutoMerge', "Reset Result"),
			shortTitle: localize('mergeEditor.resetResultToBaseAndAutoMerge.short', 'Reset'),
			f1: true,
			precondition: ctxIsMergeEditor,
			menu: { id: MenuId.MergeInputResultToolbar, group: 'primary' },
			icon: Codicon.discard,
		});
	}

	override runWithViewModel(viewModel: MergeEditorViewModel, accessor: ServicesAccessor): void {
		viewModel.model.reset();
	}
}

export class ResetCloseWithConflictsChoice extends Action2 {
	constructor() {
		super({
			id: 'mergeEditor.resetCloseWithConflictsChoice',
			category: mergeEditorCategory,
			title: localize2('mergeEditor.resetChoice', "Reset Choice for \'Close with Conflicts\'"),
			f1: true,
		});
	}
	run(accessor: ServicesAccessor): void {
		accessor.get(IStorageService).remove(StorageCloseWithConflicts, StorageScope.PROFILE);
	}
}

// this is an API command
export class AcceptMerge extends MergeEditorAction2 {
	constructor() {
		super({
			id: 'mergeEditor.acceptMerge',
			category: mergeEditorCategory,
			title: localize2('mergeEditor.acceptMerge', "Complete Merge"),
			f1: false,
			precondition: ctxIsMergeEditor
		});
	}

	override async runWithMergeEditor({ inputModel, editorIdentifier, viewModel }: MergeEditorAction2Args, accessor: ServicesAccessor) {
		const dialogService = accessor.get(IDialogService);
		const editorService = accessor.get(IEditorService);

		if (viewModel.model.unhandledConflictsCount.get() > 0) {
			const { confirmed } = await dialogService.confirm({
				message: localize('mergeEditor.acceptMerge.unhandledConflicts.message', "Do you want to complete the merge of {0}?", basename(inputModel.resultUri)),
				detail: localize('mergeEditor.acceptMerge.unhandledConflicts.detail', "The file contains unhandled conflicts."),
				primaryButton: localize({ key: 'mergeEditor.acceptMerge.unhandledConflicts.accept', comment: ['&& denotes a mnemonic'] }, "&&Complete with Conflicts")
			});

			if (!confirmed) {
				return {
					successful: false
				};
			}
		}

		await inputModel.accept();
		await editorService.closeEditor(editorIdentifier);

		return {
			successful: true
		};
	}
}
