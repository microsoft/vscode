/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./notebookKernelActionViewItem';
import { ActionViewItem } from 'vs/base/browser/ui/actionbar/actionViewItems';
import { Action, IAction } from 'vs/base/common/actions';
import { groupBy } from 'vs/base/common/arrays';
import { createCancelablePromise } from 'vs/base/common/async';
import { CancellationToken } from 'vs/base/common/cancellation';
import { Codicon } from 'vs/base/common/codicons';
import { Event } from 'vs/base/common/event';
import { compareIgnoreCase, uppercaseFirstLetter } from 'vs/base/common/strings';
import { localize } from 'vs/nls';
import { Action2, MenuId, registerAction2 } from 'vs/platform/actions/common/actions';
import { ContextKeyExpr, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { ExtensionIdentifier } from 'vs/platform/extensions/common/extensions';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { ILabelService } from 'vs/platform/label/common/label';
import { ILogService } from 'vs/platform/log/common/log';
import { IProductService } from 'vs/platform/product/common/productService';
import { ProgressLocation } from 'vs/platform/progress/common/progress';
import { IQuickInputService, IQuickPick, IQuickPickItem, QuickPickInput } from 'vs/platform/quickinput/common/quickInput';
import { ThemeIcon } from 'vs/platform/theme/common/themeService';
import { ViewContainerLocation } from 'vs/workbench/common/views';
import { IExtensionsViewPaneContainer, IExtensionsWorkbenchService, VIEWLET_ID as EXTENSION_VIEWLET_ID } from 'vs/workbench/contrib/extensions/common/extensions';
import { NOTEBOOK_ACTIONS_CATEGORY, SELECT_KERNEL_ID } from 'vs/workbench/contrib/notebook/browser/controller/coreActions';
import { getNotebookEditorFromEditorPane, INotebookEditor, INotebookExtensionRecommendation, KERNEL_RECOMMENDATIONS } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { NotebookEditorWidget } from 'vs/workbench/contrib/notebook/browser/notebookEditorWidget';
import { executingStateIcon, selectKernelIcon } from 'vs/workbench/contrib/notebook/browser/notebookIcons';
import { NotebookTextModel } from 'vs/workbench/contrib/notebook/common/model/notebookTextModel';
import { NOTEBOOK_IS_ACTIVE_EDITOR, NOTEBOOK_KERNEL_COUNT } from 'vs/workbench/contrib/notebook/common/notebookContextKeys';
import { INotebookKernel, INotebookKernelMatchResult, INotebookKernelService, ISourceAction } from 'vs/workbench/contrib/notebook/common/notebookKernelService';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { IPaneCompositePartService } from 'vs/workbench/services/panecomposite/browser/panecomposite';

type KernelPick = IQuickPickItem & { kernel: INotebookKernel };
function isKernelPick(item: QuickPickInput<IQuickPickItem>): item is KernelPick {
	return 'kernel' in item;
}
type SourcePick = IQuickPickItem & { action: ISourceAction };
function isSourcePick(item: QuickPickInput<IQuickPickItem>): item is SourcePick {
	return 'action' in item;
}
type InstallExtensionPick = IQuickPickItem & { extensionId: string };
function isInstallExtensionPick(item: QuickPickInput<IQuickPickItem>): item is InstallExtensionPick {
	return item.id === 'installSuggested' && 'extensionId' in item;
}
type KernelQuickPickItem = IQuickPickItem | InstallExtensionPick | KernelPick | SourcePick;
const KERNEL_PICKER_UPDATE_DEBOUNCE = 200;

type KernelQuickPickContext =
	{ id: string; extension: string } |
	{ notebookEditorId: string } |
	{ id: string; extension: string; notebookEditorId: string } |
	{ ui?: boolean; notebookEditor?: NotebookEditorWidget };

interface IKernelPickerStrategy {
	showQuickPick(context?: KernelQuickPickContext): Promise<boolean>;
}

class KernelPickerFlatStrategy implements IKernelPickerStrategy {
	constructor(
		private readonly _notebookKernelService: INotebookKernelService,
		private readonly _editorService: IEditorService,
		private readonly _productService: IProductService,
		private readonly _quickInputService: IQuickInputService,
		private readonly _labelService: ILabelService,
		private readonly _logService: ILogService,
		private readonly _paneCompositePartService: IPaneCompositePartService,
		private readonly _extensionWorkbenchService: IExtensionsWorkbenchService,
		private readonly _extensionService: IExtensionService,
	) { }
	async showQuickPick(context?: KernelQuickPickContext): Promise<boolean> {
		const editor = this._getEditorFromContext(context);

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
		const scopedContextKeyService = editor.scopedContextKeyService;
		const matchResult = this._notebookKernelService.getMatchingKernel(notebook);
		const { selected, all } = matchResult;

		if (selected && controllerId && selected.id === controllerId && ExtensionIdentifier.equals(selected.extension, extensionId)) {
			// current kernel is wanted kernel -> done
			return true;
		}

		let newKernel: INotebookKernel | undefined;
		if (controllerId) {
			const wantedId = `${extensionId}/${controllerId}`;
			for (const candidate of all) {
				if (candidate.id === wantedId) {
					newKernel = candidate;
					break;
				}
			}
			if (!newKernel) {
				this._logService.warn(`wanted kernel DOES NOT EXIST, wanted: ${wantedId}, all: ${all.map(k => k.id)}`);
				return false;
			}
		}

		if (newKernel) {
			this._notebookKernelService.selectKernelForNotebook(newKernel, notebook);
			return true;
		}

		const quickPick = this._quickInputService.createQuickPick<KernelQuickPickItem>();
		const quickPickItems = this._getKernelPickerQuickPickItems(notebook, matchResult, this._notebookKernelService, scopedContextKeyService);
		quickPick.items = quickPickItems;
		quickPick.canSelectMany = false;
		quickPick.placeholder = selected
			? localize('prompt.placeholder.change', "Change kernel for '{0}'", this._labelService.getUriLabel(notebook.uri, { relative: true }))
			: localize('prompt.placeholder.select', "Select kernel for '{0}'", this._labelService.getUriLabel(notebook.uri, { relative: true }));

		quickPick.busy = this._notebookKernelService.getKernelDetectionTasks(notebook).length > 0;

		const kernelDetectionTaskListener = this._notebookKernelService.onDidChangeKernelDetectionTasks(() => {
			quickPick.busy = this._notebookKernelService.getKernelDetectionTasks(notebook).length > 0;
		});

		// run extension recommendataion task if quickPickItems is empty
		const extensionRecommendataionPromise = quickPickItems.length === 0
			? createCancelablePromise(token => this._showInstallKernelExtensionRecommendation(notebook, quickPick, this._extensionWorkbenchService, token))
			: undefined;

		const kernelChangeEventListener = Event.debounce<void, void>(
			Event.any(
				this._notebookKernelService.onDidChangeSourceActions,
				this._notebookKernelService.onDidAddKernel,
				this._notebookKernelService.onDidRemoveKernel,
				this._notebookKernelService.onDidChangeNotebookAffinity
			),
			(last, _current) => last,
			KERNEL_PICKER_UPDATE_DEBOUNCE
		)(async () => {
			// reset quick pick progress
			quickPick.busy = false;
			extensionRecommendataionPromise?.cancel();

			const currentActiveItems = quickPick.activeItems;
			const matchResult = this._notebookKernelService.getMatchingKernel(notebook);
			const quickPickItems = this._getKernelPickerQuickPickItems(notebook, matchResult, this._notebookKernelService, scopedContextKeyService);
			quickPick.keepScrollPosition = true;

			// recalcuate active items
			const activeItems: KernelQuickPickItem[] = [];
			for (const item of currentActiveItems) {
				if (isKernelPick(item)) {
					const kernelId = item.kernel.id;
					const sameItem = quickPickItems.find(pi => isKernelPick(pi) && pi.kernel.id === kernelId) as KernelPick | undefined;
					if (sameItem) {
						activeItems.push(sameItem);
					}
				} else if (isSourcePick(item)) {
					const sameItem = quickPickItems.find(pi => isSourcePick(pi) && pi.action.action.id === item.action.action.id) as SourcePick | undefined;
					if (sameItem) {
						activeItems.push(sameItem);
					}
				}
			}

			quickPick.items = quickPickItems;
			quickPick.activeItems = activeItems;
		}, this);

		const pick = await new Promise<KernelQuickPickItem>((resolve, reject) => {
			quickPick.onDidAccept(() => {
				const item = quickPick.selectedItems[0];
				if (item) {
					resolve(item);
				} else {
					reject();
				}

				quickPick.hide();
			});

			quickPick.onDidHide(() => () => {
				kernelDetectionTaskListener.dispose();
				kernelChangeEventListener.dispose();
				quickPick.dispose();
				reject();
			});
			quickPick.show();
		});

		if (pick) {
			if (isKernelPick(pick)) {
				newKernel = pick.kernel;
				this._notebookKernelService.selectKernelForNotebook(newKernel, notebook);
				return true;
			}

			// actions
			if (pick.id === 'install') {
				await this._showKernelExtension(
					this._paneCompositePartService,
					this._extensionWorkbenchService,
					this._extensionService,
					notebook.viewType
				);
				// suggestedExtension must be defined for this option to be shown, but still check to make TS happy
			} else if (isInstallExtensionPick(pick)) {
				await this._showKernelExtension(
					this._paneCompositePartService,
					this._extensionWorkbenchService,
					this._extensionService,
					notebook.viewType,
					pick.extensionId,
					this._productService.quality !== 'stable'
				);
			} else if (isSourcePick(pick)) {
				// selected explicilty, it should trigger the execution?
				pick.action.runAction();
			}
		}

		return false;
	}

	private _getEditorFromContext(context?: KernelQuickPickContext): INotebookEditor | undefined {
		let editor: INotebookEditor | undefined;
		if (context !== undefined && 'notebookEditorId' in context) {
			const editorId = context.notebookEditorId;
			const matchingEditor = this._editorService.visibleEditorPanes.find((editorPane) => {
				const notebookEditor = getNotebookEditorFromEditorPane(editorPane);
				return notebookEditor?.getId() === editorId;
			});
			editor = getNotebookEditorFromEditorPane(matchingEditor);
		} else if (context !== undefined && 'notebookEditor' in context) {
			editor = context?.notebookEditor;
		} else {
			editor = getNotebookEditorFromEditorPane(this._editorService.activeEditorPane);
		}

		return editor;
	}

	private _getKernelPickerQuickPickItems(
		notebookTextModel: NotebookTextModel,
		matchResult: INotebookKernelMatchResult,
		notebookKernelService: INotebookKernelService,
		scopedContextKeyService: IContextKeyService
	): QuickPickInput<KernelQuickPickItem>[] {
		const { selected, all, suggestions, hidden } = matchResult;

		const quickPickItems: QuickPickInput<KernelQuickPickItem>[] = [];
		if (all.length) {
			// Always display suggested kernels on the top.
			this._fillInSuggestions(quickPickItems, suggestions, selected);

			// Next display all of the kernels not marked as hidden grouped by categories or extensions.
			// If we don't have a kind, always display those at the bottom.
			const picks = all.filter(item => (!suggestions.includes(item) && !hidden.includes(item))).map(kernel => this._toQuickPick(kernel, selected));
			const kernelsPerCategory = groupBy(picks, (a, b) => compareIgnoreCase(a.kernel.kind || 'z', b.kernel.kind || 'z'));
			kernelsPerCategory.forEach(items => {
				quickPickItems.push({
					type: 'separator',
					label: items[0].kernel.kind || localize('otherKernelKinds', "Other")
				});
				quickPickItems.push(...items);
			});
		}

		const sourceActions = notebookKernelService.getSourceActions(notebookTextModel, scopedContextKeyService);
		if (sourceActions.length) {
			quickPickItems.push({
				type: 'separator',
				// label: localize('sourceActions', "")
			});

			sourceActions.forEach(sourceAction => {
				const res = <SourcePick>{
					action: sourceAction,
					picked: false,
					label: sourceAction.action.label,
				};

				quickPickItems.push(res);
			});
		}

		return quickPickItems;
	}

	private _toQuickPick(kernel: INotebookKernel, selected: INotebookKernel | undefined) {
		const res = <KernelPick>{
			kernel,
			picked: kernel.id === selected?.id,
			label: kernel.label,
			description: kernel.description,
			detail: kernel.detail
		};
		if (kernel.id === selected?.id) {
			if (!res.description) {
				res.description = localize('current1', "Currently Selected");
			} else {
				res.description = localize('current2', "{0} - Currently Selected", res.description);
			}
		}
		return res;
	}

	private _fillInSuggestions(quickPickItems: QuickPickInput<KernelQuickPickItem>[], suggestions: INotebookKernel[], selected: INotebookKernel | undefined) {
		if (!suggestions.length) {
			return;
		}

		if (suggestions.length === 1 && suggestions[0].id === selected?.id) {
			quickPickItems.push({
				type: 'separator',
				label: localize('selectedKernels', "Selected")
			});

			// The title is already set to "Selected" so we don't need to set it again in description, thus passing in `undefined`.
			quickPickItems.push(this._toQuickPick(suggestions[0], undefined));
			return;
		}

		quickPickItems.push({
			type: 'separator',
			label: localize('suggestedKernels', "Suggested")
		});
		quickPickItems.push(...suggestions.map(kernel => this._toQuickPick(kernel, selected)));
	}

	private async _showInstallKernelExtensionRecommendation(
		notebookTextModel: NotebookTextModel,
		quickPick: IQuickPick<KernelQuickPickItem>,
		extensionWorkbenchService: IExtensionsWorkbenchService,
		token: CancellationToken
	) {
		quickPick.busy = true;

		const newQuickPickItems = await this._getKernelRecommendationsQuickPickItems(notebookTextModel, extensionWorkbenchService);
		quickPick.busy = false;

		if (token.isCancellationRequested) {
			return;
		}

		if (newQuickPickItems && quickPick.items.length === 0) {
			quickPick.items = newQuickPickItems;
		}
	}

	private async _getKernelRecommendationsQuickPickItems(
		notebookTextModel: NotebookTextModel,
		extensionWorkbenchService: IExtensionsWorkbenchService,
	): Promise<QuickPickInput<KernelQuickPickItem>[] | undefined> {
		const quickPickItems: QuickPickInput<KernelQuickPickItem>[] = [];

		const language = this.getSuggestedLanguage(notebookTextModel);
		const suggestedExtension: INotebookExtensionRecommendation | undefined = language ? this.getSuggestedKernelFromLanguage(notebookTextModel.viewType, language) : undefined;
		if (suggestedExtension) {
			await extensionWorkbenchService.queryLocal();
			const extension = extensionWorkbenchService.installed.find(e => e.identifier.id === suggestedExtension.extensionId);

			if (extension) {
				// it's installed but might be detecting kernels
				return undefined;
			}

			// We have a suggested kernel, show an option to install it
			quickPickItems.push({
				id: 'installSuggested',
				description: suggestedExtension.displayName ?? suggestedExtension.extensionId,
				label: `$(${Codicon.lightbulb.id}) ` + localize('installSuggestedKernel', 'Install suggested extensions'),
				extensionId: suggestedExtension.extensionId
			});
		}
		// there is no kernel, show the install from marketplace
		quickPickItems.push({
			id: 'install',
			label: localize('searchForKernels', "Browse marketplace for kernel extensions"),
		});

		return quickPickItems;
	}

	/**
	 * Examine the most common language in the notebook
	 * @param notebookTextModel The notebook text model
	 * @returns What the suggested language is for the notebook. Used for kernal installing
	 */
	private getSuggestedLanguage(notebookTextModel: NotebookTextModel): string | undefined {
		const metaData = notebookTextModel.metadata;
		let suggestedKernelLanguage: string | undefined = (metaData.custom as any)?.metadata?.language_info?.name;
		// TODO how do we suggest multi language notebooks?
		if (!suggestedKernelLanguage) {
			const cellLanguages = notebookTextModel.cells.map(cell => cell.language).filter(language => language !== 'markdown');
			// Check if cell languages is all the same
			if (cellLanguages.length > 1) {
				const firstLanguage = cellLanguages[0];
				if (cellLanguages.every(language => language === firstLanguage)) {
					suggestedKernelLanguage = firstLanguage;
				}
			}
		}
		return suggestedKernelLanguage;
	}

	/**
	 * Given a language and notebook view type suggest a kernel for installation
	 * @param language The language to find a suggested kernel extension for
	 * @returns A recommednation object for the recommended extension, else undefined
	 */
	private getSuggestedKernelFromLanguage(viewType: string, language: string): INotebookExtensionRecommendation | undefined {
		const recommendation = KERNEL_RECOMMENDATIONS.get(viewType)?.get(language);
		return recommendation;
	}

	private async _showKernelExtension(
		paneCompositePartService: IPaneCompositePartService,
		extensionWorkbenchService: IExtensionsWorkbenchService,
		extensionService: IExtensionService,
		viewType: string,
		extId?: string,
		isInsiders?: boolean
	) {
		// If extension id is provided attempt to install the extension as the user has requested the suggested ones be installed
		if (extId) {
			const extension = (await extensionWorkbenchService.getExtensions([{ id: extId }], CancellationToken.None))[0];
			const canInstall = await extensionWorkbenchService.canInstall(extension);
			// If we can install then install it, otherwise we will fall out into searching the viewlet
			if (canInstall) {
				await extensionWorkbenchService.install(
					extension,
					{
						installPreReleaseVersion: isInsiders ?? false,
						context: { skipWalkthrough: true }
					},
					ProgressLocation.Notification
				);
				await extensionService.activateByEvent(`onNotebook:${viewType}`);
				return;
			}
		}

		const viewlet = await paneCompositePartService.openPaneComposite(EXTENSION_VIEWLET_ID, ViewContainerLocation.Sidebar, true);
		const view = viewlet?.getViewPaneContainer() as IExtensionsViewPaneContainer | undefined;
		const pascalCased = viewType.split(/[^a-z0-9]/ig).map(uppercaseFirstLetter).join('');
		view?.search(`@tag:notebookKernel${pascalCased}`);
	}
}

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: SELECT_KERNEL_ID,
			category: NOTEBOOK_ACTIONS_CATEGORY,
			title: { value: localize('notebookActions.selectKernel', "Select Notebook Kernel"), original: 'Select Notebook Kernel' },
			icon: selectKernelIcon,
			f1: true,
			menu: [{
				id: MenuId.EditorTitle,
				when: ContextKeyExpr.and(
					NOTEBOOK_IS_ACTIVE_EDITOR,
					ContextKeyExpr.notEquals('config.notebook.globalToolbar', true)
				),
				group: 'navigation',
				order: -10
			}, {
				id: MenuId.NotebookToolbar,
				when: ContextKeyExpr.equals('config.notebook.globalToolbar', true),
				group: 'status',
				order: -10
			}, {
				id: MenuId.InteractiveToolbar,
				when: NOTEBOOK_KERNEL_COUNT.notEqualsTo(0),
				group: 'status',
				order: -10
			}],
			description: {
				description: localize('notebookActions.selectKernel.args', "Notebook Kernel Args"),
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

	async run(accessor: ServicesAccessor, context?: KernelQuickPickContext): Promise<boolean> {
		const notebookKernelService = accessor.get(INotebookKernelService);
		const editorService = accessor.get(IEditorService);
		const productService = accessor.get(IProductService);
		const quickInputService = accessor.get(IQuickInputService);
		const labelService = accessor.get(ILabelService);
		const logService = accessor.get(ILogService);
		const paneCompositeService = accessor.get(IPaneCompositePartService);
		const extensionWorkbenchService = accessor.get(IExtensionsWorkbenchService);
		const extensionHostService = accessor.get(IExtensionService);

		const strategy = new KernelPickerFlatStrategy(
			notebookKernelService,
			editorService,
			productService,
			quickInputService,
			labelService,
			logService,
			paneCompositeService,
			extensionWorkbenchService,
			extensionHostService
		);
		return await strategy.showQuickPick(context);
	}
});

