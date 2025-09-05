/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/scm.css';
import { $, append, h, reset } from '../../../../base/browser/dom.js';
import { IHoverAction, IHoverOptions } from '../../../../base/browser/ui/hover/hover.js';
import { IHoverDelegate } from '../../../../base/browser/ui/hover/hoverDelegate.js';
import { IconLabel } from '../../../../base/browser/ui/iconLabel/iconLabel.js';
import { IIdentityProvider, IListVirtualDelegate } from '../../../../base/browser/ui/list/list.js';
import { LabelFuzzyScore } from '../../../../base/browser/ui/tree/abstractTree.js';
import { IAsyncDataSource, ITreeContextMenuEvent, ITreeDragAndDrop, ITreeElementRenderDetails, ITreeNode } from '../../../../base/browser/ui/tree/tree.js';
import { createMatches, FuzzyScore, IMatch } from '../../../../base/common/filters.js';
import { combinedDisposable, Disposable, DisposableStore, IDisposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, autorunWithStore, derived, IObservable, observableValue, waitForState, constObservable, latestChangedValue, observableFromEvent, runOnChange, observableSignal, ISettableObservable } from '../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { localize } from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr, IContextKey, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IHoverService, WorkbenchHoverDelegate } from '../../../../platform/hover/browser/hover.js';
import { IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { IOpenEvent, WorkbenchCompressibleAsyncDataTree } from '../../../../platform/list/browser/listService.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { asCssVariable, ColorIdentifier, foreground } from '../../../../platform/theme/common/colorRegistry.js';
import { IFileIconTheme, IThemeService } from '../../../../platform/theme/common/themeService.js';
import { IViewPaneOptions, ViewAction, ViewPane, ViewPaneShowActions } from '../../../browser/parts/views/viewPane.js';
import { IViewDescriptorService, ViewContainerLocation } from '../../../common/views.js';
import { renderSCMHistoryItemGraph, toISCMHistoryItemViewModelArray, SWIMLANE_WIDTH, renderSCMHistoryGraphPlaceholder, historyItemHoverLabelForeground, historyItemHoverDefaultLabelBackground, getHistoryItemIndex } from './scmHistory.js';
import { getHistoryItemEditorTitle, getHistoryItemHoverContent, getProviderKey, isSCMHistoryItemChangeNode, isSCMHistoryItemChangeViewModelTreeElement, isSCMHistoryItemLoadMoreTreeElement, isSCMHistoryItemViewModelTreeElement, isSCMRepository } from './util.js';
import { ISCMHistoryItem, ISCMHistoryItemChange, ISCMHistoryItemGraphNode, ISCMHistoryItemRef, ISCMHistoryItemViewModel, ISCMHistoryProvider, SCMHistoryItemChangeViewModelTreeElement, SCMHistoryItemLoadMoreTreeElement, SCMHistoryItemViewModelTreeElement } from '../common/history.js';
import { HISTORY_VIEW_PANE_ID, ISCMProvider, ISCMRepository, ISCMService, ISCMViewService, ViewMode } from '../common/scm.js';
import { IListAccessibilityProvider } from '../../../../base/browser/ui/list/listWidget.js';
import { stripIcons } from '../../../../base/common/iconLabels.js';
import { IWorkbenchLayoutService, Position } from '../../../services/layout/browser/layoutService.js';
import { HoverPosition } from '../../../../base/browser/ui/hover/hoverWidget.js';
import { Action2, IMenuService, isIMenuItem, MenuId, MenuRegistry, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { Sequencer, Throttler } from '../../../../base/common/async.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { ActionRunner, IAction, IActionRunner } from '../../../../base/common/actions.js';
import { delta, groupBy } from '../../../../base/common/arrays.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { IProgressService } from '../../../../platform/progress/common/progress.js';
import { ContextKeys } from './scmViewPane.js';
import { IActionViewItem } from '../../../../base/browser/ui/actionbar/actionbar.js';
import { IDropdownMenuActionViewItemOptions } from '../../../../base/browser/ui/dropdown/dropdownActionViewItem.js';
import { ActionViewItem } from '../../../../base/browser/ui/actionbar/actionViewItems.js';
import { IQuickInputService, IQuickPickItem, IQuickPickSeparator } from '../../../../platform/quickinput/common/quickInput.js';
import { Event } from '../../../../base/common/event.js';
import { Iterable } from '../../../../base/common/iterator.js';
import { clamp } from '../../../../base/common/numbers.js';
import { observableConfigValue } from '../../../../platform/observable/common/platformObservableUtils.js';
import { compare } from '../../../../base/common/strings.js';
import { IClipboardService } from '../../../../platform/clipboard/common/clipboardService.js';
import { getDefaultHoverDelegate } from '../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IExtensionService } from '../../../services/extensions/common/extensions.js';
import { groupBy as groupBy2 } from '../../../../base/common/collections.js';
import { getActionBarActions, getFlatContextMenuActions } from '../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { IResourceLabel, ResourceLabels } from '../../../browser/labels.js';
import { FileKind } from '../../../../platform/files/common/files.js';
import { WorkbenchToolBar } from '../../../../platform/actions/browser/toolbar.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { basename } from '../../../../base/common/path.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { ScmHistoryItemResolver } from '../../multiDiffEditor/browser/scmMultiDiffSourceResolver.js';
import { IResourceNode, ResourceTree } from '../../../../base/common/resourceTree.js';
import { URI } from '../../../../base/common/uri.js';
import { ITreeCompressionDelegate } from '../../../../base/browser/ui/tree/asyncDataTree.js';
import { ICompressibleKeyboardNavigationLabelProvider, ICompressibleTreeRenderer } from '../../../../base/browser/ui/tree/objectTree.js';
import { ICompressedTreeNode } from '../../../../base/browser/ui/tree/compressedObjectTreeModel.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { IDragAndDropData } from '../../../../base/browser/dnd.js';
import { ElementsDragAndDropData, ListViewTargetSector } from '../../../../base/browser/ui/list/listView.js';
import { CodeDataTransfers } from '../../../../platform/dnd/browser/dnd.js';
import { SCMHistoryItemTransferData } from './scmHistoryChatContext.js';

const PICK_REPOSITORY_ACTION_ID = 'workbench.scm.action.graph.pickRepository';
const PICK_HISTORY_ITEM_REFS_ACTION_ID = 'workbench.scm.action.graph.pickHistoryItemRefs';

type TreeElement = SCMHistoryItemViewModelTreeElement | SCMHistoryItemLoadMoreTreeElement | SCMHistoryItemChangeViewModelTreeElement | IResourceNode<SCMHistoryItemChangeViewModelTreeElement, SCMHistoryItemViewModelTreeElement>;

class SCMRepositoryActionViewItem extends ActionViewItem {
	constructor(private readonly _repository: ISCMRepository, action: IAction, options?: IDropdownMenuActionViewItemOptions) {
		super(null, action, { ...options, icon: false, label: true });
	}

	protected override updateLabel(): void {
		if (this.options.label && this.label) {
			this.label.classList.add('scm-graph-repository-picker');

			const icon = $('.icon');
			const iconClassNameArray = ThemeIcon.isThemeIcon(this._repository.provider.iconPath)
				? ThemeIcon.asClassNameArray(this._repository.provider.iconPath)
				: ThemeIcon.asClassNameArray(Codicon.repo);
			icon.classList.add(...iconClassNameArray);

			const name = $('.name');
			name.textContent = this._repository.provider.name;


			reset(this.label, icon, name);
		}
	}

	protected override getTooltip(): string | undefined {
		return this._repository.provider.name;
	}
}

class SCMHistoryItemRefsActionViewItem extends ActionViewItem {
	constructor(
		private readonly _repository: ISCMRepository,
		private readonly _historyItemsFilter: 'all' | 'auto' | ISCMHistoryItemRef[],
		action: IAction,
		options?: IDropdownMenuActionViewItemOptions
	) {
		super(null, action, { ...options, icon: false, label: true });
	}

	protected override updateLabel(): void {
		if (this.options.label && this.label) {
			this.label.classList.add('scm-graph-history-item-picker');

			const icon = $('.icon');
			icon.classList.add(...ThemeIcon.asClassNameArray(Codicon.gitBranch));

			const name = $('.name');
			if (this._historyItemsFilter === 'all') {
				name.textContent = localize('all', "All");
			} else if (this._historyItemsFilter === 'auto') {
				name.textContent = localize('auto', "Auto");
			} else if (this._historyItemsFilter.length === 1) {
				name.textContent = this._historyItemsFilter[0].name;
			} else {
				name.textContent = localize('items', "{0} Items", this._historyItemsFilter.length);
			}

			reset(this.label, icon, name);
		}
	}

	protected override getTooltip(): string | undefined {
		if (this._historyItemsFilter === 'all') {
			return localize('allHistoryItemRefs', "All history item references");
		} else if (this._historyItemsFilter === 'auto') {
			const historyProvider = this._repository.provider.historyProvider.get();

			return [
				historyProvider?.historyItemRef.get()?.name,
				historyProvider?.historyItemRemoteRef.get()?.name,
				historyProvider?.historyItemBaseRef.get()?.name
			].filter(ref => !!ref).join(', ');
		} else if (this._historyItemsFilter.length === 1) {
			return this._historyItemsFilter[0].name;
		} else {
			return this._historyItemsFilter.map(ref => ref.name).join(', ');
		}
	}
}

registerAction2(class extends ViewAction<SCMHistoryViewPane> {
	constructor() {
		super({
			id: PICK_REPOSITORY_ACTION_ID,
			title: localize('repositoryPicker', "Repository Picker"),
			viewId: HISTORY_VIEW_PANE_ID,
			f1: false,
			menu: {
				id: MenuId.SCMHistoryTitle,
				when: ContextKeyExpr.and(ContextKeyExpr.has('scm.providerCount'), ContextKeyExpr.greater('scm.providerCount', 1)),
				group: 'navigation',
				order: 0
			}
		});
	}

	async runInView(_: ServicesAccessor, view: SCMHistoryViewPane): Promise<void> {
		view.pickRepository();
	}
});

registerAction2(class extends ViewAction<SCMHistoryViewPane> {
	constructor() {
		super({
			id: PICK_HISTORY_ITEM_REFS_ACTION_ID,
			title: localize('referencePicker', "History Item Reference Picker"),
			icon: Codicon.gitBranch,
			viewId: HISTORY_VIEW_PANE_ID,
			precondition: ContextKeys.SCMHistoryItemCount.notEqualsTo(0),
			f1: false,
			menu: {
				id: MenuId.SCMHistoryTitle,
				group: 'navigation',
				order: 1
			}
		});
	}

	async runInView(_: ServicesAccessor, view: SCMHistoryViewPane): Promise<void> {
		view.pickHistoryItemRef();
	}
});

registerAction2(class extends ViewAction<SCMHistoryViewPane> {
	constructor() {
		super({
			id: 'workbench.scm.action.graph.revealCurrentHistoryItem',
			title: localize('goToCurrentHistoryItem', "Go to Current History Item"),
			icon: Codicon.target,
			viewId: HISTORY_VIEW_PANE_ID,
			precondition: ContextKeyExpr.and(
				ContextKeys.SCMHistoryItemCount.notEqualsTo(0),
				ContextKeys.SCMCurrentHistoryItemRefInFilter.isEqualTo(true)),
			f1: false,
			menu: {
				id: MenuId.SCMHistoryTitle,
				group: 'navigation',
				order: 2
			}
		});
	}

	async runInView(_: ServicesAccessor, view: SCMHistoryViewPane): Promise<void> {
		view.revealCurrentHistoryItem();
	}
});

registerAction2(class extends ViewAction<SCMHistoryViewPane> {
	constructor() {
		super({
			id: 'workbench.scm.action.graph.refresh',
			title: localize('refreshGraph', "Refresh"),
			viewId: HISTORY_VIEW_PANE_ID,
			f1: false,
			icon: Codicon.refresh,
			menu: {
				id: MenuId.SCMHistoryTitle,
				group: 'navigation',
				order: 1000
			}
		});
	}

	async runInView(_: ServicesAccessor, view: SCMHistoryViewPane): Promise<void> {
		view.refresh();
	}
});

registerAction2(class extends ViewAction<SCMHistoryViewPane> {
	constructor() {
		super({
			id: 'workbench.scm.action.graph.setListViewMode',
			title: localize('setListViewMode', "View as List"),
			viewId: HISTORY_VIEW_PANE_ID,
			toggled: ContextKeys.SCMHistoryViewMode.isEqualTo(ViewMode.List),
			menu: { id: MenuId.SCMHistoryTitle, group: '9_viewmode', order: 1 },
			f1: false
		});
	}

	async runInView(_: ServicesAccessor, view: SCMHistoryViewPane): Promise<void> {
		view.setViewMode(ViewMode.List);
	}
});

registerAction2(class extends ViewAction<SCMHistoryViewPane> {
	constructor() {
		super({
			id: 'workbench.scm.action.graph.setTreeViewMode',
			title: localize('setTreeViewMode', "View as Tree"),
			viewId: HISTORY_VIEW_PANE_ID,
			toggled: ContextKeys.SCMHistoryViewMode.isEqualTo(ViewMode.Tree),
			menu: { id: MenuId.SCMHistoryTitle, group: '9_viewmode', order: 2 },
			f1: false
		});
	}

	async runInView(_: ServicesAccessor, view: SCMHistoryViewPane): Promise<void> {
		view.setViewMode(ViewMode.Tree);
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'workbench.scm.action.graph.viewChanges',
			title: localize('openChanges', "Open Changes"),
			icon: Codicon.diffMultiple,
			f1: false,
			menu: [
				{
					id: MenuId.SCMHistoryItemContext,
					when: ContextKeyExpr.equals('config.multiDiffEditor.experimental.enabled', true),
					group: 'inline',
					order: 1
				},
				{
					id: MenuId.SCMHistoryItemContext,
					when: ContextKeyExpr.equals('config.multiDiffEditor.experimental.enabled', true),
					group: '0_view',
					order: 1
				}
			]
		});
	}

	override async run(accessor: ServicesAccessor, provider: ISCMProvider, ...historyItems: ISCMHistoryItem[]) {
		const commandService = accessor.get(ICommandService);

		if (!provider || historyItems.length === 0) {
			return;
		}

		const historyItem = historyItems[0];
		const historyItemLast = historyItems[historyItems.length - 1];
		const historyProvider = provider.historyProvider.get();

		if (historyItems.length > 1) {
			const ancestor = await historyProvider?.resolveHistoryItemRefsCommonAncestor([historyItem.id, historyItemLast.id]);
			if (!ancestor || (ancestor !== historyItem.id && ancestor !== historyItemLast.id)) {
				return;
			}
		}

		const title = historyItems.length === 1 ?
			getHistoryItemEditorTitle(historyItem) :
			localize('historyItemChangesEditorTitle', "All Changes ({0} ↔ {1})", historyItemLast.displayId ?? historyItemLast.id, historyItem.displayId ?? historyItem.id);

		const multiDiffSourceUri = ScmHistoryItemResolver.getMultiDiffSourceUri(provider, historyItem);
		commandService.executeCommand('_workbench.openMultiDiffEditor', { title, multiDiffSourceUri });
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'workbench.scm.action.graph.openFile',
			title: localize('openFile', "Open File"),
			icon: Codicon.goToFile,
			f1: false,
			menu: [
				{
					id: MenuId.SCMHistoryItemChangeContext,
					group: 'inline',
					order: 1
				},
			]
		});
	}

	override async run(accessor: ServicesAccessor, historyItem: ISCMHistoryItem, historyItemChange: ISCMHistoryItemChange) {
		const editorService = accessor.get(IEditorService);

		if (!historyItem || !historyItemChange.modifiedUri) {
			return;
		}

		await editorService.openEditor({
			resource: historyItemChange.modifiedUri,
			label: `${basename(historyItemChange.modifiedUri.fsPath)} (${historyItem.displayId ?? historyItem.id})`,
		});
	}
});

