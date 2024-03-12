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
import { MarkupCellViewModel } from 'vs/workbench/contrib/notebook/browser/viewModel/markupCellViewModel';

export type NotebookSectionArgs = {
	notebookEditor: INotebookEditor | undefined;
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
						NotebookOutlineContext.CellKind.isEqualTo('code'),
						NotebookOutlineContext.OutlineElementTarget.isEqualTo('outline'),
						NotebookOutlineContext.CellHasChildren.toNegated(),
						NotebookOutlineContext.CellHasHeader.toNegated(),
					)
				}
			]
		});
	}

	override async run(_accessor: ServicesAccessor, context: NotebookSectionArgs): Promise<void> {
		context.notebookEditor?.executeNotebookCells([context.outlineEntry.cell]);
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
						NotebookOutlineContext.CellKind.isEqualTo('markdown'),
						NotebookOutlineContext.OutlineElementTarget.isEqualTo('outline'),
						NotebookOutlineContext.CellHasChildren,
						NotebookOutlineContext.CellHasHeader,
					)
				}
			]
		});
	}

	override async run(_accessor: ServicesAccessor, context: NotebookSectionArgs): Promise<void> {
		const cell = context.outlineEntry.cell;

		const idx = context.notebookEditor?.getViewModel()?.getCellIndex(cell);
		if (idx === undefined) {
			return;
		}
		const length = context.notebookEditor?.getViewModel()?.getFoldedLength(idx);
		if (length === undefined) {
			return;
		}

		const cells = context.notebookEditor?.getCellsInRange({ start: idx, end: idx + length + 1 });
		context.notebookEditor?.executeNotebookCells(cells);
	}
}

export class NotebookToggleFoldingSection extends Action2 {
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
						NotebookOutlineContext.CellKind.isEqualTo('markdown'),
						NotebookOutlineContext.OutlineElementTarget.isEqualTo('outline'),
						NotebookOutlineContext.CellHasChildren,
						NotebookOutlineContext.CellHasHeader,
					)
				}
			]
		});
	}

	override async run(_accessor: ServicesAccessor, context: NotebookSectionArgs): Promise<void> {
		if (context.notebookEditor) {
			this.toggleFoldRange(context.outlineEntry, context.notebookEditor);
		}
	}

	private toggleFoldRange(entry: OutlineEntry, notebookEditor: INotebookEditor) {
		const foldingController = notebookEditor.getContribution<FoldingController>(FoldingController.id);
		const currentState = (entry.cell as MarkupCellViewModel).foldingState;

		const index = entry.index;
		const headerLevel = entry.level;
		const newFoldingState = (currentState === CellFoldingState.Collapsed) ? CellFoldingState.Expanded : CellFoldingState.Collapsed;

		foldingController.setFoldingStateUp(index, newFoldingState, headerLevel);
	}

}

registerAction2(NotebookRunSingleCellInSection);
registerAction2(NotebookRunCellsInSection);
registerAction2(NotebookToggleFoldingSection);