export class NotebooKernelActionViewItem extends ActionViewItem {

	private _kernelLabel?: HTMLAnchorElement;

	constructor(
		actualAction: IAction,
		private readonly _editor: { onDidChangeModel: Event<void>; textModel: NotebookTextModel | undefined; scopedContextKeyService?: IContextKeyService } | INotebookEditor,
		@INotebookKernelService private readonly _notebookKernelService: INotebookKernelService,
	) {
		super(
			undefined,
			new Action('fakeAction', undefined, ThemeIcon.asClassName(selectKernelIcon), true, (event) => actualAction.run(event)),
			{ label: false, icon: true }
		);
		this._register(_editor.onDidChangeModel(this._update, this));
		this._register(_notebookKernelService.onDidChangeNotebookAffinity(this._update, this));
		this._register(_notebookKernelService.onDidChangeSelectedNotebooks(this._update, this));
		this._register(_notebookKernelService.onDidChangeSourceActions(this._update, this));
		this._register(_notebookKernelService.onDidChangeKernelDetectionTasks(this._update, this));
	}

	override render(container: HTMLElement): void {
		this._update();
		super.render(container);
		container.classList.add('kernel-action-view-item');
		this._kernelLabel = document.createElement('a');
		container.appendChild(this._kernelLabel);
		this.updateLabel();
	}

