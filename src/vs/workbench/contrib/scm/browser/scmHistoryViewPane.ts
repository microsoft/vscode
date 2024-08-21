/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/scm';
import { Event } from 'vs/base/common/event';
import * as platform from 'vs/base/common/platform';
import { $, append } from 'vs/base/browser/dom';
import { IHoverOptions, IManagedHoverTooltipMarkdownString } from 'vs/base/browser/ui/hover/hover';
import { IHoverDelegate } from 'vs/base/browser/ui/hover/hoverDelegate';
import { createInstantHoverDelegate } from 'vs/base/browser/ui/hover/hoverDelegateFactory';
import { IconLabel } from 'vs/base/browser/ui/iconLabel/iconLabel';
import { IListVirtualDelegate } from 'vs/base/browser/ui/list/list';
import { LabelFuzzyScore } from 'vs/base/browser/ui/tree/abstractTree';
import { IAsyncDataSource, ITreeNode, ITreeRenderer } from 'vs/base/browser/ui/tree/tree';
import { fromNow } from 'vs/base/common/date';
import { createMatches, FuzzyScore, IMatch } from 'vs/base/common/filters';
import { MarkdownString } from 'vs/base/common/htmlContent';
import { Disposable, DisposableMap, DisposableStore, IDisposable } from 'vs/base/common/lifecycle';
import { autorun } from 'vs/base/common/observable';
import { ThemeIcon } from 'vs/base/common/themables';
import { localize } from 'vs/nls';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IHoverService, WorkbenchHoverDelegate } from 'vs/platform/hover/browser/hover';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IOpenEvent, WorkbenchAsyncDataTree } from 'vs/platform/list/browser/listService';
import { observableConfigValue } from 'vs/platform/observable/common/platformObservableUtils';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { ColorIdentifier, registerColor } from 'vs/platform/theme/common/colorRegistry';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { IViewPaneOptions, ViewPane } from 'vs/workbench/browser/parts/views/viewPane';
import { IViewDescriptorService, ViewContainerLocation } from 'vs/workbench/common/views';
import { renderSCMHistoryItemGraph, historyItemGroupLocal, historyItemGroupRemote, historyItemGroupBase, historyItemGroupHoverLabelForeground, toISCMHistoryItemViewModelArray } from 'vs/workbench/contrib/scm/browser/scmHistory';
import { RepositoryRenderer } from 'vs/workbench/contrib/scm/browser/scmRepositoryRenderer';
import { getActionViewItemProvider, isSCMHistoryItemViewModelTreeElement, isSCMRepository, isSCMViewService } from 'vs/workbench/contrib/scm/browser/util';
import { ISCMHistoryItemViewModel, SCMHistoryItemViewModelTreeElement } from 'vs/workbench/contrib/scm/common/history';
import { ISCMRepository, ISCMViewService, ISCMViewVisibleRepositoryChangeEvent } from 'vs/workbench/contrib/scm/common/scm';
import { IListAccessibilityProvider } from 'vs/base/browser/ui/list/listWidget';
import { stripIcons } from 'vs/base/common/iconLabels';
import { IWorkbenchLayoutService, Position } from 'vs/workbench/services/layout/browser/layoutService';
import { HoverPosition } from 'vs/base/browser/ui/hover/hoverWidget';
import { MenuId } from 'vs/platform/actions/common/actions';
import { Iterable } from 'vs/base/common/iterator';
import { Sequencer, Throttler } from 'vs/base/common/async';
import { equals } from 'vs/base/common/arrays';
import { URI } from 'vs/base/common/uri';
import { ICommandService } from 'vs/platform/commands/common/commands';

const historyItemAdditionsForeground = registerColor('scm.historyItemAdditionsForeground', 'gitDecoration.addedResourceForeground', localize('scm.historyItemAdditionsForeground', "History item additions foreground color."));
const historyItemDeletionsForeground = registerColor('scm.historyItemDeletionsForeground', 'gitDecoration.deletedResourceForeground', localize('scm.historyItemDeletionsForeground', "History item deletions foreground color."));

type TreeElement = ISCMRepository | SCMHistoryItemViewModelTreeElement;

class ListDelegate implements IListVirtualDelegate<TreeElement> {

	getHeight(): number {
		return 22;
	}

