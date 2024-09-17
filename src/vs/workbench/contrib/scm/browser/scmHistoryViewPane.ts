/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/scm.css';
import * as platform from '../../../../base/common/platform.js';
import { $, append, h, reset } from '../../../../base/browser/dom.js';
import { IHoverOptions, IManagedHoverTooltipMarkdownString } from '../../../../base/browser/ui/hover/hover.js';
import { IHoverDelegate } from '../../../../base/browser/ui/hover/hoverDelegate.js';
import { IconLabel } from '../../../../base/browser/ui/iconLabel/iconLabel.js';
import { IIdentityProvider, IKeyboardNavigationLabelProvider, IListVirtualDelegate } from '../../../../base/browser/ui/list/list.js';
import { LabelFuzzyScore } from '../../../../base/browser/ui/tree/abstractTree.js';
import { IAsyncDataSource, ITreeContextMenuEvent, ITreeNode, ITreeRenderer } from '../../../../base/browser/ui/tree/tree.js';
import { fromNow } from '../../../../base/common/date.js';
import { createMatches, FuzzyScore, IMatch } from '../../../../base/common/filters.js';
import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { Disposable, DisposableStore, IDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, autorunWithStore, derived, IObservable, observableValue, waitForState, constObservable, latestChangedValue, observableFromEvent, runOnChange, ISettableObservable } from '../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { localize } from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr, IContextKey, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IHoverService, WorkbenchHoverDelegate } from '../../../../platform/hover/browser/hover.js';
import { IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { IOpenEvent, WorkbenchAsyncDataTree } from '../../../../platform/list/browser/listService.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { asCssVariable, ColorIdentifier, foreground } from '../../../../platform/theme/common/colorRegistry.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { IViewPaneOptions, ViewAction, ViewPane, ViewPaneShowActions } from '../../../browser/parts/views/viewPane.js';
import { IViewDescriptorService, ViewContainerLocation } from '../../../common/views.js';
import { renderSCMHistoryItemGraph, toISCMHistoryItemViewModelArray, SWIMLANE_WIDTH, renderSCMHistoryGraphPlaceholder, historyItemHoverDeletionsForeground, historyItemHoverLabelForeground, historyItemHoverAdditionsForeground, historyItemHoverDefaultLabelForeground, historyItemHoverDefaultLabelBackground } from './scmHistory.js';
import { getHistoryItemEditorTitle, isSCMHistoryItemLoadMoreTreeElement, isSCMHistoryItemViewModelTreeElement, isSCMRepository } from './util.js';
import { ISCMHistoryItem, ISCMHistoryItemRef, ISCMHistoryItemViewModel, ISCMHistoryProvider, SCMHistoryItemLoadMoreTreeElement, SCMHistoryItemViewModelTreeElement } from '../common/history.js';
import { HISTORY_VIEW_PANE_ID, ISCMProvider, ISCMRepository, ISCMService, ISCMViewService } from '../common/scm.js';
import { IListAccessibilityProvider } from '../../../../base/browser/ui/list/listWidget.js';
import { stripIcons } from '../../../../base/common/iconLabels.js';
import { IWorkbenchLayoutService, Position } from '../../../services/layout/browser/layoutService.js';
import { HoverPosition } from '../../../../base/browser/ui/hover/hoverWidget.js';
import { Action2, MenuId, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { Sequencer, Throttler } from '../../../../base/common/async.js';
import { URI } from '../../../../base/common/uri.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { ActionRunner, IAction, IActionRunner } from '../../../../base/common/actions.js';
import { delta, groupBy, tail } from '../../../../base/common/arrays.js';
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
import { INotificationService } from '../../../../platform/notification/common/notification.js';

const PICK_REPOSITORY_ACTION_ID = 'workbench.scm.action.graph.pickRepository';
const PICK_HISTORY_ITEM_REFS_ACTION_ID = 'workbench.scm.action.graph.pickHistoryItemRefs';

type TreeElement = SCMHistoryItemViewModelTreeElement | SCMHistoryItemLoadMoreTreeElement;

class SCMRepositoryActionViewItem extends ActionViewItem {
	constructor(private readonly _repository: ISCMRepository, action: IAction, options?: IDropdownMenuActionViewItemOptions) {
		super(null, action, { ...options, icon: false, label: true });
	}

	protected override updateLabel(): void {
		if (this.options.label && this.label) {
			this.label.classList.add('scm-graph-repository-picker');

			const icon = $('.icon');
			icon.classList.add(...ThemeIcon.asClassNameArray(Codicon.repo));

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
		private readonly _historyItemsFilter: HistoryItemRefsFilter,
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
			viewId: HISTORY_VIEW_PANE_ID,
			f1: false,
			icon: Codicon.target,
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

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'workbench.scm.action.graph.viewChanges',
			title: localize('viewChanges', "View Changes"),
			f1: false,
			menu: [
				{
					id: MenuId.SCMChangesContext,
					group: '0_view',
					when: ContextKeyExpr.equals('config.multiDiffEditor.experimental.enabled', true)
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

		const historyItemParentId = historyItemLast.parentIds.length > 0 ? historyItemLast.parentIds[0] : undefined;
		const historyItemChanges = await historyProvider?.provideHistoryItemChanges(historyItem.id, historyItemParentId);

		if (!historyItemChanges?.length) {
			return;
		}

		const title = historyItems.length === 1 ?
			getHistoryItemEditorTitle(historyItem) :
			localize('historyItemChangesEditorTitle', "All Changes ({0} ↔ {1})", historyItemLast.displayId ?? historyItemLast.id, historyItem.displayId ?? historyItem.id);

		const rootUri = provider.rootUri;
		const path = rootUri ? rootUri.path : provider.label;
		const multiDiffSourceUri = URI.from({ scheme: 'scm-history-item', path: `${path}/${historyItemParentId}..${historyItem.id}` }, true);

		commandService.executeCommand('_workbench.openMultiDiffEditor', { title, multiDiffSourceUri, resources: historyItemChanges });
	}
});

class ListDelegate implements IListVirtualDelegate<TreeElement> {

	getHeight(): number {
		return 22;
	}

	getTemplateId(element: TreeElement): string {
		if (isSCMHistoryItemViewModelTreeElement(element)) {
			return HistoryItemRenderer.TEMPLATE_ID;
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
	readonly labelContainer: HTMLElement;
	readonly elementDisposables: DisposableStore;
	readonly disposables: IDisposable;
}

class HistoryItemRenderer implements ITreeRenderer<SCMHistoryItemViewModelTreeElement, LabelFuzzyScore, HistoryItemTemplate> {

	static readonly TEMPLATE_ID = 'history-item';
	get templateId(): string { return HistoryItemRenderer.TEMPLATE_ID; }

	private readonly _badgesConfig = observableConfigValue<'all' | 'filter'>('scm.graph.badges', 'filter', this._configurationService);

	constructor(
		private readonly hoverDelegate: IHoverDelegate,
		@IClipboardService private readonly _clipboardService: IClipboardService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IHoverService private readonly _hoverService: IHoverService,
		@IThemeService private readonly _themeService: IThemeService
	) { }

	renderTemplate(container: HTMLElement): HistoryItemTemplate {
		// hack
		(container.parentElement!.parentElement!.querySelector('.monaco-tl-twistie')! as HTMLElement).classList.add('force-no-twistie');

		const element = append(container, $('.history-item'));
		const graphContainer = append(element, $('.graph-container'));
		const iconLabel = new IconLabel(element, { supportIcons: true, supportHighlights: true, supportDescriptionHighlights: true });

		const labelContainer = append(element, $('.label-container'));
		element.appendChild(labelContainer);

		return { element, graphContainer, label: iconLabel, labelContainer, elementDisposables: new DisposableStore(), disposables: new DisposableStore() };
	}

	renderElement(node: ITreeNode<SCMHistoryItemViewModelTreeElement, LabelFuzzyScore>, index: number, templateData: HistoryItemTemplate, height: number | undefined): void {
		const historyItemViewModel = node.element.historyItemViewModel;
		const historyItem = historyItemViewModel.historyItem;

		const historyItemHover = this._hoverService.setupManagedHover(this.hoverDelegate, templateData.element, this._getHoverContent(node.element), {
			actions: this._getHoverActions(historyItem),
		});
		templateData.elementDisposables.add(historyItemHover);

		templateData.graphContainer.textContent = '';
		templateData.graphContainer.classList.toggle('current', historyItemViewModel.isCurrent);
		templateData.graphContainer.appendChild(renderSCMHistoryItemGraph(historyItemViewModel));

		const provider = node.element.repository.provider;
		const historyItemRef = provider.historyProvider.get()?.historyItemRef?.get();
		const extraClasses = historyItemRef?.revision === historyItem.id ? ['history-item-current'] : [];
		const [matches, descriptionMatches] = this._processMatches(historyItemViewModel, node.filterData);
		templateData.label.setLabel(historyItem.subject, historyItem.author, { matches, descriptionMatches, extraClasses });

		this._renderBadges(historyItem, templateData);
	}

	private _renderBadges(historyItem: ISCMHistoryItem, templateData: HistoryItemTemplate): void {
		templateData.elementDisposables.add(autorun(reader => {
			const labelConfig = this._badgesConfig.read(reader);

			templateData.labelContainer.textContent = '';
			const firstColoredRef = historyItem.references?.find(ref => ref.color);

			for (const ref of historyItem.references ?? []) {
				if (!ref.color && labelConfig === 'filter') {
					continue;
				}

				if (ref.icon && ThemeIcon.isThemeIcon(ref.icon)) {
					const elements = h('div.label', {
						style: {
							color: ref.color ? asCssVariable(historyItemHoverLabelForeground) : asCssVariable(foreground),
							backgroundColor: ref.color ? asCssVariable(ref.color) : asCssVariable(historyItemHoverDefaultLabelBackground)
						}
					}, [
						h('div.icon@icon'),
						h('div.description@description')
					]);

					elements.icon.classList.add(...ThemeIcon.asClassNameArray(ref.icon));

					elements.description.textContent = ref.name;
					elements.description.style.display = ref === firstColoredRef ? '' : 'none';

					append(templateData.labelContainer, elements.root);
				}
			}
		}));
	}

	private _getHoverActions(historyItem: ISCMHistoryItem) {
		return [
			{
				commandId: 'workbench.scm.action.graph.copyHistoryItemId',
				iconClass: 'codicon.codicon-copy',
				label: historyItem.displayId ?? historyItem.id,
				run: () => this._clipboardService.writeText(historyItem.id)
			},
			{
				commandId: 'workbench.scm.action.graph.copyHistoryItemMessage',
				iconClass: 'codicon.codicon-copy',
				label: localize('historyItemMessage', "Message"),
				run: () => this._clipboardService.writeText(historyItem.message)
			}
		];
	}

	private _getHoverContent(element: SCMHistoryItemViewModelTreeElement): IManagedHoverTooltipMarkdownString {
		const colorTheme = this._themeService.getColorTheme();
		const historyItem = element.historyItemViewModel.historyItem;

		const markdown = new MarkdownString('', { isTrusted: true, supportThemeIcons: true });
		// markdown.appendMarkdown(`$(git-commit) \`${historyItem.displayId ?? historyItem.id}\`\n\n`);

		if (historyItem.author) {
			markdown.appendMarkdown(`$(account) **${historyItem.author}**`);

			if (historyItem.timestamp) {
				const dateFormatter = new Intl.DateTimeFormat(platform.language, { year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: 'numeric' });
				markdown.appendMarkdown(`, $(history) ${fromNow(historyItem.timestamp, true, true)} (${dateFormatter.format(historyItem.timestamp)})`);
			}

			markdown.appendMarkdown('\n\n');
		}

		markdown.appendMarkdown(`${historyItem.message}\n\n`);

		if (historyItem.statistics) {
			markdown.appendMarkdown(`---\n\n`);

			markdown.appendMarkdown(`<span>${historyItem.statistics.files === 1 ?
				localize('fileChanged', "{0} file changed", historyItem.statistics.files) :
				localize('filesChanged', "{0} files changed", historyItem.statistics.files)}</span>`);

			if (historyItem.statistics.insertions) {
				const additionsForegroundColor = colorTheme.getColor(historyItemHoverAdditionsForeground);
				markdown.appendMarkdown(`,&nbsp;<span style="color:${additionsForegroundColor};">${historyItem.statistics.insertions === 1 ?
					localize('insertion', "{0} insertion{1}", historyItem.statistics.insertions, '(+)') :
					localize('insertions', "{0} insertions{1}", historyItem.statistics.insertions, '(+)')}</span>`);
			}

			if (historyItem.statistics.deletions) {
				const deletionsForegroundColor = colorTheme.getColor(historyItemHoverDeletionsForeground);
				markdown.appendMarkdown(`,&nbsp;<span style="color:${deletionsForegroundColor};">${historyItem.statistics.deletions === 1 ?
					localize('deletion', "{0} deletion{1}", historyItem.statistics.deletions, '(-)') :
					localize('deletions', "{0} deletions{1}", historyItem.statistics.deletions, '(-)')}</span>`);
			}
		}

		if ((historyItem.references ?? []).length > 0) {
			markdown.appendMarkdown(`\n\n---\n\n`);
			markdown.appendMarkdown((historyItem.references ?? []).map(ref => {
				const labelIconId = ThemeIcon.isThemeIcon(ref.icon) ? ref.icon.id : '';

				const labelBackgroundColor = ref.color ? asCssVariable(ref.color) : asCssVariable(historyItemHoverDefaultLabelBackground);
				const labelForegroundColor = ref.color ? asCssVariable(historyItemHoverLabelForeground) : asCssVariable(historyItemHoverDefaultLabelForeground);

				return `<span style="color:${labelForegroundColor};background-color:${labelBackgroundColor};border-radius:10px;">&nbsp;$(${labelIconId})&nbsp;${ref.name}&nbsp;</span>`;
			}).join('&nbsp;&nbsp;'));
		}

		return { markdown, markdownNotSupportedFallback: historyItem.message };
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

	disposeElement(element: ITreeNode<SCMHistoryItemViewModelTreeElement, LabelFuzzyScore>, index: number, templateData: HistoryItemTemplate, height: number | undefined): void {
		templateData.elementDisposables.clear();
	}

	disposeTemplate(templateData: HistoryItemTemplate): void {
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

class HistoryItemLoadMoreRenderer implements ITreeRenderer<SCMHistoryItemLoadMoreTreeElement, void, LoadMoreTemplate> {

	static readonly TEMPLATE_ID = 'historyItemLoadMore';
	get templateId(): string { return HistoryItemLoadMoreRenderer.TEMPLATE_ID; }

	constructor(
		private readonly _loadingMore: () => IObservable<boolean>,
		private readonly _loadMoreCallback: (repository: ISCMRepository) => void,
		@IConfigurationService private readonly _configurationService: IConfigurationService
	) { }

	renderTemplate(container: HTMLElement): LoadMoreTemplate {
		// hack
		(container.parentElement!.parentElement!.querySelector('.monaco-tl-twistie')! as HTMLElement).classList.add('force-no-twistie');

		const element = append(container, $('.history-item-load-more'));
		const graphPlaceholder = append(element, $('.graph-placeholder'));
		const historyItemPlaceholderContainer = append(element, $('.history-item-placeholder'));
		const historyItemPlaceholderLabel = new IconLabel(historyItemPlaceholderContainer, { supportIcons: true });

		return { element, graphPlaceholder, historyItemPlaceholderContainer, historyItemPlaceholderLabel, elementDisposables: new DisposableStore(), disposables: new DisposableStore() };
	}

	renderElement(element: ITreeNode<SCMHistoryItemLoadMoreTreeElement, void>, index: number, templateData: LoadMoreTemplate, height: number | undefined): void {
		templateData.graphPlaceholder.textContent = '';
		templateData.graphPlaceholder.style.width = `${SWIMLANE_WIDTH * (element.element.graphColumns.length + 1)}px`;
		templateData.graphPlaceholder.appendChild(renderSCMHistoryGraphPlaceholder(element.element.graphColumns));

		const pageOnScroll = this._configurationService.getValue<boolean>('scm.graph.pageOnScroll') === true;
		templateData.historyItemPlaceholderContainer.classList.toggle('shimmer', pageOnScroll);

		if (pageOnScroll) {
			templateData.historyItemPlaceholderLabel.setLabel('');
			this._loadMoreCallback(element.element.repository);
		} else {
			templateData.elementDisposables.add(autorun(reader => {
				const loadingMore = this._loadingMore().read(reader);
				const icon = `$(${loadingMore ? 'loading~spin' : 'fold-down'})`;

				templateData.historyItemPlaceholderLabel.setLabel(localize('loadMore', "{0} Load More...", icon));
			}));
		}
	}

	disposeElement(element: ITreeNode<SCMHistoryItemLoadMoreTreeElement, void>, index: number, templateData: LoadMoreTemplate, height: number | undefined): void {
		templateData.elementDisposables.clear();
	}

	disposeTemplate(templateData: LoadMoreTemplate): void {
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
		super('element', true, () => this.getHoverOptions(), configurationService, hoverService);
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
		} else if (isSCMHistoryItemLoadMoreTreeElement(element)) {
			const provider = element.repository.provider;
			return `historyItemLoadMore:${provider.id}}`;
		} else {
			throw new Error('Invalid tree element');
		}
	}
}

class SCMHistoryTreeKeyboardNavigationLabelProvider implements IKeyboardNavigationLabelProvider<TreeElement> {
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
}

class SCMHistoryTreeDataSource extends Disposable implements IAsyncDataSource<SCMHistoryViewModel, TreeElement> {

	async getChildren(inputOrElement: SCMHistoryViewModel | TreeElement): Promise<Iterable<TreeElement>> {
		if (!(inputOrElement instanceof SCMHistoryViewModel)) {
			return [];
		}

		// History items
		const children: TreeElement[] = [];
		const historyItems = await inputOrElement.getHistoryItems();
		children.push(...historyItems);

		// Load More element
		const repository = inputOrElement.repository.get();
		const lastHistoryItem = tail(historyItems);
		if (repository && lastHistoryItem && lastHistoryItem.historyItemViewModel.outputSwimlanes.length > 0) {
			children.push({
				repository,
				graphColumns: lastHistoryItem.historyItemViewModel.outputSwimlanes,
				type: 'historyItemLoadMore'
			} satisfies SCMHistoryItemLoadMoreTreeElement);
		}

		return children;
	}

	hasChildren(inputOrElement: SCMHistoryViewModel | TreeElement): boolean {
		return inputOrElement instanceof SCMHistoryViewModel;
	}
}

type HistoryItemRefsFilter = 'all' | 'auto' | ISCMHistoryItemRef[];
type HistoryItemState = {
	historyItemRefs: ISCMHistoryItemRef[];
	viewModels: SCMHistoryItemViewModelTreeElement[];
	loadMore: boolean | string;
};

class SCMHistoryViewModel extends Disposable {

	private readonly _closedRepository = observableFromEvent(
		this,
		this._scmService.onDidRemoveRepository,
		repository => repository);

	private readonly _firstRepository = this._scmService.repositoryCount > 0 ?
		constObservable(Iterable.first(this._scmService.repositories)) :
		observableFromEvent(
			this,
			Event.once(this._scmService.onDidAddRepository),
			repository => repository
		);

	private readonly _selectedRepository = observableValue<'auto' | ISCMRepository>(this, 'auto');

	private readonly _graphRepository = derived(reader => {
		const selectedRepository = this._selectedRepository.read(reader);
		if (selectedRepository !== 'auto') {
			return selectedRepository;
		}

		return this._scmViewService.activeRepository.read(reader);
	});

	/**
	 * The active | selected repository takes precedence over the first repository when the observable
	 * values are updated in the same transaction (or during the initial read of the observable value).
	 */
	readonly repository = latestChangedValue(this, [this._firstRepository, this._graphRepository]);
	readonly historyItemsFilter: ISettableObservable<HistoryItemRefsFilter>;

	private readonly _state = new Map<ISCMRepository, HistoryItemState>();

	constructor(
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@ISCMService private readonly _scmService: ISCMService,
		@ISCMViewService private readonly _scmViewService: ISCMViewService,
		@IStorageService private readonly _storageService: IStorageService
	) {
		super();

		try {
			// Restore references filter from workspace storage
			const filterData = this._storageService.get('scm.graphView.referencesFiler', StorageScope.WORKSPACE) ?? 'auto';
			const filter = filterData === 'auto' || filterData === 'all' ? filterData : JSON.parse(filterData) as ISCMHistoryItemRef[];

			this.historyItemsFilter = observableValue<HistoryItemRefsFilter>(this, filter);
		} catch {
			// Default to `auto` in case the storage value is invalid
			this.historyItemsFilter = observableValue<HistoryItemRefsFilter>(this, 'auto');
		}

		// Closed repository cleanup
		this._register(autorun(reader => {
			const repository = this._closedRepository.read(reader);
			if (!repository) {
				return;
			}

			if (this.repository.get() === repository) {
				this._selectedRepository.set(Iterable.first(this._scmService.repositories) ?? 'auto', undefined);
			}

			this._state.delete(repository);
		}));
	}

	clearRepositoryState(): void {
		const repository = this.repository.get();
		if (!repository) {
			return;
		}

		this._state.delete(repository);
	}

	getRepositoryState(): HistoryItemState | undefined {
		const repository = this.repository.get();
		if (!repository) {
			return;
		}

		return this._state.get(repository);
	}

	setLoadMore(repository: ISCMRepository, loadMore: boolean | string): void {
		const state = this._state.get(repository);
		if (!state) {
			return;
		}

		this._state.set(repository, { ...state, loadMore });
	}

	async getHistoryItems(): Promise<SCMHistoryItemViewModelTreeElement[]> {
		const repository = this.repository.get();
		const historyProvider = repository?.provider.historyProvider.get();

		if (!repository || !historyProvider) {
			return [];
		}

		let state = this._state.get(repository);

		if (!state || state.loadMore !== false) {
			let historyItemRefs = state?.historyItemRefs;
			const historyItems = state?.viewModels
				.map(vm => vm.historyItemViewModel.historyItem) ?? [];

			if (!historyItemRefs) {
				const historyItemsFilter = this.historyItemsFilter.get();

				switch (historyItemsFilter) {
					case 'all':
						historyItemRefs = await historyProvider.provideHistoryItemRefs() ?? [];
						break;
					case 'auto':
						historyItemRefs = [
							historyProvider.historyItemRef.get(),
							historyProvider.historyItemRemoteRef.get(),
							historyProvider.historyItemBaseRef.get(),
						].filter(ref => !!ref);
						break;
					default:
						historyItemRefs = historyItemsFilter;
						break;
				}
			}

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

			state = { historyItemRefs, viewModels, loadMore: false };
			this._state.set(repository, state);
		}

		return state.viewModels;
	}

	setRepository(repository: ISCMRepository | 'auto'): void {
		this._selectedRepository.set(repository, undefined);
	}

	setHistoryItemsFilter(filter: 'all' | 'auto' | ISCMHistoryItemRef[]): void {
		this._storageService.store('scm.graphView.referencesFiler', filter, StorageScope.WORKSPACE, StorageTarget.USER);
		this.historyItemsFilter.set(filter, undefined);
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

	override dispose(): void {
		this._state.clear();
		super.dispose();
	}
}

type RepositoryQuickPickItem = IQuickPickItem & { repository: 'auto' | ISCMRepository };

class RepositoryPicker extends Disposable {
	private readonly _autoQuickPickItem: RepositoryQuickPickItem = {
		label: localize('auto', "Auto"),
		description: localize('activeRepository', "Show the source control graph for the active repository"),
		repository: 'auto'
	};

	constructor(
		@IQuickInputService private readonly _quickInputService: IQuickInputService,
		@ISCMViewService private readonly _scmViewService: ISCMViewService
	) {
		super();
	}

	async pickRepository(): Promise<RepositoryQuickPickItem | undefined> {
		const picks: (RepositoryQuickPickItem | IQuickPickSeparator)[] = [
			this._autoQuickPickItem,
			{ type: 'separator' }];

		picks.push(...this._scmViewService.repositories.map(r => ({
			label: r.provider.name,
			description: r.provider.rootUri?.fsPath,
			iconClass: ThemeIcon.asClassName(Codicon.repo),
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

	async pickHistoryItemRef(): Promise<'all' | 'auto' | ISCMHistoryItemRef[] | undefined> {
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

		return new Promise<'all' | 'auto' | ISCMHistoryItemRef[] | undefined>(resolve => {
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
					resolve(selectedItems.map(item => item.historyItemRef) as ISCMHistoryItemRef[]);
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
	private _tree!: WorkbenchAsyncDataTree<SCMHistoryViewModel, TreeElement, FuzzyScore>;
	private _treeViewModel!: SCMHistoryViewModel;
	private _treeDataSource!: SCMHistoryTreeDataSource;
	private _treeIdentityProvider!: SCMHistoryTreeIdentityProvider;

	private readonly _repositoryLoadMore = observableValue(this, false);
	private readonly _repositoryOutdated = observableValue(this, false);

	private readonly _actionRunner: IActionRunner;
	private readonly _visibilityDisposables = new DisposableStore();

	private readonly _treeOperationSequencer = new Sequencer();
	private readonly _treeLoadMoreSequencer = new Sequencer();
	private readonly _updateChildrenThrottler = new Throttler();

	private readonly _scmProviderCtx: IContextKey<string | undefined>;

	constructor(
		options: IViewPaneOptions,
		@ICommandService private readonly _commandService: ICommandService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@INotificationService private readonly _notificationService: INotificationService,
		@IProgressService private readonly _progressService: IProgressService,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IOpenerService openerService: IOpenerService,
		@IThemeService themeService: IThemeService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IHoverService hoverService: IHoverService
	) {
		super({
			...options,
			titleMenuId: MenuId.SCMHistoryTitle,
			showActions: ViewPaneShowActions.WhenExpanded
		}, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, telemetryService, hoverService);

		this._scmProviderCtx = ContextKeys.SCMProvider.bindTo(this.scopedContextKeyService);

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

		this._treeContainer = append(container, $('.scm-view.scm-history-view'));
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

			// Initial rendering
			await this._progressService.withProgress({ location: this.id }, async () => {
				const firstRepositoryInitialized = derived(this, reader => {
					const repository = this._treeViewModel.repository.read(reader);
					const historyProvider = repository?.provider.historyProvider.read(reader);
					const historyItemRef = historyProvider?.historyItemRef.read(reader);

					return historyItemRef !== undefined ? true : undefined;
				});

				// Wait for first repository to be initialized
				await waitForState(firstRepositoryInitialized);

				// Set tree input
				await this._treeOperationSequencer.queue(async () => {
					await this._tree.setInput(this._treeViewModel);
					this._tree.scrollTop = 0;
				});
			});

			// Repository change
			let isFirstRun = true;
			this._visibilityDisposables.add(autorunWithStore((reader, store) => {
				const repository = this._treeViewModel.repository.read(reader);
				const historyProvider = repository?.provider.historyProvider.read(reader);
				if (!repository || !historyProvider) {
					return;
				}

				// Update context
				this._scmProviderCtx.set(repository.provider.contextValue);

				// HistoryItemId changed (checkout)
				const historyItemRefId = derived(reader => {
					return historyProvider.historyItemRef.read(reader)?.id;
				});
				store.add(runOnChange(historyItemRefId, () => {
					this.refresh();
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

					// If there are any removed history item references we need to check whether they are
					// currently being used in the filter. If they are, we need to update the filter which
					// will result in the graph being refreshed.
					if (changes.removed.length !== 0) {
						const historyItemsFilter = this._treeViewModel.historyItemsFilter.get();

						if (historyItemsFilter !== 'all' && historyItemsFilter !== 'auto') {
							let updateFilter = false;
							const historyItemRefs = [...historyItemsFilter];

							for (const ref of changes.removed) {
								const index = historyItemRefs
									.findIndex(item => item.id === ref.id);

								if (index !== -1) {
									historyItemRefs.splice(index, 1);
									updateFilter = true;
								}
							}

							if (updateFilter) {
								this._treeViewModel.setHistoryItemsFilter(historyItemRefs);
								return;
							}
						}
					}

					this.refresh();
				}));

				// HistoryItemRefs filter changed
				store.add(runOnChange(this._treeViewModel.historyItemsFilter, () => {
					this.refresh();
				}));

				// We skip refreshing the graph on the first execution of the autorun
				// since the graph for the first repository is rendered when the tree
				// input is set.
				if (!isFirstRun) {
					this.refresh();
				}
				isFirstRun = false;
			}));
		});
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

	override getActionViewItem(action: IAction, options?: IDropdownMenuActionViewItemOptions): IActionViewItem | undefined {
		if (action.id === PICK_REPOSITORY_ACTION_ID) {
			const repository = this._treeViewModel?.repository.get();
			if (repository) {
				return new SCMRepositoryActionViewItem(repository, action, options);
			}
		} else if (action.id === PICK_HISTORY_ITEM_REFS_ACTION_ID) {
			const repository = this._treeViewModel?.repository.get();
			const historyItemsFilter = this._treeViewModel?.historyItemsFilter.get();
			if (repository && historyItemsFilter) {
				return new SCMHistoryItemRefsActionViewItem(repository, historyItemsFilter, action, options);
			}
		}

		return super.getActionViewItem(action, options);
	}

	async refresh(): Promise<void> {
		await this._updateChildren(true);

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

		if (!historyProvider) {
			return;
		}

		const historyItemsFilter = this._treeViewModel.historyItemsFilter.get();
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

		if (!repository || !historyItemRef?.revision) {
			return;
		}

		const historyItemFilter = this._treeViewModel.historyItemsFilter.get();

		// Filter is `all`, `auto` or it contains the current history item
		if (Array.isArray(historyItemFilter) &&
			!historyItemFilter.find(r => r.id === historyItemRef.id)) {
			this._notificationService.info(localize('scmGraphViewRevealCurrentHistoryItem', "The current history item is not present in the source control graph. Please use the history item references picker to expand the set of history items in the graph."));
			return;
		}

		const revealTreeNode = (): boolean => {
			const state = this._treeViewModel.getRepositoryState();
			if (!state) {
				return false;
			}

			const historyItemViewModel = state.viewModels.find(item =>
				item.historyItemViewModel.historyItem.id === historyItemRef.revision);

			if (historyItemViewModel && this._tree.hasNode(historyItemViewModel)) {
				this._tree.reveal(historyItemViewModel, 0.5);

				this._tree.setSelection([historyItemViewModel]);
				this._tree.setFocus([historyItemViewModel]);
				return true;
			}

			return false;
		};

		if (revealTreeNode()) {
			return;
		}

		// Fetch current history item
		this._treeViewModel.setLoadMore(repository, historyItemRef.revision);

		// Update the tree
		await this._updateChildren();

		// Reveal node
		revealTreeNode();
	}

	private _createTree(container: HTMLElement): void {
		this._treeIdentityProvider = new SCMHistoryTreeIdentityProvider();

		const historyItemHoverDelegate = this.instantiationService.createInstance(HistoryItemHoverDelegate, this.viewDescriptorService.getViewLocationById(this.id));
		this._register(historyItemHoverDelegate);

		this._treeDataSource = this.instantiationService.createInstance(SCMHistoryTreeDataSource);
		this._register(this._treeDataSource);

		this._tree = this.instantiationService.createInstance(
			WorkbenchAsyncDataTree,
			'SCM History Tree',
			container,
			new ListDelegate(),
			[
				this.instantiationService.createInstance(HistoryItemRenderer, historyItemHoverDelegate),
				this.instantiationService.createInstance(
					HistoryItemLoadMoreRenderer,
					() => this._repositoryLoadMore,
					repository => this._loadMoreCallback(repository)),
			],
			this._treeDataSource,
			{
				accessibilityProvider: new SCMHistoryTreeAccessibilityProvider(),
				identityProvider: this._treeIdentityProvider,
				collapseByDefault: (e: unknown) => false,
				keyboardNavigationLabelProvider: new SCMHistoryTreeKeyboardNavigationLabelProvider(),
				horizontalScrolling: false,
				multipleSelectionSupport: false,
			}
		) as WorkbenchAsyncDataTree<SCMHistoryViewModel, TreeElement, FuzzyScore>;
		this._register(this._tree);

		this._tree.onDidOpen(this._onDidOpen, this, this._store);
		this._tree.onContextMenu(this._onContextMenu, this, this._store);
	}

	private async _onDidOpen(e: IOpenEvent<TreeElement | undefined>): Promise<void> {
		if (!e.element) {
			return;
		} else if (isSCMHistoryItemViewModelTreeElement(e.element)) {
			const historyItem = e.element.historyItemViewModel.historyItem;
			const historyItemParentId = historyItem.parentIds.length > 0 ? historyItem.parentIds[0] : undefined;

			const historyProvider = e.element.repository.provider.historyProvider.get();
			const historyItemChanges = await historyProvider?.provideHistoryItemChanges(historyItem.id, historyItemParentId);
			if (historyItemChanges) {
				const title = getHistoryItemEditorTitle(historyItem);
				const rootUri = e.element.repository.provider.rootUri;
				const path = rootUri ? rootUri.path : e.element.repository.provider.label;
				const multiDiffSourceUri = URI.from({ scheme: 'scm-history-item', path: `${path}/${historyItemParentId}..${historyItem.id}` }, true);

				await this._commandService.executeCommand('_workbench.openMultiDiffEditor', { title, multiDiffSourceUri, resources: historyItemChanges });
			}
		} else if (isSCMHistoryItemLoadMoreTreeElement(e.element)) {
			const pageOnScroll = this.configurationService.getValue<boolean>('scm.graph.pageOnScroll') === true;
			if (!pageOnScroll) {
				this._loadMoreCallback(e.element.repository);
				this._tree.setSelection([]);
			}
		}
	}

	private _onContextMenu(e: ITreeContextMenuEvent<TreeElement | null>): void {
		const element = e.element;

		if (!element || !isSCMHistoryItemViewModelTreeElement(element)) {
			return;
		}

		this.contextMenuService.showContextMenu({
			menuId: MenuId.SCMChangesContext,
			menuActionOptions: {
				arg: element.repository.provider,
				shouldForwardArgs: true
			},
			getAnchor: () => e.anchor,
			getActionsContext: () => element.historyItemViewModel.historyItem
		});
	}

	private async _loadMoreCallback(repository: ISCMRepository): Promise<void> {
		return this._treeLoadMoreSequencer.queue(async () => {
			if (this._repositoryLoadMore.get()) {
				return;
			}

			this._repositoryLoadMore.set(true, undefined);
			this._treeViewModel.setLoadMore(repository, true);

			await this._updateChildren();
			this._repositoryLoadMore.set(false, undefined);
		});
	}

	private _updateChildren(clearCache = false): Promise<void> {
		return this._updateChildrenThrottler.queue(
			() => this._treeOperationSequencer.queue(
				async () => {
					if (clearCache) {
						this._treeViewModel.clearRepositoryState();
					}

					await this._progressService.withProgress({ location: this.id },
						async () => {
							await this._tree.updateChildren(undefined, undefined, undefined, {
								// diffIdentityProvider: this._treeIdentityProvider
							});
						});
				}));
	}

	override dispose(): void {
		this._visibilityDisposables.dispose();
		super.dispose();
	}
}