class ListDelegate implements IListVirtualDelegate<TreeElement> {

	getHeight(): number {
		return 22;
	}

	getTemplateId(element: TreeElement): string {
		if (isSCMHistoryItemViewModelTreeElement(element)) {
			return HistoryItemRenderer.TEMPLATE_ID;
		} else if (isSCMHistoryItemChangeViewModelTreeElement(element) || isSCMHistoryItemChangeNode(element)) {
			return HistoryItemChangeRenderer.TEMPLATE_ID;
		} else if (isSCMHistoryItemLoadMoreTreeElement(element)) {
			return HistoryItemLoadMoreRenderer.TEMPLATE_ID;
		} else {
			throw new Error('Unknown element');
		}
	}
}

interface HistoryItemTemplate {
	readonly element: HTMLElement;
	readonly label: IconLabel;
	readonly graphContainer: HTMLElement;
	readonly actionBar: WorkbenchToolBar;
	readonly labelContainer: HTMLElement;
	readonly elementDisposables: DisposableStore;
	readonly disposables: IDisposable;
}

class HistoryItemRenderer implements ICompressibleTreeRenderer<SCMHistoryItemViewModelTreeElement, LabelFuzzyScore, HistoryItemTemplate> {

	static readonly TEMPLATE_ID = 'history-item';
	get templateId(): string { return HistoryItemRenderer.TEMPLATE_ID; }

	private readonly _badgesConfig: IObservable<'all' | 'filter'>;

	constructor(
		private readonly hoverDelegate: IHoverDelegate,
		@IClipboardService private readonly _clipboardService: IClipboardService,
		@ICommandService private readonly _commandService: ICommandService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
		@IContextMenuService private readonly _contextMenuService: IContextMenuService,
		@IHoverService private readonly _hoverService: IHoverService,
		@IKeybindingService private readonly _keybindingService: IKeybindingService,
		@IMenuService private readonly _menuService: IMenuService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@IThemeService private readonly _themeService: IThemeService
	) {
		this._badgesConfig = observableConfigValue<'all' | 'filter'>('scm.graph.badges', 'filter', this._configurationService);
	}

	renderTemplate(container: HTMLElement): HistoryItemTemplate {
		// hack
		(container.parentElement!.parentElement!.querySelector('.monaco-tl-twistie')! as HTMLElement).classList.add('force-no-twistie');

		const element = append(container, $('.history-item'));
		const graphContainer = append(element, $('.graph-container'));
		const iconLabel = new IconLabel(element, {
			supportIcons: true, supportHighlights: true, supportDescriptionHighlights: true
		});

		const labelContainer = append(element, $('.label-container'));

		const actionsContainer = append(element, $('.actions'));
		const actionBar = new WorkbenchToolBar(actionsContainer, undefined, this._menuService, this._contextKeyService, this._contextMenuService, this._keybindingService, this._commandService, this._telemetryService);

		return { element, graphContainer, label: iconLabel, labelContainer, actionBar, elementDisposables: new DisposableStore(), disposables: combinedDisposable(iconLabel, actionBar) };
	}

	renderElement(node: ITreeNode<SCMHistoryItemViewModelTreeElement, LabelFuzzyScore>, index: number, templateData: HistoryItemTemplate): void {
		const provider = node.element.repository.provider;
		const historyItemViewModel = node.element.historyItemViewModel;
		const historyItem = historyItemViewModel.historyItem;

		const historyItemHover = this._hoverService.setupManagedHover(this.hoverDelegate, templateData.element, getHistoryItemHoverContent(this._themeService, historyItem), {
			actions: this._getHoverActions(provider, historyItem),
		});
		templateData.elementDisposables.add(historyItemHover);

		templateData.graphContainer.textContent = '';
		templateData.graphContainer.classList.toggle('current', historyItemViewModel.isCurrent);
		templateData.graphContainer.appendChild(renderSCMHistoryItemGraph(historyItemViewModel));

		const historyItemRef = provider.historyProvider.get()?.historyItemRef?.get();
		const extraClasses = historyItemRef?.revision === historyItem.id ? ['history-item-current'] : [];
		const [matches, descriptionMatches] = this._processMatches(historyItemViewModel, node.filterData);
		templateData.label.setLabel(historyItem.subject, historyItem.author, { matches, descriptionMatches, extraClasses });

		this._renderBadges(historyItem, templateData);

		const actions = this._menuService.getMenuActions(
			MenuId.SCMHistoryItemContext,
			this._contextKeyService,
			{ arg: provider, shouldForwardArgs: true });
		templateData.actionBar.context = historyItem;
		templateData.actionBar.setActions(getActionBarActions(actions, 'inline').primary);
	}

	renderCompressedElements(node: ITreeNode<ICompressedTreeNode<SCMHistoryItemViewModelTreeElement>, LabelFuzzyScore>, index: number, templateData: HistoryItemTemplate): void {
		throw new Error('Should never happen since node is incompressible');
	}

