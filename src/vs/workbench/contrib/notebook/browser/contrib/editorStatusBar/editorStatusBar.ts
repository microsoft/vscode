/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { Disposable, DisposableStore, IDisposable, MutableDisposable } from 'vs/base/common/lifecycle';
import { Schemas } from 'vs/base/common/network';
import { ILanguageFeaturesService } from 'vs/editor/common/services/languageFeatures';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ILogService } from 'vs/platform/log/common/log';
import { IWorkbenchContribution, WorkbenchPhase, registerWorkbenchContribution2 } from 'vs/workbench/common/contributions';
import { CENTER_ACTIVE_CELL } from 'vs/workbench/contrib/notebook/browser/contrib/navigation/arrow';
import { SELECT_KERNEL_ID } from 'vs/workbench/contrib/notebook/browser/controller/coreActions';
import { SELECT_NOTEBOOK_INDENTATION_ID } from 'vs/workbench/contrib/notebook/browser/controller/editActions';
import { INotebookEditor, getNotebookEditorFromEditorPane } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { NotebookTextModel } from 'vs/workbench/contrib/notebook/common/model/notebookTextModel';
import { NotebookCellsChangeType } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { INotebookKernel, INotebookKernelService } from 'vs/workbench/contrib/notebook/common/notebookKernelService';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IStatusbarEntry, IStatusbarEntryAccessor, IStatusbarService, StatusbarAlignment } from 'vs/workbench/services/statusbar/browser/statusbar';
import { IEditorGroupsService } from 'vs/workbench/services/editor/common/editorGroupsService';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';

class ImplictKernelSelector implements IDisposable {

	readonly dispose: () => void;

	constructor(
		notebook: NotebookTextModel,
		suggested: INotebookKernel,
		@INotebookKernelService notebookKernelService: INotebookKernelService,
		@ILanguageFeaturesService languageFeaturesService: ILanguageFeaturesService,
		@ILogService logService: ILogService
	) {
		const disposables = new DisposableStore();
		this.dispose = disposables.dispose.bind(disposables);

		const selectKernel = () => {
			disposables.clear();
			notebookKernelService.selectKernelForNotebook(suggested, notebook);
		};

		// IMPLICITLY select a suggested kernel when the notebook has been changed
		// e.g change cell source, move cells, etc
		disposables.add(notebook.onDidChangeContent(e => {
			for (const event of e.rawEvents) {
				switch (event.kind) {
					case NotebookCellsChangeType.ChangeCellContent:
					case NotebookCellsChangeType.ModelChange:
					case NotebookCellsChangeType.Move:
					case NotebookCellsChangeType.ChangeCellLanguage:
						logService.trace('IMPLICIT kernel selection because of change event', event.kind);
						selectKernel();
						break;
				}
			}
		}));


		// IMPLICITLY select a suggested kernel when users start to hover. This should
		// be a strong enough hint that the user wants to interact with the notebook. Maybe
		// add more triggers like goto-providers or completion-providers
		disposables.add(languageFeaturesService.hoverProvider.register({ scheme: Schemas.vscodeNotebookCell, pattern: notebook.uri.path }, {
			provideHover() {
				logService.trace('IMPLICIT kernel selection because of hover');
				selectKernel();
				return undefined;
			}
		}));
	}
}

export class KernelStatus extends Disposable implements IWorkbenchContribution {

	private readonly _editorDisposables = this._register(new DisposableStore());
	private readonly _kernelInfoElement = this._register(new DisposableStore());

	constructor(
		@IEditorService private readonly _editorService: IEditorService,
		@IStatusbarService private readonly _statusbarService: IStatusbarService,
		@INotebookKernelService private readonly _notebookKernelService: INotebookKernelService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) {
		super();
		this._register(this._editorService.onDidActiveEditorChange(() => this._updateStatusbar()));
	}

	private _updateStatusbar() {
		this._editorDisposables.clear();

		const activeEditor = getNotebookEditorFromEditorPane(this._editorService.activeEditorPane);
		if (!activeEditor) {
			// not a notebook -> clean-up, done
			this._kernelInfoElement.clear();
			return;
		}

		const updateStatus = () => {
			if (activeEditor.notebookOptions.getDisplayOptions().globalToolbar) {
				// kernel info rendered in the notebook toolbar already
				this._kernelInfoElement.clear();
				return;
			}

			const notebook = activeEditor.textModel;
			if (notebook) {
				this._showKernelStatus(notebook);
			} else {
				this._kernelInfoElement.clear();
			}
		};

		this._editorDisposables.add(this._notebookKernelService.onDidAddKernel(updateStatus));
		this._editorDisposables.add(this._notebookKernelService.onDidChangeSelectedNotebooks(updateStatus));
		this._editorDisposables.add(this._notebookKernelService.onDidChangeNotebookAffinity(updateStatus));
		this._editorDisposables.add(activeEditor.onDidChangeModel(updateStatus));
		this._editorDisposables.add(activeEditor.notebookOptions.onDidChangeOptions(updateStatus));
		updateStatus();
	}