	override updateLabel() {
		if (this._kernelLabel) {
			this._kernelLabel.classList.add('kernel-label');
			this._kernelLabel.innerText = this._action.label;
			this._kernelLabel.title = this._action.tooltip;
		}
	}

	protected _update(): void {
		const notebook = this._editor.textModel;

		if (!notebook) {
			this._resetAction();
			return;
		}

		const detectionTasks = this._notebookKernelService.getKernelDetectionTasks(notebook);
		if (detectionTasks.length) {
			return this._updateActionFromDetectionTask();
		}

		const runningActions = this._notebookKernelService.getRunningSourceActions(notebook);
		if (runningActions.length) {
			return this._updateActionFromSourceAction(runningActions[0] /** TODO handle multiple actions state */, true);
		}

		const info = this._notebookKernelService.getMatchingKernel(notebook);
		if (info.all.length === 0) {
			return this._updateActionsFromSourceActions();
		}

		this._updateActionFromKernelInfo(info);
	}

	private _updateActionFromDetectionTask() {
		this._action.enabled = true;
		this._action.label = localize('kernels.detecting', "Detecting Kernels");
		this._action.class = ThemeIcon.asClassName(ThemeIcon.modify(executingStateIcon, 'spin'));
	}

	private _updateActionFromSourceAction(sourceAction: ISourceAction, running: boolean) {
		const action = sourceAction.action;
		this.action.class = running ? ThemeIcon.asClassName(ThemeIcon.modify(executingStateIcon, 'spin')) : ThemeIcon.asClassName(selectKernelIcon);
		this.updateClass();
		this._action.label = action.label;
		this._action.enabled = true;
	}