	private _renderBadges(historyItem: ISCMHistoryItem, templateData: HistoryItemTemplate): void {
		templateData.elementDisposables.add(autorun(reader => {
			const labelConfig = this._badgesConfig.read(reader);

			templateData.labelContainer.textContent = '';

			const references = historyItem.references ?
				historyItem.references.slice(0) : [];

			// If the first reference is colored, we render it
			// separately since we have to show the description
			// for the first colored reference.
			if (references.length > 0 && references[0].color) {
				this._renderBadge([references[0]], true, templateData);

				// Remove the rendered reference from the collection
				references.splice(0, 1);
			}

			// Group history item references by color
			const historyItemRefsByColor = groupBy2(references, ref => ref.color ? ref.color : '');

			for (const [key, historyItemRefs] of Object.entries(historyItemRefsByColor)) {
				// If needed skip badges without a color
				if (key === '' && labelConfig !== 'all') {
					continue;
				}

				// Group history item references by icon
				const historyItemRefByIconId = groupBy2(historyItemRefs, ref => ThemeIcon.isThemeIcon(ref.icon) ? ref.icon.id : '');
				for (const [key, historyItemRefs] of Object.entries(historyItemRefByIconId)) {
					// Skip badges without an icon
					if (key === '') {
						continue;
					}

					this._renderBadge(historyItemRefs, false, templateData);
				}
			}
		}));
	}

	private _renderBadge(historyItemRefs: ISCMHistoryItemRef[], showDescription: boolean, templateData: HistoryItemTemplate): void {
		if (historyItemRefs.length === 0 || !ThemeIcon.isThemeIcon(historyItemRefs[0].icon)) {
			return;
		}

		const elements = h('div.label', {
			style: {
				color: historyItemRefs[0].color ? asCssVariable(historyItemHoverLabelForeground) : asCssVariable(foreground),
				backgroundColor: historyItemRefs[0].color ? asCssVariable(historyItemRefs[0].color) : asCssVariable(historyItemHoverDefaultLabelBackground)
			}
		}, [
			h('div.count@count', {
				style: {
					display: historyItemRefs.length > 1 ? '' : 'none'
				}
			}),
			h('div.icon@icon'),
			h('div.description@description', {
				style: {
					display: showDescription ? '' : 'none'
				}
			})
		]);

		elements.count.textContent = historyItemRefs.length > 1 ? historyItemRefs.length.toString() : '';
		elements.icon.classList.add(...ThemeIcon.asClassNameArray(historyItemRefs[0].icon));
		elements.description.textContent = showDescription ? historyItemRefs[0].name : '';

		append(templateData.labelContainer, elements.root);
	}

	private _getHoverActions(provider: ISCMProvider, historyItem: ISCMHistoryItem): IHoverAction[] {
		const actions = this._menuService.getMenuActions(MenuId.SCMHistoryItemHover, this._contextKeyService, {
			arg: provider,
			shouldForwardArgs: true
		}).flatMap(item => item[1]);

		return [
			{
				commandId: 'workbench.scm.action.graph.copyHistoryItemId',
				iconClass: 'codicon.codicon-copy',
				label: historyItem.displayId ?? historyItem.id,
				run: () => this._clipboardService.writeText(historyItem.id)
			},
			...actions.map(action => {
				const iconClass = ThemeIcon.isThemeIcon(action.item.icon)
					? ThemeIcon.asClassNameArray(action.item.icon).join('.')
					: undefined;

				return {
					commandId: action.id,
					label: action.label,
					iconClass,
					run: () => action.run(historyItem)
				};
			}) satisfies IHoverAction[]
		];
	}

	private _processMatches(historyItemViewModel: ISCMHistoryItemViewModel, filterData: LabelFuzzyScore | undefined): [IMatch[] | undefined, IMatch[] | undefined] {
		if (!filterData) {
			return [undefined, undefined];
		}

		return [
			historyItemViewModel.historyItem.message === filterData.label ? createMatches(filterData.score) : undefined,
			historyItemViewModel.historyItem.author === filterData.label ? createMatches(filterData.score) : undefined
		];
	}

	disposeElement(element: ITreeNode<SCMHistoryItemViewModelTreeElement, LabelFuzzyScore>, index: number, templateData: HistoryItemTemplate): void {
		templateData.elementDisposables.clear();
	}

	disposeTemplate(templateData: HistoryItemTemplate): void {
		templateData.elementDisposables.dispose();
		templateData.disposables.dispose();
	}
}

interface HistoryItemChangeTemplate {
	readonly rowElement: HTMLElement;
	readonly element: HTMLElement;
	readonly graphPlaceholder: HTMLElement;
	readonly resourceLabel: IResourceLabel;
	readonly actionBar: WorkbenchToolBar;
	readonly disposables: IDisposable;
}

class HistoryItemChangeRenderer implements ICompressibleTreeRenderer<SCMHistoryItemChangeViewModelTreeElement | IResourceNode<SCMHistoryItemChangeViewModelTreeElement, SCMHistoryItemViewModelTreeElement>, void, HistoryItemChangeTemplate> {
	static readonly TEMPLATE_ID = 'history-item-change';
	get templateId(): string { return HistoryItemChangeRenderer.TEMPLATE_ID; }

	constructor(
		private readonly viewMode: () => ViewMode,
		private readonly resourceLabels: ResourceLabels,
		@ICommandService private readonly _commandService: ICommandService,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
		@IContextMenuService private readonly _contextMenuService: IContextMenuService,
		@IKeybindingService private readonly _keybindingService: IKeybindingService,
		@ILabelService private readonly _labelService: ILabelService,
		@IMenuService private readonly _menuService: IMenuService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
	) { }

	renderTemplate(container: HTMLElement): HistoryItemChangeTemplate {
		const rowElement = container.parentElement! as HTMLElement;
		const element = append(container, $('.history-item-change'));
		const graphPlaceholder = append(element, $('.graph-placeholder'));

		const labelContainer = append(element, $('.label-container'));
		const resourceLabel = this.resourceLabels.create(labelContainer, {
			supportDescriptionHighlights: true, supportHighlights: true
		});

		const disposables = new DisposableStore();
		const actionsContainer = append(resourceLabel.element, $('.actions'));
		const actionBar = new WorkbenchToolBar(actionsContainer, undefined, this._menuService, this._contextKeyService, this._contextMenuService, this._keybindingService, this._commandService, this._telemetryService);
		disposables.add(actionBar);

		return { rowElement, element, graphPlaceholder, resourceLabel, actionBar, disposables };
	}

	renderElement(elementOrNode: ITreeNode<SCMHistoryItemChangeViewModelTreeElement | IResourceNode<SCMHistoryItemChangeViewModelTreeElement, SCMHistoryItemViewModelTreeElement>, void>, index: number, templateData: HistoryItemChangeTemplate, details?: ITreeElementRenderDetails | undefined): void {
		const historyItemViewModel = isSCMHistoryItemChangeViewModelTreeElement(elementOrNode.element) ? elementOrNode.element.historyItemViewModel : elementOrNode.element.context.historyItemViewModel;
		const historyItemChange = isSCMHistoryItemChangeViewModelTreeElement(elementOrNode.element) ? elementOrNode.element.historyItemChange : elementOrNode.element;
		const graphColumns = isSCMHistoryItemChangeViewModelTreeElement(elementOrNode.element) ? elementOrNode.element.graphColumns : elementOrNode.element.context.historyItemViewModel.outputSwimlanes;

		this._renderGraphPlaceholder(templateData, historyItemViewModel, graphColumns);

		const hidePath = this.viewMode() === ViewMode.Tree;
		const fileKind = isSCMHistoryItemChangeViewModelTreeElement(elementOrNode.element) ? FileKind.FILE : FileKind.FOLDER;
		templateData.resourceLabel.setFile(historyItemChange.uri, { fileDecorations: { colors: false, badges: true }, fileKind, hidePath });

		if (fileKind === FileKind.FILE) {
			const actions = this._menuService.getMenuActions(
				MenuId.SCMHistoryItemChangeContext,
				this._contextKeyService,
				{ arg: historyItemViewModel.historyItem, shouldForwardArgs: true });

			templateData.actionBar.context = historyItemChange;
			templateData.actionBar.setActions(getActionBarActions(actions, 'inline').primary);
		} else {
			templateData.actionBar.context = undefined;
			templateData.actionBar.setActions([]);
		}
	}

	renderCompressedElements(node: ITreeNode<ICompressedTreeNode<SCMHistoryItemChangeViewModelTreeElement | IResourceNode<SCMHistoryItemChangeViewModelTreeElement, SCMHistoryItemViewModelTreeElement>>, void>, index: number, templateData: HistoryItemChangeTemplate, details?: ITreeElementRenderDetails | undefined): void {
		const compressed = node.element as ICompressedTreeNode<IResourceNode<SCMHistoryItemChangeViewModelTreeElement, SCMHistoryItemViewModelTreeElement>>;
		const historyItemViewModel = compressed.elements[0].context.historyItemViewModel;
		const graphColumns = compressed.elements[0].context.historyItemViewModel.outputSwimlanes;

		this._renderGraphPlaceholder(templateData, historyItemViewModel, graphColumns);

		const label = compressed.elements.map(e => e.name);
		const folder = compressed.elements[compressed.elements.length - 1];
		templateData.resourceLabel.setResource({ resource: folder.uri, name: label }, {
			fileDecorations: { colors: false, badges: true },
			fileKind: FileKind.FOLDER,
			separator: this._labelService.getSeparator(folder.uri.scheme)
		});

		templateData.actionBar.context = undefined;
		templateData.actionBar.setActions([]);
	}

	private _renderGraphPlaceholder(templateData: HistoryItemChangeTemplate, historyItemViewModel: ISCMHistoryItemViewModel, graphColumns: ISCMHistoryItemGraphNode[]): void {
		const graphPlaceholderSvgWidth = SWIMLANE_WIDTH * (graphColumns.length + 1);
		const marginLeft = graphPlaceholderSvgWidth - 16 /* .monaco-tl-indent left */;
		templateData.rowElement.style.marginLeft = `${marginLeft}px`;

		templateData.graphPlaceholder.textContent = '';
		templateData.graphPlaceholder.style.left = `${-1 * marginLeft}px`;
		templateData.graphPlaceholder.style.width = `${graphPlaceholderSvgWidth}px`;
		templateData.graphPlaceholder.appendChild(renderSCMHistoryGraphPlaceholder(graphColumns, getHistoryItemIndex(historyItemViewModel)));
	}

	disposeTemplate(templateData: HistoryItemChangeTemplate): void {
		templateData.disposables.dispose();
	}
}

