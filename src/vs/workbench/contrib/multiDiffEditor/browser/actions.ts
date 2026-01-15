/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import { URI } from '../../../../base/common/uri.js';
import { Selection } from '../../../../editor/common/core/selection.js';
import { localize2 } from '../../../../nls.js';
import { Action2, MenuId } from '../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { ITextEditorOptions, TextEditorSelectionRevealType } from '../../../../platform/editor/common/editor.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { IListService } from '../../../../platform/list/browser/listService.js';
import { resolveCommandsContext } from '../../../browser/parts/editor/editorCommandsContext.js';
import { MultiDiffEditor } from './multiDiffEditor.js';
import { MultiDiffEditorInput } from './multiDiffEditorInput.js';
import { IEditorGroupsService } from '../../../services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { ActiveEditorContext } from '../../../common/contextkeys.js';

export class GoToFileAction extends Action2 {
	constructor() {
		super({
			id: 'multiDiffEditor.goToFile',
			title: localize2('goToFile', 'Open File'),
			icon: Codicon.goToFile,
			precondition: ActiveEditorContext.isEqualTo(MultiDiffEditor.ID),
			menu: {
				when: ActiveEditorContext.isEqualTo(MultiDiffEditor.ID),
				id: MenuId.MultiDiffEditorFileToolbar,
				order: 22,
				group: 'navigation',
			},
		});
	}

	async run(accessor: ServicesAccessor, ...args: unknown[]): Promise<void> {
		const uri = args[0] as URI;
		const editorService = accessor.get(IEditorService);
		const activeEditorPane = editorService.activeEditorPane;
		let selections: Selection[] | undefined = undefined;
		if (!(activeEditorPane instanceof MultiDiffEditor)) {
			return;
		}

		const editor = activeEditorPane.tryGetCodeEditor(uri);
		if (editor) {
			selections = editor.editor.getSelections() ?? undefined;
		}

		let targetUri = uri;
		const item = activeEditorPane.findDocumentDiffItem(uri);
		if (item && item.goToFileUri) {
			targetUri = item.goToFileUri;
		}

		await editorService.openEditor({
			label: item?.goToFileEditorTitle,
			resource: targetUri,
			options: {
				selection: selections?.[0],
				selectionRevealType: TextEditorSelectionRevealType.CenterIfOutsideViewport,
			} satisfies ITextEditorOptions,
		});
	}
}

export class GoToNextChangeAction extends Action2 {
	constructor() {
		super({
			id: 'multiDiffEditor.goToNextChange',
			title: localize2('goToNextChange', 'Go to Next Change'),
			icon: Codicon.arrowDown,
			precondition: ContextKeyExpr.equals('activeEditor', MultiDiffEditor.ID),
			menu: [MenuId.EditorTitle, MenuId.CompactWindowEditorTitle].map(id => ({
				id,
				when: ContextKeyExpr.equals('activeEditor', MultiDiffEditor.ID),
				group: 'navigation',
				order: 2
			})),
			keybinding: {
				primary: KeyMod.Alt | KeyCode.F5,
				weight: KeybindingWeight.EditorContrib,
				when: ContextKeyExpr.equals('activeEditor', MultiDiffEditor.ID),
			},
			f1: true,
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const editorService = accessor.get(IEditorService);
		const activeEditorPane = editorService.activeEditorPane;

		if (!(activeEditorPane instanceof MultiDiffEditor)) {
			return;
		}

		activeEditorPane.goToNextChange();
	}
}

export class GoToPreviousChangeAction extends Action2 {
	constructor() {
		super({
			id: 'multiDiffEditor.goToPreviousChange',
			title: localize2('goToPreviousChange', 'Go to Previous Change'),
			icon: Codicon.arrowUp,
			precondition: ContextKeyExpr.equals('activeEditor', MultiDiffEditor.ID),
			menu: [MenuId.EditorTitle, MenuId.CompactWindowEditorTitle].map(id => ({
				id,
				when: ContextKeyExpr.equals('activeEditor', MultiDiffEditor.ID),
				group: 'navigation',
				order: 1
			})),
			keybinding: {
				primary: KeyMod.Alt | KeyMod.Shift | KeyCode.F5,
				weight: KeybindingWeight.EditorContrib,
				when: ContextKeyExpr.equals('activeEditor', MultiDiffEditor.ID),
			},
			f1: true,
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const editorService = accessor.get(IEditorService);
		const activeEditorPane = editorService.activeEditorPane;

		if (!(activeEditorPane instanceof MultiDiffEditor)) {
			return;
		}

		activeEditorPane.goToPreviousChange();
	}
}

export class CollapseAllAction extends Action2 {
	constructor() {
		super({
			id: 'multiDiffEditor.collapseAll',
			title: localize2('collapseAllDiffs', 'Collapse All Diffs'),
			icon: Codicon.collapseAll,
			precondition: ContextKeyExpr.and(ContextKeyExpr.equals('activeEditor', MultiDiffEditor.ID), ContextKeyExpr.not('multiDiffEditorAllCollapsed')),
			menu: [MenuId.EditorTitle, MenuId.CompactWindowEditorTitle].map(id => ({
				id,
				when: ContextKeyExpr.and(ContextKeyExpr.equals('activeEditor', MultiDiffEditor.ID), ContextKeyExpr.not('multiDiffEditorAllCollapsed')),
				group: 'navigation',
				order: 100
			})),
			f1: true,
		});
	}

	async run(accessor: ServicesAccessor, ...args: unknown[]): Promise<void> {
		const resolvedContext = resolveCommandsContext(args, accessor.get(IEditorService), accessor.get(IEditorGroupsService), accessor.get(IListService));

		const groupContext = resolvedContext.groupedEditors[0];
		if (!groupContext) {
			return;
		}

		const editor = groupContext.editors[0];
		if (editor instanceof MultiDiffEditorInput) {
			const viewModel = await editor.getViewModel();
			viewModel.collapseAll();
		}
	}
}

export class ExpandAllAction extends Action2 {
	constructor() {
		super({
			id: 'multiDiffEditor.expandAll',
			title: localize2('ExpandAllDiffs', 'Expand All Diffs'),
			icon: Codicon.expandAll,
			precondition: ContextKeyExpr.and(ContextKeyExpr.equals('activeEditor', MultiDiffEditor.ID), ContextKeyExpr.has('multiDiffEditorAllCollapsed')),
			menu: [MenuId.EditorTitle, MenuId.CompactWindowEditorTitle].map(id => ({
				id,
				when: ContextKeyExpr.and(ContextKeyExpr.equals('activeEditor', MultiDiffEditor.ID), ContextKeyExpr.has('multiDiffEditorAllCollapsed')),
				group: 'navigation',
				order: 100
			})),
			f1: true,
		});
	}

	async run(accessor: ServicesAccessor, ...args: unknown[]): Promise<void> {
		const resolvedContext = resolveCommandsContext(args, accessor.get(IEditorService), accessor.get(IEditorGroupsService), accessor.get(IListService));

		const groupContext = resolvedContext.groupedEditors[0];
		if (!groupContext) {
			return;
		}

		const editor = groupContext.editors[0];
		if (editor instanceof MultiDiffEditorInput) {
			const viewModel = await editor.getViewModel();
			viewModel.expandAll();
		}
	}
}
