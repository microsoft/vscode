/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IAction } from '../../../../../base/common/actions.js';
import { groupBy } from '../../../../../base/common/arrays.js';
import { createCancelablePromise } from '../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Event } from '../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { MarshalledId } from '../../../../../base/common/marshallingIds.js';
import { uppercaseFirstLetter } from '../../../../../base/common/strings.js';
import { Command } from '../../../../../editor/common/languages.js';
import { localize } from '../../../../../nls.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { ProgressLocation } from '../../../../../platform/progress/common/progress.js';
import { IQuickInputButton, IQuickInputService, IQuickPick, IQuickPickItem, QuickPickInput } from '../../../../../platform/quickinput/common/quickInput.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { IExtension, IExtensionsWorkbenchService } from '../../../extensions/common/extensions.js';
import { IActiveNotebookEditor, INotebookExtensionRecommendation, JUPYTER_EXTENSION_ID, KERNEL_RECOMMENDATIONS } from '../notebookBrowser.js';
import { NotebookEditorWidget } from '../notebookEditorWidget.js';
import { executingStateIcon, selectKernelIcon } from '../notebookIcons.js';
import { NotebookTextModel } from '../../common/model/notebookTextModel.js';
import { INotebookKernel, INotebookKernelHistoryService, INotebookKernelMatchResult, INotebookKernelService, ISourceAction } from '../../common/notebookKernelService.js';
import { IExtensionService } from '../../../../services/extensions/common/extensions.js';
import { URI } from '../../../../../base/common/uri.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { INotebookTextModel } from '../../common/notebookCommon.js';
import { SELECT_KERNEL_ID } from '../controller/coreActions.js';
import { EnablementState } from '../../../../services/extensionManagement/common/extensionManagement.js';

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
type InstallExtensionPick = IQuickPickItem & { extensionIds: string[] };
function isInstallExtensionPick(item: QuickPickInput<IQuickPickItem>): item is InstallExtensionPick {
	return item.id === 'installSuggested' && 'extensionIds' in item;
}
type SearchMarketplacePick = IQuickPickItem & { id: 'install' };
function isSearchMarketplacePick(item: QuickPickInput<IQuickPickItem>): item is SearchMarketplacePick {
	return item.id === 'install';
}

type KernelSourceQuickPickItem = IQuickPickItem & { command: Command; documentation?: string };
function isKernelSourceQuickPickItem(item: IQuickPickItem): item is KernelSourceQuickPickItem {
	return 'command' in item;
}

