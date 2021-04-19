/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { Registry } from 'vs/platform/registry/common/platform';
import { Action2, registerAction2 } from 'vs/platform/actions/common/actions';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { IQuickInputService, IQuickPickItem, QuickPickInput } from 'vs/platform/quickinput/common/quickInput';
import { NOTEBOOK_ACTIONS_CATEGORY } from 'vs/workbench/contrib/notebook/browser/contrib/coreActions';
import { getNotebookEditorFromEditorPane, INotebookEditor, NOTEBOOK_IS_ACTIVE_EDITOR } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { CancellationTokenSource } from 'vs/base/common/cancellation';
import { INotebookKernel } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { Extensions as WorkbenchExtensions, IWorkbenchContributionsRegistry, IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { Disposable, DisposableStore, MutableDisposable } from 'vs/base/common/lifecycle';
import { IStatusbarEntry, IStatusbarEntryAccessor, IStatusbarService, StatusbarAlignment } from 'vs/workbench/services/statusbar/common/statusbar';
import { NotebookKernelProviderAssociation, NotebookKernelProviderAssociations, notebookKernelProviderAssociationsSettingId } from 'vs/workbench/contrib/notebook/browser/notebookKernelAssociation';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { configureKernelIcon, selectKernelIcon } from 'vs/workbench/contrib/notebook/browser/notebookIcons';
import { ThemeIcon } from 'vs/platform/theme/common/themeService';
import { NotebookViewModel } from 'vs/workbench/contrib/notebook/browser/viewModel/notebookViewModel';

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'notebook.selectKernel',
			category: NOTEBOOK_ACTIONS_CATEGORY,
			title: { value: nls.localize('notebookActions.selectKernel', "Select Notebook Kernel"), original: 'Select Notebook Kernel' },
			precondition: NOTEBOOK_IS_ACTIVE_EDITOR,
			icon: selectKernelIcon,
			f1: true,
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
								}
							}
						}
					}
				]
			},

		});
	}

	async run(accessor: ServicesAccessor, context?: { id: string, extension: string }): Promise<void> {
		const editorService = accessor.get<IEditorService>(IEditorService);
		const quickInputService = accessor.get<IQuickInputService>(IQuickInputService);
		const configurationService = accessor.get<IConfigurationService>(IConfigurationService);

		const editor = getNotebookEditorFromEditorPane(editorService.activeEditorPane);
		if (!editor) {
			return;
		}

		if (!editor.hasModel()) {
			return;
		}

		const activeKernel = editor.activeKernel;

		const picker = quickInputService.createQuickPick<(IQuickPickItem & { run(): void; kernelProviderId?: string })>();
		picker.placeholder = nls.localize('notebook.runCell.selectKernel', "Select a notebook kernel to run this notebook");
		picker.matchOnDetail = true;


		if (context && context.id) {
		} else {
			picker.show();
		}

		picker.busy = true;

		const tokenSource = new CancellationTokenSource();
		const availableKernels = await editor.beginComputeContributedKernels();

		const selectedKernel = availableKernels.length ? availableKernels.find(
			kernel => kernel.id && context?.id && kernel.id === context?.id && kernel.extension.value === context?.extension
		) : undefined;

		if (selectedKernel) {
			editor.activeKernel = selectedKernel;
			return selectedKernel.resolve(editor.viewModel.uri, editor.getId(), tokenSource.token);
		} else {
			picker.show();
		}

		const picks: QuickPickInput<IQuickPickItem & { run(): void; kernelProviderId?: string; }>[] = [...availableKernels].map((a) => {
			return {
				id: a.friendlyId,
				label: a.label,
				picked: a.friendlyId === activeKernel?.friendlyId,
				description:
					a.description
						? a.description
						: a.extension.value + (a.friendlyId === activeKernel?.friendlyId
							? nls.localize('currentActiveKernel', " (Currently Active)")
							: ''),
				detail: a.detail,
				kernelProviderId: a.extension.value,
				run: async () => {
					editor.activeKernel = a;
					a.resolve(editor.viewModel.uri, editor.getId(), tokenSource.token);
				},
				buttons: [{
					iconClass: ThemeIcon.asClassName(configureKernelIcon),
					tooltip: nls.localize('notebook.promptKernel.setDefaultTooltip', "Set as default kernel provider for '{0}'", editor.viewModel.viewType)
				}]
			};
		});

		picker.items = picks;
		picker.busy = false;
		picker.activeItems = picks.filter(pick => (pick as IQuickPickItem).picked) as (IQuickPickItem & { run(): void; kernelProviderId?: string; })[];

		const pickedItem = await new Promise<(IQuickPickItem & { run(): void; kernelProviderId?: string; }) | undefined>(resolve => {
			picker.onDidAccept(() => {
				resolve(picker.selectedItems.length === 1 ? picker.selectedItems[0] : undefined);
				picker.dispose();
			});

			picker.onDidTriggerItemButton(e => {
				const pick = e.item;
				const id = pick.id;
				resolve(pick); // open the view
				picker.dispose();

				// And persist the setting
				if (pick && id && pick.kernelProviderId) {
					const newAssociation: NotebookKernelProviderAssociation = { viewType: editor.viewModel.viewType, kernelProvider: pick.kernelProviderId };
					const currentAssociations = [...configurationService.getValue<NotebookKernelProviderAssociations>(notebookKernelProviderAssociationsSettingId)];

					// First try updating existing association
					for (let i = 0; i < currentAssociations.length; ++i) {
						const existing = currentAssociations[i];
						if (existing.viewType === newAssociation.viewType) {
							currentAssociations.splice(i, 1, newAssociation);
							configurationService.updateValue(notebookKernelProviderAssociationsSettingId, currentAssociations);
							return;
						}
					}

					// Otherwise, create a new one
					currentAssociations.unshift(newAssociation);
					configurationService.updateValue(notebookKernelProviderAssociationsSettingId, currentAssociations);
				}
			});

		});

		tokenSource.dispose();
		return pickedItem?.run();
	}
});

