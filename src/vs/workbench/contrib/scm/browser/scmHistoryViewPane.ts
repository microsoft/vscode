/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/scm';
import { Event } from 'vs/base/common/event';
import * as platform from 'vs/base/common/platform';
import { $, append } from 'vs/base/browser/dom';
import { IHoverOptions, IManagedHover, IManagedHoverTooltipMarkdownString } from 'vs/base/browser/ui/hover/hover';
import { IHoverDelegate } from 'vs/base/browser/ui/hover/hoverDelegate';
import { getDefaultHoverDelegate } from 'vs/base/browser/ui/hover/hoverDelegateFactory';
import { IconLabel } from 'vs/base/browser/ui/iconLabel/iconLabel';
import { IIdentityProvider, IKeyboardNavigationLabelProvider, IListVirtualDelegate } from 'vs/base/browser/ui/list/list';
import { LabelFuzzyScore } from 'vs/base/browser/ui/tree/abstractTree';
import { IAsyncDataSource, ITreeContextMenuEvent, ITreeNode, ITreeRenderer } from 'vs/base/browser/ui/tree/tree';
import { fromNow } from 'vs/base/common/date';
import { createMatches, FuzzyScore, IMatch } from 'vs/base/common/filters';
import { MarkdownString } from 'vs/base/common/htmlContent';
import { combinedDisposable, Disposable, DisposableMap, DisposableStore, IDisposable } from 'vs/base/common/lifecycle';
import { autorun, autorunWithStore, IObservable, ISettableObservable, observableValue } from 'vs/base/common/observable';
import { ThemeIcon } from 'vs/base/common/themables';
import { localize } from 'vs/nls';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ContextKeyExpr, IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IHoverService, WorkbenchHoverDelegate } from 'vs/platform/hover/browser/hover';
import { IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IOpenEvent, WorkbenchAsyncDataTree } from 'vs/platform/list/browser/listService';
import { observableConfigValue } from 'vs/platform/observable/common/platformObservableUtils';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { ColorIdentifier, registerColor } from 'vs/platform/theme/common/colorRegistry';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { IViewPaneOptions, ViewAction, ViewPane } from 'vs/workbench/browser/parts/views/viewPane';
import { IViewDescriptorService, ViewContainerLocation } from 'vs/workbench/common/views';
import { renderSCMHistoryItemGraph, historyItemGroupLocal, historyItemGroupRemote, historyItemGroupBase, historyItemGroupHoverLabelForeground, toISCMHistoryItemViewModelArray, SWIMLANE_WIDTH, renderSCMHistoryGraphPlaceholder } from 'vs/workbench/contrib/scm/browser/scmHistory';
import { RepositoryActionRunner } from 'vs/workbench/contrib/scm/browser/scmRepositoryRenderer';
import { collectContextMenuActions, connectPrimaryMenu, getActionViewItemProvider, isSCMHistoryItemLoadMoreTreeElement, isSCMHistoryItemViewModelTreeElement, isSCMRepository, isSCMViewService } from 'vs/workbench/contrib/scm/browser/util';
import { ISCMHistoryItem, ISCMHistoryItemGroup, ISCMHistoryItemViewModel, SCMHistoryItemLoadMoreTreeElement, SCMHistoryItemViewModelTreeElement } from 'vs/workbench/contrib/scm/common/history';
import { HISTORY_VIEW_PANE_ID, ISCMProvider, ISCMRepository, ISCMService, ISCMViewService, ISCMViewVisibleRepositoryChangeEvent } from 'vs/workbench/contrib/scm/common/scm';
import { IListAccessibilityProvider } from 'vs/base/browser/ui/list/listWidget';
import { stripIcons } from 'vs/base/common/iconLabels';
import { IWorkbenchLayoutService, Position } from 'vs/workbench/services/layout/browser/layoutService';
import { HoverPosition } from 'vs/base/browser/ui/hover/hoverWidget';
import { IMenuService, MenuId, MenuItemAction, registerAction2 } from 'vs/platform/actions/common/actions';
import { Iterable } from 'vs/base/common/iterator';
import { Sequencer, Throttler } from 'vs/base/common/async';
import { URI } from 'vs/base/common/uri';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { ActionRunner, IAction, IActionRunner } from 'vs/base/common/actions';
import { tail } from 'vs/base/common/arrays';
import { Codicon } from 'vs/base/common/codicons';
import { ContextKeys } from 'vs/workbench/contrib/scm/browser/scmViewPane';
import { IActionViewItemProvider } from 'vs/base/browser/ui/actionbar/actionbar';
import { WorkbenchToolBar } from 'vs/platform/actions/browser/toolbar';
import { IProgressService } from 'vs/platform/progress/common/progress';