interface LoadMoreTemplate {
	readonly element: HTMLElement;
	readonly graphPlaceholder: HTMLElement;
	readonly historyItemPlaceholderContainer: HTMLElement;
	readonly historyItemPlaceholderLabel: IconLabel;
	readonly elementDisposables: DisposableStore;
	readonly disposables: IDisposable;
}

class HistoryItemLoadMoreRenderer implements ICompressibleTreeRenderer<SCMHistoryItemLoadMoreTreeElement, void, LoadMoreTemplate> {

	static readonly TEMPLATE_ID = 'historyItemLoadMore';
	get templateId(): string { return HistoryItemLoadMoreRenderer.TEMPLATE_ID; }

	constructor(
		private readonly _isLoadingMore: IObservable<boolean>,
		private readonly _loadMoreCallback: () => void,
		@IConfigurationService private readonly _configurationService: IConfigurationService
	) { }

	renderTemplate(container: HTMLElement): LoadMoreTemplate {
		// hack
		(container.parentElement!.parentElement!.querySelector('.monaco-tl-twistie')! as HTMLElement).classList.add('force-no-twistie');

		const element = append(container, $('.history-item-load-more'));
		const graphPlaceholder = append(element, $('.graph-placeholder'));
		const historyItemPlaceholderContainer = append(element, $('.history-item-placeholder'));
		const historyItemPlaceholderLabel = new IconLabel(historyItemPlaceholderContainer, { supportIcons: true });

		return { element, graphPlaceholder, historyItemPlaceholderContainer, historyItemPlaceholderLabel, elementDisposables: new DisposableStore(), disposables: historyItemPlaceholderLabel };
	}

	renderElement(element: ITreeNode<SCMHistoryItemLoadMoreTreeElement, void>, index: number, templateData: LoadMoreTemplate): void {
		templateData.graphPlaceholder.textContent = '';
		templateData.graphPlaceholder.style.width = `${SWIMLANE_WIDTH * (element.element.graphColumns.length + 1)}px`;
		templateData.graphPlaceholder.appendChild(renderSCMHistoryGraphPlaceholder(element.element.graphColumns));

		const pageOnScroll = this._configurationService.getValue<boolean>('scm.graph.pageOnScroll') === true;
		templateData.historyItemPlaceholderContainer.classList.toggle('shimmer', pageOnScroll);

		if (pageOnScroll) {
			templateData.historyItemPlaceholderLabel.setLabel('');
			this._loadMoreCallback();
		} else {
			templateData.elementDisposables.add(autorun(reader => {
				const isLoadingMore = this._isLoadingMore.read(reader);
				const icon = `$(${isLoadingMore ? 'loading~spin' : 'fold-down'})`;

				templateData.historyItemPlaceholderLabel.setLabel(localize('loadMore', "{0} Load More...", icon));
			}));
		}
	}

	renderCompressedElements(node: ITreeNode<ICompressedTreeNode<SCMHistoryItemLoadMoreTreeElement>, void>, index: number, templateData: LoadMoreTemplate): void {
		throw new Error('Should never happen since node is incompressible');
	}

	disposeElement(element: ITreeNode<SCMHistoryItemLoadMoreTreeElement, void>, index: number, templateData: LoadMoreTemplate): void {
		templateData.elementDisposables.clear();
	}

	disposeTemplate(templateData: LoadMoreTemplate): void {
		templateData.elementDisposables.dispose();
		templateData.disposables.dispose();
	}
}

class HistoryItemHoverDelegate extends WorkbenchHoverDelegate {
	constructor(
		private readonly _viewContainerLocation: ViewContainerLocation | null,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
		@IConfigurationService configurationService: IConfigurationService,
		@IHoverService hoverService: IHoverService,

	) {
		super(_viewContainerLocation === ViewContainerLocation.Panel ? 'mouse' : 'element', {
			instantHover: _viewContainerLocation !== ViewContainerLocation.Panel
		}, () => this.getHoverOptions(), configurationService, hoverService);
	}

	private getHoverOptions(): Partial<IHoverOptions> {
		const sideBarPosition = this.layoutService.getSideBarPosition();

		let hoverPosition: HoverPosition;
		if (this._viewContainerLocation === ViewContainerLocation.Sidebar) {
			hoverPosition = sideBarPosition === Position.LEFT ? HoverPosition.RIGHT : HoverPosition.LEFT;
		} else if (this._viewContainerLocation === ViewContainerLocation.AuxiliaryBar) {
			hoverPosition = sideBarPosition === Position.LEFT ? HoverPosition.LEFT : HoverPosition.RIGHT;
		} else {
			hoverPosition = HoverPosition.RIGHT;
		}

		return { additionalClasses: ['history-item-hover'], position: { hoverPosition, forcePosition: true } };
	}
}

class SCMHistoryViewPaneActionRunner extends ActionRunner {
	constructor(@IProgressService private readonly _progressService: IProgressService) {
		super();
	}

	protected override runAction(action: IAction, context?: unknown): Promise<void> {
		return this._progressService.withProgress({ location: HISTORY_VIEW_PANE_ID },
			async () => await super.runAction(action, context));
	}
}

class SCMHistoryTreeAccessibilityProvider implements IListAccessibilityProvider<TreeElement> {

	getWidgetAriaLabel(): string {
		return localize('scm history', "Source Control History");
	}

	getAriaLabel(element: TreeElement): string {
		if (isSCMRepository(element)) {
			return `${element.provider.name} ${element.provider.label}`;
		} else if (isSCMHistoryItemViewModelTreeElement(element)) {
			const historyItem = element.historyItemViewModel.historyItem;
			return `${stripIcons(historyItem.message).trim()}${historyItem.author ? `, ${historyItem.author}` : ''}`;
		} else {
			return '';
		}
	}
}

class SCMHistoryTreeIdentityProvider implements IIdentityProvider<TreeElement> {

	getId(element: TreeElement): string {
		if (isSCMRepository(element)) {
			const provider = element.provider;
			return `repo:${provider.id}`;
		} else if (isSCMHistoryItemViewModelTreeElement(element)) {
			const provider = element.repository.provider;
			const historyItem = element.historyItemViewModel.historyItem;
			return `historyItem:${provider.id}/${historyItem.id}/${historyItem.parentIds.join(',')}`;
		} else if (isSCMHistoryItemChangeViewModelTreeElement(element)) {
			const provider = element.repository.provider;
			const historyItem = element.historyItemViewModel.historyItem;
			return `historyItemChange:${provider.id}/${historyItem.id}/${historyItem.parentIds.join(',')}/${element.historyItemChange.uri.fsPath}`;
		} else if (isSCMHistoryItemChangeNode(element)) {
			const provider = element.context.repository.provider;
			const historyItem = element.context.historyItemViewModel.historyItem;
			return `historyItemChangeFolder:${provider.id}/${historyItem.id}/${historyItem.parentIds.join(',')}/${element.uri.fsPath}`;
		} else if (isSCMHistoryItemLoadMoreTreeElement(element)) {
			const provider = element.repository.provider;
			return `historyItemLoadMore:${provider.id}`;
		} else {
			throw new Error('Invalid tree element');
		}
	}
}

class SCMHistoryTreeKeyboardNavigationLabelProvider implements ICompressibleKeyboardNavigationLabelProvider<TreeElement> {
	getKeyboardNavigationLabel(element: TreeElement): { toString(): string } | { toString(): string }[] | undefined {
		if (isSCMRepository(element)) {
			return undefined;
		} else if (isSCMHistoryItemViewModelTreeElement(element)) {
			// For a history item we want to match both the message and
			// the author. A match in the message takes precedence over
			// a match in the author.
			return [element.historyItemViewModel.historyItem.message, element.historyItemViewModel.historyItem.author];
		} else if (isSCMHistoryItemLoadMoreTreeElement(element)) {
			// We don't want to match the load more element
			return '';
		} else {
			throw new Error('Invalid tree element');
		}
	}

	getCompressedNodeKeyboardNavigationLabel(elements: TreeElement[]): { toString(): string | undefined } | undefined {
		const folders = elements as IResourceNode<SCMHistoryItemChangeViewModelTreeElement, SCMHistoryItemViewModelTreeElement>[];
		return folders.map(e => e.name).join('/');
	}
}

class SCMHistoryTreeCompressionDelegate implements ITreeCompressionDelegate<TreeElement> {

	isIncompressible(element: TreeElement): boolean {
		if (ResourceTree.isResourceNode(element)) {
			return element.childrenCount === 0 || !element.parent || !element.parent.parent;
		}

		return true;
	}
}

class SCMHistoryTreeDataSource extends Disposable implements IAsyncDataSource<SCMHistoryViewModel, TreeElement> {
	constructor(private readonly viewMode: () => ViewMode) {
		super();
	}

	async getChildren(inputOrElement: SCMHistoryViewModel | TreeElement): Promise<Iterable<TreeElement>> {
		const children: TreeElement[] = [];

		if (inputOrElement instanceof SCMHistoryViewModel) {
			// History items
			const historyItems = await inputOrElement.getHistoryItems();
			children.push(...historyItems);

			// Load More element
			const repository = inputOrElement.repository.get();
			const lastHistoryItem = historyItems.at(-1);
			if (repository && lastHistoryItem && lastHistoryItem.historyItemViewModel.outputSwimlanes.length > 0) {
				children.push({
					repository,
					graphColumns: lastHistoryItem.historyItemViewModel.outputSwimlanes,
					type: 'historyItemLoadMore'
				} satisfies SCMHistoryItemLoadMoreTreeElement);
			}
		} else if (isSCMHistoryItemViewModelTreeElement(inputOrElement)) {
			// History item changes
			const historyItem = inputOrElement.historyItemViewModel.historyItem;
			const historyItemParentId = historyItem.parentIds.length > 0 ? historyItem.parentIds[0] : undefined;

			const historyProvider = inputOrElement.repository.provider.historyProvider.get();
			const historyItemChanges = await historyProvider?.provideHistoryItemChanges(historyItem.id, historyItemParentId) ?? [];

			if (this.viewMode() === ViewMode.List) {
				// List
				children.push(...historyItemChanges.map(change => ({
					repository: inputOrElement.repository,
					historyItemViewModel: inputOrElement.historyItemViewModel,
					historyItemChange: change,
					graphColumns: inputOrElement.historyItemViewModel.outputSwimlanes,
					type: 'historyItemChangeViewModel'
				} satisfies SCMHistoryItemChangeViewModelTreeElement)));
			} else if (this.viewMode() === ViewMode.Tree) {
				// Tree
				const rootUri = inputOrElement.repository.provider.rootUri ?? URI.file('/');
				const historyItemChangesTree = new ResourceTree<SCMHistoryItemChangeViewModelTreeElement, SCMHistoryItemViewModelTreeElement>(inputOrElement, rootUri);
				for (const change of historyItemChanges) {
					historyItemChangesTree.add(change.uri, {
						repository: inputOrElement.repository,
						historyItemViewModel: inputOrElement.historyItemViewModel,
						historyItemChange: change,
						graphColumns: inputOrElement.historyItemViewModel.outputSwimlanes,
						type: 'historyItemChangeViewModel'
					});
				}
				for (const node of historyItemChangesTree.root.children) {
					children.push(node.element ?? node);
				}
			}
		} else if (ResourceTree.isResourceNode(inputOrElement) && isSCMHistoryItemChangeNode(inputOrElement)) {
			// Tree
			for (const node of inputOrElement.children) {
				children.push(node.element && node.childrenCount === 0 ? node.element : node);
			}
		}

		return children;
	}

