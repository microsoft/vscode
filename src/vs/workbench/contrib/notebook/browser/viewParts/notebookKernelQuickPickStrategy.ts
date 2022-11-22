/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IAction } from 'vs/base/common/actions';
import { groupBy } from 'vs/base/common/arrays';
import { createCancelablePromise } from 'vs/base/common/async';
import { CancellationToken } from 'vs/base/common/cancellation';
import { Codicon } from 'vs/base/common/codicons';
import { Event } from 'vs/base/common/event';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { MarshalledId } from 'vs/base/common/marshallingIds';
import { compareIgnoreCase, uppercaseFirstLetter } from 'vs/base/common/strings';
import 'vs/css!./notebookKernelActionViewItem';
import { Command } from 'vs/editor/common/languages';
import { localize } from 'vs/nls';
import { MenuItemAction } from 'vs/platform/actions/common/actions';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { ILabelService } from 'vs/platform/label/common/label';
import { ILogService } from 'vs/platform/log/common/log';
import { IProductService } from 'vs/platform/product/common/productService';
import { ProgressLocation } from 'vs/platform/progress/common/progress';
import { IQuickInputService, IQuickPick, IQuickPickItem, QuickPickInput } from 'vs/platform/quickinput/common/quickInput';
import { ThemeIcon } from 'vs/platform/theme/common/themeService';
import { ViewContainerLocation } from 'vs/workbench/common/views';
import { IExtensionsViewPaneContainer, IExtensionsWorkbenchService, VIEWLET_ID as EXTENSION_VIEWLET_ID } from 'vs/workbench/contrib/extensions/common/extensions';
import { IActiveNotebookEditor, INotebookExtensionRecommendation, JUPYTER_EXTENSION_ID, KERNEL_RECOMMENDATIONS } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { NotebookEditorWidget } from 'vs/workbench/contrib/notebook/browser/notebookEditorWidget';
import { executingStateIcon, selectKernelIcon } from 'vs/workbench/contrib/notebook/browser/notebookIcons';
import { NotebookTextModel } from 'vs/workbench/contrib/notebook/common/model/notebookTextModel';
import { INotebookKernel, INotebookKernelHistoryService, INotebookKernelMatchResult, INotebookKernelService, ISourceAction } from 'vs/workbench/contrib/notebook/common/notebookKernelService';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { IPaneCompositePartService } from 'vs/workbench/services/panecomposite/browser/panecomposite';

type KernelPick = IQuickPickItem & { kernel: INotebookKernel };
function isKernelPick(item: QuickPickInput<IQuickPickItem>): item is KernelPick {
	return 'kernel' in item;
}
type GroupedKernelsPick = IQuickPickItem & { kernels: INotebookKernel[]; source: string };
function isGroupedKernelsPick(item: QuickPickInput<IQuickPickItem>): item is GroupedKernelsPick {
	return 'kernels' in item;
}
type SourcePick = IQuickPickItem & { action: ISourceAction };
function isSourcePick(item: QuickPickInput<IQuickPickItem>): item is SourcePick {
	return 'action' in item;
}
type InstallExtensionPick = IQuickPickItem & { extensionId: string };
function isInstallExtensionPick(item: QuickPickInput<IQuickPickItem>): item is InstallExtensionPick {
	return item.id === 'installSuggested' && 'extensionId' in item;
}
type KernelSourceQuickPickItem = IQuickPickItem & { command: Command };
function isKernelSourceQuickPickItem(item: IQuickPickItem): item is KernelSourceQuickPickItem {
	return 'command' in item;
}
type KernelQuickPickItem = IQuickPickItem | InstallExtensionPick | KernelPick | GroupedKernelsPick | SourcePick | KernelSourceQuickPickItem;
const KERNEL_PICKER_UPDATE_DEBOUNCE = 200;

export type KernelQuickPickContext =
	{ id: string; extension: string } |
	{ notebookEditorId: string } |
	{ id: string; extension: string; notebookEditorId: string } |
	{ ui?: boolean; notebookEditor?: NotebookEditorWidget };

export interface IKernelPickerStrategy {
	showQuickPick(editor: IActiveNotebookEditor, wantedKernelId?: string): Promise<boolean>;
}

