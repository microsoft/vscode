/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize, localize2 } from 'vs/nls';
import { Action2, MenuId, registerAction2 } from 'vs/platform/actions/common/actions';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { NotebookOutlineContext } from 'vs/workbench/contrib/notebook/browser/contrib/outline/notebookOutline';
import { FoldingController } from 'vs/workbench/contrib/notebook/browser/controller/foldingController';
import { CellFoldingState, INotebookEditor } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import * as icons from 'vs/workbench/contrib/notebook/browser/notebookIcons';
import { OutlineEntry } from 'vs/workbench/contrib/notebook/browser/viewModel/OutlineEntry';
import { CellKind } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { OutlineTarget } from 'vs/workbench/services/outline/browser/outline';

export type NotebookSectionArgs = {
	notebookEditor: INotebookEditor | undefined;
	outlineEntry: OutlineEntry;
};

export type ValidNotebookSectionArgs = {
	notebookEditor: INotebookEditor;
	outlineEntry: OutlineEntry;
};

export class NotebookRunSingleCellInSection extends Action2 {
	constructor() {
		super({
			id: 'notebook.section.runSingleCell',
			title: {
				...localize2('runCell', "Run Cell"),
				mnemonicTitle: localize({ key: 'mirunCell', comment: ['&& denotes a mnemonic'] }, "&&Run Cell"),
			},
			shortTitle: localize('runCell', "Run Cell"),
			icon: icons.executeIcon,
			menu: [
				{
					id: MenuId.NotebookOutlineActionMenu,
					group: 'inline',
					order: 1,
					when: ContextKeyExpr.and(
						NotebookOutlineContext.CellKind.isEqualTo(CellKind.Code),
						NotebookOutlineContext.OutlineElementTarget.isEqualTo(OutlineTarget.OutlinePane),
						NotebookOutlineContext.CellHasChildren.toNegated(),
						NotebookOutlineContext.CellHasHeader.toNegated(),
					)
				}
			]
		});
	}

	override async run(_accessor: ServicesAccessor, context: NotebookSectionArgs): Promise<void> {
		if (!checkSectionContext(context)) {
			return;
		}

		context.notebookEditor.executeNotebookCells([context.outlineEntry.cell]);
	}
}

export class NotebookRunCellsInSection extends Action2 {
	constructor() {
		super({
			id: 'notebook.section.runCells',
			title: {
				...localize2('runCellsInSection', "Run Cells In Section"),
				mnemonicTitle: localize({ key: 'mirunCellsInSection', comment: ['&& denotes a mnemonic'] }, "&&Run Cells In Section"),
			},
			shortTitle: localize('runCellsInSection', "Run Cells In Section"),
			// icon: icons.executeBelowIcon, // TODO @Yoyokrazy replace this with new icon later
			menu: [
				{
					id: MenuId.NotebookStickyScrollContext,
					group: 'notebookExecution',
					order: 1
				},
				{
					id: MenuId.NotebookOutlineActionMenu,
					group: 'inline',
					order: 1,
					when: ContextKeyExpr.and(
						NotebookOutlineContext.CellKind.isEqualTo(CellKind.Markup),
						NotebookOutlineContext.OutlineElementTarget.isEqualTo(OutlineTarget.OutlinePane),
						NotebookOutlineContext.CellHasChildren,
						NotebookOutlineContext.CellHasHeader,
					)
				}
			]
		});
	}

	override async run(_accessor: ServicesAccessor, context: NotebookSectionArgs): Promise<void> {
		if (!checkSectionContext(context)) {
			return;
		}

		const cell = context.outlineEntry.cell;
		const idx = context.notebookEditor.getViewModel()?.getCellIndex(cell);
		if (idx === undefined) {
			return;
		}
		const length = context.notebookEditor.getViewModel()?.getFoldedLength(idx);
		if (length === undefined) {
			return;
		}

		const cells = context.notebookEditor.getCellsInRange({ start: idx, end: idx + length + 1 });
		context.notebookEditor.executeNotebookCells(cells);
	}
}