const historyItemAdditionsForeground = registerColor('scm.historyItemAdditionsForeground', 'gitDecoration.addedResourceForeground', localize('scm.historyItemAdditionsForeground', "History item additions foreground color."));
const historyItemDeletionsForeground = registerColor('scm.historyItemDeletionsForeground', 'gitDecoration.deletedResourceForeground', localize('scm.historyItemDeletionsForeground', "History item deletions foreground color."));

type TreeElement = ISCMRepository | SCMHistoryItemViewModelTreeElement | SCMHistoryItemLoadMoreTreeElement;

registerAction2(class extends ViewAction<SCMHistoryViewPane> {
	constructor() {
		super({
			id: 'workbench.scm.action.refreshGraph',
			title: localize('refreshGraph', "Refresh"),
			viewId: HISTORY_VIEW_PANE_ID,
			f1: false,
			icon: Codicon.refresh,
			menu: {
				id: MenuId.SCMHistoryTitle,
				when: ContextKeyExpr.or(
					ContextKeyExpr.has('scmRepository'),
					ContextKeyExpr.and(ContextKeys.RepositoryVisibilityCount.isEqualTo(1), ContextKeyExpr.equals('config.scm.alwaysShowRepositories', false))
				),
				group: 'navigation',
				order: 1000
			}
		});
	}

	async runInView(accessor: ServicesAccessor, view: SCMHistoryViewPane, provider?: ISCMProvider): Promise<void> {
		const scmService = accessor.get<ISCMService>(ISCMService);
		const repository = provider ? scmService.getRepository(provider.id) : undefined;

		view.refresh(repository);
	}
});

class ListDelegate implements IListVirtualDelegate<TreeElement> {

	getHeight(): number {
		return 22;
	}

	getTemplateId(element: TreeElement): string {
		if (isSCMRepository(element)) {
			return RepositoryRenderer.TEMPLATE_ID;
		} else if (isSCMHistoryItemViewModelTreeElement(element)) {
			return HistoryItemRenderer.TEMPLATE_ID;
		} else if (isSCMHistoryItemLoadMoreTreeElement(element)) {
			return HistoryItemLoadMoreRenderer.TEMPLATE_ID;
		} else {
			throw new Error('Unknown element');
		}
	}
}

interface RepositoryTemplate {
	readonly label: IconLabel;
	readonly labelCustomHover: IManagedHover;
	readonly stateLabel: HTMLElement;
	readonly toolBar: WorkbenchToolBar;
	readonly elementDisposables: DisposableStore;
	readonly templateDisposable: IDisposable;
}

class RepositoryRenderer implements ITreeRenderer<ISCMRepository, FuzzyScore, RepositoryTemplate> {

	static readonly TEMPLATE_ID = 'repository';
	get templateId(): string { return RepositoryRenderer.TEMPLATE_ID; }

	constructor(
		private readonly description: (repository: ISCMRepository) => IObservable<string>,
		private readonly actionRunner: IActionRunner,
		private readonly actionViewItemProvider: IActionViewItemProvider,
		@ICommandService private commandService: ICommandService,
		@IContextKeyService private contextKeyService: IContextKeyService,
		@IContextMenuService private contextMenuService: IContextMenuService,
		@IHoverService private hoverService: IHoverService,
		@IKeybindingService private keybindingService: IKeybindingService,
		@IMenuService private menuService: IMenuService,
		@ITelemetryService private telemetryService: ITelemetryService
	) { }

	renderTemplate(container: HTMLElement): RepositoryTemplate {
		// hack
		if (container.classList.contains('monaco-tl-contents')) {
			(container.parentElement!.parentElement!.querySelector('.monaco-tl-twistie')! as HTMLElement).classList.add('force-twistie');
		}

		const element = append(container, $('.scm-provider'));
		const label = new IconLabel(element);
		const labelCustomHover = this.hoverService.setupManagedHover(getDefaultHoverDelegate('mouse'), label.element, '', {});
		const stateLabel = append(element, $('div.state-label.monaco-count-badge.long'));
		const toolBar = new WorkbenchToolBar(append(element, $('.actions')), { actionRunner: this.actionRunner, actionViewItemProvider: this.actionViewItemProvider, resetMenu: MenuId.SCMHistoryTitle }, this.menuService, this.contextKeyService, this.contextMenuService, this.keybindingService, this.commandService, this.telemetryService);

		return { label, labelCustomHover, stateLabel, toolBar, elementDisposables: new DisposableStore(), templateDisposable: combinedDisposable(labelCustomHover, toolBar) };
	}