	hasChildren(inputOrElement: SCMHistoryViewModel | TreeElement): boolean {
		return inputOrElement instanceof SCMHistoryViewModel ||
			isSCMHistoryItemViewModelTreeElement(inputOrElement) ||
			(isSCMHistoryItemChangeNode(inputOrElement) && inputOrElement.childrenCount > 0);
	}
}

class SCMHistoryTreeDragAndDrop implements ITreeDragAndDrop<TreeElement> {
	getDragURI(element: TreeElement): string | null {
		const uri = this._getTreeElementUri(element);
		return uri ? uri.toString() : null;
	}

	onDragStart(data: IDragAndDropData, originalEvent: DragEvent): void {
		if (!originalEvent.dataTransfer) {
			return;
		}

		const historyItems = this._getDragAndDropData(data as ElementsDragAndDropData<TreeElement, TreeElement[]>);
		if (historyItems.length === 0) {
			return;
		}

		originalEvent.dataTransfer.setData(CodeDataTransfers.SCM_HISTORY_ITEM, JSON.stringify(historyItems));
	}

	getDragLabel(elements: TreeElement[], originalEvent: DragEvent): string | undefined {
		if (elements.length === 1) {
			const element = elements[0];
			return this._getTreeElementLabel(element);
		}

		return String(elements.length);
	}

	onDragOver(data: IDragAndDropData, targetElement: TreeElement | undefined, targetIndex: number | undefined, targetSector: ListViewTargetSector | undefined, originalEvent: DragEvent): boolean {
		return false;
	}

	drop(data: IDragAndDropData, targetElement: TreeElement | undefined, targetIndex: number | undefined, targetSector: ListViewTargetSector | undefined, originalEvent: DragEvent): void { }

	private _getDragAndDropData(data: ElementsDragAndDropData<TreeElement, TreeElement[]>): SCMHistoryItemTransferData[] {
		const historyItems: SCMHistoryItemTransferData[] = [];
		for (const element of [...data.context ?? [], ...data.elements]) {
			if (!isSCMHistoryItemViewModelTreeElement(element)) {
				continue;
			}

			const provider = element.repository.provider;
			const historyItem = element.historyItemViewModel.historyItem;
			const attachmentName = `$(${Codicon.repo.id})\u00A0${provider.name}\u00A0$(${Codicon.gitCommit.id})\u00A0${historyItem.displayId ?? historyItem.id}`;

			historyItems.push({
				name: attachmentName,
				resource: ScmHistoryItemResolver.getMultiDiffSourceUri(provider, historyItem),
				historyItem: historyItem
			});
		}

		return historyItems;
	}

	private _getTreeElementLabel(element: TreeElement): string | undefined {
		if (isSCMHistoryItemViewModelTreeElement(element)) {
			const historyItem = element.historyItemViewModel.historyItem;
			return getHistoryItemEditorTitle(historyItem);
		}

		return undefined;
	}

	private _getTreeElementUri(element: TreeElement): URI | undefined {
		if (isSCMHistoryItemViewModelTreeElement(element)) {
			const provider = element.repository.provider;
			const historyItem = element.historyItemViewModel.historyItem;

			return ScmHistoryItemResolver.getMultiDiffSourceUri(provider, historyItem);
		}

		return undefined;
	}

	dispose(): void { }
}

type HistoryItemRefsFilter = 'all' | 'auto' | string[];

type RepositoryState = {
	viewModels: SCMHistoryItemViewModelTreeElement[];
	historyItemsFilter: ISCMHistoryItemRef[];
	loadMore: boolean | string;
};

class SCMHistoryViewModel extends Disposable {
	readonly viewMode: ISettableObservable<ViewMode>;

	/**
	 * The active | selected repository takes precedence over the first repository when the observable
	 * values are updated in the same transaction (or during the initial read of the observable value).
	 */
	readonly repository: IObservable<ISCMRepository | undefined>;
	private readonly _selectedRepository = observableValue<'auto' | ISCMRepository>(this, 'auto');

	readonly onDidChangeHistoryItemsFilter = observableSignal(this);
	readonly isViewModelEmpty = observableValue(this, false);

	private readonly _repositoryState = new Map<ISCMRepository, RepositoryState>();
	private readonly _repositoryFilterState = new Map<string, HistoryItemRefsFilter>();

	private readonly _scmHistoryItemCountCtx: IContextKey<number>;
	private readonly _scmHistoryViewModeCtx: IContextKey<ViewMode>;

	constructor(
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
		@IExtensionService private readonly _extensionService: IExtensionService,
		@ISCMService private readonly _scmService: ISCMService,
		@ISCMViewService private readonly _scmViewService: ISCMViewService,
		@IStorageService private readonly _storageService: IStorageService
	) {
		super();

		this._repositoryFilterState = this._loadHistoryItemsFilterState();
		this.viewMode = observableValue<ViewMode>(this, this._getViewMode());

		this._extensionService.onWillStop(this._saveHistoryItemsFilterState, this, this._store);
		this._storageService.onWillSaveState(this._saveHistoryItemsFilterState, this, this._store);

		this._scmHistoryItemCountCtx = ContextKeys.SCMHistoryItemCount.bindTo(this._contextKeyService);
		this._scmHistoryViewModeCtx = ContextKeys.SCMHistoryViewMode.bindTo(this._contextKeyService);
		this._scmHistoryViewModeCtx.set(this.viewMode.get());

		const firstRepository = this._scmService.repositoryCount > 0
			? constObservable(Iterable.first(this._scmService.repositories))
			: observableFromEvent(this,
				Event.once(this._scmService.onDidAddRepository),
				repository => repository);

		const graphRepository = derived(reader => {
			const selectedRepository = this._selectedRepository.read(reader);
			if (selectedRepository !== 'auto') {
				return selectedRepository;
			}

			return this._scmViewService.activeRepository.read(reader);
		});

		this.repository = latestChangedValue(this, [firstRepository, graphRepository]);

		const closedRepository = observableFromEvent(this,
			this._scmService.onDidRemoveRepository,
			repository => repository);

		// Closed repository cleanup
		this._register(autorun(reader => {
			const repository = closedRepository.read(reader);
			if (!repository) {
				return;
			}

			if (this.repository.get() === repository) {
				this._selectedRepository.set(Iterable.first(this._scmService.repositories) ?? 'auto', undefined);
			}

			this._repositoryState.delete(repository);
		}));
	}

	clearRepositoryState(): void {
		const repository = this.repository.get();
		if (!repository) {
			return;
		}

		this._repositoryState.delete(repository);
	}

	getHistoryItemsFilter(): 'all' | 'auto' | ISCMHistoryItemRef[] | undefined {
		const repository = this.repository.get();
		if (!repository) {
			return;
		}

		const filterState = this._repositoryFilterState.get(getProviderKey(repository.provider)) ?? 'auto';
		if (filterState === 'all' || filterState === 'auto') {
			return filterState;
		}

		const repositoryState = this._repositoryState.get(repository);
		return repositoryState?.historyItemsFilter;
	}

	getCurrentHistoryItemTreeElement(): SCMHistoryItemViewModelTreeElement | undefined {
		const repository = this.repository.get();
		if (!repository) {
			return undefined;
		}

		const state = this._repositoryState.get(repository);
		if (!state) {
			return undefined;
		}

		const historyProvider = repository?.provider.historyProvider.get();
		const historyItemRef = historyProvider?.historyItemRef.get();

		return state.viewModels
			.find(viewModel => viewModel.historyItemViewModel.historyItem.id === historyItemRef?.revision);
	}

	loadMore(cursor?: string): void {
		const repository = this.repository.get();
		if (!repository) {
			return;
		}

		const state = this._repositoryState.get(repository);
		if (!state) {
			return;
		}

		this._repositoryState.set(repository, { ...state, loadMore: cursor ?? true });
	}

	async getHistoryItems(): Promise<SCMHistoryItemViewModelTreeElement[]> {
		const repository = this.repository.get();
		const historyProvider = repository?.provider.historyProvider.get();

		if (!repository || !historyProvider) {
			this._scmHistoryItemCountCtx.set(0);
			this.isViewModelEmpty.set(true, undefined);
			return [];
		}

		let state = this._repositoryState.get(repository);

		if (!state || state.loadMore !== false) {
			const historyItems = state?.viewModels
				.map(vm => vm.historyItemViewModel.historyItem) ?? [];

			const historyItemRefs = state?.historyItemsFilter ??
				await this._resolveHistoryItemFilter(repository, historyProvider);

			const limit = clamp(this._configurationService.getValue<number>('scm.graph.pageSize'), 1, 1000);
			const historyItemRefIds = historyItemRefs.map(ref => ref.revision ?? ref.id);

			do {
				// Fetch the next page of history items
				historyItems.push(...(await historyProvider.provideHistoryItems({
					historyItemRefs: historyItemRefIds, limit, skip: historyItems.length
				}) ?? []));
			} while (typeof state?.loadMore === 'string' && !historyItems.find(item => item.id === state?.loadMore));

			// Create the color map
			const colorMap = this._getGraphColorMap(historyItemRefs);

			const viewModels = toISCMHistoryItemViewModelArray(historyItems, colorMap, historyProvider.historyItemRef.get())
				.map(historyItemViewModel => ({
					repository,
					historyItemViewModel,
					type: 'historyItemViewModel'
				}) satisfies SCMHistoryItemViewModelTreeElement);

			state = { historyItemsFilter: historyItemRefs, viewModels, loadMore: false };
			this._repositoryState.set(repository, state);

			this._scmHistoryItemCountCtx.set(viewModels.length);
			this.isViewModelEmpty.set(viewModels.length === 0, undefined);
		}

		return state.viewModels;
	}

