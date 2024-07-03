/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from 'vs/base/common/codicons';
import { URI } from 'vs/base/common/uri';
import { Selection } from 'vs/editor/common/core/selection';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { localize2 } from 'vs/nls';
import { Action2, MenuId } from 'vs/platform/actions/common/actions';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { getCommandsContext, resolveCommandsContext } from 'vs/workbench/browser/parts/editor/editorCommands';
import { IEditorCommandsContext } from 'vs/workbench/common/editor';
import { TextFileEditor } from 'vs/workbench/contrib/files/browser/editors/textFileEditor';
import { MultiDiffEditor } from 'vs/workbench/contrib/multiDiffEditor/browser/multiDiffEditor';
import { MultiDiffEditorInput } from 'vs/workbench/contrib/multiDiffEditor/browser/multiDiffEditorInput';
import { IEditorGroupsService } from 'vs/workbench/services/editor/common/editorGroupsService';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';

export class GoToFileAction extends Action2 {
	constructor() {
		super({
			id: 'multiDiffEditor.goToFile',
			title: localize2('goToFile', 'Open File'),
			icon: Codicon.goToFile,
			precondition: EditorContextKeys.inMultiDiffEditor,
			menu: {
				when: EditorContextKeys.inMultiDiffEditor,
				id: MenuId.MultiDiffEditorFileToolbar,
				order: 22,
				group: 'navigation',
			},
		});
	}

	async run(accessor: ServicesAccessor, ...args: any[]): Promise<void> {
		const uri = args[0] as URI;
		const editorService = accessor.get(IEditorService);
		const activeEditorPane = editorService.activeEditorPane;
		let selections: Selection[] | undefined = undefined;
		if (activeEditorPane instanceof MultiDiffEditor) {
			const editor = activeEditorPane.tryGetCodeEditor(uri);
			if (editor) {
				selections = editor.editor.getSelections() ?? undefined;
			}
		}

		const editor = await editorService.openEditor({ resource: uri });
		if (selections && (editor instanceof TextFileEditor)) {
			const c = editor.getControl();
			if (c) {
				c.setSelections(selections);
				c.revealLineInCenter(selections[0].selectionStartLineNumber);
			}
		}
	}
}

export class CollapseAllAction extends Action2 {
	constructor() {
		super({
			id: 'multiDiffEditor.collapseAll',
			title: localize2('collapseAllDiffs', 'Collapse All Diffs'),
			icon: Codicon.collapseAll,
			precondition: ContextKeyExpr.and(ContextKeyExpr.equals('activeEditor', MultiDiffEditor.ID), ContextKeyExpr.not('multiDiffEditorAllCollapsed')),
			menu: {
				when: ContextKeyExpr.and(ContextKeyExpr.equals('activeEditor', MultiDiffEditor.ID), ContextKeyExpr.not('multiDiffEditorAllCollapsed')),
				id: MenuId.EditorTitle,
				group: 'navigation',
				order: 100
			},
			f1: true,
		});
	}

	async run(accessor: ServicesAccessor, resourceOrContext?: URI | IEditorCommandsContext, context?: IEditorCommandsContext): Promise<void> {
		const { editor } = resolveCommandsContext(accessor.get(IEditorGroupsService), getCommandsContext(accessor, resourceOrContext, context));

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
			menu: {
				when: ContextKeyExpr.and(ContextKeyExpr.equals('activeEditor', MultiDiffEditor.ID), ContextKeyExpr.has('multiDiffEditorAllCollapsed')),
				id: MenuId.EditorTitle,
				group: 'navigation',
				order: 100
			},
			f1: true,
		});
	}

	async run(accessor: ServicesAccessor, resourceOrContext?: URI | IEditorCommandsContext, context?: IEditorCommandsContext): Promise<void> {
		const { editor } = resolveCommandsContext(accessor.get(IEditorGroupsService), getCommandsContext(accessor, resourceOrContext, context));

		if (editor instanceof MultiDiffEditorInput) {
			const viewModel = await editor.getViewModel();
			viewModel.expandAll();
		}
	}
}