	renderElement(arg: ISCMRepository | ITreeNode<ISCMRepository, FuzzyScore>, index: number, templateData: RepositoryTemplate, height: number | undefined): void {
		const repository = isSCMRepository(arg) ? arg : arg.element;

		templateData.elementDisposables.add(autorun(reader => {
			const description = this.description(repository).read(reader);
			templateData.stateLabel.style.display = description !== '' ? '' : 'none';
			templateData.stateLabel.textContent = description;
		}));

		templateData.label.setLabel(repository.provider.name);
		templateData.labelCustomHover.update(repository.provider.rootUri ? `${repository.provider.label}: ${repository.provider.rootUri.fsPath}` : repository.provider.label);

		templateData.elementDisposables.add(autorunWithStore((reader, store) => {
			const currentHistoryItemGroup = repository.provider.historyProvider.read(reader)?.currentHistoryItemGroup.read(reader);
			if (!currentHistoryItemGroup) {
				templateData.toolBar.setActions([], []);
				return;
			}

			const contextKeyService = this.contextKeyService.createOverlay([
				['scmRepository', repository.id],
				['scmProvider', repository.provider.contextValue],
				['scmHistoryItemGroupHasRemote', !!currentHistoryItemGroup.remote],
			]);
			const menu = this.menuService.createMenu(MenuId.SCMHistoryTitle, contextKeyService);
			store.add(connectPrimaryMenu(menu, (primary, secondary) => {
				templateData.toolBar.setActions(primary, secondary);
			}));
		}));

		templateData.toolBar.context = repository.provider;
	}

	disposeElement(group: ISCMRepository | ITreeNode<ISCMRepository, FuzzyScore>, index: number, template: RepositoryTemplate): void {
		template.elementDisposables.clear();
	}

	disposeTemplate(templateData: RepositoryTemplate): void {
		templateData.elementDisposables.dispose();
		templateData.templateDisposable.dispose();
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

	constructor(
		private readonly hoverDelegate: IHoverDelegate,
		@IHoverService private readonly hoverService: IHoverService,
		@IThemeService private readonly themeService: IThemeService
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

		const historyItemHover = this.hoverService.setupManagedHover(this.hoverDelegate, templateData.element, this.getTooltip(node.element));
		templateData.elementDisposables.add(historyItemHover);

		templateData.graphContainer.textContent = '';
		templateData.graphContainer.appendChild(renderSCMHistoryItemGraph(historyItemViewModel));

		const [matches, descriptionMatches] = this.processMatches(historyItemViewModel, node.filterData);
		templateData.label.setLabel(historyItem.message, historyItem.author, { matches, descriptionMatches });

		templateData.labelContainer.textContent = '';
		if (historyItem.labels) {
			// Get lits of labels to render (current, remote, base)
			const labels = this.getLabels(node.element.repository);

			for (const label of historyItem.labels) {
				if (label.icon && ThemeIcon.isThemeIcon(label.icon) && labels.includes(label.title)) {
					const icon = append(templateData.labelContainer, $('div.label'));
					icon.classList.add(...ThemeIcon.asClassNameArray(label.icon));
				}
			}
		}
	}

	private getLabels(repository: ISCMRepository): string[] {
		const currentHistoryItemGroup = repository.provider.historyProvider.get()?.currentHistoryItemGroup.get();
		if (!currentHistoryItemGroup) {
			return [];
		}

		return [
			currentHistoryItemGroup.name,
			currentHistoryItemGroup.remote?.name,
			currentHistoryItemGroup.base?.name]
			.filter(l => l !== undefined);
	}

	private getTooltip(element: SCMHistoryItemViewModelTreeElement): IManagedHoverTooltipMarkdownString {
		const colorTheme = this.themeService.getColorTheme();
		const historyItem = element.historyItemViewModel.historyItem;
		const currentHistoryItemGroup = element.repository.provider.historyProvider.get()?.currentHistoryItemGroup?.get();

		const markdown = new MarkdownString('', { isTrusted: true, supportThemeIcons: true });

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
				const historyItemAdditionsForegroundColor = colorTheme.getColor(historyItemAdditionsForeground);
				markdown.appendMarkdown(`,&nbsp;<span style="color:${historyItemAdditionsForegroundColor};">${historyItem.statistics.insertions === 1 ?
					localize('insertion', "{0} insertion{1}", historyItem.statistics.insertions, '(+)') :
					localize('insertions', "{0} insertions{1}", historyItem.statistics.insertions, '(+)')}</span>`);
			}

			if (historyItem.statistics.deletions) {
				const historyItemDeletionsForegroundColor = colorTheme.getColor(historyItemDeletionsForeground);
				markdown.appendMarkdown(`,&nbsp;<span style="color:${historyItemDeletionsForegroundColor};">${historyItem.statistics.deletions === 1 ?
					localize('deletion', "{0} deletion{1}", historyItem.statistics.deletions, '(-)') :
					localize('deletions', "{0} deletions{1}", historyItem.statistics.deletions, '(-)')}</span>`);
			}
		}