	setRepository(repository: ISCMRepository | 'auto'): void {
		this._selectedRepository.set(repository, undefined);
	}

	setHistoryItemsFilter(filter: HistoryItemRefsFilter): void {
		const repository = this.repository.get();
		if (!repository) {
			return;
		}

		if (filter !== 'auto') {
			this._repositoryFilterState.set(getProviderKey(repository.provider), filter);
		} else {
			this._repositoryFilterState.delete(getProviderKey(repository.provider));
		}
		this._saveHistoryItemsFilterState();

		this.onDidChangeHistoryItemsFilter.trigger(undefined);
	}

	setViewMode(viewMode: ViewMode): void {
		if (viewMode === this.viewMode.get()) {
			return;
		}

		this.viewMode.set(viewMode, undefined);
		this._scmHistoryViewModeCtx.set(viewMode);
		this._storageService.store('scm.graphView.viewMode', viewMode, StorageScope.WORKSPACE, StorageTarget.USER);
	}

	private _getViewMode(): ViewMode {
		let mode = this._configurationService.getValue<'tree' | 'list'>('scm.defaultViewMode') === 'list' ? ViewMode.List : ViewMode.Tree;
		const storageMode = this._storageService.get('scm.graphView.viewMode', StorageScope.WORKSPACE) as ViewMode;
		if (typeof storageMode === 'string') {
			mode = storageMode;
		}

		return mode;
	}

	private _getGraphColorMap(historyItemRefs: ISCMHistoryItemRef[]): Map<string, ColorIdentifier | undefined> {
		const repository = this.repository.get();
		const historyProvider = repository?.provider.historyProvider.get();
		const historyItemRef = historyProvider?.historyItemRef.get();
		const historyItemRemoteRef = historyProvider?.historyItemRemoteRef.get();
		const historyItemBaseRef = historyProvider?.historyItemBaseRef.get();

		const colorMap = new Map<string, ColorIdentifier | undefined>();

		if (historyItemRef) {
			colorMap.set(historyItemRef.id, historyItemRef.color);

			if (historyItemRemoteRef) {
				colorMap.set(historyItemRemoteRef.id, historyItemRemoteRef.color);
			}
			if (historyItemBaseRef) {
				colorMap.set(historyItemBaseRef.id, historyItemBaseRef.color);
			}
		}

		// Add the remaining history item references to the color map
		// if not already present. These history item references will
		// be colored using the color of the history item to which they
		// point to.
		for (const ref of historyItemRefs) {
			if (!colorMap.has(ref.id)) {
				colorMap.set(ref.id, undefined);
			}
		}

		return colorMap;
	}

	private async _resolveHistoryItemFilter(repository: ISCMRepository, historyProvider: ISCMHistoryProvider): Promise<ISCMHistoryItemRef[]> {
		const historyItemRefs: ISCMHistoryItemRef[] = [];
		const historyItemsFilter = this._repositoryFilterState.get(getProviderKey(repository.provider)) ?? 'auto';

		switch (historyItemsFilter) {
			case 'all':
				historyItemRefs.push(...(await historyProvider.provideHistoryItemRefs() ?? []));
				break;
			case 'auto':
				historyItemRefs.push(...[
					historyProvider.historyItemRef.get(),
					historyProvider.historyItemRemoteRef.get(),
					historyProvider.historyItemBaseRef.get(),
				].filter(ref => !!ref));
				break;
			default: {
				// Get the latest revisions for the history items references in the filer
				const refs = (await historyProvider.provideHistoryItemRefs(historyItemsFilter) ?? [])
					.filter(ref => historyItemsFilter.some(filter => filter === ref.id));

				if (refs.length === 0) {
					// Reset the filter
					historyItemRefs.push(...[
						historyProvider.historyItemRef.get(),
						historyProvider.historyItemRemoteRef.get(),
						historyProvider.historyItemBaseRef.get(),
					].filter(ref => !!ref));
					this._repositoryFilterState.delete(getProviderKey(repository.provider));
				} else {
					// Update filter
					historyItemRefs.push(...refs);
					this._repositoryFilterState.set(getProviderKey(repository.provider), refs.map(ref => ref.id));
				}

				this._saveHistoryItemsFilterState();

				break;
			}
		}

		return historyItemRefs;
	}

	private _loadHistoryItemsFilterState() {
		try {
			const filterData = this._storageService.get('scm.graphView.referencesFilter', StorageScope.WORKSPACE);
			if (filterData) {
				return new Map<string, HistoryItemRefsFilter>(JSON.parse(filterData));
			}
		} catch { }

		return new Map<string, HistoryItemRefsFilter>();
	}

	private _saveHistoryItemsFilterState(): void {
		const filter = Array.from(this._repositoryFilterState.entries());
		this._storageService.store('scm.graphView.referencesFilter', JSON.stringify(filter), StorageScope.WORKSPACE, StorageTarget.USER);
	}

	override dispose(): void {
		this._repositoryState.clear();
		super.dispose();
	}
}

type RepositoryQuickPickItem = IQuickPickItem & { repository: 'auto' | ISCMRepository };

class RepositoryPicker {
	private readonly _autoQuickPickItem: RepositoryQuickPickItem = {
		label: localize('auto', "Auto"),
		description: localize('activeRepository', "Show the source control graph for the active repository"),
		repository: 'auto'
	};

	constructor(
		@IQuickInputService private readonly _quickInputService: IQuickInputService,
		@ISCMViewService private readonly _scmViewService: ISCMViewService
	) { }

	async pickRepository(): Promise<RepositoryQuickPickItem | undefined> {
		const picks: (RepositoryQuickPickItem | IQuickPickSeparator)[] = [
			this._autoQuickPickItem,
			{ type: 'separator' }];

		picks.push(...this._scmViewService.repositories.map(r => ({
			label: r.provider.name,
			description: r.provider.rootUri?.fsPath,
			iconClass: ThemeIcon.isThemeIcon(r.provider.iconPath)
				? ThemeIcon.asClassName(r.provider.iconPath)
				: ThemeIcon.asClassName(Codicon.repo),
			repository: r
		})));

		return this._quickInputService.pick(picks, {
			placeHolder: localize('scmGraphRepository', "Select the repository to view, type to filter all repositories")
		});
	}
}

type HistoryItemRefQuickPickItem = IQuickPickItem & { historyItemRef: 'all' | 'auto' | ISCMHistoryItemRef };

class HistoryItemRefPicker extends Disposable {
	private readonly _allQuickPickItem: HistoryItemRefQuickPickItem = {
		id: 'all',
		label: localize('all', "All"),
		description: localize('allHistoryItemRefs', "All history item references"),
		historyItemRef: 'all'
	};

	private readonly _autoQuickPickItem: HistoryItemRefQuickPickItem = {
		id: 'auto',
		label: localize('auto', "Auto"),
		description: localize('currentHistoryItemRef', "Current history item reference(s)"),
		historyItemRef: 'auto'
	};

	constructor(
		private readonly _historyProvider: ISCMHistoryProvider,
		private readonly _historyItemsFilter: 'all' | 'auto' | ISCMHistoryItemRef[],
		@IQuickInputService private readonly _quickInputService: IQuickInputService,
	) {
		super();
	}

	async pickHistoryItemRef(): Promise<HistoryItemRefsFilter | undefined> {
		const quickPick = this._quickInputService.createQuickPick<HistoryItemRefQuickPickItem>({ useSeparators: true });
		this._store.add(quickPick);

		quickPick.placeholder = localize('scmGraphHistoryItemRef', "Select one/more history item references to view, type to filter");
		quickPick.canSelectMany = true;
		quickPick.hideCheckAll = true;
		quickPick.busy = true;
		quickPick.show();

		const items = await this._createQuickPickItems();

		// Set initial selection
		let selectedItems: HistoryItemRefQuickPickItem[] = [];
		if (this._historyItemsFilter === 'all') {
			selectedItems.push(this._allQuickPickItem);
		} else if (this._historyItemsFilter === 'auto') {
			selectedItems.push(this._autoQuickPickItem);
		} else {
			let index = 0;
			while (index < items.length) {
				if (items[index].type === 'separator') {
					index++;
					continue;
				}

				if (this._historyItemsFilter.some(ref => ref.id === items[index].id)) {
					const item = items.splice(index, 1) as HistoryItemRefQuickPickItem[];
					selectedItems.push(...item);
				} else {
					index++;
				}
			}

			// Insert the selected items after `All` and `Auto`
			items.splice(2, 0, { type: 'separator' }, ...selectedItems);
		}

		quickPick.items = items;
		quickPick.selectedItems = selectedItems;
		quickPick.busy = false;

		return new Promise<HistoryItemRefsFilter | undefined>(resolve => {
			this._store.add(quickPick.onDidChangeSelection(items => {
				const { added } = delta(selectedItems, items, (a, b) => compare(a.id ?? '', b.id ?? ''));
				if (added.length > 0) {
					if (added[0].historyItemRef === 'all' || added[0].historyItemRef === 'auto') {
						quickPick.selectedItems = [added[0]];
					} else {
						// Remove 'all' and 'auto' items if present
						quickPick.selectedItems = [...quickPick.selectedItems
							.filter(i => i.historyItemRef !== 'all' && i.historyItemRef !== 'auto')];
					}
				}

				selectedItems = [...quickPick.selectedItems];
			}));

			this._store.add(quickPick.onDidAccept(() => {
				if (selectedItems.length === 0) {
					resolve(undefined);
				} else if (selectedItems.length === 1 && selectedItems[0].historyItemRef === 'all') {
					resolve('all');
				} else if (selectedItems.length === 1 && selectedItems[0].historyItemRef === 'auto') {
					resolve('auto');
				} else {
					resolve(selectedItems.map(item => (item.historyItemRef as ISCMHistoryItemRef).id));
				}

				quickPick.hide();
			}));

			this._store.add(quickPick.onDidHide(() => {
				resolve(undefined);
				this.dispose();
			}));
		});
	}

	private async _createQuickPickItems(): Promise<(HistoryItemRefQuickPickItem | IQuickPickSeparator)[]> {
		const picks: (HistoryItemRefQuickPickItem | IQuickPickSeparator)[] = [
			this._allQuickPickItem, this._autoQuickPickItem
		];

		const historyItemRefs = await this._historyProvider.provideHistoryItemRefs() ?? [];
		const historyItemRefsByCategory = groupBy(historyItemRefs, (a, b) => compare(a.category ?? '', b.category ?? ''));

		for (const refs of historyItemRefsByCategory) {
			if (refs.length === 0) {
				continue;
			}

			picks.push({ type: 'separator', label: refs[0].category });

			picks.push(...refs.map(ref => {
				return {
					id: ref.id,
					label: ref.name,
					description: ref.description,
					iconClass: ThemeIcon.isThemeIcon(ref.icon) ?
						ThemeIcon.asClassName(ref.icon) : undefined,
					historyItemRef: ref
				};
			}));
		}

		return picks;
	}
}

