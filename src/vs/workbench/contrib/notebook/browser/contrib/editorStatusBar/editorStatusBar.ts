/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { groupBy } from 'vs/base/common/arrays';
import { Disposable, DisposableStore, IDisposable, MutableDisposable } from 'vs/base/common/lifecycle';
import { Schemas } from 'vs/base/common/network';
import { compareIgnoreCase, uppercaseFirstLetter } from 'vs/base/common/strings';
import { HoverProviderRegistry } from 'vs/editor/common/modes';
import * as nls from 'vs/nls';
import { Action2, MenuId, registerAction2 } from 'vs/platform/actions/common/actions';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { ExtensionIdentifier } from 'vs/platform/extensions/common/extensions';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { ILabelService } from 'vs/platform/label/common/label';
import { ILogService } from 'vs/platform/log/common/log';
import { IQuickInputButton, IQuickInputService, IQuickPickItem, QuickPickInput } from 'vs/platform/quickinput/common/quickInput';
import { Registry } from 'vs/platform/registry/common/platform';
import { ThemeIcon } from 'vs/platform/theme/common/themeService';
import type { SelectKernelReturnArgs } from 'vs/workbench/api/common/extHostNotebookKernels';
import { Extensions as WorkbenchExtensions, IWorkbenchContribution, IWorkbenchContributionsRegistry } from 'vs/workbench/common/contributions';
import { ViewContainerLocation } from 'vs/workbench/common/views';
import { IExtensionsViewPaneContainer, VIEWLET_ID as EXTENSION_VIEWLET_ID } from 'vs/workbench/contrib/extensions/common/extensions';
import { CENTER_ACTIVE_CELL } from 'vs/workbench/contrib/notebook/browser/contrib/navigation/arrow';
import { NOTEBOOK_ACTIONS_CATEGORY, SELECT_KERNEL_ID } from 'vs/workbench/contrib/notebook/browser/controller/coreActions';
import { getNotebookEditorFromEditorPane, INotebookEditor, KERNEL_EXTENSIONS, NOTEBOOK_MISSING_KERNEL_EXTENSION, NOTEBOOK_IS_ACTIVE_EDITOR, NOTEBOOK_KERNEL_COUNT } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { NotebookEditorWidget } from 'vs/workbench/contrib/notebook/browser/notebookEditorWidget';
import { configureKernelIcon, selectKernelIcon } from 'vs/workbench/contrib/notebook/browser/notebookIcons';
import { NotebookTextModel } from 'vs/workbench/contrib/notebook/common/model/notebookTextModel';
import { NotebookCellsChangeType } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { INotebookKernel, INotebookKernelService } from 'vs/workbench/contrib/notebook/common/notebookKernelService';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { IPaneCompositePartService } from 'vs/workbench/services/panecomposite/browser/panecomposite';
import { IStatusbarEntry, IStatusbarEntryAccessor, IStatusbarService, StatusbarAlignment } from 'vs/workbench/services/statusbar/browser/statusbar';

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: '_notebook.selectKernel',
			category: NOTEBOOK_ACTIONS_CATEGORY,
			title: { value: nls.localize('notebookActions.selectKernel', "Select Notebook Kernel"), original: 'Select Notebook Kernel' },
			// precondition: NOTEBOOK_IS_ACTIVE_EDITOR,
			icon: selectKernelIcon,
			f1: true,
			menu: [{
				id: MenuId.EditorTitle,
				when: ContextKeyExpr.and(
					NOTEBOOK_IS_ACTIVE_EDITOR,
					ContextKeyExpr.or(NOTEBOOK_KERNEL_COUNT.notEqualsTo(0), NOTEBOOK_MISSING_KERNEL_EXTENSION),
					ContextKeyExpr.notEquals('config.notebook.globalToolbar', true)
				),
				group: 'navigation',
				order: -10
			}, {
				id: MenuId.NotebookToolbar,
				when: ContextKeyExpr.and(
					ContextKeyExpr.or(NOTEBOOK_KERNEL_COUNT.notEqualsTo(0), NOTEBOOK_MISSING_KERNEL_EXTENSION),
					ContextKeyExpr.equals('config.notebook.globalToolbar', true)
				),
				group: 'status',
				order: -10
			}, {
				id: MenuId.InteractiveToolbar,
				when: NOTEBOOK_KERNEL_COUNT.notEqualsTo(0),
				group: 'status',
				order: -10
			}],
			description: {
				description: nls.localize('notebookActions.selectKernel.args', "Notebook Kernel Args"),
				args: [
					{
						name: 'kernelInfo',
						description: 'The kernel info',
						schema: {
							'type': 'object',
							'required': ['id', 'extension'],
							'properties': {
								'id': {
									'type': 'string'
								},
								'extension': {
									'type': 'string'
								},
								'notebookEditorId': {
									'type': 'string'
								}
							}
						}
					}
				]
			},
		});
	}

	async run(accessor: ServicesAccessor, context?: SelectKernelReturnArgs | { ui?: boolean, notebookEditor?: NotebookEditorWidget }): Promise<boolean> {
		const notebookKernelService = accessor.get(INotebookKernelService);
		const editorService = accessor.get(IEditorService);
		const quickInputService = accessor.get(IQuickInputService);
		const labelService = accessor.get(ILabelService);
		const logService = accessor.get(ILogService);
		const paneCompositeService = accessor.get(IPaneCompositePartService);

		let editor: INotebookEditor | undefined;
		if (context !== undefined && 'notebookEditorId' in context) {
			const editorId = context.notebookEditorId;
			const matchingEditor = editorService.visibleEditorPanes.find((editorPane) => {
				const notebookEditor = getNotebookEditorFromEditorPane(editorPane);
				return notebookEditor?.getId() === editorId;
			});
			editor = getNotebookEditorFromEditorPane(matchingEditor);
		} else if (context !== undefined && 'notebookEditor' in context) {
			editor = context?.notebookEditor;
		} else {
			editor = getNotebookEditorFromEditorPane(editorService.activeEditorPane);
		}

		if (!editor || !editor.hasModel()) {
			return false;
		}
		let controllerId = context && 'id' in context ? context.id : undefined;
		let extensionId = context && 'extension' in context ? context.extension : undefined;

		if (controllerId && (typeof controllerId !== 'string' || typeof extensionId !== 'string')) {
			// validate context: id & extension MUST be strings
			controllerId = undefined;
			extensionId = undefined;
		}

		const notebook = editor.textModel;
		const { selected, all, suggestions } = notebookKernelService.getMatchingKernel(notebook);

		if (selected && controllerId && selected.id === controllerId && ExtensionIdentifier.equals(selected.extension, extensionId)) {
			// current kernel is wanted kernel -> done
			return true;
		}

		let newKernel: INotebookKernel | undefined;
		if (controllerId) {
			const wantedId = `${extensionId}/${controllerId}`;
			for (let candidate of all) {
				if (candidate.id === wantedId) {
					newKernel = candidate;
					break;
				}
			}
			if (!newKernel) {
				logService.warn(`wanted kernel DOES NOT EXIST, wanted: ${wantedId}, all: ${all.map(k => k.id)}`);
				return false;
			}
		}

		if (!newKernel) {
			type KernelPick = IQuickPickItem & { kernel: INotebookKernel; };
			const configButton: IQuickInputButton = {
				iconClass: ThemeIcon.asClassName(configureKernelIcon),
				tooltip: nls.localize('notebook.promptKernel.setDefaultTooltip', "Set as default for '{0}' notebooks", editor.textModel.viewType)
			};
			function toQuickPick(kernel: INotebookKernel) {
				const res = <KernelPick>{
					kernel,
					picked: kernel.id === selected?.id,
					label: kernel.label,
					description: kernel.description,
					detail: kernel.detail,
					buttons: [configButton]
				};
				if (kernel.id === selected?.id) {
					if (!res.description) {
						res.description = nls.localize('current1', "Currently Selected");
					} else {
						res.description = nls.localize('current2', "{0} - Currently Selected", res.description);
					}
				}
				return res;
			}
			const quickPickItems: QuickPickInput<IQuickPickItem | KernelPick>[] = [];
			if (!all.length) {
				quickPickItems.push({
					id: 'install',
					label: nls.localize('installKernels', "Install kernels from the marketplace"),
				});
			} else {
				// Always display suggested kernels on the top.
				if (suggestions.length) {
					quickPickItems.push({
						type: 'separator',
						label: nls.localize('suggestedKernels', "Suggested")
					});
					quickPickItems.push(...suggestions.map(toQuickPick));
				}

				// Next display all of the kernels grouped by categories or extensions.
				// If we don't have a kind, always display those at the bottom.
				const picks = all.filter(item => !suggestions.includes(item)).map(toQuickPick);
				const kernelsPerCategory = groupBy(picks, (a, b) => compareIgnoreCase(a.kernel.kind || 'z', b.kernel.kind || 'z'));
				kernelsPerCategory.forEach(items => {
					quickPickItems.push({
						type: 'separator',
						label: items[0].kernel.kind || nls.localize('otherKernelKinds', "Other")
					});
					quickPickItems.push(...items);
				});
			}

			const pick = await quickInputService.pick(quickPickItems, {
				placeHolder: selected
					? nls.localize('prompt.placeholder.change', "Change kernel for '{0}'", labelService.getUriLabel(notebook.uri, { relative: true }))
					: nls.localize('prompt.placeholder.select', "Select kernel for '{0}'", labelService.getUriLabel(notebook.uri, { relative: true })),
				onDidTriggerItemButton: (context) => {
					if ('kernel' in context.item) {
						notebookKernelService.selectKernelForNotebookType(context.item.kernel, notebook.viewType);
					}
				}
			});

			if (pick) {
				if (pick.id === 'install') {
					await this._showKernelExtension(paneCompositeService, notebook.viewType);
				} else if ('kernel' in pick) {
					newKernel = pick.kernel;
				}
			}
		}

		if (newKernel) {
			notebookKernelService.selectKernelForNotebook(newKernel, notebook);
			return true;
		}
		return false;
	}

	private async _showKernelExtension(paneCompositePartService: IPaneCompositePartService, viewType: string) {
		const viewlet = await paneCompositePartService.openPaneComposite(EXTENSION_VIEWLET_ID, ViewContainerLocation.Sidebar, true);
		const view = viewlet?.getViewPaneContainer() as IExtensionsViewPaneContainer | undefined;

		const extId = KERNEL_EXTENSIONS.get(viewType);
		if (extId) {
			view?.search(`@id:${extId}`);
		} else {
			const pascalCased = viewType.split(/[^a-z0-9]/ig).map(uppercaseFirstLetter).join('');
			view?.search(`@tag:notebookKernel${pascalCased}`);
		}
	}
});