	getTemplateId(element: TreeElement): string {
		if (isSCMRepository(element)) {
			return RepositoryRenderer.TEMPLATE_ID;
		} else if (isSCMHistoryItemViewModelTreeElement(element)) {
			return HistoryItemRenderer.TEMPLATE_ID;
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
			const instantHoverDelegate = createInstantHoverDelegate();
			templateData.elementDisposables.add(instantHoverDelegate);

			for (const label of historyItem.labels) {
				if (label.icon && ThemeIcon.isThemeIcon(label.icon)) {
					const icon = append(templateData.labelContainer, $('div.label'));
					icon.classList.add(...ThemeIcon.asClassNameArray(label.icon));

					const hover = this.hoverService.setupManagedHover(instantHoverDelegate, icon, label.title);
					templateData.elementDisposables.add(hover);
				}
			}
		}
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

		if (historyItem.labels) {
			const historyItemGroupLocalColor = colorTheme.getColor(historyItemGroupLocal);
			const historyItemGroupRemoteColor = colorTheme.getColor(historyItemGroupRemote);
			const historyItemGroupBaseColor = colorTheme.getColor(historyItemGroupBase);

			const historyItemGroupHoverLabelForegroundColor = colorTheme.getColor(historyItemGroupHoverLabelForeground);

			markdown.appendMarkdown(`\n\n---\n\n`);
			markdown.appendMarkdown(historyItem.labels.map(label => {
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

class SCMHistoryTreeDataSource extends Disposable implements IAsyncDataSource<ISCMViewService, TreeElement> {
	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ISCMViewService private readonly scmViewService: ISCMViewService
	) {
		super();
	}

	async getChildren(inputOrElement: ISCMViewService | TreeElement): Promise<Iterable<TreeElement>> {
		const repositoryCount = this.scmViewService.visibleRepositories.length;
		const alwaysShowRepositories = this.configurationService.getValue<boolean>('scm.alwaysShowRepositories') === true;

		if (isSCMViewService(inputOrElement) && (repositoryCount > 1 || alwaysShowRepositories)) {
			return this.scmViewService.visibleRepositories;
		} else if ((isSCMViewService(inputOrElement) && repositoryCount === 1 && !alwaysShowRepositories) || isSCMRepository(inputOrElement)) {
			const children: TreeElement[] = [];
			inputOrElement = isSCMRepository(inputOrElement) ? inputOrElement : this.scmViewService.visibleRepositories[0];

			const historyItems = await this._getHistoryItems(inputOrElement);
			children.push(...historyItems);

			return children;
		}
		return [];
	}

	hasChildren(inputOrElement: ISCMViewService | TreeElement): boolean {
		if (isSCMViewService(inputOrElement)) {
			return this.scmViewService.visibleRepositories.length !== 0;
		} else if (isSCMRepository(inputOrElement)) {
			return true;
		} else if (isSCMHistoryItemViewModelTreeElement(inputOrElement)) {
			return false;
		} else {
			throw new Error('hasChildren not implemented.');
		}
	}

	private async _getHistoryItems(element: ISCMRepository): Promise<SCMHistoryItemViewModelTreeElement[]> {
		const historyProvider = element.provider.historyProvider.get();
		const currentHistoryItemGroup = historyProvider?.currentHistoryItemGroup.get();

		if (!historyProvider || !currentHistoryItemGroup) {
			return [];
		}

		const historyItemGroupIds = [
			currentHistoryItemGroup.id,
			...currentHistoryItemGroup.remote ? [currentHistoryItemGroup.remote.id] : [],
			...currentHistoryItemGroup.base ? [currentHistoryItemGroup.base.id] : [],
		];

		// Common ancestor of current, remote, base independent of the select history item group
		const ancestor = await historyProvider.resolveHistoryItemGroupCommonAncestor2(historyItemGroupIds);
		if (!ancestor) {
			return [];
		}

		const historyItemsElement = await historyProvider.provideHistoryItems2({
			historyItemGroupIds,
			limit: { id: ancestor }
		}) ?? [];

		// If we only have one history item that contains all the labels (current, remote, base),
		// we don't need to show it, unless it is the root commit (does not have any parents) and
		// the repository has not been published yet.
		if (historyItemsElement.length === 1 &&
			(historyItemsElement[0].parentIds.length > 0 || currentHistoryItemGroup.remote)) {
			const currentHistoryItemGroupLabels = [
				currentHistoryItemGroup.name,
				...currentHistoryItemGroup.remote ? [currentHistoryItemGroup.remote.name] : [],
				...currentHistoryItemGroup.base ? [currentHistoryItemGroup.base.name] : [],
			];

			const labels = (historyItemsElement[0].labels ?? [])
				.map(l => l.title);

			if (equals(currentHistoryItemGroupLabels.sort(), labels.sort())) {
				return [];
			}
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

		return toISCMHistoryItemViewModelArray(historyItemsElement, colorMap)
			.map(historyItemViewModel => ({
				repository: element,
				historyItemViewModel,
				type: 'historyItem2'
			}) satisfies SCMHistoryItemViewModelTreeElement);
	}
}

export class SCMHistoryViewPane extends ViewPane {

	private _treeContainer!: HTMLElement;
	private _tree!: WorkbenchAsyncDataTree<ISCMViewService, TreeElement, FuzzyScore>;
	private _treeScrollTop: number | undefined;

	private readonly _repositories = new DisposableMap<ISCMRepository, IDisposable>();
	private readonly _visibilityDisposables = new DisposableStore();

	private readonly _treeOperationSequencer = new Sequencer();
	private readonly _updateChildrenThrottler = new Throttler();

	private readonly _providerCountBadgeConfig = observableConfigValue<'hidden' | 'auto' | 'visible'>('scm.providerCountBadge', 'hidden', this.configurationService);

	constructor(
		options: IViewPaneOptions,
		@ICommandService private readonly commandService: ICommandService,
		@ISCMViewService private readonly scmViewService: ISCMViewService,
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
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, telemetryService, hoverService);

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
					await this._tree.setInput(this.scmViewService);

					Event.filter(this.configurationService.onDidChangeConfiguration,
						e =>
							e.affectsConfiguration('scm.alwaysShowRepositories'),
						this._visibilityDisposables)
						(() => {
							this.updateActions();
							this._updateChildren();
						}, this, this._visibilityDisposables);

					// Add visible repositories
					this.scmViewService.onDidChangeVisibleRepositories(this._onDidChangeVisibleRepositories, this, this._visibilityDisposables);
					this._onDidChangeVisibleRepositories({ added: this.scmViewService.visibleRepositories, removed: Iterable.empty() });

					// Restore scroll position
					if (typeof this._treeScrollTop === 'number') {
						this._tree.scrollTop = this._treeScrollTop;
						this._treeScrollTop = undefined;
					}
				});
			} else {
				this._visibilityDisposables.clear();
				this._repositories.clearAndDisposeAll();

				this._treeScrollTop = this._tree.scrollTop;
			}
		});
	}