function supportAutoRun(item: QuickPickInput<IQuickPickItem>): item is IQuickPickItem {
	return 'autoRun' in item && !!item.autoRun;
}
type KernelQuickPickItem = (IQuickPickItem & { autoRun?: boolean }) | SearchMarketplacePick | InstallExtensionPick | KernelPick | GroupedKernelsPick | SourcePick | KernelSourceQuickPickItem;
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
		protected readonly _extensionWorkbenchService: IExtensionsWorkbenchService,
		protected readonly _extensionService: IExtensionService,
		protected readonly _commandService: ICommandService
	) { }

	async showQuickPick(editor: IActiveNotebookEditor, wantedId?: string, skipAutoRun?: boolean): Promise<boolean> {
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


		const localDisposableStore = new DisposableStore();
		const quickPick = localDisposableStore.add(this._quickInputService.createQuickPick<KernelQuickPickItem>({ useSeparators: true }));
		const quickPickItems = this._getKernelPickerQuickPickItems(notebook, matchResult, this._notebookKernelService, scopedContextKeyService);

		if (quickPickItems.length === 1 && supportAutoRun(quickPickItems[0]) && !skipAutoRun) {
			const picked = await this._handleQuickPick(editor, quickPickItems[0], quickPickItems as KernelQuickPickItem[]);
			localDisposableStore.dispose();
			return picked;
		}

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

		const pick = await new Promise<{ selected: KernelQuickPickItem | undefined; items: KernelQuickPickItem[] }>((resolve, reject) => {
			localDisposableStore.add(quickPick.onDidAccept(() => {
				const item = quickPick.selectedItems[0];
				if (item) {
					resolve({ selected: item, items: quickPick.items as KernelQuickPickItem[] });
				} else {
					resolve({ selected: undefined, items: quickPick.items as KernelQuickPickItem[] });
				}

				quickPick.hide();
			}));

			localDisposableStore.add(quickPick.onDidHide(() => {
				kernelDetectionTaskListener.dispose();
				kernelChangeEventListener.dispose();
				quickPick.dispose();
				resolve({ selected: undefined, items: quickPick.items as KernelQuickPickItem[] });
			}));
			quickPick.show();
		});

		localDisposableStore.dispose();

		if (pick.selected) {
			return await this._handleQuickPick(editor, pick.selected, pick.items);
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

	protected async _handleQuickPick(editor: IActiveNotebookEditor, pick: KernelQuickPickItem, quickPickItems: KernelQuickPickItem[]): Promise<boolean> {
		if (isKernelPick(pick)) {
			const newKernel = pick.kernel;
			this._selecteKernel(editor.textModel, newKernel);
			return true;
		}

		// actions
		if (isSearchMarketplacePick(pick)) {
			await this._showKernelExtension(
				this._extensionWorkbenchService,
				this._extensionService,
				editor.textModel.viewType,
				[]
			);
			// suggestedExtension must be defined for this option to be shown, but still check to make TS happy
		} else if (isInstallExtensionPick(pick)) {
			await this._showKernelExtension(
				this._extensionWorkbenchService,
				this._extensionService,
				editor.textModel.viewType,
				pick.extensionIds,
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

	protected async _showKernelExtension(
		extensionWorkbenchService: IExtensionsWorkbenchService,
		extensionService: IExtensionService,
		viewType: string,
		extIds: string[],
		isInsiders?: boolean
	) {
		// If extension id is provided attempt to install the extension as the user has requested the suggested ones be installed
		const extensionsToInstall: IExtension[] = [];
		const extensionsToEnable: IExtension[] = [];

		for (const extId of extIds) {
			const extension = (await extensionWorkbenchService.getExtensions([{ id: extId }], CancellationToken.None))[0];
			if (extension.enablementState === EnablementState.DisabledGlobally || extension.enablementState === EnablementState.DisabledWorkspace || extension.enablementState === EnablementState.DisabledByEnvironment) {
				extensionsToEnable.push(extension);
			} else {
				const canInstall = await extensionWorkbenchService.canInstall(extension);
				if (canInstall === true) {
					extensionsToInstall.push(extension);
				}
			}
		}

		if (extensionsToInstall.length || extensionsToEnable.length) {
			await Promise.all([...extensionsToInstall.map(async extension => {
				await extensionWorkbenchService.install(
					extension,
					{
						installPreReleaseVersion: isInsiders ?? false,
						context: { skipWalkthrough: true }
					},
					ProgressLocation.Notification
				);
			}), ...extensionsToEnable.map(async extension => {
				switch (extension.enablementState) {
					case EnablementState.DisabledWorkspace:
						await extensionWorkbenchService.setEnablement([extension], EnablementState.EnabledWorkspace);
						return;
					case EnablementState.DisabledGlobally:
						await extensionWorkbenchService.setEnablement([extension], EnablementState.EnabledGlobally);
						return;
					case EnablementState.DisabledByEnvironment:
						await extensionWorkbenchService.setEnablement([extension], EnablementState.EnabledByEnvironment);
						return;
					default:
						break;
				}
			})]);

			await extensionService.activateByEvent(`onNotebook:${viewType}`);
			return;
		}

		const pascalCased = viewType.split(/[^a-z0-9]/ig).map(uppercaseFirstLetter).join('');
		await extensionWorkbenchService.openSearch(`@tag:notebookKernel${pascalCased}`);
	}

	private async _showInstallKernelExtensionRecommendation(
		notebookTextModel: NotebookTextModel,
		quickPick: IQuickPick<KernelQuickPickItem, { useSeparators: true }>,
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

	protected async _getKernelRecommendationsQuickPickItems(
		notebookTextModel: NotebookTextModel,
		extensionWorkbenchService: IExtensionsWorkbenchService,
	): Promise<QuickPickInput<SearchMarketplacePick | InstallExtensionPick>[] | undefined> {
		const quickPickItems: QuickPickInput<SearchMarketplacePick | InstallExtensionPick>[] = [];

		const language = this.getSuggestedLanguage(notebookTextModel);
		const suggestedExtension: INotebookExtensionRecommendation | undefined = language ? this.getSuggestedKernelFromLanguage(notebookTextModel.viewType, language) : undefined;
		if (suggestedExtension) {
			await extensionWorkbenchService.queryLocal();

			const extensions = extensionWorkbenchService.installed.filter(e =>
				(e.enablementState === EnablementState.EnabledByEnvironment || e.enablementState === EnablementState.EnabledGlobally || e.enablementState === EnablementState.EnabledWorkspace)
				&& suggestedExtension.extensionIds.includes(e.identifier.id)
			);

			if (extensions.length === suggestedExtension.extensionIds.length) {
				// it's installed but might be detecting kernels
				return undefined;
			}

			// We have a suggested kernel, show an option to install it
			quickPickItems.push({
				id: 'installSuggested',
				description: suggestedExtension.displayName ?? suggestedExtension.extensionIds.join(', '),
				label: `$(${Codicon.lightbulb.id}) ` + localize('installSuggestedKernel', 'Install/Enable suggested extensions'),
				extensionIds: suggestedExtension.extensionIds
			} satisfies InstallExtensionPick);
		}
		// there is no kernel, show the install from marketplace
		quickPickItems.push({
			id: 'install',
			label: localize('searchForKernels', "Browse marketplace for kernel extensions"),
		} satisfies SearchMarketplacePick);

		return quickPickItems;
	}

	/**
	 * Examine the most common language in the notebook
	 * @param notebookTextModel The notebook text model
	 * @returns What the suggested language is for the notebook. Used for kernal installing
	 */
	private getSuggestedLanguage(notebookTextModel: NotebookTextModel): string | undefined {
		const metaData = notebookTextModel.metadata;
		let suggestedKernelLanguage: string | undefined = (metaData as any)?.metadata?.language_info?.name;
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

export class KernelPickerMRUStrategy extends KernelPickerStrategyBase {
	constructor(
		@INotebookKernelService _notebookKernelService: INotebookKernelService,
		@IProductService _productService: IProductService,
		@IQuickInputService _quickInputService: IQuickInputService,
		@ILabelService _labelService: ILabelService,
		@ILogService _logService: ILogService,
		@IExtensionsWorkbenchService _extensionWorkbenchService: IExtensionsWorkbenchService,
		@IExtensionService _extensionService: IExtensionService,
		@ICommandService _commandService: ICommandService,
		@INotebookKernelHistoryService private readonly _notebookKernelHistoryService: INotebookKernelHistoryService,
		@IOpenerService private readonly _openerService: IOpenerService

	) {
		super(
			_notebookKernelService,
			_productService,
			_quickInputService,
			_labelService,
			_logService,
			_extensionWorkbenchService,
			_extensionService,
			_commandService,
		);
	}

	protected _getKernelPickerQuickPickItems(notebookTextModel: NotebookTextModel, matchResult: INotebookKernelMatchResult, notebookKernelService: INotebookKernelService, scopedContextKeyService: IContextKeyService): QuickPickInput<KernelQuickPickItem>[] {
		const quickPickItems: QuickPickInput<KernelQuickPickItem>[] = [];

		if (matchResult.selected) {
			const kernelItem = toKernelQuickPick(matchResult.selected, matchResult.selected);
			quickPickItems.push(kernelItem);
		}

		matchResult.suggestions.filter(kernel => kernel.id !== matchResult.selected?.id).map(kernel => toKernelQuickPick(kernel, matchResult.selected))
			.forEach(kernel => {
				quickPickItems.push(kernel);
			});

		const shouldAutoRun = quickPickItems.length === 0;

		if (quickPickItems.length > 0) {
			quickPickItems.push({
				type: 'separator'
			});
		}

		// select another kernel quick pick
		quickPickItems.push({
			id: 'selectAnother',
			label: localize('selectAnotherKernel.more', "Select Another Kernel..."),
			autoRun: shouldAutoRun
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

	protected override async _handleQuickPick(editor: IActiveNotebookEditor, pick: KernelQuickPickItem, items: KernelQuickPickItem[]): Promise<boolean> {
		if (pick.id === 'selectAnother') {
			return this.displaySelectAnotherQuickPick(editor, items.length === 1 && items[0] === pick);
		}

		return super._handleQuickPick(editor, pick, items);
	}

	private async displaySelectAnotherQuickPick(editor: IActiveNotebookEditor, kernelListEmpty: boolean): Promise<boolean> {
		const notebook: NotebookTextModel = editor.textModel;
		const disposables = new DisposableStore();
		const quickPick = disposables.add(this._quickInputService.createQuickPick<KernelQuickPickItem>({ useSeparators: true }));
		const quickPickItem = await new Promise<KernelQuickPickItem | IQuickInputButton | undefined>(resolve => {
			// select from kernel sources
			quickPick.title = kernelListEmpty ? localize('select', "Select Kernel") : localize('selectAnotherKernel', "Select Another Kernel");
			quickPick.placeholder = localize('selectKernel.placeholder', "Type to choose a kernel source");
			quickPick.busy = true;
			quickPick.buttons = [this._quickInputService.backButton];
			quickPick.show();

			disposables.add(quickPick.onDidTriggerButton(button => {
				if (button === this._quickInputService.backButton) {
					resolve(button);
				}
			}));
			disposables.add(quickPick.onDidTriggerItemButton(async (e) => {
				if (isKernelSourceQuickPickItem(e.item) && e.item.documentation !== undefined) {
					const uri = URI.isUri(e.item.documentation) ? URI.parse(e.item.documentation) : await this._commandService.executeCommand(e.item.documentation);
					void this._openerService.open(uri, { openExternal: true });
				}
			}));
			disposables.add(quickPick.onDidAccept(async () => {
				resolve(quickPick.selectedItems[0]);
			}));
			disposables.add(quickPick.onDidHide(() => {
				resolve(undefined);
			}));

			this._calculdateKernelSources(editor).then(quickPickItems => {
				quickPick.items = quickPickItems;
				if (quickPick.items.length > 0) {
					quickPick.busy = false;
				}
			});

			disposables.add(Event.debounce<void, void>(
				Event.any(
					this._notebookKernelService.onDidChangeSourceActions,
					this._notebookKernelService.onDidAddKernel,
					this._notebookKernelService.onDidRemoveKernel
				),
				(last, _current) => last,
				KERNEL_PICKER_UPDATE_DEBOUNCE
			)(async () => {
				quickPick.busy = true;
				const quickPickItems = await this._calculdateKernelSources(editor);
				quickPick.items = quickPickItems;
				quickPick.busy = false;
			}));
		});

		quickPick.hide();
		disposables.dispose();

		if (quickPickItem === this._quickInputService.backButton) {
			return this.showQuickPick(editor, undefined, true);
		}

		if (quickPickItem) {
			const selectedKernelPickItem = quickPickItem as KernelQuickPickItem;
			if (isKernelSourceQuickPickItem(selectedKernelPickItem)) {
				try {
					const selectedKernelId = await this._executeCommand<string>(notebook, selectedKernelPickItem.command);
					if (selectedKernelId) {
						const { all } = await this._getMatchingResult(notebook);
						const kernel = all.find(kernel => kernel.id === `ms-toolsai.jupyter/${selectedKernelId}`);
						if (kernel) {
							await this._selecteKernel(notebook, kernel);
							return true;
						}
						return true;
					} else {
						return this.displaySelectAnotherQuickPick(editor, false);
					}
				} catch (ex) {
					return false;
				}
			} else if (isKernelPick(selectedKernelPickItem)) {
				await this._selecteKernel(notebook, selectedKernelPickItem.kernel);
				return true;
			} else if (isGroupedKernelsPick(selectedKernelPickItem)) {
				await this._selectOneKernel(notebook, selectedKernelPickItem.label, selectedKernelPickItem.kernels);
				return true;
			} else if (isSourcePick(selectedKernelPickItem)) {
				// selected explicilty, it should trigger the execution?
				try {
					await selectedKernelPickItem.action.runAction();
					return true;
				} catch (ex) {
					return false;
				}
			} else if (isSearchMarketplacePick(selectedKernelPickItem)) {
				await this._showKernelExtension(
					this._extensionWorkbenchService,
					this._extensionService,
					editor.textModel.viewType,
					[]
				);
				return true;
			} else if (isInstallExtensionPick(selectedKernelPickItem)) {
				await this._showKernelExtension(
					this._extensionWorkbenchService,
					this._extensionService,
					editor.textModel.viewType,
					selectedKernelPickItem.extensionIds,
					this._productService.quality !== 'stable'
				);
				return this.displaySelectAnotherQuickPick(editor, false);
			}
		}

		return false;
	}

	private async _calculdateKernelSources(editor: IActiveNotebookEditor) {
		const notebook: NotebookTextModel = editor.textModel;

		const sourceActionCommands = this._notebookKernelService.getSourceActions(notebook, editor.scopedContextKeyService);
		const actions = await this._notebookKernelService.getKernelSourceActions2(notebook);
		const matchResult = this._getMatchingResult(notebook);

		if (sourceActionCommands.length === 0 && matchResult.all.length === 0 && actions.length === 0) {
			return await this._getKernelRecommendationsQuickPickItems(notebook, this._extensionWorkbenchService) ?? [];
		}

		const others = matchResult.all.filter(item => item.extension.value !== JUPYTER_EXTENSION_ID);
		const quickPickItems: QuickPickInput<KernelQuickPickItem>[] = [];

		// group controllers by extension
		for (const group of groupBy(others, (a, b) => a.extension.value === b.extension.value ? 0 : 1)) {
			const extension = this._extensionService.extensions.find(extension => extension.identifier.value === group[0].extension.value);
			const source = extension?.displayName ?? extension?.description ?? group[0].extension.value;
			if (group.length > 1) {
				quickPickItems.push({
					label: source,
					kernels: group
				});
			} else {
				quickPickItems.push({
					label: group[0].label,
					kernel: group[0]
				});
			}
		}

		const validActions = actions.filter(action => action.command);

		quickPickItems.push(...validActions.map(action => {
			const buttons = action.documentation ? [{
				iconClass: ThemeIcon.asClassName(Codicon.info),
				tooltip: localize('learnMoreTooltip', 'Learn More'),
			}] : [];
			return {
				id: typeof action.command! === 'string' ? action.command : action.command!.id,
				label: action.label,
				description: action.description,
				command: action.command,
				documentation: action.documentation,
				buttons
			};
		}));

		for (const sourceAction of sourceActionCommands) {
			const res: SourcePick = {
				action: sourceAction,
				picked: false,
				label: sourceAction.action.label,
				tooltip: sourceAction.action.tooltip
			};

			quickPickItems.push(res);
		}

		return quickPickItems;
	}

	private async _selectOneKernel(notebook: NotebookTextModel, source: string, kernels: INotebookKernel[]) {
		const quickPickItems: QuickPickInput<KernelPick>[] = kernels.map(kernel => toKernelQuickPick(kernel, undefined));
		const localDisposableStore = new DisposableStore();
		const quickPick = localDisposableStore.add(this._quickInputService.createQuickPick<KernelQuickPickItem>({ useSeparators: true }));
		quickPick.items = quickPickItems;
		quickPick.canSelectMany = false;

		quickPick.title = localize('selectKernelFromExtension', "Select Kernel from {0}", source);

		localDisposableStore.add(quickPick.onDidAccept(async () => {
			if (quickPick.selectedItems && quickPick.selectedItems.length > 0 && isKernelPick(quickPick.selectedItems[0])) {
				await this._selecteKernel(notebook, quickPick.selectedItems[0].kernel);
			}

			quickPick.hide();
			quickPick.dispose();
		}));

		localDisposableStore.add(quickPick.onDidHide(() => {
			localDisposableStore.dispose();
		}));

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

	static updateKernelStatusAction(notebook: NotebookTextModel, action: IAction, notebookKernelService: INotebookKernelService, notebookKernelHistoryService: INotebookKernelHistoryService) {
		const detectionTasks = notebookKernelService.getKernelDetectionTasks(notebook);
		if (detectionTasks.length) {
			const info = notebookKernelService.getMatchingKernel(notebook);
			action.enabled = true;
			action.class = ThemeIcon.asClassName(ThemeIcon.modify(executingStateIcon, 'spin'));

			if (info.selected) {
				action.label = info.selected.label;
				const kernelInfo = info.selected.description ?? info.selected.detail;
				action.tooltip = kernelInfo
					? localize('kernels.selectedKernelAndKernelDetectionRunning', "Selected Kernel: {0} (Kernel Detection Tasks Running)", kernelInfo)
					: localize('kernels.detecting', "Detecting Kernels");
			} else {
				action.label = localize('kernels.detecting', "Detecting Kernels");
			}
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

		const { selected } = notebookKernelHistoryService.getKernels(notebook);

		if (selected) {
			action.label = selected.label;
			action.class = ThemeIcon.asClassName(selectKernelIcon);
			action.tooltip = selected.description ?? selected.detail ?? '';
		} else {
			action.label = localize('select', "Select Kernel");
			action.class = ThemeIcon.asClassName(selectKernelIcon);
			action.tooltip = '';
		}
	}

	static async resolveKernel(notebook: INotebookTextModel, notebookKernelService: INotebookKernelService, notebookKernelHistoryService: INotebookKernelHistoryService, commandService: ICommandService): Promise<INotebookKernel | undefined> {
		const alreadySelected = notebookKernelHistoryService.getKernels(notebook);

		if (alreadySelected.selected) {
			return alreadySelected.selected;
		}

		await commandService.executeCommand(SELECT_KERNEL_ID);
		const { selected } = notebookKernelHistoryService.getKernels(notebook);
		return selected;
	}
}