class ImplictKernelSelector implements IDisposable {

	readonly dispose: () => void;

	constructor(
		notebook: NotebookTextModel,
		suggested: INotebookKernel,
		@INotebookKernelService notebookKernelService: INotebookKernelService,
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
			for (let event of e.rawEvents) {
				switch (event.kind) {
					case NotebookCellsChangeType.ChangeCellContent:
					case NotebookCellsChangeType.ModelChange:
					case NotebookCellsChangeType.Move:
					case NotebookCellsChangeType.ChangeLanguage:
						logService.trace('IMPLICIT kernel selection because of change event', event.kind);
						selectKernel();
						break;
				}
			}
		}));


		// IMPLICITLY select a suggested kernel when users start to hover. This should
		// be a strong enough hint that the user wants to interact with the notebook. Maybe
		// add more triggers like goto-providers or completion-providers
		disposables.add(HoverProviderRegistry.register({ scheme: Schemas.vscodeNotebookCell, pattern: notebook.uri.path }, {
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
		@ILogService private readonly _logService: ILogService,
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
			if (activeEditor.notebookOptions.getLayoutConfiguration().globalToolbar) {
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

		let { selected, suggestions, all } = this._notebookKernelService.getMatchingKernel(notebook);
		const suggested = suggestions[0];
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
				this._kernelInfoElement.add(new ImplictKernelSelector(notebook, kernel, this._notebookKernelService, this._logService));
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
				'_notebook.selectKernel',
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
					backgroundColor: { id: 'statusBarItem.prominentBackground' }
				},
				'_notebook.selectKernel',
				StatusbarAlignment.RIGHT,
				10
			));
		}
	}
}

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(KernelStatus, LifecyclePhase.Restored);

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

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(ActiveCellStatus, LifecyclePhase.Restored);