	private _createTree(container: HTMLElement): void {
		const historyItemHoverDelegate = this.instantiationService.createInstance(HistoryItemHoverDelegate, this.viewDescriptorService.getViewLocationById(this.id));
		this._register(historyItemHoverDelegate);

		this._tree = this.instantiationService.createInstance(
			WorkbenchAsyncDataTree,
			'SCM History Tree',
			container,
			new ListDelegate(),
			[
				this.instantiationService.createInstance(RepositoryRenderer, MenuId.SCMTitle, getActionViewItemProvider(this.instantiationService)),
				this.instantiationService.createInstance(HistoryItemRenderer, historyItemHoverDelegate),
			],
			this.instantiationService.createInstance(SCMHistoryTreeDataSource),
			{
				accessibilityProvider: new SCMHistoryTreeAccessibilityProvider(),
				collapseByDefault: (e: unknown) => !isSCMRepository(e),
				horizontalScrolling: false,
				multipleSelectionSupport: false,
			}
		) as WorkbenchAsyncDataTree<ISCMViewService, TreeElement, FuzzyScore>;
		this._register(this._tree);

		this._tree.onDidOpen(this._onDidOpen, this, this._store);
	}

	private async _onDidOpen(e: IOpenEvent<TreeElement | undefined>): Promise<void> {
		if (!e.element) {
			return;
		} else if (isSCMRepository(e.element)) {
			this.scmViewService.focus(e.element);
			return;
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

				await this.commandService.executeCommand('_workbench.openMultiDiffEditor', { title, multiDiffSourceUri, resources: historyItemChanges });
			}

			this.scmViewService.focus(e.element.repository);
			return;
		}
	}

	private _onDidChangeVisibleRepositories({ added, removed }: ISCMViewVisibleRepositoryChangeEvent): void {
		// Added repositories
		for (const repository of added) {
			const repositoryDisposables = new DisposableStore();

			repositoryDisposables.add(autorun(reader => {
				repository.provider.historyProvider.read(reader)?.currentHistoryItemGroup.read(reader);
				this._updateChildren(repository);
			}));

			this._repositories.set(repository, repositoryDisposables);
		}

		// Removed repositories
		for (const repository of removed) {
			this._repositories.deleteAndDispose(repository);
		}

		this._updateChildren();
	}

	private _updateChildren(element?: ISCMRepository): void {
		this._updateChildrenThrottler.queue(
			() => this._treeOperationSequencer.queue(
				async () => {
					if (element && this._tree.hasNode(element)) {
						// Refresh specific repository
						await this._tree.updateChildren(element);
					} else {
						// Refresh the entire tree
						await this._tree.updateChildren(undefined);
					}
				}));
	}

	override dispose(): void {
		this._visibilityDisposables.dispose();
		this._repositories.dispose();
		super.dispose();
	}
}