		const labels = this.getLabels(element.repository);
		const historyItemLabels = (historyItem.labels ?? [])
			.filter(l => labels.includes(l.title));

		if (historyItemLabels.length > 0) {
			const historyItemGroupLocalColor = colorTheme.getColor(historyItemGroupLocal);
			const historyItemGroupRemoteColor = colorTheme.getColor(historyItemGroupRemote);
			const historyItemGroupBaseColor = colorTheme.getColor(historyItemGroupBase);

			const historyItemGroupHoverLabelForegroundColor = colorTheme.getColor(historyItemGroupHoverLabelForeground);

			markdown.appendMarkdown(`\n\n---\n\n`);
			markdown.appendMarkdown(historyItemLabels.map(label => {
				const historyItemGroupHoverLabelBackgroundColor =
					label.title === currentHistoryItemGroup?.name ? historyItemGroupLocalColor :
						label.title === currentHistoryItemGroup?.remote?.name ? historyItemGroupRemoteColor :
							label.title === currentHistoryItemGroup?.base?.name ? historyItemGroupBaseColor :
								undefined;

				const historyItemGroupHoverLabelIconId = ThemeIcon.isThemeIcon(label.icon) ? label.icon.id : '';

				return `<span style="color:${historyItemGroupHoverLabelForegroundColor};background-color:${historyItemGroupHoverLabelBackgroundColor};border-radius:2px;">&nbsp;$(${historyItemGroupHoverLabelIconId})&nbsp;${label.title}&nbsp;</span>`;
			}).join('&nbsp;&nbsp;'));
		}

		return { markdown, markdownNotSupportedFallback: historyItem.message };
	}

	private processMatches(historyItemViewModel: ISCMHistoryItemViewModel, filterData: LabelFuzzyScore | undefined): [IMatch[] | undefined, IMatch[] | undefined] {
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
		private readonly _loadingMore: (repository: ISCMRepository) => IObservable<boolean>,
		private readonly _loadMoreCallback: (repository: ISCMRepository) => void,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@ISCMViewService private readonly _scmViewService: ISCMViewService) { }

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
		const repositoryCount = this._scmViewService.visibleRepositories.length;
		const alwaysShowRepositories = this._configurationService.getValue<boolean>('scm.alwaysShowRepositories') === true;

		templateData.graphPlaceholder.textContent = '';
		templateData.graphPlaceholder.style.width = `${SWIMLANE_WIDTH * (element.element.graphColumns.length + 1)}px`;
		templateData.graphPlaceholder.appendChild(renderSCMHistoryGraphPlaceholder(element.element.graphColumns));

		templateData.historyItemPlaceholderContainer.classList.toggle('shimmer', repositoryCount === 1 && !alwaysShowRepositories);

		if (repositoryCount > 1 || alwaysShowRepositories) {
			templateData.elementDisposables.add(autorun(reader => {
				const loadingMore = this._loadingMore(element.element.repository).read(reader);
				const icon = `$(${loadingMore ? 'loading~spin' : 'fold-down'})`;

				templateData.historyItemPlaceholderLabel.setLabel(localize('loadMore', "{0} Load More...", icon));
			}));
		} else {
			templateData.historyItemPlaceholderLabel.setLabel('');
			this._loadMoreCallback(element.element.repository);
		}
	}

	disposeTemplate(templateData: LoadMoreTemplate): void {
		templateData.disposables.dispose();
	}
}

class HistoryItemActionRunner extends ActionRunner {
	constructor(private readonly getSelectedHistoryItems: () => SCMHistoryItemViewModelTreeElement[]) {
		super();
	}

