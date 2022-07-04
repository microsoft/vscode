/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from 'vs/base/common/codicons';
import { URI, UriComponents } from 'vs/base/common/uri';
import { localize } from 'vs/nls';
import { ILocalizedString } from 'vs/platform/action/common/action';
import { Action2, MenuId } from 'vs/platform/actions/common/actions';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { API_OPEN_DIFF_EDITOR_COMMAND_ID } from 'vs/workbench/browser/parts/editor/editorCommands';
import { MergeEditorInput, MergeEditorInputData } from 'vs/workbench/contrib/mergeEditor/browser/mergeEditorInput';
import { MergeEditor } from 'vs/workbench/contrib/mergeEditor/browser/view/mergeEditor';
import { ctxIsMergeEditor, ctxMergeEditorLayout } from 'vs/workbench/contrib/mergeEditor/common/mergeEditor';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';

export class OpenMergeEditor extends Action2 {
	constructor() {
		super({
			id: '_open.mergeEditor',
			title: { value: localize('title', "Open Merge Editor"), original: 'Open Merge Editor' },
		});
	}
	run(accessor: ServicesAccessor, ...args: unknown[]): void {
		const validatedArgs = IRelaxedOpenArgs.validate(args[0]);

		const instaService = accessor.get(IInstantiationService);
		const input = instaService.createInstance(
			MergeEditorInput,
			validatedArgs.base,
			validatedArgs.input1,
			validatedArgs.input2,
			validatedArgs.output,
		);
		accessor.get(IEditorService).openEditor(input, { preserveFocus: true });
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

export class GoToNextConflict extends Action2 {
	constructor() {
		super({
			id: 'merge.goToNextConflict',
			category: mergeEditorCategory,
			title: {
				value: localize('merge.goToNextConflict', 'Go to Next Conflict'),
				original: 'Go to Next Conflict',
			},
			icon: Codicon.arrowDown,
			menu: [
				{
					id: MenuId.EditorTitle,
					when: ctxIsMergeEditor,
					group: 'navigation',
				},
			],
			f1: true,
			precondition: ctxIsMergeEditor,
		});
	}

	run(accessor: ServicesAccessor): void {
		const { activeEditorPane } = accessor.get(IEditorService);
		if (activeEditorPane instanceof MergeEditor) {
			activeEditorPane.viewModel.get()?.goToNextModifiedBaseRange(true);
		}
	}
}

export class GoToPreviousConflict extends Action2 {
	constructor() {
		super({
			id: 'merge.goToPreviousConflict',
			category: mergeEditorCategory,
			title: {
				value: localize(
					'merge.goToPreviousConflict',
					'Go to Previous Conflict'
				),
				original: 'Go to Previous Conflict',
			},
			icon: Codicon.arrowUp,
			menu: [
				{
					id: MenuId.EditorTitle,
					when: ctxIsMergeEditor,
					group: 'navigation',
				},
			],
			f1: true,
			precondition: ctxIsMergeEditor,
		});
	}

	run(accessor: ServicesAccessor): void {
		const { activeEditorPane } = accessor.get(IEditorService);
		if (activeEditorPane instanceof MergeEditor) {
			activeEditorPane.viewModel.get()?.goToPreviousModifiedBaseRange(true);
		}
	}
}

export class ToggleActiveConflictInput1 extends Action2 {
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

	run(accessor: ServicesAccessor): void {
		const { activeEditorPane } = accessor.get(IEditorService);
		if (activeEditorPane instanceof MergeEditor) {
			const vm = activeEditorPane.viewModel.get();
			if (!vm) {
				return;
			}
			vm.toggleActiveConflict(1);
		}
	}
}

export class ToggleActiveConflictInput2 extends Action2 {
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

	run(accessor: ServicesAccessor): void {
		const { activeEditorPane } = accessor.get(IEditorService);
		if (activeEditorPane instanceof MergeEditor) {
			const vm = activeEditorPane.viewModel.get();
			if (!vm) {
				return;
			}
			vm.toggleActiveConflict(2);
		}
	}
}

export class CompareInput1WithBaseCommand extends Action2 {
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
			f1: true,
			precondition: ctxIsMergeEditor,
		});
	}
	run(accessor: ServicesAccessor, ...args: unknown[]): void {
		const editorService = accessor.get(IEditorService);
		const commandService = accessor.get(ICommandService);
		mergeEditorCompare(editorService, commandService, 1);
	}
}

export class CompareInput2WithBaseCommand extends Action2 {
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
			f1: true,
			precondition: ctxIsMergeEditor,
		});
	}
	run(accessor: ServicesAccessor, ...args: unknown[]): void {
		const editorService = accessor.get(IEditorService);
		const commandService = accessor.get(ICommandService);
		mergeEditorCompare(editorService, commandService, 2);
	}
}

function mergeEditorCompare(editorService: IEditorService, commandService: ICommandService, inputNumber: 1 | 2) {
	const { activeEditorPane } = editorService;
	if (activeEditorPane instanceof MergeEditor) {
		if (!activeEditorPane.model) {
			return;
		}

		const base = activeEditorPane.model.base.uri;
		const input = inputNumber === 1 ? activeEditorPane.model.input1.uri : activeEditorPane.model.input2.uri;

		openDiffEditor(commandService, base, input);
	}
}

function openDiffEditor(commandService: ICommandService, left: URI, right: URI, label?: string) {
	commandService.executeCommand(API_OPEN_DIFF_EDITOR_COMMAND_ID, left, right, label);
}