export class SCMHistoryViewPane extends ViewPane {

	private _treeContainer!: HTMLElement;
	private _tree!: WorkbenchCompressibleAsyncDataTree<SCMHistoryViewModel, TreeElement, FuzzyScore>;
	private _treeViewModel!: SCMHistoryViewModel;
	private _treeDataSource!: SCMHistoryTreeDataSource;
	private _treeIdentityProvider!: SCMHistoryTreeIdentityProvider;

	private readonly _repositoryIsLoadingMore = observableValue(this, false);
	private readonly _repositoryOutdated = observableValue(this, false);

	private readonly _actionRunner: IActionRunner;
	private readonly _visibilityDisposables = new DisposableStore();

	private readonly _treeOperationSequencer = new Sequencer();
	private readonly _treeLoadMoreSequencer = new Sequencer();
	private readonly _updateChildrenThrottler = new Throttler();

	private readonly _scmProviderCtx: IContextKey<string | undefined>;
	private readonly _scmCurrentHistoryItemRefHasRemote: IContextKey<boolean>;
	private readonly _scmCurrentHistoryItemRefInFilter: IContextKey<boolean>;

	private readonly _contextMenuDisposables = new MutableDisposable<DisposableStore>();

	constructor(
		options: IViewPaneOptions,
		@IEditorService private readonly _editorService: IEditorService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IMenuService private readonly _menuService: IMenuService,
		@IProgressService private readonly _progressService: IProgressService,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IOpenerService openerService: IOpenerService,
		@IThemeService themeService: IThemeService,
		@IHoverService hoverService: IHoverService
	) {
		super({
			...options,
			titleMenuId: MenuId.SCMHistoryTitle,
			showActions: ViewPaneShowActions.WhenExpanded
		}, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);

		this._scmProviderCtx = ContextKeys.SCMProvider.bindTo(this.scopedContextKeyService);
		this._scmCurrentHistoryItemRefHasRemote = ContextKeys.SCMCurrentHistoryItemRefHasRemote.bindTo(this.scopedContextKeyService);
		this._scmCurrentHistoryItemRefInFilter = ContextKeys.SCMCurrentHistoryItemRefInFilter.bindTo(this.scopedContextKeyService);

		this._actionRunner = this.instantiationService.createInstance(SCMHistoryViewPaneActionRunner);
		this._register(this._actionRunner);

		this._register(this._updateChildrenThrottler);
	}

	protected override renderHeaderTitle(container: HTMLElement): void {
		super.renderHeaderTitle(container, this.title);

		const element = h('div.scm-graph-view-badge-container', [
			h('div.scm-graph-view-badge.monaco-count-badge.long@badge')
		]);

		element.badge.textContent = 'Outdated';
		container.appendChild(element.root);

		this._register(this.hoverService.setupManagedHover(getDefaultHoverDelegate('mouse'), element.root, {
			markdown: {
				value: localize('scmGraphViewOutdated', "Please refresh the graph using the refresh action ($(refresh))."),
				supportThemeIcons: true
			},
			markdownNotSupportedFallback: undefined
		}));

		this._register(autorun(reader => {
			const outdated = this._repositoryOutdated.read(reader);
			element.root.style.display = outdated ? '' : 'none';
		}));
	}

	protected override renderBody(container: HTMLElement): void {
		super.renderBody(container);

		this._treeContainer = append(container, $('.scm-view.scm-history-view.show-file-icons'));
		this._treeContainer.classList.add('file-icon-themable-tree');

		this._createTree(this._treeContainer);

		this.onDidChangeBodyVisibility(async visible => {
			if (!visible) {
				this._visibilityDisposables.clear();
				return;
			}

			// Create view model
			this._treeViewModel = this.instantiationService.createInstance(SCMHistoryViewModel);
			this._visibilityDisposables.add(this._treeViewModel);

			// Wait for first repository to be initialized
			const firstRepositoryInitialized = derived(this, reader => {
				const repository = this._treeViewModel.repository.read(reader);
				const historyProvider = repository?.provider.historyProvider.read(reader);
				const historyItemRef = historyProvider?.historyItemRef.read(reader);

				return historyItemRef !== undefined ? true : undefined;
			});
			await waitForState(firstRepositoryInitialized);

			// Initial rendering
			await this._progressService.withProgress({ location: this.id }, async () => {
				await this._treeOperationSequencer.queue(async () => {
					await this._tree.setInput(this._treeViewModel);
					this._tree.scrollTop = 0;
				});
			});

			this._visibilityDisposables.add(autorun(reader => {
				this._treeViewModel.isViewModelEmpty.read(reader);
				this._onDidChangeViewWelcomeState.fire();
			}));

			// Repository change
			let isFirstRun = true;
			this._visibilityDisposables.add(autorunWithStore((reader, store) => {
				const repository = this._treeViewModel.repository.read(reader);
				const historyProvider = repository?.provider.historyProvider.read(reader);
				if (!repository || !historyProvider) {
					return;
				}

				// HistoryItemId changed (checkout)
				const historyItemRefId = derived(reader => {
					return historyProvider.historyItemRef.read(reader)?.id;
				});
				store.add(runOnChange(historyItemRefId, async historyItemRefIdValue => {
					await this.refresh();

					// Update context key (needs to be done after the refresh call)
					this._scmCurrentHistoryItemRefInFilter.set(this._isCurrentHistoryItemInFilter(historyItemRefIdValue));
				}));

				// HistoryItemRefs changed
				store.add(runOnChange(historyProvider.historyItemRefChanges, changes => {
					if (changes.silent) {
						// The history item reference changes occurred in the background (ex: Auto Fetch)
						// If tree is scrolled to the top, we can safely refresh the tree, otherwise we
						// will show a visual cue that the view is outdated.
						if (this._tree.scrollTop === 0) {
							this.refresh();
							return;
						}

						// Show the "Outdated" badge on the view
						this._repositoryOutdated.set(true, undefined);
						return;
					}

					this.refresh();
				}));

				// HistoryItemRefs filter changed
				store.add(runOnChange(this._treeViewModel.onDidChangeHistoryItemsFilter, async () => {
					await this.refresh();

					// Update context key (needs to be done after the refresh call)
					this._scmCurrentHistoryItemRefInFilter.set(this._isCurrentHistoryItemInFilter(historyItemRefId.get()));
				}));

				// HistoryItemRemoteRef changed
				store.add(autorun(reader => {
					this._scmCurrentHistoryItemRefHasRemote.set(!!historyProvider.historyItemRemoteRef.read(reader));
				}));

				// ViewMode changed
				store.add(runOnChange(this._treeViewModel.viewMode, async () => {
					await this._updateChildren();
				}));

				// Update context
				this._scmProviderCtx.set(repository.provider.providerId);
				this._scmCurrentHistoryItemRefInFilter.set(this._isCurrentHistoryItemInFilter(historyItemRefId.get()));

				// We skip refreshing the graph on the first execution of the autorun
				// since the graph for the first repository is rendered when the tree
				// input is set.
				if (!isFirstRun) {
					this.refresh();
				}
				isFirstRun = false;
			}));

			// FileIconTheme & viewMode change
			const fileIconThemeObs = observableFromEvent(
				this.themeService.onDidFileIconThemeChange,
				() => this.themeService.getFileIconTheme());

			this._visibilityDisposables.add(autorun(reader => {
				const fileIconTheme = fileIconThemeObs.read(reader);
				const viewMode = this._treeViewModel.viewMode.read(reader);

				this._updateIndentStyles(fileIconTheme, viewMode);
			}));
		}, this, this._store);
	}

	protected override layoutBody(height: number, width: number): void {
		super.layoutBody(height, width);
		this._tree.layout(height, width);
	}

	override getActionRunner(): IActionRunner | undefined {
		return this._actionRunner;
	}

	override getActionsContext(): ISCMProvider | undefined {
		return this._treeViewModel?.repository.get()?.provider;
	}

	override createActionViewItem(action: IAction, options?: IDropdownMenuActionViewItemOptions): IActionViewItem | undefined {
		if (action.id === PICK_REPOSITORY_ACTION_ID) {
			const repository = this._treeViewModel?.repository.get();
			if (repository) {
				return new SCMRepositoryActionViewItem(repository, action, options);
			}
		} else if (action.id === PICK_HISTORY_ITEM_REFS_ACTION_ID) {
			const repository = this._treeViewModel?.repository.get();
			const historyItemsFilter = this._treeViewModel?.getHistoryItemsFilter();
			if (repository && historyItemsFilter) {
				return new SCMHistoryItemRefsActionViewItem(repository, historyItemsFilter, action, options);
			}
		}

		return super.createActionViewItem(action, options);
	}

	override focus(): void {
		super.focus();

		const fakeKeyboardEvent = new KeyboardEvent('keydown');
		this._tree.focusFirst(fakeKeyboardEvent);
		this._tree.domFocus();
	}

	override shouldShowWelcome(): boolean {
		return this._treeViewModel?.isViewModelEmpty.get() === true;
	}

	async refresh(): Promise<void> {
		this._treeViewModel.clearRepositoryState();
		await this._updateChildren();

		this.updateActions();
		this._repositoryOutdated.set(false, undefined);
		this._tree.scrollTop = 0;
	}

	async pickRepository(): Promise<void> {
		const picker = this._instantiationService.createInstance(RepositoryPicker);
		const result = await picker.pickRepository();

		if (result) {
			this._treeViewModel.setRepository(result.repository);
		}
	}

	async pickHistoryItemRef(): Promise<void> {
		const repository = this._treeViewModel.repository.get();
		const historyProvider = repository?.provider.historyProvider.get();
		const historyItemsFilter = this._treeViewModel.getHistoryItemsFilter();

		if (!historyProvider || !historyItemsFilter) {
			return;
		}

		const picker = this._instantiationService.createInstance(HistoryItemRefPicker, historyProvider, historyItemsFilter);
		const result = await picker.pickHistoryItemRef();

		if (result) {
			this._treeViewModel.setHistoryItemsFilter(result);
		}
	}