	protected override async runAction(action: IAction, context: SCMHistoryItemViewModelTreeElement): Promise<any> {
		if (!(action instanceof MenuItemAction)) {
			return super.runAction(action, context);
		}

		const args: (ISCMProvider | ISCMHistoryItem)[] = [];
		args.push(context.repository.provider);

		const selection = this.getSelectedHistoryItems();
		const contextIsSelected = selection.some(s => s === context);
		if (contextIsSelected && selection.length > 1) {
			args.push(...selection.map(h => (
				{
					id: h.historyItemViewModel.historyItem.id,
					parentIds: h.historyItemViewModel.historyItem.parentIds,
					message: h.historyItemViewModel.historyItem.message,
					author: h.historyItemViewModel.historyItem.author,
					icon: h.historyItemViewModel.historyItem.icon,
					timestamp: h.historyItemViewModel.historyItem.timestamp,
					statistics: h.historyItemViewModel.historyItem.statistics,
				} satisfies ISCMHistoryItem)));
		} else {
			args.push({
				id: context.historyItemViewModel.historyItem.id,
				parentIds: context.historyItemViewModel.historyItem.parentIds,
				message: context.historyItemViewModel.historyItem.message,
				author: context.historyItemViewModel.historyItem.author,
				icon: context.historyItemViewModel.historyItem.icon,
				timestamp: context.historyItemViewModel.historyItem.timestamp,
				statistics: context.historyItemViewModel.historyItem.statistics,
			} satisfies ISCMHistoryItem);
		}

		await action.run(...args);
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

type HistoryItemState = { currentHistoryItemGroup: ISCMHistoryItemGroup; items: ISCMHistoryItem[]; loadMore: boolean };

class SCMHistoryTreeDataSource extends Disposable implements IAsyncDataSource<ISCMViewService, TreeElement> {
	private readonly _state = new Map<ISCMRepository, HistoryItemState>();

	constructor(
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@ISCMViewService private readonly _scmViewService: ISCMViewService
	) {
		super();
	}

	async getChildren(inputOrElement: ISCMViewService | TreeElement): Promise<Iterable<TreeElement>> {
		const repositoryCount = this._scmViewService.visibleRepositories.length;
		const alwaysShowRepositories = this._configurationService.getValue<boolean>('scm.alwaysShowRepositories') === true;

		if (isSCMViewService(inputOrElement) && (repositoryCount > 1 || alwaysShowRepositories)) {
			return this._scmViewService.visibleRepositories;
		} else if ((isSCMViewService(inputOrElement) && repositoryCount === 1 && !alwaysShowRepositories) || isSCMRepository(inputOrElement)) {
			const children: TreeElement[] = [];
			inputOrElement = isSCMRepository(inputOrElement) ? inputOrElement : this._scmViewService.visibleRepositories[0];

			const historyItems = await this._getHistoryItems(inputOrElement);
			children.push(...historyItems);

			const lastHistoryItem = tail(historyItems);
			if (lastHistoryItem && lastHistoryItem.historyItemViewModel.outputSwimlanes.length > 0) {
				children.push({
					repository: inputOrElement,
					graphColumns: lastHistoryItem.historyItemViewModel.outputSwimlanes,
					type: 'historyItemLoadMore'
				} satisfies SCMHistoryItemLoadMoreTreeElement);
			}

			return children;
		}
		return [];
	}

	hasChildren(inputOrElement: ISCMViewService | TreeElement): boolean {
		if (isSCMViewService(inputOrElement)) {
			return this._scmViewService.visibleRepositories.length !== 0;
		} else if (isSCMRepository(inputOrElement)) {
			return true;
		} else if (isSCMHistoryItemViewModelTreeElement(inputOrElement)) {
			return false;
		} else if (isSCMHistoryItemLoadMoreTreeElement(inputOrElement)) {
			return false;
		} else {
			throw new Error('hasChildren not implemented.');
		}
	}

	clearState(repository?: ISCMRepository): void {
		if (!repository) {
			this._state.clear();
			return;
		}

		this._state.delete(repository);
	}

	loadMore(repository: ISCMRepository): void {
		const state = this._state.get(repository);
		if (!state) {
			return;
		}

		this._state.set(repository, { ...state, loadMore: true });
	}

	private async _getHistoryItems(element: ISCMRepository): Promise<SCMHistoryItemViewModelTreeElement[]> {
		let state = this._state.get(element);
		const historyProvider = element.provider.historyProvider.get();
		const currentHistoryItemGroup = state?.currentHistoryItemGroup ?? historyProvider?.currentHistoryItemGroup.get();

		if (!historyProvider || !currentHistoryItemGroup) {
			return [];
		}

		if (!state || state.loadMore) {
			const historyItemGroupIds = [
				currentHistoryItemGroup.revision ?? currentHistoryItemGroup.id,
				...currentHistoryItemGroup.remote ? [currentHistoryItemGroup.remote.revision ?? currentHistoryItemGroup.remote.id] : [],
				...currentHistoryItemGroup.base ? [currentHistoryItemGroup.base.revision ?? currentHistoryItemGroup.base.id] : [],
			];

			const existingHistoryItems = state?.items ?? [];
			const historyItems = await historyProvider.provideHistoryItems2({
				historyItemGroupIds, limit: 50, skip: existingHistoryItems.length
			}) ?? [];

			state = {
				currentHistoryItemGroup,
				items: [...existingHistoryItems, ...historyItems],
				loadMore: false
			};

			this._state.set(element, state);
		}

		// Create the color map
		const colorMap = new Map<string, ColorIdentifier>([
			[currentHistoryItemGroup.name, historyItemGroupLocal]
		]);
		if (currentHistoryItemGroup.remote) {
			colorMap.set(currentHistoryItemGroup.remote.name, historyItemGroupRemote);
		}
		if (currentHistoryItemGroup.base) {
			colorMap.set(currentHistoryItemGroup.base.name, historyItemGroupBase);
		}

		return toISCMHistoryItemViewModelArray(state.items, colorMap)
			.map(historyItemViewModel => ({
				repository: element,
				historyItemViewModel,
				type: 'historyItem2'
			}) satisfies SCMHistoryItemViewModelTreeElement);
	}

	override dispose(): void {
		this._state.clear();
		super.dispose();
	}
}

export class SCMHistoryViewPane extends ViewPane {

	private _treeContainer!: HTMLElement;
	private _tree!: WorkbenchAsyncDataTree<ISCMViewService, TreeElement, FuzzyScore>;
	private _treeDataSource!: SCMHistoryTreeDataSource;
	private _treeIdentityProvider!: SCMHistoryTreeIdentityProvider;
	private _repositoryDescription = new Map<ISCMRepository, ISettableObservable<string>>();
	private _repositoryLoadMore = new Map<ISCMRepository, ISettableObservable<boolean>>();

	private readonly _actionRunner: IActionRunner;
	private readonly _repositories = new DisposableMap<ISCMRepository>();
	private readonly _visibilityDisposables = new DisposableStore();

	private readonly _treeOperationSequencer = new Sequencer();
	private readonly _updateChildrenThrottler = new Throttler();

	private readonly _scmHistoryItemGroupHasRemoteContextKey: IContextKey<boolean | undefined>;

	private readonly _providerCountBadgeConfig = observableConfigValue<'hidden' | 'auto' | 'visible'>('scm.providerCountBadge', 'hidden', this.configurationService);

	constructor(
		options: IViewPaneOptions,
		@ICommandService private readonly _commandService: ICommandService,
		@ISCMViewService private readonly _scmViewService: ISCMViewService,
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
		super({ ...options, titleMenuId: MenuId.SCMHistoryTitle }, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, telemetryService, hoverService);

		this._scmHistoryItemGroupHasRemoteContextKey = this.scopedContextKeyService.createKey('scmHistoryItemGroupHasRemote', undefined);

		this._actionRunner = this.instantiationService.createInstance(SCMHistoryViewPaneActionRunner);
		this._register(this._actionRunner);

		this._register(this._updateChildrenThrottler);
	}

	protected override layoutBody(height: number, width: number): void {
		super.layoutBody(height, width);
		this._tree.layout(height, width);
	}

	protected override renderBody(container: HTMLElement): void {
		super.renderBody(container);

		this._treeContainer = append(container, $('.scm-view.scm-history-view'));
		this._treeContainer.classList.add('file-icon-themable-tree');

		this._register(autorun(reader => {
			const providerCountBadgeConfig = this._providerCountBadgeConfig.read(reader);

			this._treeContainer.classList.toggle('hide-provider-counts', providerCountBadgeConfig === 'hidden');
			this._treeContainer.classList.toggle('auto-provider-counts', providerCountBadgeConfig === 'auto');
		}));

		this._createTree(this._treeContainer);

		this.onDidChangeBodyVisibility(visible => {
			if (visible) {
				this._treeOperationSequencer.queue(async () => {
					await this._tree.setInput(this._scmViewService);

					Event.filter(this.configurationService.onDidChangeConfiguration,
						e =>
							e.affectsConfiguration('scm.alwaysShowRepositories'),
						this._visibilityDisposables)
						(() => {
							this.updateActions();
							this.refresh();
						}, this, this._visibilityDisposables);

					// Add visible repositories
					this._scmViewService.onDidChangeVisibleRepositories(this._onDidChangeVisibleRepositories, this, this._visibilityDisposables);
					this._onDidChangeVisibleRepositories({ added: this._scmViewService.visibleRepositories, removed: Iterable.empty() });

					this._tree.scrollTop = 0;
				});
			} else {
				this._treeDataSource.clearState();
				this._visibilityDisposables.clear();
				this._repositories.clearAndDisposeAll();
			}
		});
	}

	override getActionRunner(): IActionRunner | undefined {
		return this._actionRunner;
	}

	async refresh(repository?: ISCMRepository): Promise<void> {
		this._treeDataSource.clearState(repository);
		await this._updateChildren(repository);

		this._setRepositoryDescription(repository, '');
		this._tree.scrollTop = 0;
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
				this.instantiationService.createInstance(RepositoryRenderer, repository => this._getRepositoryDescription(repository), this._actionRunner, getActionViewItemProvider(this.instantiationService)),
				this.instantiationService.createInstance(HistoryItemRenderer, historyItemHoverDelegate),
				this.instantiationService.createInstance(HistoryItemLoadMoreRenderer, repository => this._getLoadMore(repository), repository => this._loadMoreCallback(repository)),
			],
			this._treeDataSource,
			{
				accessibilityProvider: new SCMHistoryTreeAccessibilityProvider(),
				identityProvider: this._treeIdentityProvider,
				collapseByDefault: (e: unknown) => !isSCMRepository(e),
				keyboardNavigationLabelProvider: new SCMHistoryTreeKeyboardNavigationLabelProvider(),
				horizontalScrolling: false,
				multipleSelectionSupport: false,
			}
		) as WorkbenchAsyncDataTree<ISCMViewService, TreeElement, FuzzyScore>;
		this._register(this._tree);

		this._tree.onDidOpen(this._onDidOpen, this, this._store);
		this._tree.onContextMenu(this._onContextMenu, this, this._store);
	}