	private _updateActionsFromSourceActions() {
		this._action.enabled = true;
		const sourceActions = this._editor.textModel ? this._notebookKernelService.getSourceActions(this._editor.textModel, this._editor.scopedContextKeyService) : [];
		if (sourceActions.length === 1) {
			// exact one action
			this._updateActionFromSourceAction(sourceActions[0], false);
		} else if (sourceActions.filter(sourceAction => sourceAction.isPrimary).length === 1) {
			// exact one primary action
			this._updateActionFromSourceAction(sourceActions.filter(sourceAction => sourceAction.isPrimary)[0], false);
		} else {
			this._action.class = ThemeIcon.asClassName(selectKernelIcon);
			this._action.label = localize('select', "Select Kernel");
			this._action.tooltip = '';
		}
	}

	private _updateActionFromKernelInfo(info: INotebookKernelMatchResult): void {
		this._action.enabled = true;
		this._action.class = ThemeIcon.asClassName(selectKernelIcon);
		const selectedOrSuggested = info.selected
			?? (info.suggestions.length === 1 ? info.suggestions[0] : undefined)
			?? (info.all.length === 1 ? info.all[0] : undefined);
		if (selectedOrSuggested) {
			// selected or suggested kernel
			this._action.label = this._generateKenrelLabel(selectedOrSuggested);
			this._action.tooltip = selectedOrSuggested.description ?? selectedOrSuggested.detail ?? '';
			if (!info.selected) {
				// special UI for selected kernel?
			}
		} else {
			// many kernels or no kernels
			this._action.label = localize('select', "Select Kernel");
			this._action.tooltip = '';
		}
	}

	private _generateKenrelLabel(kernel: INotebookKernel) {
		return kernel.label;
	}

	private _resetAction(): void {
		this._action.enabled = false;
		this._action.label = '';
		this._action.class = '';
	}
}