function toKernelQuickPick(kernel: INotebookKernel, selected: INotebookKernel | undefined) {
	const res: KernelPick = {
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


abstract class KernelPickerStrategyBase implements IKernelPickerStrategy {
	constructor(
		protected readonly _notebookKernelService: INotebookKernelService,
		protected readonly _productService: IProductService,
		protected readonly _quickInputService: IQuickInputService,
		protected readonly _labelService: ILabelService,
		protected readonly _logService: ILogService,
		protected readonly _paneCompositePartService: IPaneCompositePartService,
		protected readonly _extensionWorkbenchService: IExtensionsWorkbenchService,
		protected readonly _extensionService: IExtensionService,
		protected readonly _commandService: ICommandService
	) { }

	async showQuickPick(editor: IActiveNotebookEditor, wantedId?: string): Promise<boolean> {
		const notebook = editor.textModel;
		const scopedContextKeyService = editor.scopedContextKeyService;
		const matchResult = this._getMatchingResult(notebook);
		const { selected, all } = matchResult;

		let newKernel: INotebookKernel | undefined;
		if (wantedId) {
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
			this._selecteKernel(notebook, newKernel);
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
			const matchResult = this._getMatchingResult(notebook);
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
			return await this._handleQuickPick(editor, pick);
		}

		return false;
	}

	protected _getMatchingResult(notebook: NotebookTextModel) {
		return this._notebookKernelService.getMatchingKernel(notebook);
	}

	protected abstract _getKernelPickerQuickPickItems(
		notebookTextModel: NotebookTextModel,
		matchResult: INotebookKernelMatchResult,
		notebookKernelService: INotebookKernelService,
		scopedContextKeyService: IContextKeyService
	): QuickPickInput<KernelQuickPickItem>[];

	protected async _handleQuickPick(editor: IActiveNotebookEditor, pick: KernelQuickPickItem) {
		if (isKernelPick(pick)) {
			const newKernel = pick.kernel;
			this._selecteKernel(editor.textModel, newKernel);
			return true;
		}

		// actions
		if (pick.id === 'install') {
			await this._showKernelExtension(
				this._paneCompositePartService,
				this._extensionWorkbenchService,
				this._extensionService,
				editor.textModel.viewType
			);
			// suggestedExtension must be defined for this option to be shown, but still check to make TS happy
		} else if (isInstallExtensionPick(pick)) {
			await this._showKernelExtension(
				this._paneCompositePartService,
				this._extensionWorkbenchService,
				this._extensionService,
				editor.textModel.viewType,
				pick.extensionId,
				this._productService.quality !== 'stable'
			);
		} else if (isSourcePick(pick)) {
			// selected explicilty, it should trigger the execution?
			pick.action.runAction();
		}

		return true;
	}

	protected _selecteKernel(notebook: NotebookTextModel, kernel: INotebookKernel) {
		this._notebookKernelService.selectKernelForNotebook(kernel, notebook);
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
}

export class KernelPickerFlatStrategy extends KernelPickerStrategyBase {

	constructor(
		@INotebookKernelService _notebookKernelService: INotebookKernelService,
		@IProductService _productService: IProductService,
		@IQuickInputService _quickInputService: IQuickInputService,
		@ILabelService _labelService: ILabelService,
		@ILogService _logService: ILogService,
		@IPaneCompositePartService _paneCompositePartService: IPaneCompositePartService,
		@IExtensionsWorkbenchService _extensionWorkbenchService: IExtensionsWorkbenchService,
		@IExtensionService _extensionService: IExtensionService,
		@ICommandService _commandService: ICommandService

	) {
		super(
			_notebookKernelService,
			_productService,
			_quickInputService,
			_labelService,
			_logService,
			_paneCompositePartService,
			_extensionWorkbenchService,
			_extensionService,
			_commandService,
		);
	}

	protected _getKernelPickerQuickPickItems(
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
			const picks = all.filter(item => (!suggestions.includes(item) && !hidden.includes(item))).map(kernel => toKernelQuickPick(kernel, selected));
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

			for (const sourceAction of sourceActions) {
				const res: SourcePick = {
					action: sourceAction,
					picked: false,
					label: sourceAction.action.label,
				};

				quickPickItems.push(res);
			}
		}

		return quickPickItems;
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
			quickPickItems.push(toKernelQuickPick(suggestions[0], undefined));
			return;
		}

		quickPickItems.push({
			type: 'separator',
			label: localize('suggestedKernels', "Suggested")
		});
		quickPickItems.push(...suggestions.map(kernel => toKernelQuickPick(kernel, selected)));
	}

	static updateKernelStatusAction(notebook: NotebookTextModel, action: IAction, notebookKernelService: INotebookKernelService, scopedContextKeyService?: IContextKeyService) {
		const detectionTasks = notebookKernelService.getKernelDetectionTasks(notebook);
		if (detectionTasks.length) {
			action.enabled = true;
			action.label = localize('kernels.detecting', "Detecting Kernels");
			action.class = ThemeIcon.asClassName(ThemeIcon.modify(executingStateIcon, 'spin'));
			return;
		}

		const runningActions = notebookKernelService.getRunningSourceActions(notebook);

		const updateActionFromSourceAction = (sourceAction: ISourceAction, running: boolean) => {
			const sAction = sourceAction.action;
			action.class = running ? ThemeIcon.asClassName(ThemeIcon.modify(executingStateIcon, 'spin')) : ThemeIcon.asClassName(selectKernelIcon);
			action.label = sAction.label;
			action.enabled = true;
		};

		if (runningActions.length) {
			return updateActionFromSourceAction(runningActions[0] /** TODO handle multiple actions state */, true);
		}

		const info = notebookKernelService.getMatchingKernel(notebook);
		if (info.all.length === 0) {
			action.enabled = true;
			const sourceActions = notebookKernelService.getSourceActions(notebook, scopedContextKeyService);
			if (sourceActions.length === 1) {
				// exact one action
				updateActionFromSourceAction(sourceActions[0], false);
			} else if (sourceActions.filter(sourceAction => sourceAction.isPrimary).length === 1) {
				// exact one primary action
				updateActionFromSourceAction(sourceActions.filter(sourceAction => sourceAction.isPrimary)[0], false);
			} else {
				action.class = ThemeIcon.asClassName(selectKernelIcon);
				action.label = localize('select', "Select Kernel");
				action.tooltip = '';
			}
			return;
		}

		action.enabled = true;
		action.class = ThemeIcon.asClassName(selectKernelIcon);
		const selectedOrSuggested = info.selected
			?? (info.suggestions.length === 1 ? info.suggestions[0] : undefined)
			?? (info.all.length === 1 ? info.all[0] : undefined);
		if (selectedOrSuggested) {
			// selected or suggested kernel
			action.label = selectedOrSuggested.label;
			action.tooltip = selectedOrSuggested.description ?? selectedOrSuggested.detail ?? '';
			if (!info.selected) {
				// special UI for selected kernel?
			}
		} else {
			// many kernels or no kernels
			action.label = localize('select', "Select Kernel");
			action.tooltip = '';
		}
	}
}

export class KernelPickerMRUStrategy extends KernelPickerStrategyBase {
	constructor(
		@INotebookKernelService _notebookKernelService: INotebookKernelService,
		@IProductService _productService: IProductService,
		@IQuickInputService _quickInputService: IQuickInputService,
		@ILabelService _labelService: ILabelService,
		@ILogService _logService: ILogService,
		@IPaneCompositePartService _paneCompositePartService: IPaneCompositePartService,
		@IExtensionsWorkbenchService _extensionWorkbenchService: IExtensionsWorkbenchService,
		@IExtensionService _extensionService: IExtensionService,
		@ICommandService _commandService: ICommandService,
		@INotebookKernelHistoryService private readonly _notebookKernelHistoryService: INotebookKernelHistoryService

	) {
		super(
			_notebookKernelService,
			_productService,
			_quickInputService,
			_labelService,
			_logService,
			_paneCompositePartService,
			_extensionWorkbenchService,
			_extensionService,
			_commandService,
		);
	}

	protected _getKernelPickerQuickPickItems(notebookTextModel: NotebookTextModel, matchResult: INotebookKernelMatchResult, notebookKernelService: INotebookKernelService, scopedContextKeyService: IContextKeyService): QuickPickInput<KernelQuickPickItem>[] {
		const quickPickItems: QuickPickInput<KernelQuickPickItem>[] = [];
		let previousKind = '';

		if (matchResult.selected) {
			const kernelItem = toKernelQuickPick(matchResult.selected, matchResult.selected);
			const kind = matchResult.selected.kind || '';
			if (kind) {
				previousKind = kind;
				quickPickItems.push({ type: 'separator', label: kind });
			}
			quickPickItems.push(kernelItem);
		}

		matchResult.suggestions.filter(kernel => kernel.id !== matchResult.selected?.id).map(kernel => toKernelQuickPick(kernel, matchResult.selected))
			.forEach(kernel => {
				const kind = kernel.kernel.kind || '';
				if (kind && kind !== previousKind) {
					previousKind = kind;
					quickPickItems.push({ type: 'separator', label: kind });
				}
				quickPickItems.push(kernel);
			});

		quickPickItems.push({
			type: 'separator'
		});

		// select another kernel quick pick
		quickPickItems.push({
			id: 'selectAnother',
			label: localize('selectAnotherKernel.more', "Select Another Kernel..."),
		});

		return quickPickItems;
	}

	protected override _selecteKernel(notebook: NotebookTextModel, kernel: INotebookKernel): void {
		const currentInfo = this._notebookKernelService.getMatchingKernel(notebook);
		if (currentInfo.selected) {
			// there is already a selected kernel
			this._notebookKernelHistoryService.addMostRecentKernel(currentInfo.selected);
		}
		super._selecteKernel(notebook, kernel);
		this._notebookKernelHistoryService.addMostRecentKernel(kernel);
	}

	protected override _getMatchingResult(notebook: NotebookTextModel): INotebookKernelMatchResult {
		const { selected, all } = this._notebookKernelHistoryService.getKernels(notebook);
		const matchingResult = this._notebookKernelService.getMatchingKernel(notebook);
		return {
			selected: selected,
			all: matchingResult.all,
			suggestions: all,
			hidden: []
		};
	}

	protected override async _handleQuickPick(editor: IActiveNotebookEditor, pick: KernelQuickPickItem): Promise<boolean> {
		if (pick.id === 'selectAnother') {
			return this.displaySelectAnotherQuickPick(editor);
		}

		return super._handleQuickPick(editor, pick);
	}

	private async displaySelectAnotherQuickPick(editor: IActiveNotebookEditor) {
		const notebook: NotebookTextModel = editor.textModel;
		const disposables = new DisposableStore();
		return new Promise<boolean>(resolve => {
			// select from kernel sources
			const quickPick = this._quickInputService.createQuickPick<KernelQuickPickItem>();
			quickPick.title = localize('selectAnotherKernel', "Select Another Kernel");
			quickPick.busy = true;
			quickPick.buttons = [this._quickInputService.backButton];
			quickPick.show();

			const quickPickItems: QuickPickInput<KernelQuickPickItem>[] = [];
			disposables.add(quickPick.onDidTriggerButton(button => {
				if (button === this._quickInputService.backButton) {
					quickPick.hide();
					resolve(this.showQuickPick(editor));
				}
			}));
			disposables.add(quickPick.onDidAccept(async () => {
				quickPick.hide();
				quickPick.dispose();
				if (quickPick.selectedItems) {
					if (isKernelSourceQuickPickItem(quickPick.selectedItems[0])) {
						const selectedKernelId = await this._executeCommand<string>(notebook, quickPick.selectedItems[0].command);
						if (selectedKernelId) {
							const { all } = await this._getMatchingResult(notebook);
							const kernel = all.find(kernel => kernel.id === `ms-toolsai.jupyter/${selectedKernelId}`);
							if (kernel) {
								await this._selecteKernel(notebook, kernel);
								resolve(true);
							}
							resolve(true);
						} else {
							return resolve(this.displaySelectAnotherQuickPick(editor));
						}
					} else if (isKernelPick(quickPick.selectedItems[0])) {
						await this._selecteKernel(notebook, quickPick.selectedItems[0].kernel);
						resolve(true);
					} else if (isGroupedKernelsPick(quickPick.selectedItems[0])) {
						await this._selectOneKernel(notebook, quickPick.selectedItems[0].source, quickPick.selectedItems[0].kernels);
						resolve(true);
					} else if (isSourcePick(quickPick.selectedItems[0])) {
						// selected explicilty, it should trigger the execution?
						quickPick.selectedItems[0].action.runAction();
						resolve(true);
					}
				}
			}));
			this._notebookKernelService.getKernelSourceActions2(notebook).then(actions => {
				quickPick.busy = false;
				const matchResult = this._getMatchingResult(notebook);
				const others = matchResult.all.filter(item => item.extension.value !== JUPYTER_EXTENSION_ID);

				// group controllers by extension
				for (const group of groupBy(others, (a, b) => a.extension.value === b.extension.value ? 0 : 1)) {
					const extension = this._extensionService.extensions.find(extension => extension.identifier.value === group[0].extension.value);
					const source = extension?.description ?? group[0].extension.value;
					if (group.length > 1) {
						quickPickItems.push({
							label: source,
							detail: localize('selectKernelFromExtensionDetail', "Kernels: {0}", group.map(kernel => kernel.label).join(', ')),
							kernels: group
						});
					} else {
						quickPickItems.push({
							label: group[0].label,
							detail: source,
							kernel: group[0]
						});
					}
				}

				const validActions = actions.filter(action => action.command);

				quickPickItems.push(...validActions.map(action => {
					return {
						id: typeof action.command! === 'string' ? action.command! : action.command!.id,
						label: action.label,
						detail: action.detail,
						description: action.description,
						command: action.command
					};
				}));

				const sourceActionCommands = this._notebookKernelService.getSourceActions(notebook, editor.scopedContextKeyService);
				for (const sourceAction of sourceActionCommands) {
					const res: SourcePick = {
						action: sourceAction,
						picked: false,
						label: sourceAction.action.label,
						detail: (sourceAction.action as MenuItemAction)?.item?.source
					};

					quickPickItems.push(res);
				}

				quickPick.items = quickPickItems;
			});
		}).finally(() => {
			disposables.dispose();
		});
	}

	private async _selectOneKernel(notebook: NotebookTextModel, source: string, kernels: INotebookKernel[]) {
		const quickPickItems: QuickPickInput<KernelPick>[] = kernels.map(kernel => toKernelQuickPick(kernel, undefined));
		const quickPick = this._quickInputService.createQuickPick<KernelQuickPickItem>();
		quickPick.items = quickPickItems;
		quickPick.canSelectMany = false;

		quickPick.title = localize('selectKernelFromExtension', "Select Kernel from {0}", source);

		quickPick.onDidAccept(async () => {
			if (quickPick.selectedItems && quickPick.selectedItems.length > 0 && isKernelPick(quickPick.selectedItems[0])) {
				await this._selecteKernel(notebook, quickPick.selectedItems[0].kernel);
			}

			quickPick.hide();
			quickPick.dispose();
		});

		quickPick.onDidHide(() => {
			quickPick.dispose();
		});

		quickPick.show();
	}

	private async _executeCommand<T>(notebook: NotebookTextModel, command: string | Command): Promise<T | undefined | void> {
		const id = typeof command === 'string' ? command : command.id;
		const args = typeof command === 'string' ? [] : command.arguments ?? [];

		if (typeof command === 'string' || !command.arguments || !Array.isArray(command.arguments) || command.arguments.length === 0) {
			args.unshift({
				uri: notebook.uri,
				$mid: MarshalledId.NotebookActionContext
			});
		}

		if (typeof command === 'string') {
			return this._commandService.executeCommand(id);
		} else {
			return this._commandService.executeCommand(id, ...args);
		}
	}

	static updateKernelStatusAction(notebook: NotebookTextModel, action: IAction, notebookKernelService: INotebookKernelService) {
		const detectionTasks = notebookKernelService.getKernelDetectionTasks(notebook);
		if (detectionTasks.length) {
			action.enabled = true;
			action.label = localize('kernels.detecting', "Detecting Kernels");
			action.class = ThemeIcon.asClassName(ThemeIcon.modify(executingStateIcon, 'spin'));
			return;
		}

		const runningActions = notebookKernelService.getRunningSourceActions(notebook);

		const updateActionFromSourceAction = (sourceAction: ISourceAction, running: boolean) => {
			const sAction = sourceAction.action;
			action.class = running ? ThemeIcon.asClassName(ThemeIcon.modify(executingStateIcon, 'spin')) : ThemeIcon.asClassName(selectKernelIcon);
			action.label = sAction.label;
			action.enabled = true;
		};

		if (runningActions.length) {
			return updateActionFromSourceAction(runningActions[0] /** TODO handle multiple actions state */, true);
		}

		const info = notebookKernelService.getMatchingKernel(notebook);
		const suggested = (info.suggestions.length === 1 ? info.suggestions[0] : undefined)
			?? (info.all.length === 1) ? info.all[0] : undefined;

		const selectedOrSuggested = info.selected ?? suggested;

		if (selectedOrSuggested) {
			action.label = selectedOrSuggested.label;
			action.class = ThemeIcon.asClassName(selectKernelIcon);
			action.tooltip = selectedOrSuggested.description ?? selectedOrSuggested.detail ?? '';
		} else {
			action.label = localize('select', "Select Kernel");
			action.class = ThemeIcon.asClassName(selectKernelIcon);
			action.tooltip = '';
		}
	}
}