	private async _onDidOpen(e: IOpenEvent<TreeElement | undefined>): Promise<void> {
		if (!e.element) {
			return;
		} else if (isSCMRepository(e.element)) {
			this._scmViewService.focus(e.element);
		} else if (isSCMHistoryItemViewModelTreeElement(e.element)) {
			const historyItem = e.element.historyItemViewModel.historyItem;
			const historyItemParentId = historyItem.parentIds.length > 0 ? historyItem.parentIds[0] : undefined;

			const historyProvider = e.element.repository.provider.historyProvider.get();
			const historyItemChanges = await historyProvider?.provideHistoryItemChanges(historyItem.id, historyItemParentId);
			if (historyItemChanges) {
				const title = `${historyItem.id.substring(0, 8)} - ${historyItem.message}`;

				const rootUri = e.element.repository.provider.rootUri;
				const path = rootUri ? rootUri.path : e.element.repository.provider.label;
				const multiDiffSourceUri = URI.from({ scheme: 'scm-history-item', path: `${path}/${historyItemParentId}..${historyItem.id}` }, true);

				await this._commandService.executeCommand('_workbench.openMultiDiffEditor', { title, multiDiffSourceUri, resources: historyItemChanges });
			}

			this._scmViewService.focus(e.element.repository);
		} else if (isSCMHistoryItemLoadMoreTreeElement(e.element)) {
			const repositoryCount = this._scmViewService.visibleRepositories.length;
			const alwaysShowRepositories = this.configurationService.getValue<boolean>('scm.alwaysShowRepositories') === true;

			if (repositoryCount > 1 || alwaysShowRepositories) {
				this._loadMoreCallback(e.element.repository);
				this._tree.setSelection([]);
			}
		}
	}