	private _showKernelStatus(notebook: NotebookTextModel) {

		this._kernelInfoElement.clear();

		const { selected, suggestions, all } = this._notebookKernelService.getMatchingKernel(notebook);
		const suggested = (suggestions.length === 1 ? suggestions[0] : undefined)
			?? (all.length === 1) ? all[0] : undefined;
		let isSuggested = false;

		if (all.length === 0) {
			// no kernel -> no status
			return;

		} else if (selected || suggested) {
			// selected or single kernel
			let kernel = selected;

			if (!kernel) {
				// proceed with suggested kernel - show UI and install handler that selects the kernel
				// when non trivial interactions with the notebook happen.
				kernel = suggested!;
				isSuggested = true;
				this._kernelInfoElement.add(this._instantiationService.createInstance(ImplictKernelSelector, notebook, kernel));
			}
			const tooltip = kernel.description ?? kernel.detail ?? kernel.label;
			this._kernelInfoElement.add(this._statusbarService.addEntry(
				{
					name: nls.localize('notebook.info', "Notebook Kernel Info"),
					text: `$(notebook-kernel-select) ${kernel.label}`,
					ariaLabel: kernel.label,
					tooltip: isSuggested ? nls.localize('tooltop', "{0} (suggestion)", tooltip) : tooltip,
					command: SELECT_KERNEL_ID,
				},
				SELECT_KERNEL_ID,
				StatusbarAlignment.RIGHT,
				10
			));

			this._kernelInfoElement.add(kernel.onDidChange(() => this._showKernelStatus(notebook)));


		} else {
			// multiple kernels -> show selection hint
			this._kernelInfoElement.add(this._statusbarService.addEntry(
				{
					name: nls.localize('notebook.select', "Notebook Kernel Selection"),
					text: nls.localize('kernel.select.label', "Select Kernel"),
					ariaLabel: nls.localize('kernel.select.label', "Select Kernel"),
					command: SELECT_KERNEL_ID,
					kind: 'prominent'
				},
				SELECT_KERNEL_ID,
				StatusbarAlignment.RIGHT,
				10
			));
		}
	}
}

export class ActiveCellStatus extends Disposable implements IWorkbenchContribution {

	private readonly _itemDisposables = this._register(new DisposableStore());
	private readonly _accessor = this._register(new MutableDisposable<IStatusbarEntryAccessor>());

	constructor(
		@IEditorService private readonly _editorService: IEditorService,
		@IStatusbarService private readonly _statusbarService: IStatusbarService,
	) {
		super();
		this._register(this._editorService.onDidActiveEditorChange(() => this._update()));
	}

	private _update() {
		this._itemDisposables.clear();
		const activeEditor = getNotebookEditorFromEditorPane(this._editorService.activeEditorPane);
		if (activeEditor) {
			this._itemDisposables.add(activeEditor.onDidChangeSelection(() => this._show(activeEditor)));
			this._itemDisposables.add(activeEditor.onDidChangeActiveCell(() => this._show(activeEditor)));
			this._show(activeEditor);
		} else {
			this._accessor.clear();
		}
	}

	private _show(editor: INotebookEditor) {
		if (!editor.hasModel()) {
			this._accessor.clear();
			return;
		}

		const newText = this._getSelectionsText(editor);
		if (!newText) {
			this._accessor.clear();
			return;
		}

		const entry: IStatusbarEntry = {
			name: nls.localize('notebook.activeCellStatusName', "Notebook Editor Selections"),
			text: newText,
			ariaLabel: newText,
			command: CENTER_ACTIVE_CELL
		};
		if (!this._accessor.value) {
			this._accessor.value = this._statusbarService.addEntry(
				entry,
				'notebook.activeCellStatus',
				StatusbarAlignment.RIGHT,
				100
			);
		} else {
			this._accessor.value.update(entry);
		}
	}