	async revealCurrentHistoryItem(): Promise<void> {
		const repository = this._treeViewModel.repository.get();
		const historyProvider = repository?.provider.historyProvider.get();
		const historyItemRef = historyProvider?.historyItemRef.get();
		if (!repository || !historyItemRef?.id || !historyItemRef?.revision) {
			return;
		}

		if (!this._isCurrentHistoryItemInFilter(historyItemRef.id)) {
			return;
		}

		const revealTreeNode = (): boolean => {
			const historyItemTreeElement = this._treeViewModel.getCurrentHistoryItemTreeElement();

			if (historyItemTreeElement && this._tree.hasNode(historyItemTreeElement)) {
				this._tree.reveal(historyItemTreeElement, 0.5);

				this._tree.setSelection([historyItemTreeElement]);
				this._tree.setFocus([historyItemTreeElement]);
				return true;
			}

			return false;
		};

		if (revealTreeNode()) {
			return;
		}

		// Fetch current history item
		await this._loadMore(historyItemRef.revision);

		// Reveal node
		revealTreeNode();
	}

	setViewMode(viewMode: ViewMode): void {
		this._treeViewModel.setViewMode(viewMode);
	}

	private _createTree(container: HTMLElement): void {
		this._treeIdentityProvider = new SCMHistoryTreeIdentityProvider();

		const historyItemHoverDelegate = this.instantiationService.createInstance(HistoryItemHoverDelegate, this.viewDescriptorService.getViewLocationById(this.id));
		this._register(historyItemHoverDelegate);

		const resourceLabels = this.instantiationService.createInstance(ResourceLabels, { onDidChangeVisibility: this.onDidChangeBodyVisibility });
		this._register(resourceLabels);

		this._treeDataSource = this.instantiationService.createInstance(SCMHistoryTreeDataSource, () => this._treeViewModel.viewMode.get());
		this._register(this._treeDataSource);

		const compressionEnabled = observableConfigValue('scm.compactFolders', true, this.configurationService);

		this._tree = this.instantiationService.createInstance(
			WorkbenchCompressibleAsyncDataTree,
			'SCM History Tree',
			container,
			new ListDelegate(),
			new SCMHistoryTreeCompressionDelegate(),
			[
				this.instantiationService.createInstance(HistoryItemRenderer, historyItemHoverDelegate),
				this.instantiationService.createInstance(HistoryItemChangeRenderer, () => this._treeViewModel.viewMode.get(), resourceLabels),
				this.instantiationService.createInstance(HistoryItemLoadMoreRenderer, this._repositoryIsLoadingMore, () => this._loadMore()),
			],
			this._treeDataSource,
			{
				accessibilityProvider: new SCMHistoryTreeAccessibilityProvider(),
				identityProvider: this._treeIdentityProvider,
				collapseByDefault: (e: unknown) => !isSCMHistoryItemChangeNode(e),
				compressionEnabled: compressionEnabled.get(),
				dnd: new SCMHistoryTreeDragAndDrop(),
				keyboardNavigationLabelProvider: new SCMHistoryTreeKeyboardNavigationLabelProvider(),
				horizontalScrolling: false,
				multipleSelectionSupport: false
			}
		) as WorkbenchCompressibleAsyncDataTree<SCMHistoryViewModel, TreeElement, FuzzyScore>;
		this._register(this._tree);

		this._tree.onDidOpen(this._onDidOpen, this, this._store);
		this._tree.onContextMenu(this._onContextMenu, this, this._store);
	}

	private _isCurrentHistoryItemInFilter(historyItemRefId: string | undefined): boolean {
		if (!historyItemRefId) {
			return false;
		}

		const historyItemFilter = this._treeViewModel.getHistoryItemsFilter();
		if (historyItemFilter === 'all' || historyItemFilter === 'auto') {
			return true;
		}

		return Array.isArray(historyItemFilter) && !!historyItemFilter.find(ref => ref.id === historyItemRefId);
	}

	private async _onDidOpen(e: IOpenEvent<TreeElement | undefined>): Promise<void> {
		if (!e.element) {
			return;
		} else if (isSCMHistoryItemChangeViewModelTreeElement(e.element)) {
			const historyItemChange = e.element.historyItemChange;
			const historyItem = e.element.historyItemViewModel.historyItem;
			const historyItemDisplayId = historyItem.displayId ?? historyItem.id;

			const historyItemParentId = historyItem.parentIds.length > 0 ? historyItem.parentIds[0] : undefined;
			const historyItemParentDisplayId = historyItemParentId && historyItem.displayId
				? historyItemParentId.substring(0, historyItem.displayId.length)
				: historyItemParentId;

			if (historyItemChange.originalUri && historyItemChange.modifiedUri) {
				// Diff Editor
				const originalUriTitle = `${basename(historyItemChange.originalUri.fsPath)} (${historyItemParentDisplayId})`;
				const modifiedUriTitle = `${basename(historyItemChange.modifiedUri.fsPath)} (${historyItemDisplayId})`;

				const title = `${originalUriTitle} ↔ ${modifiedUriTitle}`;
				await this._editorService.openEditor({
					label: title,
					original: { resource: historyItemChange.originalUri },
					modified: { resource: historyItemChange.modifiedUri },
					options: e.editorOptions
				});
			} else if (historyItemChange.modifiedUri) {
				await this._editorService.openEditor({
					label: `${basename(historyItemChange.modifiedUri.fsPath)} (${historyItemDisplayId})`,
					resource: historyItemChange.modifiedUri,
					options: e.editorOptions
				});
			} else if (historyItemChange.originalUri) {
				// Editor (Deleted)
				await this._editorService.openEditor({
					label: `${basename(historyItemChange.originalUri.fsPath)} (${historyItemParentDisplayId})`,
					resource: historyItemChange.originalUri,
					options: e.editorOptions
				});
			}
		} else if (isSCMHistoryItemLoadMoreTreeElement(e.element)) {
			const pageOnScroll = this.configurationService.getValue<boolean>('scm.graph.pageOnScroll') === true;
			if (!pageOnScroll) {
				this._loadMore();
				this._tree.setSelection([]);
			}
		}
	}

	private _onContextMenu(e: ITreeContextMenuEvent<TreeElement | null>): void {
		const element = e.element;

		if (!element || !isSCMHistoryItemViewModelTreeElement(element)) {
			return;
		}

		this._contextMenuDisposables.value = new DisposableStore();

		const historyItemRefMenuItems = MenuRegistry.getMenuItems(MenuId.SCMHistoryItemRefContext).filter(item => isIMenuItem(item));

		// If there are any history item references we have to add a submenu item for each orignal action,
		// and a menu item for each history item ref that matches the `when` clause of the original action.
		if (historyItemRefMenuItems.length > 0 && element.historyItemViewModel.historyItem.references?.length) {
			const historyItemRefActions = new Map<string, ISCMHistoryItemRef[]>();

			for (const ref of element.historyItemViewModel.historyItem.references) {
				const contextKeyService = this.scopedContextKeyService.createOverlay([
					['scmHistoryItemRef', ref.id]
				]);

				const menuActions = this._menuService.getMenuActions(
					MenuId.SCMHistoryItemRefContext, contextKeyService);

				for (const action of menuActions.flatMap(a => a[1])) {
					if (!historyItemRefActions.has(action.id)) {
						historyItemRefActions.set(action.id, []);
					}

					historyItemRefActions.get(action.id)!.push(ref);
				}
			}

			// Register submenu, menu items
			for (const historyItemRefMenuItem of historyItemRefMenuItems) {
				const actionId = historyItemRefMenuItem.command.id;

				if (!historyItemRefActions.has(actionId)) {
					continue;
				}

				// Register the submenu for the original action
				this._contextMenuDisposables.value.add(MenuRegistry.appendMenuItem(MenuId.SCMHistoryItemContext, {
					title: historyItemRefMenuItem.command.title,
					submenu: MenuId.for(actionId),
					group: historyItemRefMenuItem?.group,
					order: historyItemRefMenuItem?.order
				}));

				// Register the action for the history item ref
				for (const historyItemRef of historyItemRefActions.get(actionId) ?? []) {
					this._contextMenuDisposables.value.add(registerAction2(class extends Action2 {
						constructor() {
							super({
								id: `${actionId}.${historyItemRef.id}`,
								title: historyItemRef.name,
								menu: {
									id: MenuId.for(actionId),
									group: historyItemRef.category
								}
							});
						}
						override run(accessor: ServicesAccessor, ...args: any[]): void {
							const commandService = accessor.get(ICommandService);
							commandService.executeCommand(actionId, ...args, historyItemRef.id);
						}
					}));
				}
			}
		}

		const historyItemMenuActions = this._menuService.getMenuActions(
			MenuId.SCMHistoryItemContext,
			this.scopedContextKeyService, {
			arg: element.repository.provider,
			shouldForwardArgs: true
		}).filter(group => group[0] !== 'inline');

		this.contextMenuService.showContextMenu({
			contextKeyService: this.scopedContextKeyService,
			getAnchor: () => e.anchor,
			getActions: () => getFlatContextMenuActions(historyItemMenuActions),
			getActionsContext: () => element.historyItemViewModel.historyItem
		});
	}

	private async _loadMore(cursor?: string): Promise<void> {
		return this._treeLoadMoreSequencer.queue(async () => {
			if (this._repositoryIsLoadingMore.get()) {
				return;
			}

			this._repositoryIsLoadingMore.set(true, undefined);
			this._treeViewModel.loadMore(cursor);

			await this._updateChildren();
			this._repositoryIsLoadingMore.set(false, undefined);
		});
	}

	private _updateChildren(): Promise<void> {
		return this._updateChildrenThrottler.queue(
			() => this._treeOperationSequencer.queue(
				async () => {
					await this._progressService.withProgress({ location: this.id, delay: 100 },
						async () => {
							await this._tree.updateChildren(undefined, undefined, undefined, {
								// diffIdentityProvider: this._treeIdentityProvider
							});
						});
				}));
	}

	private _updateIndentStyles(theme: IFileIconTheme, viewMode: ViewMode): void {
		this._treeContainer.classList.toggle('list-view-mode', viewMode === ViewMode.List);
		this._treeContainer.classList.toggle('tree-view-mode', viewMode === ViewMode.Tree);
		this._treeContainer.classList.toggle('align-icons-and-twisties', (viewMode === ViewMode.List && theme.hasFileIcons) || (theme.hasFileIcons && !theme.hasFolderIcons));
		this._treeContainer.classList.toggle('hide-arrows', viewMode === ViewMode.Tree && theme.hidesExplorerArrows === true);
	}

	override dispose(): void {
		this._contextMenuDisposables.dispose();
		this._visibilityDisposables.dispose();
		super.dispose();
	}
}
