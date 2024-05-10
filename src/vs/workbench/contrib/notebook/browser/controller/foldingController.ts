/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { NOTEBOOK_EDITOR_FOCUSED, NOTEBOOK_IS_ACTIVE_EDITOR } from 'vs/workbench/contrib/notebook/common/notebookContextKeys';
import { INotebookEditor, INotebookEditorMouseEvent, INotebookEditorContribution, getNotebookEditorFromEditorPane, CellFoldingState } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { FoldingModel } from 'vs/workbench/contrib/notebook/browser/viewModel/foldingModel'; import { CellKind } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { ICellRange } from 'vs/workbench/contrib/notebook/common/notebookRange';
import { registerNotebookContribution } from 'vs/workbench/contrib/notebook/browser/notebookEditorExtensions';
import { registerAction2, Action2 } from 'vs/platform/actions/common/actions';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { InputFocusedContextKey } from 'vs/platform/contextkey/common/contextkeys';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { NOTEBOOK_ACTIONS_CATEGORY } from 'vs/workbench/contrib/notebook/browser/controller/coreActions';
import { localize, localize2 } from 'vs/nls';
import { FoldingRegion } from 'vs/editor/contrib/folding/browser/foldingRanges';
import { ICommandMetadata } from 'vs/platform/commands/common/commands';
import { NotebookViewModel } from 'vs/workbench/contrib/notebook/browser/viewModel/notebookViewModelImpl';

export class FoldingController extends Disposable implements INotebookEditorContribution {
	static id: string = 'workbench.notebook.foldingController';

	private _foldingModel: FoldingModel | null = null;
	private readonly _localStore = this._register(new DisposableStore());

	constructor(private readonly _notebookEditor: INotebookEditor) {
		super();

		this._register(this._notebookEditor.onMouseUp(e => { this.onMouseUp(e); }));

		this._register(this._notebookEditor.onDidChangeModel(() => {
			this._localStore.clear();

			if (!this._notebookEditor.hasModel()) {
				return;
			}

			this._localStore.add(this._notebookEditor.onDidChangeCellState(e => {
				if (e.source.editStateChanged && e.cell.cellKind === CellKind.Markup) {
					this._foldingModel?.recompute();
					// this._updateEditorFoldingRanges();
				}
			}));

			this._foldingModel = new FoldingModel();
			this._localStore.add(this._foldingModel);
			this._foldingModel.attachViewModel(this._notebookEditor.getViewModel());

			this._localStore.add(this._foldingModel.onDidFoldingRegionChanged(() => {
				this._updateEditorFoldingRanges();
			}));
		}));
	}

	saveViewState(): ICellRange[] {
		return this._foldingModel?.getMemento() || [];
	}

	restoreViewState(state: ICellRange[] | undefined) {
		this._foldingModel?.applyMemento(state || []);
		this._updateEditorFoldingRanges();
	}

	setFoldingStateDown(index: number, state: CellFoldingState, levels: number) {
		const doCollapse = state === CellFoldingState.Collapsed;
		const region = this._foldingModel!.getRegionAtLine(index + 1);
		const regions: FoldingRegion[] = [];
		if (region) {
			if (region.isCollapsed !== doCollapse) {
				regions.push(region);
			}
			if (levels > 1) {
				const regionsInside = this._foldingModel!.getRegionsInside(region, (r, level: number) => r.isCollapsed !== doCollapse && level < levels);
				regions.push(...regionsInside);
			}
		}

		regions.forEach(r => this._foldingModel!.setCollapsed(r.regionIndex, state === CellFoldingState.Collapsed));
		this._updateEditorFoldingRanges();
	}

	setFoldingStateUp(index: number, state: CellFoldingState, levels: number) {
		if (!this._foldingModel) {
			return;
		}

		const regions = this._foldingModel.getAllRegionsAtLine(index + 1, (region, level) => region.isCollapsed !== (state === CellFoldingState.Collapsed) && level <= levels);
		regions.forEach(r => this._foldingModel!.setCollapsed(r.regionIndex, state === CellFoldingState.Collapsed));
		this._updateEditorFoldingRanges();
	}

	private _updateEditorFoldingRanges() {
		if (!this._foldingModel) {
			return;
		}

		if (!this._notebookEditor.hasModel()) {
			return;
		}

		const vm = this._notebookEditor.getViewModel() as NotebookViewModel;

		vm.updateFoldingRanges(this._foldingModel.regions);
		const hiddenRanges = vm.getHiddenRanges();
		this._notebookEditor.setHiddenAreas(hiddenRanges);
	}

	onMouseUp(e: INotebookEditorMouseEvent) {
		if (!e.event.target) {
			return;
		}

		if (!this._notebookEditor.hasModel()) {
			return;
		}

		const viewModel = this._notebookEditor.getViewModel() as NotebookViewModel;
		const target = e.event.target as HTMLElement;

		if (target.classList.contains('codicon-notebook-collapsed') || target.classList.contains('codicon-notebook-expanded')) {
			const parent = target.parentElement as HTMLElement;

			if (!parent.classList.contains('notebook-folding-indicator')) {
				return;
			}

			// folding icon

			const cellViewModel = e.target;
			const modelIndex = viewModel.getCellIndex(cellViewModel);
			const state = viewModel.getFoldingState(modelIndex);

			if (state === CellFoldingState.None) {
				return;
			}

			this.setFoldingStateUp(modelIndex, state === CellFoldingState.Collapsed ? CellFoldingState.Expanded : CellFoldingState.Collapsed, 1);
			this._notebookEditor.focusElement(cellViewModel);
		}

		return;
	}
}