	private _getSelectionsText(editor: INotebookEditor): string | undefined {
		if (!editor.hasModel()) {
			return undefined;
		}

		const activeCell = editor.getActiveCell();
		if (!activeCell) {
			return undefined;
		}

		const idxFocused = editor.getCellIndex(activeCell) + 1;
		const numSelected = editor.getSelections().reduce((prev, range) => prev + (range.end - range.start), 0);
		const totalCells = editor.getLength();
		return numSelected > 1 ?
			nls.localize('notebook.multiActiveCellIndicator', "Cell {0} ({1} selected)", idxFocused, numSelected) :
			nls.localize('notebook.singleActiveCellIndicator', "Cell {0} of {1}", idxFocused, totalCells);
	}
}

export class NotebookIndentationStatus extends Disposable {

	private readonly _itemDisposables = this._register(new DisposableStore());
	private readonly _accessor = this._register(new MutableDisposable<IStatusbarEntryAccessor>());

	static readonly ID = 'selectNotebookIndentation';

	constructor(
		@IEditorService private readonly _editorService: IEditorService,
		@IStatusbarService private readonly _statusbarService: IStatusbarService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
	) {
		super();
		this._register(this._editorService.onDidActiveEditorChange(() => this._update()));
		this._register(this._configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('editor') || e.affectsConfiguration('notebook')) {
				this._update();
			}
		}));
	}

	private _update() {
		this._itemDisposables.clear();
		const activeEditor = getNotebookEditorFromEditorPane(this._editorService.activeEditorPane);
		if (activeEditor) {
			this._show(activeEditor);
			this._itemDisposables.add(activeEditor.onDidChangeSelection(() => {
				this._accessor.clear();
				this._show(activeEditor);
			}));
		} else {
			this._accessor.clear();
		}
	}

	private _show(editor: INotebookEditor) {
		if (!editor.hasModel()) {
			this._accessor.clear();
			return;
		}

		const cellOptions = editor.getActiveCell()?.textModel?.getOptions();
		if (!cellOptions) {
			this._accessor.clear();
			return;
		}

		const cellEditorOverridesRaw = editor.notebookOptions.getDisplayOptions().editorOptionsCustomizations;
		const indentSize = cellEditorOverridesRaw?.['editor.indentSize'] ?? cellOptions?.indentSize;
		const insertSpaces = cellEditorOverridesRaw?.['editor.insertSpaces'] ?? cellOptions?.insertSpaces;
		const tabSize = cellEditorOverridesRaw?.['editor.tabSize'] ?? cellOptions?.tabSize;

		const width = typeof indentSize === 'number' ? indentSize : tabSize;

		const message = insertSpaces ? `Spaces: ${width}` : `Tab Size: ${width}`;
		const newText = message;
		if (!newText) {
			this._accessor.clear();
			return;
		}

		const entry: IStatusbarEntry = {
			name: nls.localize('notebook.indentation', "Notebook Indentation"),
			text: newText,
			ariaLabel: newText,
			tooltip: nls.localize('selectNotebookIndentation', "Select Indentation"),
			command: SELECT_NOTEBOOK_INDENTATION_ID
		};

		if (!this._accessor.value) {
			this._accessor.value = this._statusbarService.addEntry(
				entry,
				'notebook.status.indentation',
				StatusbarAlignment.RIGHT,
				100.4
			);
		} else {
			this._accessor.value.update(entry);
		}
	}
}

export class NotebookEditorStatusContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'notebook.contrib.editorStatus';

	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
		@IEditorGroupsService editorGroupService: IEditorGroupsService,
		@IEditorService editorService: IEditorService
	) {
		super();

		// Main Editor Status
		const mainInstantiationService = instantiationService.createChild(new ServiceCollection(
			[IEditorService, editorService.createScoped('main', this._store)]
		));
		this._register(mainInstantiationService.createInstance(KernelStatus));
		this._register(mainInstantiationService.createInstance(ActiveCellStatus));
		this._register(mainInstantiationService.createInstance(NotebookIndentationStatus));

		// Auxiliary Editor Status
		this._register(editorGroupService.onDidCreateAuxiliaryEditorPart(({ part, instantiationService, disposables }) => {
			disposables.add(instantiationService.createInstance(KernelStatus));
			disposables.add(instantiationService.createInstance(ActiveCellStatus));
			disposables.add(instantiationService.createInstance(NotebookIndentationStatus));
		}));
	}
}


registerWorkbenchContribution2(NotebookEditorStatusContribution.ID, NotebookEditorStatusContribution, WorkbenchPhase.AfterRestored);
