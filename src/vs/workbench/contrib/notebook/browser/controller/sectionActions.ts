/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize, localize2 } from '../../../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { NotebookOutlineContext } from '../contrib/outline/notebookOutline.js';
import { FoldingController } from './foldingController.js';
import { CellEditState, CellFoldingState, ICellViewModel, INotebookEditor } from '../notebookBrowser.js';
import * as icons from '../notebookIcons.js';
import { OutlineEntry } from '../viewModel/OutlineEntry.js';
import { CellKind } from '../../common/notebookCommon.js';
import { OutlineTarget } from '../../../../services/outline/browser/outline.js';
import { CELL_TITLE_CELL_GROUP_ID, CellToolbarOrder } from './coreActions.js';
import { executeSectionCondition } from './executeActions.js';

export type NotebookOutlineEntryArgs = {
	notebookEditor: INotebookEditor;
	outlineEntry: OutlineEntry;
};

export type NotebookCellArgs = {
	notebookEditor: INotebookEditor;
	cell: ICellViewModel;
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

	override async run(_accessor: ServicesAccessor, context: any): Promise<void> {
		if (!checkOutlineEntryContext(context)) {
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
			icon: icons.executeIcon, // TODO @Yoyokrazy replace this with new icon later
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
				},
				{
					id: MenuId.NotebookCellTitle,
					order: CellToolbarOrder.RunSection,
					group: CELL_TITLE_CELL_GROUP_ID,
					when: executeSectionCondition
				}
			]
		});
	}

	override async run(_accessor: ServicesAccessor, context: any): Promise<void> {
		let cell: ICellViewModel;
		if (checkOutlineEntryContext(context)) {
			cell = context.outlineEntry.cell;
		} else if (checkNotebookCellContext(context)) {
			cell = context.cell;
		} else {
			return;
		}

		if (cell.getEditState() === CellEditState.Editing) {
			const foldingController = context.notebookEditor.getContribution<FoldingController>(FoldingController.id);
			foldingController.recompute();
		}

		const cellIdx = context.notebookEditor.getViewModel()?.getCellIndex(cell);
		if (cellIdx === undefined) {
			return;
		}
		const sectionIdx = context.notebookEditor.getViewModel()?.getFoldingStartIndex(cellIdx);
		if (sectionIdx === undefined) {
			return;
		}
		const length = context.notebookEditor.getViewModel()?.getFoldedLength(sectionIdx);
		if (length === undefined) {
			return;
		}

		const cells = context.notebookEditor.getCellsInRange({ start: sectionIdx, end: sectionIdx + length + 1 });
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

	override async run(_accessor: ServicesAccessor, context: any): Promise<void> {
		if (!checkOutlineEntryContext(context)) {
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

	override async run(_accessor: ServicesAccessor, context: any): Promise<void> {
		if (!checkOutlineEntryContext(context)) {
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
 * Take in context args and check if they exist. True if action is run from notebook sticky scroll context menu or
 * notebook outline context menu.
 *
 * @param context - Notebook Outline Context containing a notebook editor and outline entry
 * @returns true if context is valid, false otherwise
 */
function checkOutlineEntryContext(context: any): context is NotebookOutlineEntryArgs {
	return !!(context && context.notebookEditor && context.outlineEntry);
}

/**
 * Take in context args and check if they exist. True if action is run from a cell toolbar menu (potentially from the
 * notebook cell container or cell editor context menus, but not tested or implemented atm)
 *
 * @param context - Notebook Outline Context containing a notebook editor and outline entry
 * @returns true if context is valid, false otherwise
 */
function checkNotebookCellContext(context: any): context is NotebookCellArgs {
	return !!(context && context.notebookEditor && context.cell);
}

registerAction2(NotebookRunSingleCellInSection);
registerAction2(NotebookRunCellsInSection);
registerAction2(NotebookFoldSection);
registerAction2(NotebookExpandSection);