registerNotebookContribution(FoldingController.id, FoldingController);


const NOTEBOOK_FOLD_COMMAND_LABEL = localize('fold.cell', "Fold Cell");
const NOTEBOOK_UNFOLD_COMMAND_LABEL = localize2('unfold.cell', "Unfold Cell");

const FOLDING_COMMAND_ARGS: Pick<ICommandMetadata, 'args'> = {
	args: [{
		isOptional: true,
		name: 'index',
		description: 'The cell index',
		schema: {
			'type': 'object',
			'required': ['index', 'direction'],
			'properties': {
				'index': {
					'type': 'number'
				},
				'direction': {
					'type': 'string',
					'enum': ['up', 'down'],
					'default': 'down'
				},
				'levels': {
					'type': 'number',
					'default': 1
				},
			}
		}
	}]
};

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'notebook.fold',
			title: localize2('fold.cell', "Fold Cell"),
			category: NOTEBOOK_ACTIONS_CATEGORY,
			keybinding: {
				when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, ContextKeyExpr.not(InputFocusedContextKey)),
				primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.BracketLeft,
				mac: {
					primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.BracketLeft,
					secondary: [KeyCode.LeftArrow],
				},
				secondary: [KeyCode.LeftArrow],
				weight: KeybindingWeight.WorkbenchContrib
			},
			metadata: {
				description: NOTEBOOK_FOLD_COMMAND_LABEL,
				args: FOLDING_COMMAND_ARGS.args
			},
			precondition: NOTEBOOK_IS_ACTIVE_EDITOR,
			f1: true
		});
	}

	async run(accessor: ServicesAccessor, args?: { index: number; levels: number; direction: 'up' | 'down' }): Promise<void> {
		const editorService = accessor.get(IEditorService);

		const editor = getNotebookEditorFromEditorPane(editorService.activeEditorPane);
		if (!editor) {
			return;
		}

		if (!editor.hasModel()) {
			return;
		}

		const levels = args && args.levels || 1;
		const direction = args && args.direction === 'up' ? 'up' : 'down';
		let index: number | undefined = undefined;

		if (args) {
			index = args.index;
		} else {
			const activeCell = editor.getActiveCell();
			if (!activeCell) {
				return;
			}
			index = editor.getCellIndex(activeCell);
		}

		const controller = editor.getContribution<FoldingController>(FoldingController.id);
		if (index !== undefined) {
			const targetCell = (index < 0 || index >= editor.getLength()) ? undefined : editor.cellAt(index);
			if (targetCell?.cellKind === CellKind.Code && direction === 'down') {
				return;
			}

			if (direction === 'up') {
				controller.setFoldingStateUp(index, CellFoldingState.Collapsed, levels);
			} else {
				controller.setFoldingStateDown(index, CellFoldingState.Collapsed, levels);
			}

			const viewIndex = editor.getViewModel().getNearestVisibleCellIndexUpwards(index);
			editor.focusElement(editor.cellAt(viewIndex));
		}
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'notebook.unfold',
			title: NOTEBOOK_UNFOLD_COMMAND_LABEL,
			category: NOTEBOOK_ACTIONS_CATEGORY,
			keybinding: {
				when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, ContextKeyExpr.not(InputFocusedContextKey)),
				primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.BracketRight,
				mac: {
					primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.BracketRight,
					secondary: [KeyCode.RightArrow],
				},
				secondary: [KeyCode.RightArrow],
				weight: KeybindingWeight.WorkbenchContrib
			},
			metadata: {
				description: NOTEBOOK_UNFOLD_COMMAND_LABEL,
				args: FOLDING_COMMAND_ARGS.args
			},
			precondition: NOTEBOOK_IS_ACTIVE_EDITOR,
			f1: true
		});
	}

	async run(accessor: ServicesAccessor, args?: { index: number; levels: number; direction: 'up' | 'down' }): Promise<void> {
		const editorService = accessor.get(IEditorService);

		const editor = getNotebookEditorFromEditorPane(editorService.activeEditorPane);
		if (!editor) {
			return;
		}

		const levels = args && args.levels || 1;
		const direction = args && args.direction === 'up' ? 'up' : 'down';
		let index: number | undefined = undefined;

		if (args) {
			index = args.index;
		} else {
			const activeCell = editor.getActiveCell();
			if (!activeCell) {
				return;
			}
			index = editor.getCellIndex(activeCell);
		}

		const controller = editor.getContribution<FoldingController>(FoldingController.id);
		if (index !== undefined) {
			if (direction === 'up') {
				controller.setFoldingStateUp(index, CellFoldingState.Expanded, levels);
			} else {
				controller.setFoldingStateDown(index, CellFoldingState.Expanded, levels);
			}
		}
	}
});