	private _onContextMenu(e: ITreeContextMenuEvent<TreeElement | null>): void {
		const element = e.element;

		if (!element) {
			return;
		}

		let actions: IAction[] = [];
		let context: TreeElement | ISCMProvider = element;
		let actionRunner: IActionRunner = new HistoryItemActionRunner(() => this._getSelectedHistoryItems());

		if (isSCMRepository(element)) {
			const menus = this._scmViewService.menus.getRepositoryMenus(element.provider);
			const menu = menus.repositoryContextMenu;

			actions = collectContextMenuActions(menu);
			actionRunner = new RepositoryActionRunner(() => this._getSelectedRepositories());
			context = element.provider;
		} else if (isSCMHistoryItemViewModelTreeElement(element)) {
			const menus = this._scmViewService.menus.getRepositoryMenus(element.repository.provider);
			const menu = menus.historyProviderMenu?.getHistoryItemMenu2(element);

			actions = menu ? collectContextMenuActions(menu) : [];
		}

		actionRunner.onWillRun(() => this._tree.domFocus());

		this.contextMenuService.showContextMenu({
			getAnchor: () => e.anchor,
			getActions: () => actions,
			getActionsContext: () => context,
			actionRunner
		});
	}

	private _onDidChangeVisibleRepositories({ added, removed }: ISCMViewVisibleRepositoryChangeEvent): void {
		// Added repositories
		for (const repository of added) {
			const repositoryDisposables = new DisposableStore();

			repositoryDisposables.add(autorun(reader => {
				const historyProvider = repository.provider.historyProvider.read(reader);
				const currentHistoryItemGroupId = historyProvider?.currentHistoryItemGroupId.read(reader);
				const currentHistoryItemGroupRevision = historyProvider?.currentHistoryItemGroupRevision.read(reader);
				const currentHistoryItemGroupRemoteId = historyProvider?.currentHistoryItemGroupRemoteId.read(reader);

				// Update scmHistoryItemGroupHasRemote context key
				if (this._scmViewService.visibleRepositories.length === 1) {
					this._scmHistoryItemGroupHasRemoteContextKey.set(!!currentHistoryItemGroupRemoteId);
				} else {
					this._scmHistoryItemGroupHasRemoteContextKey.reset();
				}

				if (!currentHistoryItemGroupId && !currentHistoryItemGroupRevision && !currentHistoryItemGroupRemoteId) {
					return;
				}

				this.refresh(repository);
			}));

			repositoryDisposables.add(autorun(reader => {
				const historyProvider = repository.provider.historyProvider.read(reader);
				const currentHistoryItemGroupRemoteRevision = historyProvider?.currentHistoryItemGroupRemoteRevision.read(reader);

				if (!currentHistoryItemGroupRemoteRevision) {
					return;
				}

				// Remote revision changes can occur as a result of a user action (Fetch, Push) but
				// it can also occur as a result of background action (Auto Fetch). If the tree is
				// scrolled to the top, we can safely refresh the tree.
				if (this._tree.scrollTop === 0) {
					this.refresh(repository);
					return;
				}

				// Set the "OUTDATED" description
				const description = localize('outdated', "OUTDATED");
				this._setRepositoryDescription(this._isRepositoryNodeVisible() ? repository : undefined, description);
			}));

			this._repositories.set(repository, repositoryDisposables);
		}

		// Removed repositories
		for (const repository of removed) {
			this._treeDataSource.clearState(repository);
			this._repositoryDescription.delete(repository);
			this._repositoryLoadMore.delete(repository);
			this._repositories.deleteAndDispose(repository);
		}

		this._updateChildren();
	}