export class NotebookFoldSection extends Action2 {
	constructor() {
		super({
			id: 'notebook.section.foldSection',
			title: {
				...localize2('foldSection', "Fold Section"),
				mnemonicTitle: localize({ key: 'mifoldSection', comment: ['&& denotes a mnemonic'] }, "&&Fold Section"),
			},
			shortTitle: localize('foldSection', "Fold Section"),
			menu: [
				{
					id: MenuId.NotebookOutlineActionMenu,
					group: 'notebookFolding',
					order: 2,
					when: ContextKeyExpr.and(
						NotebookOutlineContext.CellKind.isEqualTo(CellKind.Markup),
						NotebookOutlineContext.OutlineElementTarget.isEqualTo(OutlineTarget.OutlinePane),
						NotebookOutlineContext.CellHasChildren,
						NotebookOutlineContext.CellHasHeader,
						NotebookOutlineContext.CellFoldingState.isEqualTo(CellFoldingState.Expanded)
					)
				}
			]
		});
	}

	override async run(_accessor: ServicesAccessor, context: NotebookSectionArgs): Promise<void> {
		if (!checkSectionContext(context)) {
			return;
		}

		this.toggleFoldRange(context.outlineEntry, context.notebookEditor);
	}

	private toggleFoldRange(entry: OutlineEntry, notebookEditor: INotebookEditor) {
		const foldingController = notebookEditor.getContribution<FoldingController>(FoldingController.id);
		const index = entry.index;
		const headerLevel = entry.level;
		const newFoldingState = CellFoldingState.Collapsed;

		foldingController.setFoldingStateDown(index, newFoldingState, headerLevel);
	}
}

export class NotebookExpandSection extends Action2 {
	constructor() {
		super({
			id: 'notebook.section.expandSection',
			title: {
				...localize2('expandSection', "Expand Section"),
				mnemonicTitle: localize({ key: 'miexpandSection', comment: ['&& denotes a mnemonic'] }, "&&Expand Section"),
			},
			shortTitle: localize('expandSection', "Expand Section"),
			menu: [
				{
					id: MenuId.NotebookOutlineActionMenu,
					group: 'notebookFolding',
					order: 2,
					when: ContextKeyExpr.and(
						NotebookOutlineContext.CellKind.isEqualTo(CellKind.Markup),
						NotebookOutlineContext.OutlineElementTarget.isEqualTo(OutlineTarget.OutlinePane),
						NotebookOutlineContext.CellHasChildren,
						NotebookOutlineContext.CellHasHeader,
						NotebookOutlineContext.CellFoldingState.isEqualTo(CellFoldingState.Collapsed)
					)
				}
			]
		});
	}

	override async run(_accessor: ServicesAccessor, context: NotebookSectionArgs): Promise<void> {
		if (!checkSectionContext(context)) {
			return;
		}

		this.toggleFoldRange(context.outlineEntry, context.notebookEditor);
	}

	private toggleFoldRange(entry: OutlineEntry, notebookEditor: INotebookEditor) {
		const foldingController = notebookEditor.getContribution<FoldingController>(FoldingController.id);
		const index = entry.index;
		const headerLevel = entry.level;
		const newFoldingState = CellFoldingState.Expanded;

		foldingController.setFoldingStateDown(index, newFoldingState, headerLevel);
	}
}

/**
 * Take in context args and check if they exist
 *
 * @param context - Notebook Section Context containing a notebook editor and outline entry
 * @returns true if context is valid, false otherwise
 */
function checkSectionContext(context: NotebookSectionArgs): context is ValidNotebookSectionArgs {
	return !!(context && context.notebookEditor && context.outlineEntry);
}

registerAction2(NotebookRunSingleCellInSection);
registerAction2(NotebookRunCellsInSection);
registerAction2(NotebookFoldSection);
registerAction2(NotebookExpandSection);