export class KernelStatus extends Disposable implements IWorkbenchContribution {

	private readonly _editorDisposable = this._register(new DisposableStore());
	private readonly _kernelInfoElement = this._register(new MutableDisposable<IStatusbarEntryAccessor>());

	constructor(
		@IEditorService private readonly _editorService: IEditorService,
		@IStatusbarService private readonly _statusbarService: IStatusbarService,
	) {
		super();
		this._register(this._editorService.onDidActiveEditorChange(() => this._updateStatusbar()));
	}

	private _updateStatusbar() {
		this._editorDisposable.clear();
		const activeEditor = getNotebookEditorFromEditorPane(this._editorService.activeEditorPane);
		if (activeEditor) {
			this._editorDisposable.add(activeEditor.onDidChangeKernel(() => {
				this._showKernelStatus(activeEditor.activeKernel, activeEditor.availableKernelCount);
			}));
			this._editorDisposable.add(activeEditor.onDidChangeAvailableKernels(() => {
				this._showKernelStatus(activeEditor.activeKernel, activeEditor.availableKernelCount);
			}));
			this._showKernelStatus(activeEditor.activeKernel, activeEditor.availableKernelCount);
		} else {
			this._kernelInfoElement.clear();
		}
	}

	private static readonly _chooseKernelEntry: IStatusbarEntry = {
		text: nls.localize('choose', "Choose Kernel"),
		ariaLabel: nls.localize('choose', "Choose Kernel"),
		tooltip: nls.localize('tooltop', "Choose kernel for current notebook"),
		command: 'notebook.selectKernel'
	};

	private _showKernelStatus(kernel: INotebookKernel | undefined, availableKernelCount: number) {

		if (availableKernelCount === 0) {
			this._kernelInfoElement.clear();
			return;
		}

		let entry: IStatusbarEntry;

		if (kernel) {
			entry = {
				text: `$(notebook-kernel-select) ${kernel.label}`,
				ariaLabel: kernel.label,
				tooltip: kernel.description ?? kernel.detail ?? kernel.label,
				command: availableKernelCount > 1 ? 'notebook.selectKernel' : undefined,
			};
		} else {
			entry = KernelStatus._chooseKernelEntry;
		}

		this._kernelInfoElement.value = this._statusbarService.addEntry(
			entry,
			'notebook.selectKernel',
			nls.localize('notebook.info', "Notebook Kernel Info"),
			StatusbarAlignment.RIGHT,
			100
		);
	}
}

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(KernelStatus, LifecyclePhase.Ready);

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
			this._show(activeEditor);
		} else {
			this._accessor.clear();
		}
	}

	private _show(editor: INotebookEditor) {
		const vm = editor.viewModel;
		if (!vm) {
			this._accessor.clear();
			return;
		}

		const newText = this._getSelectionsText(editor, vm);
		if (!newText) {
			this._accessor.clear();
			return;
		}

		const entry = { text: newText, ariaLabel: newText };
		if (!this._accessor.value) {
			this._accessor.value = this._statusbarService.addEntry(
				entry,
				'notebook.activeCellStatus',
				nls.localize('notebook.activeCellStatusName', "Notebook Editor Selections"),
				StatusbarAlignment.RIGHT,
				100);
		} else {
			this._accessor.value.update(entry);
		}
	}

	private _getSelectionsText(editor: INotebookEditor, vm: NotebookViewModel): string | undefined {
		const activeCell = editor.getActiveCell();
		if (!activeCell) {
			return undefined;
		}

		const idxFocused = vm.getCellIndex(activeCell) + 1;
		const numSelected = vm.getSelections().reduce((prev, range) => prev + (range.end - range.start), 0);
		return numSelected > 1 ?
			nls.localize('notebook.multiActiveCellIndicator', "Cell {0} ({1} selected)", idxFocused, numSelected) :
			nls.localize('notebook.singleActiveCellIndicator', "Cell {0}", idxFocused);
	}
}

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(ActiveCellStatus, LifecyclePhase.Ready);