	private _getSelectedRepositories(): ISCMRepository[] {
		const focusedRepositories = this._tree.getFocus().filter(r => !!r && isSCMRepository(r))! as ISCMRepository[];
		const selectedRepositories = this._tree.getSelection().filter(r => !!r && isSCMRepository(r))! as ISCMRepository[];

		return Array.from(new Set<ISCMRepository>([...focusedRepositories, ...selectedRepositories]));
	}

	private _getSelectedHistoryItems(): SCMHistoryItemViewModelTreeElement[] {
		return this._tree.getSelection()
			.filter(r => !!r && isSCMHistoryItemViewModelTreeElement(r))!;
	}

	private _getLoadMore(repository: ISCMRepository): ISettableObservable<boolean> {
		let loadMore = this._repositoryLoadMore.get(repository);
		if (!loadMore) {
			loadMore = observableValue<boolean>(this, false);
			this._repositoryLoadMore.set(repository, loadMore);
		}

		return loadMore;
	}

	private async _loadMoreCallback(repository: ISCMRepository): Promise<void> {
		const loadMore = this._getLoadMore(repository);
		if (loadMore.get()) {
			return;
		}

		loadMore.set(true, undefined);
		this._treeDataSource.loadMore(repository);

		await this._updateChildren(repository);
		loadMore.set(false, undefined);
	}

	private _getRepositoryDescription(repository: ISCMRepository): ISettableObservable<string> {
		let description = this._repositoryDescription.get(repository);
		if (!description) {
			description = observableValue<string>(this, '');
			this._repositoryDescription.set(repository, description);
		}

		return description;
	}

	private _setRepositoryDescription(repository: ISCMRepository | undefined, description: string): void {
		if (!repository) {
			this.updateTitleDescription(description);
		} else {
			this._getRepositoryDescription(repository).set(description, undefined);
		}
	}

	private _isRepositoryNodeVisible(): boolean {
		const repositoryCount = this._scmViewService.visibleRepositories.length;
		const alwaysShowRepositories = this.configurationService.getValue<boolean>('scm.alwaysShowRepositories') === true;

		return alwaysShowRepositories || repositoryCount > 1;
	}

	private _updateChildren(element?: ISCMRepository): Promise<void> {
		return this._updateChildrenThrottler.queue(
			() => this._treeOperationSequencer.queue(
				async () => {
					await this._progressService.withProgress({ location: this.id },
						async () => {
							if (element && this._tree.hasNode(element)) {
								// Refresh specific repository
								await this._tree.updateChildren(element, undefined, undefined, {
									// diffIdentityProvider: this._treeIdentityProvider
								});
							} else {
								// Refresh the entire tree
								await this._tree.updateChildren(undefined, undefined, undefined, {
									// diffIdentityProvider: this._treeIdentityProvider
								});
							}
						});
				}));
	}

	override dispose(): void {
		this._visibilityDisposables.dispose();
		this._repositories.dispose();
		super.dispose();
	}
}
