/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { IKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { ActionBar, IActionViewItem } from 'vs/base/browser/ui/actionbar/actionbar';
import * as aria from 'vs/base/browser/ui/aria/aria';
import { Button } from 'vs/base/browser/ui/button/button';
import { IIdentityProvider, IKeyboardNavigationLabelProvider, IListVirtualDelegate } from 'vs/base/browser/ui/list/list';
import { DefaultKeyboardNavigationDelegate, IListAccessibilityProvider } from 'vs/base/browser/ui/list/listWidget';
import { ObjectTree } from 'vs/base/browser/ui/tree/objectTree';
import { ITreeContextMenuEvent, ITreeEvent, ITreeFilter, ITreeNode, ITreeRenderer, ITreeSorter, TreeFilterResult, TreeVisibility } from 'vs/base/browser/ui/tree/tree';
import { Action, IAction } from 'vs/base/common/actions';
import { DeferredPromise, RunOnceScheduler } from 'vs/base/common/async';
import { Color, RGBA } from 'vs/base/common/color';
import { throttle } from 'vs/base/common/decorators';
import { Event } from 'vs/base/common/event';
import { FuzzyScore } from 'vs/base/common/filters';
import { splitGlobAware } from 'vs/base/common/glob';
import { Iterable } from 'vs/base/common/iterator';
import { KeyCode } from 'vs/base/common/keyCodes';
import { Disposable, DisposableStore, dispose, IDisposable, MutableDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { isDefined } from 'vs/base/common/types';
import { URI } from 'vs/base/common/uri';
import 'vs/css!./media/testing';
import { ICodeEditor, isCodeEditor } from 'vs/editor/browser/editorBrowser';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { localize } from 'vs/nls';
import { createAndFillInActionBarActions, MenuEntryActionViewItem } from 'vs/platform/actions/browser/menuEntryActionViewItem';
import { IMenuService, MenuId, MenuItemAction } from 'vs/platform/actions/common/actions';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { FileKind } from 'vs/platform/files/common/files';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { WorkbenchObjectTree } from 'vs/platform/list/browser/listService';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { IProgress, IProgressService, IProgressStep } from 'vs/platform/progress/common/progress';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { foreground } from 'vs/platform/theme/common/colorRegistry';
import { attachButtonStyler } from 'vs/platform/theme/common/styler';
import { IThemeService, registerThemingParticipant, ThemeIcon } from 'vs/platform/theme/common/themeService';
import { TestRunState } from 'vs/workbench/api/common/extHostTypes';
import { IResourceLabel, IResourceLabelOptions, IResourceLabelProps, ResourceLabels } from 'vs/workbench/browser/labels';
import { ViewPane } from 'vs/workbench/browser/parts/views/viewPane';
import { IViewletViewOptions } from 'vs/workbench/browser/parts/views/viewsViewlet';
import { IViewDescriptorService, ViewContainerLocation } from 'vs/workbench/common/views';
import { ITestTreeElement, ITestTreeProjection } from 'vs/workbench/contrib/testing/browser/explorerProjections';
import { HierarchicalByLocationProjection } from 'vs/workbench/contrib/testing/browser/explorerProjections/hierarchalByLocation';
import { HierarchicalByNameProjection } from 'vs/workbench/contrib/testing/browser/explorerProjections/hierarchalByName';
import { testingHiddenIcon, testingStatesToIcons } from 'vs/workbench/contrib/testing/browser/icons';
import { ITestExplorerFilterState, TestExplorerFilterState, TestingExplorerFilter } from 'vs/workbench/contrib/testing/browser/testingExplorerFilter';
import { ITestingPeekOpener, TestingOutputPeekController } from 'vs/workbench/contrib/testing/browser/testingOutputPeek';
import { TestExplorerStateFilter, TestExplorerViewMode, TestExplorerViewSorting, Testing, testStateNames } from 'vs/workbench/contrib/testing/common/constants';
import { TestingContextKeys } from 'vs/workbench/contrib/testing/common/testingContextKeys';
import { cmpPriority, isFailedState } from 'vs/workbench/contrib/testing/common/testingStates';
import { ITestResultService, sumCounts, TestStateCount } from 'vs/workbench/contrib/testing/common/testResultService';
import { ITestService } from 'vs/workbench/contrib/testing/common/testService';
import { IWorkspaceTestCollectionService, TestSubscriptionListener } from 'vs/workbench/contrib/testing/common/workspaceTestCollectionService';
import { IActivityService, NumberBadge, ProgressBadge } from 'vs/workbench/services/activity/common/activity';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { DebugAction, HideOrShowTestAction, RunAction } from './testExplorerActions';

export class TestingExplorerView extends ViewPane {
	public viewModel!: TestingExplorerViewModel;
	private filterActionBar = this._register(new MutableDisposable());
	private readonly currentSubscription = new MutableDisposable<TestSubscriptionListener>();
	private container!: HTMLElement;
	private finishDiscovery?: () => void;
	private readonly location = TestingContextKeys.explorerLocation.bindTo(this.contextKeyService);;

	constructor(
		options: IViewletViewOptions,
		@IWorkspaceTestCollectionService private readonly testCollection: IWorkspaceTestCollectionService,
		@ITestService private readonly testService: ITestService,
		@IProgressService private readonly progress: IProgressService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IConfigurationService configurationService: IConfigurationService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IOpenerService openerService: IOpenerService,
		@IThemeService themeService: IThemeService,
		@ITelemetryService telemetryService: ITelemetryService,
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, telemetryService);
		this._register(testService.onDidChangeProviders(() => this._onDidChangeViewWelcomeState.fire()));
		this.location.set(viewDescriptorService.getViewLocationById(Testing.ExplorerViewId) ?? ViewContainerLocation.Sidebar);
	}

	/**
	 * @override
	 */
	public shouldShowWelcome() {
		return this.testService.providers === 0;
	}

	/**
	 * @override
	 */
	protected renderBody(container: HTMLElement): void {
		super.renderBody(container);

		this.container = dom.append(container, dom.$('.test-explorer'));

		if (this.location.get() === ViewContainerLocation.Sidebar) {
			this.filterActionBar.value = this.createFilterActionBar();
		}

		const messagesContainer = dom.append(this.container, dom.$('.test-explorer-messages'));
		this._register(this.instantiationService.createInstance(TestRunProgress, messagesContainer, this.getProgressLocation()));

		const listContainer = dom.append(this.container, dom.$('.test-explorer-tree'));
		this.viewModel = this.instantiationService.createInstance(TestingExplorerViewModel, listContainer, this.onDidChangeBodyVisibility, this.currentSubscription.value);
		this._register(this.viewModel);

		this._register(this.onDidChangeBodyVisibility(visible => {
			if (!visible && this.currentSubscription) {
				this.currentSubscription.value = undefined;
				this.viewModel.replaceSubscription(undefined);
			} else if (visible && !this.currentSubscription.value) {
				this.currentSubscription.value = this.createSubscription();
				this.viewModel.replaceSubscription(this.currentSubscription.value);
			}
		}));
	}

	/**
	 * @override
	 */
	public getActionViewItem(action: IAction): IActionViewItem | undefined {
		if (action.id === Testing.FilterActionId) {
			return this.instantiationService.createInstance(TestingExplorerFilter, action);
		}

		return super.getActionViewItem(action);
	}

	/**
	 * @override
	 */
	public saveState() {
		super.saveState();
	}

	private createFilterActionBar() {
		const bar = new ActionBar(this.container, {
			actionViewItemProvider: action => this.getActionViewItem(action),
			triggerKeys: { keyDown: false, keys: [] },
		});
		bar.push(new Action(Testing.FilterActionId));
		bar.getContainer().classList.add('testing-filter-action-bar');
		return bar;
	}

	private updateDiscoveryProgress(busy: number) {
		if (!busy && this.finishDiscovery) {
			this.finishDiscovery();
			this.finishDiscovery = undefined;
		} else if (busy && !this.finishDiscovery) {
			const promise = new Promise<void>(resolve => { this.finishDiscovery = resolve; });
			this.progress.withProgress({ location: this.getProgressLocation() }, () => promise);
		}
	}

	/**
	 * @override
	 */
	protected layoutBody(height: number, width: number): void {
		super.layoutBody(height, width);
		this.container.style.height = `${height}px`;
		this.viewModel.layout(height, width);
	}

	private createSubscription() {
		const handle = this.testCollection.subscribeToWorkspaceTests();
		handle.subscription.onBusyProvidersChange(() => this.updateDiscoveryProgress(handle.subscription.busyProviders));
		return handle;
	}
}

class EmptyTestsWidget extends Disposable {
	private readonly el: HTMLElement;
	constructor(
		container: HTMLElement,
		@ICommandService commandService: ICommandService,
		@IThemeService themeService: IThemeService,
	) {
		super();
		const el = this.el = dom.append(container, dom.$('.testing-no-test-placeholder'));
		const emptyParagraph = dom.append(el, dom.$('p'));
		emptyParagraph.innerText = localize('testingNoTest', 'No tests have been found in this workspace yet.');
		const buttonLabel = localize('testingFindExtension', 'Find Test Extensions');
		const button = this._register(new Button(el, { title: buttonLabel }));
		button.label = buttonLabel;
		this._register(attachButtonStyler(button, themeService));
		this._register(button.onDidClick(() => commandService.executeCommand('testing.searchForTestExtension')));
	}

	public setVisible(isVisible: boolean) {
		this.el.classList.toggle('visible', isVisible);
	}
}

export class TestingExplorerViewModel extends Disposable {
	public tree: ObjectTree<ITestTreeElement, FuzzyScore>;
	private filter: TestsFilter;
	public projection = this._register(new MutableDisposable<ITestTreeProjection>());

	private readonly emptyTestsWidget: EmptyTestsWidget;
	private readonly _viewMode = TestingContextKeys.viewMode.bindTo(this.contextKeyService);
	private readonly _viewSorting = TestingContextKeys.viewSorting.bindTo(this.contextKeyService);

	/**
	 * Whether there's a reveal request which has not yet been delivered. This
	 * can happen if the user asks to reveal before the test tree is loaded.
	 * We check to see if the reveal request is present on each tree update,
	 * and do it then if so.
	 */
	private hasPendingReveal = false;

	/**
	 * Fires when the selected tests change.
	 */
	public readonly onDidChangeSelection: Event<ITreeEvent<ITestTreeElement | null>>;

	public get viewMode() {
		return this._viewMode.get() ?? TestExplorerViewMode.Tree;
	}

	public set viewMode(newMode: TestExplorerViewMode) {
		if (newMode === this._viewMode.get()) {
			return;
		}

		this._viewMode.set(newMode);
		this.updatePreferredProjection();
		this.storageService.store('testing.viewMode', newMode, StorageScope.WORKSPACE, StorageTarget.USER);
	}


	public get viewSorting() {
		return this._viewSorting.get() ?? TestExplorerViewSorting.ByLocation;
	}

	public set viewSorting(newSorting: TestExplorerViewSorting) {
		if (newSorting === this._viewSorting.get()) {
			return;
		}

		this._viewSorting.set(newSorting);
		this.tree.resort(null);
		this.storageService.store('testing.viewSorting', newSorting, StorageScope.WORKSPACE, StorageTarget.USER);
	}

	constructor(
		listContainer: HTMLElement,
		onDidChangeVisibility: Event<boolean>,
		private listener: TestSubscriptionListener | undefined,
		@IMenuService private readonly menuService: IMenuService,
		@IContextMenuService private readonly contextMenuService: IContextMenuService,
		@ITestService private readonly testService: ITestService,
		@ITestExplorerFilterState private readonly filterState: TestExplorerFilterState,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IEditorService private readonly editorService: IEditorService,
		@IStorageService private readonly storageService: IStorageService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@ITestResultService private readonly testResults: ITestResultService,
		@ITestingPeekOpener private readonly peekOpener: ITestingPeekOpener,
	) {
		super();

		this.hasPendingReveal = !!filterState.reveal.value;
		this.emptyTestsWidget = this._register(instantiationService.createInstance(EmptyTestsWidget, listContainer));
		this._viewMode.set(this.storageService.get('testing.viewMode', StorageScope.WORKSPACE, TestExplorerViewMode.Tree) as TestExplorerViewMode);
		this._viewSorting.set(this.storageService.get('testing.viewSorting', StorageScope.WORKSPACE, TestExplorerViewSorting.ByLocation) as TestExplorerViewSorting);

		const labels = this._register(instantiationService.createInstance(ResourceLabels, { onDidChangeVisibility: onDidChangeVisibility }));

		this.filter = this.instantiationService.createInstance(TestsFilter);
		this.tree = instantiationService.createInstance(
			WorkbenchObjectTree,
			'Test Explorer List',
			listContainer,
			new ListDelegate(),
			[
				instantiationService.createInstance(TestsRenderer, labels)
			],
			{
				simpleKeyboardNavigation: true,
				identityProvider: instantiationService.createInstance(IdentityProvider),
				hideTwistiesOfChildlessElements: true,
				sorter: instantiationService.createInstance(TreeSorter, this),
				keyboardNavigationLabelProvider: instantiationService.createInstance(TreeKeyboardNavigationLabelProvider),
				accessibilityProvider: instantiationService.createInstance(ListAccessibilityProvider),
				filter: this.filter,
			}) as WorkbenchObjectTree<ITestTreeElement, FuzzyScore>;

		this._register(filterState.currentDocumentOnly.onDidChange(() => {
			if (!filterState.currentDocumentOnly.value) {
				this.filter.filterToUri(undefined);
			} else if (editorService.activeEditor?.resource && this.projection.value?.hasTestInDocument(editorService.activeEditor.resource)) {
				this.filter.filterToUri(editorService.activeEditor.resource);
			}

			this.tree.refilter();
		}));

		this._register(this.tree.onContextMenu(e => this.onContextMenu(e)));

		this._register(editorService.onDidActiveEditorChange(() => {
			if (filterState.currentDocumentOnly.value && editorService.activeEditor?.resource) {
				if (this.projection.value?.hasTestInDocument(editorService.activeEditor.resource)) {
					this.filter.filterToUri(editorService.activeEditor.resource);
					this.tree.refilter();
				}
			}
		}));

		this._register(Event.any(
			filterState.text.onDidChange,
			filterState.stateFilter.onDidChange,
			filterState.showExcludedTests.onDidChange,
			testService.excludeTests.onDidChange,
		)(this.tree.refilter, this.tree));

		this._register(this.tree);

		this._register(dom.addStandardDisposableListener(this.tree.getHTMLElement(), 'keydown', evt => {
			if (evt.equals(KeyCode.Enter)) {
				this.handleExecuteKeypress(evt);
			} else if (DefaultKeyboardNavigationDelegate.mightProducePrintableCharacter(evt)) {
				filterState.text.value = evt.browserEvent.key;
				filterState.focusInput();
			}
		}));

		this._register(filterState.reveal.onDidChange(this.revealByExtId, this));

		this._register(onDidChangeVisibility(visible => {
			if (visible) {
				filterState.focusInput();
			}
		}));

		this.updatePreferredProjection();

		this.onDidChangeSelection = this.tree.onDidChangeSelection;
		this._register(this.tree.onDidChangeSelection(evt => {
			const selected = evt.elements[0];
			if (selected && evt.browserEvent && !selected.children.size) {
				this.openEditorForItem(selected);
			}
		}));

		const tracker = this._register(this.instantiationService.createInstance(CodeEditorTracker, this));
		this._register(onDidChangeVisibility(visible => {
			if (visible) {
				tracker.activate();
			} else {
				tracker.deactivate();
			}
		}));

		this._register(testResults.onResultsChanged(() => {
			this.tree.resort(null);
		}));
	}

	/**
	 * Re-layout the tree.
	 */
	public layout(_height: number, _width: number): void {
		this.tree.layout(); // The tree will measure its container
	}

	/**
	 * Replaces the test listener and recalculates the tree.
	 */
	public replaceSubscription(listener: TestSubscriptionListener | undefined) {
		this.listener = listener;
		this.updatePreferredProjection();
	}

	/**
	 * Reveals and moves focus to the item.
	 */
	public async revealItem(item: ITestTreeElement, reveal = true): Promise<void> {
		if (!this.tree.hasElement(item)) {
			return;
		}

		const chain: ITestTreeElement[] = [];
		for (let parent = item.parentItem; parent; parent = parent.parentItem) {
			chain.push(parent);
		}

		for (const parent of chain.reverse()) {
			try {
				this.tree.expand(parent);
			} catch {
				// ignore if not present
			}
		}

		if (reveal === true && this.tree.getRelativeTop(item) === null) {
			// Don't scroll to the item if it's already visible, or if set not to.
			this.tree.reveal(item, 0.5);
		}

		this.tree.setFocus([item]);
		this.tree.setSelection([item]);
	}

	/**
	 * Tries to reveal by extension ID. Queues the request if the extension
	 * ID is not currently available.
	 */
	private revealByExtId(testExtId: string | undefined) {
		if (!testExtId) {
			this.hasPendingReveal = false;
			return;
		}

		const item = testExtId && this.projection.value?.getElementByTestId(testExtId);
		if (!item) {
			this.hasPendingReveal = true;
			return;
		}

		// reveal the test if it's hidden, #117481
		for (let n: ITestTreeElement | null = item; n; n = n.parentItem) {
			if (n.test && this.testService.excludeTests.value.has(n.test.item.extId)) {
				this.filterState.showExcludedTests.value = true;
				break;
			}
		}

		setTimeout(() => this.revealItem(item, true), 1);
		this.filterState.reveal.value = undefined;
		this.hasPendingReveal = false;
		this.tree.domFocus();
	}

	/**
	 * Collapse all items in the tree.
	 */
	public async collapseAll() {
		this.tree.collapseAll();
	}

	/**
	 * Opens an editor for the item. If there is a failure associated with the
	 * test item, it will be shown.
	 */
	public async openEditorForItem(item: ITestTreeElement, preserveFocus = true) {
		if (await this.tryPeekError(item)) {
			return;
		}

		const location = item?.location;
		if (!location) {
			return;
		}

		const pane = await this.editorService.openEditor({
			resource: location.uri,
			options: {
				selection: { startColumn: location.range.startColumn, startLineNumber: location.range.startLineNumber },
				preserveFocus,
			},
		});

		// if the user selected a failed test and now they didn't, hide the peek
		const control = pane?.getControl();
		if (isCodeEditor(control)) {
			TestingOutputPeekController.get(control).removePeek();
		}
	}

	/**
	 * Tries to peek the first test error, if the item is in a failed state.
	 */
	private async tryPeekError(item: ITestTreeElement) {
		const lookup = item.test && this.testResults.getStateById(item.test.item.extId);
		return lookup && isFailedState(lookup[1].state.state)
			? this.peekOpener.tryPeekFirstError(lookup[0], lookup[1], { preserveFocus: true })
			: false;
	}

	private onContextMenu(evt: ITreeContextMenuEvent<ITestTreeElement | null>) {
		if (!evt.element) {
			return;
		}

		const actions = getTestItemActions(this.instantiationService, this.contextKeyService, this.menuService, evt.element);
		this.contextMenuService.showContextMenu({
			getAnchor: () => evt.anchor,
			getActions: () => actions.value.secondary,
			getActionsContext: () => evt.element?.test?.item.extId,
			onHide: () => actions.dispose(),
		});
	}

	private handleExecuteKeypress(evt: IKeyboardEvent) {
		const focused = this.tree.getFocus();
		const selected = this.tree.getSelection();
		let targeted: (ITestTreeElement | null)[];
		if (focused.length === 1 && selected.includes(focused[0])) {
			evt.browserEvent?.preventDefault();
			targeted = selected;
		} else {
			targeted = focused;
		}

		const toRun = targeted
			.map(e => e?.test)
			.filter(isDefined)
			.filter(e => e.item.runnable);

		if (toRun.length) {
			this.testService.runTests({
				debug: false,
				tests: toRun.map(t => ({ providerId: t.providerId, testId: t.item.extId })),
			});
		}
	}

	private shouldShowEmptyPlaceholder() {
		return !!this.listener
			&& this.listener.subscription.busyProviders === 0
			&& this.listener.subscription.isEmpty;
	}

	private updatePreferredProjection() {
		this.projection.clear();
		if (!this.listener) {
			this.tree.setChildren(null, []);
			return;
		}

		if (this._viewMode.get() === TestExplorerViewMode.List) {
			this.projection.value = this.instantiationService.createInstance(HierarchicalByNameProjection, this.listener);
		} else {
			this.projection.value = this.instantiationService.createInstance(HierarchicalByLocationProjection, this.listener);
		}

		const scheduler = new RunOnceScheduler(() => this.applyProjectionChanges(), 200);
		this.projection.value.onUpdate(() => {
			if (!scheduler.isScheduled()) {
				scheduler.schedule();
			}
		});

		this.applyProjectionChanges();
	}

	private applyProjectionChanges() {
		this.emptyTestsWidget.setVisible(this.shouldShowEmptyPlaceholder());
		this.projection.value?.applyTo(this.tree);

		if (this.hasPendingReveal) {
			this.revealByExtId(this.filterState.reveal.value);
		}
	}

	/**
	 * Gets the selected tests from the tree.
	 */
	public getSelectedTests() {
		return this.tree.getSelection();
	}
}

class CodeEditorTracker {
	private store = new DisposableStore();
	private lastRevealed?: ITestTreeElement;

	constructor(
		private readonly model: TestingExplorerViewModel,
		@ICodeEditorService private readonly codeEditorService: ICodeEditorService,
	) {
	}

	public activate() {
		const editorStores = new Set<DisposableStore>();
		this.store.add(toDisposable(() => {
			for (const store of editorStores) {
				store.dispose();
			}
		}));

		const register = (editor: ICodeEditor) => {
			const store = new DisposableStore();
			editorStores.add(store);

			store.add(editor.onDidChangeCursorPosition(evt => {
				const uri = editor.getModel()?.uri;
				if (!uri) {
					return;
				}

				const test = this.model.projection.value?.getTestAtPosition(uri, evt.position);
				if (test && test !== this.lastRevealed) {
					this.model.revealItem(test);
					this.lastRevealed = test;
				}
			}));

			editor.onDidDispose(() => {
				store.dispose();
				editorStores.delete(store);
			});
		};

		this.store.add(this.codeEditorService.onCodeEditorAdd(register));
		this.codeEditorService.listCodeEditors().forEach(register);
	}

	public deactivate() {
		this.store.dispose();
		this.store = new DisposableStore();
	}

	public dispose() {
		this.store.dispose();
	}
}

const enum FilterResult {
	Exclude,
	Inherit,
	Include,
}

class TestsFilter implements ITreeFilter<ITestTreeElement> {
	private lastText?: string;
	private filters: [include: boolean, value: string][] | undefined;
	private _filterToUri: string | undefined;

	constructor(
		@ITestExplorerFilterState private readonly state: ITestExplorerFilterState,
		@ITestService private readonly testService: ITestService,
	) { }

	/**
	 * Parses and updates the tree filter. Supports lists of patterns that can be !negated.
	 */
	private setFilter(text: string) {
		this.lastText = text;
		text = text.trim();

		if (!text) {
			this.filters = undefined;
			return;
		}

		this.filters = [];
		for (const filter of splitGlobAware(text, ',').map(s => s.trim()).filter(s => !!s.length)) {
			if (filter.startsWith('!')) {
				this.filters.push([false, filter.slice(1).toLowerCase()]);
			} else {
				this.filters.push([true, filter.toLowerCase()]);
			}
		}
	}

	public filterToUri(uri: URI | undefined) {
		this._filterToUri = uri?.toString();
	}

	/**
	 * @inheritdoc
	 */
	public filter(element: ITestTreeElement): TreeFilterResult<void> {
		if (this.state.text.value !== this.lastText) {
			this.setFilter(this.state.text.value);
		}

		if (
			element.test
			&& !this.state.showExcludedTests.value
			&& this.testService.excludeTests.value.has(element.test.item.extId)
		) {
			return TreeVisibility.Hidden;
		}

		switch (Math.min(this.testFilterText(element), this.testLocation(element), this.testState(element))) {
			case FilterResult.Exclude:
				return TreeVisibility.Hidden;
			case FilterResult.Include:
				return TreeVisibility.Visible;
			default:
				return TreeVisibility.Recurse;
		}
	}

	private testState(element: ITestTreeElement): FilterResult {
		switch (this.state.stateFilter.value) {
			case TestExplorerStateFilter.All:
				return FilterResult.Include;
			case TestExplorerStateFilter.OnlyExecuted:
				return element.ownState !== TestRunState.Unset ? FilterResult.Include : FilterResult.Inherit;
			case TestExplorerStateFilter.OnlyFailed:
				return isFailedState(element.ownState) ? FilterResult.Include : FilterResult.Inherit;
		}
	}

	private testLocation(element: ITestTreeElement): FilterResult {
		if (!this._filterToUri || !this.state.currentDocumentOnly.value) {
			return FilterResult.Include;
		}

		for (let e: ITestTreeElement | null = element; e; e = e!.parentItem) {
			if (!e.location) {
				continue;
			}

			return e.location.uri.toString() === this._filterToUri
				? FilterResult.Include
				: FilterResult.Exclude;
		}

		return FilterResult.Inherit;
	}

	private testFilterText(element: ITestTreeElement) {
		if (!this.filters) {
			return FilterResult.Include;
		}

		for (let e: ITestTreeElement | null = element; e; e = e.parentItem) {
			// start as included if the first glob is a negation
			let included = this.filters[0][0] === false ? FilterResult.Exclude : FilterResult.Inherit;
			const data = e.label.toLowerCase();

			for (const [include, filter] of this.filters) {
				if (data.includes(filter)) {
					included = include ? FilterResult.Include : FilterResult.Exclude;
				}
			}

			if (included !== FilterResult.Inherit) {
				return included;
			}
		}

		return FilterResult.Inherit;
	}
}

class TreeSorter implements ITreeSorter<ITestTreeElement> {
	constructor(private readonly viewModel: TestingExplorerViewModel) { }

	public compare(a: ITestTreeElement, b: ITestTreeElement): number {
		let delta = cmpPriority(a.state, b.state);
		if (delta !== 0) {
			return delta;
		}

		if (this.viewModel.viewSorting === TestExplorerViewSorting.ByLocation && a.location && b.location && a.location.uri.toString() === b.location.uri.toString()) {
			delta = a.location.range.startLineNumber - b.location.range.startLineNumber;
			if (delta !== 0) {
				return delta;
			}
		}

		return a.label.localeCompare(b.label);
	}
}

class ListAccessibilityProvider implements IListAccessibilityProvider<ITestTreeElement> {
	getWidgetAriaLabel(): string {
		return localize('testExplorer', "Test Explorer");
	}

	getAriaLabel(element: ITestTreeElement): string {
		let label = localize({
			key: 'testing.treeElementLabel',
			comment: ['label then the unit tests state, for example "Addition Tests (Running)"'],
		}, '{0} ({1})', element.label, testStateNames[element.state]);

		if (element.retired) {
			label = localize({
				key: 'testing.treeElementLabelOutdated',
				comment: ['{0} is the original label in testing.treeElementLabel'],
			}, '{0}, outdated result', label, testStateNames[element.state]);
		}

		return label;
	}
}

class TreeKeyboardNavigationLabelProvider implements IKeyboardNavigationLabelProvider<ITestTreeElement> {
	getKeyboardNavigationLabel(element: ITestTreeElement) {
		return element.label;
	}
}

class ListDelegate implements IListVirtualDelegate<ITestTreeElement> {
	getHeight(_element: ITestTreeElement) {
		return 22;
	}

	getTemplateId(_element: ITestTreeElement) {
		return TestsRenderer.ID;
	}
}

class IdentityProvider implements IIdentityProvider<ITestTreeElement> {
	public getId(element: ITestTreeElement) {
		return element.treeId;
	}
}

interface TestTemplateData {
	label: IResourceLabel;
	icon: HTMLElement;
	wrapper: HTMLElement;
	actionBar: ActionBar;
	elementDisposable: IDisposable[];
	templateDisposable: IDisposable[];
}

class TestsRenderer extends Disposable implements ITreeRenderer<ITestTreeElement, FuzzyScore, TestTemplateData> {
	public static readonly ID = 'testExplorer';

	constructor(
		private labels: ResourceLabels,
		@IMenuService private readonly menuService: IMenuService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ITestService private readonly testService: ITestService
	) {
		super();
	}

	/**
	 * @inheritdoc
	 */
	get templateId(): string {
		return TestsRenderer.ID;
	}

	/**
	 * @inheritdoc
	 */
	public renderTemplate(container: HTMLElement): TestTemplateData {
		const wrapper = dom.append(container, dom.$('.test-item'));

		const icon = dom.append(wrapper, dom.$('.computed-state'));
		const name = dom.append(wrapper, dom.$('.name'));
		const label = this.labels.create(name, { supportHighlights: true });

		dom.append(wrapper, dom.$(ThemeIcon.asCSSSelector(testingHiddenIcon)));
		const actionBar = new ActionBar(wrapper, {
			actionViewItemProvider: action =>
				action instanceof MenuItemAction
					? this.instantiationService.createInstance(MenuEntryActionViewItem, action)
					: undefined
		});

		return { wrapper, label, actionBar, icon, elementDisposable: [], templateDisposable: [label, actionBar] };
	}

	/**
	 * @inheritdoc
	 */
	public renderElement({ element }: ITreeNode<ITestTreeElement, FuzzyScore>, _: number, data: TestTemplateData): void {
		const label: IResourceLabelProps = { name: element.label };
		const options: IResourceLabelOptions = {};
		data.actionBar.clear();

		const testHidden = !!element.test && this.testService.excludeTests.value.has(element.test.item.extId);
		data.wrapper.classList.toggle('test-is-hidden', testHidden);

		const icon = testingStatesToIcons.get(element.state);
		data.icon.className = 'computed-state ' + (icon ? ThemeIcon.asClassName(icon) : '');
		if (element.retired) {
			data.icon.className += ' retired';
		}

		const test = element.test;
		if (test) {
			if (test.item.location) {
				label.resource = test.item.location.uri;
			}

			let title = element.label;
			for (let p = element.parentItem; p; p = p.parentItem) {
				title = `${p.label}, ${title}`;
			}

			options.title = title;
			options.fileKind = FileKind.FILE;
			label.description = element.description;
		} else {
			options.fileKind = FileKind.ROOT_FOLDER;
		}

		this.fillActionBar(element, data);
		data.label.setResource(label, options);
	}

	/**
	 * @inheritdoc
	 */
	disposeTemplate(templateData: TestTemplateData): void {
		dispose(templateData.templateDisposable);
		templateData.templateDisposable = [];
	}

	/**
	 * @inheritdoc
	 */
	disposeElement(_element: ITreeNode<ITestTreeElement, FuzzyScore>, _: number, templateData: TestTemplateData): void {
		dispose(templateData.elementDisposable);
		templateData.elementDisposable = [];
	}

	private fillActionBar(element: ITestTreeElement, data: TestTemplateData) {
		const actions = getTestItemActions(this.instantiationService, this.contextKeyService, this.menuService, element);
		data.elementDisposable.push(actions);
		data.actionBar.clear();
		data.actionBar.push(actions.value.primary, { icon: true, label: false });
	}
}

const getTestItemActions = (
	instantionService: IInstantiationService,
	contextKeyService: IContextKeyService,
	menuService: IMenuService,
	element: ITestTreeElement,
) => {
	const contextOverlay = contextKeyService.createOverlay([
		['view', Testing.ExplorerViewId],
		[TestingContextKeys.testItemExtId.key, element.test?.item.extId]
	]);
	const menu = menuService.createMenu(MenuId.TestItem, contextOverlay);

	try {
		const primary: IAction[] = [];
		const running = element.state === TestRunState.Running;
		if (!Iterable.isEmpty(element.runnable)) {
			primary.push(instantionService.createInstance(RunAction, element.runnable, running));
		}

		if (!Iterable.isEmpty(element.debuggable)) {
			primary.push(instantionService.createInstance(DebugAction, element.debuggable, running));
		}

		const secondary: IAction[] = [];
		if (element.test) {
			secondary.push(instantionService.createInstance(HideOrShowTestAction, element.test.item.extId));
		}

		const result = { primary, secondary };
		const actionsDisposable = createAndFillInActionBarActions(menu, {
			arg: element.test?.item.extId,
			shouldForwardArgs: true,
		}, result, 'inline');

		return { value: result, dispose: () => actionsDisposable.dispose };
	} finally {
		menu.dispose();
	}
};

type CountSummary = ReturnType<typeof collectCounts>;

const collectCounts = (count: TestStateCount) => {
	const failed = count[TestRunState.Errored] + count[TestRunState.Failed];
	const passed = count[TestRunState.Passed];
	const skipped = count[TestRunState.Skipped];

	return {
		passed,
		failed,
		runSoFar: passed + failed,
		totalWillBeRun: passed + failed + count[TestRunState.Queued] + count[TestRunState.Running],
		skipped,
	};
};

const getProgressText = ({ passed, runSoFar, skipped, failed }: CountSummary) => {
	let percent = passed / runSoFar * 100;
	if (failed > 0) {
		// fix: prevent from rounding to 100 if there's any failed test
		percent = Math.min(percent, 99.9);
	} else if (runSoFar === 0) {
		percent = 0;
	}

	if (skipped === 0) {
		return localize('testProgress', '{0}/{1} tests passed ({2}%)', passed, runSoFar, percent.toPrecision(3));
	} else {
		return localize('testProgressWithSkip', '{0}/{1} tests passed ({2}%, {3} skipped)', passed, runSoFar, percent.toPrecision(3), skipped);
	}
};

class TestRunProgress {
	private current?: { update: IProgress<IProgressStep>; deferred: DeferredPromise<void> };
	private badge = new MutableDisposable();
	private readonly resultLister = this.resultService.onResultsChanged(result => {
		if (!('started' in result)) {
			return;
		}

		this.updateProgress();
		this.updateBadge();

		result.started.onChange(this.throttledProgressUpdate, this);
		result.started.onComplete(() => {
			this.throttledProgressUpdate();
			this.updateBadge();
		});
	});

	constructor(
		private readonly messagesContainer: HTMLElement,
		private readonly location: string,
		@IProgressService private readonly progress: IProgressService,
		@ITestResultService private readonly resultService: ITestResultService,
		@IActivityService private readonly activityService: IActivityService,
	) {
	}

	public dispose() {
		this.resultLister.dispose();
		this.current?.deferred.complete();
		this.badge.dispose();
	}

	@throttle(200)
	private throttledProgressUpdate() {
		this.updateProgress();
	}

	private updateProgress() {
		const running = this.resultService.results.filter(r => r.completedAt === undefined);
		if (!running.length) {
			this.setIdleText(this.resultService.results[0]?.counts);
			this.current?.deferred.complete();
			this.current = undefined;
		} else if (!this.current) {
			this.progress.withProgress({ location: this.location, total: 100 }, update => {
				this.current = { update, deferred: new DeferredPromise() };
				this.updateProgress();
				return this.current.deferred.p;
			});
		} else {
			const counts = sumCounts(running.map(r => r.counts));
			this.setRunningText(counts);
			const { runSoFar, totalWillBeRun } = collectCounts(counts);
			this.current.update.report({ increment: runSoFar, total: totalWillBeRun });
		}
	}

	private setRunningText(counts: TestStateCount) {
		this.messagesContainer.dataset.state = 'running';

		const collected = collectCounts(counts);
		if (collected.runSoFar === 0) {
			this.messagesContainer.innerText = localize('testResultStarting', 'Test run is starting...');
		} else {
			this.messagesContainer.innerText = getProgressText(collected);
		}
	}

	private setIdleText(lastCount?: TestStateCount) {
		if (!lastCount) {
			this.messagesContainer.innerText = '';
		} else {
			const collected = collectCounts(lastCount);
			this.messagesContainer.dataset.state = collected.failed ? 'failed' : 'running';
			const doneMessage = getProgressText(collected);
			this.messagesContainer.innerText = doneMessage;
			aria.alert(doneMessage);
		}
	}

	private updateBadge() {
		this.badge.value = undefined;
		const result = this.resultService.results[0]; // currently running, or last run
		if (!result) {
			return;
		}

		if (result.completedAt === undefined) {
			const badge = new ProgressBadge(() => localize('testBadgeRunning', 'Test run in progress'));
			this.badge.value = this.activityService.showViewActivity(Testing.ExplorerViewId, { badge, clazz: 'progress-badge' });
			return;
		}

		const failures = result.counts[TestRunState.Failed] + result.counts[TestRunState.Errored];
		if (failures === 0) {
			return;
		}

		const badge = new NumberBadge(failures, () => localize('testBadgeFailures', '{0} tests failed', failures));
		this.badge.value = this.activityService.showViewActivity(Testing.ExplorerViewId, { badge });
	}
}

registerThemingParticipant((theme, collector) => {
	if (theme.type === 'dark') {
		const foregroundColor = theme.getColor(foreground);
		if (foregroundColor) {
			const fgWithOpacity = new Color(new RGBA(foregroundColor.rgba.r, foregroundColor.rgba.g, foregroundColor.rgba.b, 0.65));
			collector.addRule(`.test-explorer .test-explorer-messages { color: ${fgWithOpacity}; }`);
		}
	}
});
