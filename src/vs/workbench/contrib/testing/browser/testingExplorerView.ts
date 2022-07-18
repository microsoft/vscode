/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { IKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { ActionBar, IActionViewItem } from 'vs/base/browser/ui/actionbar/actionbar';
import { Button } from 'vs/base/browser/ui/button/button';
import { renderLabelWithIcons } from 'vs/base/browser/ui/iconLabel/iconLabels';
import { IIdentityProvider, IKeyboardNavigationLabelProvider, IListVirtualDelegate } from 'vs/base/browser/ui/list/list';
import { DefaultKeyboardNavigationDelegate, IListAccessibilityProvider } from 'vs/base/browser/ui/list/listWidget';
import { AbstractTreeViewState, IAbstractTreeViewState } from 'vs/base/browser/ui/tree/abstractTree';
import { ObjectTree } from 'vs/base/browser/ui/tree/objectTree';
import { ITreeContextMenuEvent, ITreeFilter, ITreeNode, ITreeRenderer, ITreeSorter, TreeFilterResult, TreeVisibility } from 'vs/base/browser/ui/tree/tree';
import { Action, ActionRunner, IAction, Separator } from 'vs/base/common/actions';
import { disposableTimeout, RunOnceScheduler } from 'vs/base/common/async';
import { Color, RGBA } from 'vs/base/common/color';
import { Emitter, Event } from 'vs/base/common/event';
import { FuzzyScore } from 'vs/base/common/filters';
import { KeyCode } from 'vs/base/common/keyCodes';
import { Disposable, dispose, IDisposable, MutableDisposable } from 'vs/base/common/lifecycle';
import { fuzzyContains } from 'vs/base/common/strings';
import { isDefined } from 'vs/base/common/types';
import { URI } from 'vs/base/common/uri';
import 'vs/css!./media/testing';
import { MarkdownRenderer } from 'vs/editor/contrib/markdownRenderer/browser/markdownRenderer';
import { localize } from 'vs/nls';
import { DropdownWithPrimaryActionViewItem } from 'vs/platform/actions/browser/dropdownWithPrimaryActionViewItem';
import { createAndFillInActionBarActions, MenuEntryActionViewItem } from 'vs/platform/actions/browser/menuEntryActionViewItem';
import { IMenuService, MenuId, MenuItemAction } from 'vs/platform/actions/common/actions';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { WorkbenchObjectTree } from 'vs/platform/list/browser/listService';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { UnmanagedProgress } from 'vs/platform/progress/common/progress';
import { IStorageService, StorageScope, StorageTarget, WillSaveStateReason } from 'vs/platform/storage/common/storage';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { foreground } from 'vs/platform/theme/common/colorRegistry';
import { attachButtonStyler } from 'vs/platform/theme/common/styler';
import { IThemeService, registerThemingParticipant, ThemeIcon } from 'vs/platform/theme/common/themeService';
import { IUriIdentityService } from 'vs/platform/uriIdentity/common/uriIdentity';
import { ViewPane } from 'vs/workbench/browser/parts/views/viewPane';
import { IViewletViewOptions } from 'vs/workbench/browser/parts/views/viewsViewlet';
import { IViewDescriptorService } from 'vs/workbench/common/views';
import { HierarchicalByLocationProjection } from 'vs/workbench/contrib/testing/browser/explorerProjections/hierarchalByLocation';
import { ByNameTestItemElement, HierarchicalByNameProjection } from 'vs/workbench/contrib/testing/browser/explorerProjections/hierarchalByName';
import { ITestTreeProjection, TestExplorerTreeElement, TestItemTreeElement, TestTreeErrorMessage } from 'vs/workbench/contrib/testing/browser/explorerProjections/index';
import { getTestItemContextOverlay } from 'vs/workbench/contrib/testing/browser/explorerProjections/testItemContextOverlay';
import * as icons from 'vs/workbench/contrib/testing/browser/icons';
import { TestingExplorerFilter } from 'vs/workbench/contrib/testing/browser/testingExplorerFilter';
import { ITestingProgressUiService } from 'vs/workbench/contrib/testing/browser/testingProgressUiService';
import { getTestingConfiguration, TestingConfigKeys } from 'vs/workbench/contrib/testing/common/configuration';
import { labelForTestInState, TestCommandId, TestExplorerViewMode, TestExplorerViewSorting, Testing } from 'vs/workbench/contrib/testing/common/constants';
import { StoredValue } from 'vs/workbench/contrib/testing/common/storedValue';
import { ITestExplorerFilterState, TestExplorerFilterState, TestFilterTerm } from 'vs/workbench/contrib/testing/common/testExplorerFilterState';
import { TestId } from 'vs/workbench/contrib/testing/common/testId';
import { TestingContextKeys } from 'vs/workbench/contrib/testing/common/testingContextKeys';
import { ITestingPeekOpener } from 'vs/workbench/contrib/testing/common/testingPeekOpener';
import { cmpPriority, isFailedState, isStateWithResult } from 'vs/workbench/contrib/testing/common/testingStates';
import { canUseProfileWithTest, ITestProfileService } from 'vs/workbench/contrib/testing/common/testProfileService';
import { TestResultItemChangeReason } from 'vs/workbench/contrib/testing/common/testResult';
import { ITestResultService } from 'vs/workbench/contrib/testing/common/testResultService';
import { IMainThreadTestCollection, ITestService, testCollectionIsEmpty } from 'vs/workbench/contrib/testing/common/testService';
import { InternalTestItem, ITestRunProfile, TestItemExpandState, TestResultState, TestRunProfileBitset } from 'vs/workbench/contrib/testing/common/testTypes';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';

export class TestingExplorerView extends ViewPane {
	public viewModel!: TestingExplorerViewModel;
	private filterActionBar = this._register(new MutableDisposable());
	private container!: HTMLElement;
	private treeHeader!: HTMLElement;
	private discoveryProgress = this._register(new MutableDisposable<UnmanagedProgress>());
	private filter?: TestingExplorerFilter;
	private readonly dimensions = { width: 0, height: 0 };

	constructor(
		options: IViewletViewOptions,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IConfigurationService configurationService: IConfigurationService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IOpenerService openerService: IOpenerService,
		@IThemeService themeService: IThemeService,
		@ITestService private readonly testService: ITestService,
		@ITelemetryService telemetryService: ITelemetryService,
		@ITestingProgressUiService private readonly testProgressService: ITestingProgressUiService,
		@ITestProfileService private readonly testProfileService: ITestProfileService,
		@ICommandService private readonly commandService: ICommandService,
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, telemetryService);

		const relayout = this._register(new RunOnceScheduler(() => this.layoutBody(), 1));
		this._register(this.onDidChangeViewWelcomeState(() => {
			if (!this.shouldShowWelcome()) {
				relayout.schedule();
			}
		}));

		this._register(testService.collection.onBusyProvidersChange(busy => {
			this.updateDiscoveryProgress(busy);
		}));

		this._register(testProfileService.onDidChange(() => this.updateActions()));
	}

	/**
	 * @override
	 */
	public override shouldShowWelcome() {
		return this.viewModel?.welcomeExperience === WelcomeExperience.ForWorkspace ?? true;
	}

	public getSelectedOrVisibleItems(profile?: ITestRunProfile) {
		const projection = this.viewModel.projection.value;
		if (!projection) {
			return { include: [], exclude: [] };
		}

		if (projection instanceof ByNameTestItemElement) {
			return {
				include: [...this.testService.collection.rootItems],
				exclude: [],
			};
		}

		// To calculate includes and excludes, we include the first children that
		// have a majority of their items included too, and then apply exclusions.
		const include: InternalTestItem[] = [];
		const exclude: InternalTestItem[] = [];

		const attempt = (element: TestExplorerTreeElement, alreadyIncluded: boolean) => {
			// sanity check hasElement since updates are debounced and they may exist
			// but not be rendered yet
			if (!(element instanceof TestItemTreeElement) || !this.viewModel.tree.hasElement(element)) {
				return;
			}

			// If the current node is not visible or runnable in the current profile, it's excluded
			const inTree = this.viewModel.tree.getNode(element);
			if (!inTree.visible) {
				if (alreadyIncluded) { exclude.push(element.test); }
				return;
			}

			// If it's not already included but most of its children are, then add it
			// if it can be run under the current profile (when specified)
			if (
				// If it's not already included...
				!alreadyIncluded
				// And it can be run using the current profile (if any)
				&& (!profile || canUseProfileWithTest(profile, element.test))
				// And either it's a leaf node or most children are included, the  include it.
				&& (inTree.children.length === 0 || inTree.visibleChildrenCount * 2 >= inTree.children.length)
				// And not if we're only showing a single of its children, since it
				// probably fans out later. (Worse case we'll directly include its single child)
				&& inTree.visibleChildrenCount !== 1
			) {
				include.push(element.test);
				alreadyIncluded = true;
			}

			// Recurse ✨
			for (const child of element.children) {
				attempt(child, alreadyIncluded);
			}
		};

		for (const root of this.testService.collection.rootItems) {
			const element = projection.getElementByTestId(root.item.extId);
			if (!element) {
				continue;
			}

			if (profile && !canUseProfileWithTest(profile, root)) {
				continue;
			}

			// single controllers won't have visible root ID nodes, handle that  case specially
			if (!this.viewModel.tree.hasElement(element)) {
				const visibleChildren = [...element.children].reduce((acc, c) =>
					this.viewModel.tree.hasElement(c) && this.viewModel.tree.getNode(c).visible ? acc + 1 : acc, 0);

				// note we intentionally check children > 0 here, unlike above, since
				// we don't want to bother dispatching to controllers who have no discovered tests
				if (element.children.size > 0 && visibleChildren * 2 >= element.children.size) {
					include.push(element.test);
					element.children.forEach(c => attempt(c, true));
				} else {
					element.children.forEach(c => attempt(c, false));
				}
			} else {
				attempt(element, false);
			}
		}

		return { include, exclude };
	}

	/**
	 * @override
	 */
	protected override renderBody(container: HTMLElement): void {
		super.renderBody(container);

		this.container = dom.append(container, dom.$('.test-explorer'));
		this.treeHeader = dom.append(this.container, dom.$('.test-explorer-header'));
		this.filterActionBar.value = this.createFilterActionBar();

		const messagesContainer = dom.append(this.treeHeader, dom.$('.test-explorer-messages'));
		this._register(this.testProgressService.onTextChange(text => {
			const hadText = !!messagesContainer.innerText;
			const hasText = !!text;
			messagesContainer.innerText = text;

			if (hadText !== hasText) {
				this.layoutBody();
			}
		}));

		const listContainer = dom.append(this.container, dom.$('.test-explorer-tree'));
		this.viewModel = this.instantiationService.createInstance(TestingExplorerViewModel, listContainer, this.onDidChangeBodyVisibility);
		this._register(this.viewModel.onChangeWelcomeVisibility(() => this._onDidChangeViewWelcomeState.fire()));
		this._register(this.viewModel);
		this._onDidChangeViewWelcomeState.fire();
	}

	/** @override  */
	public override getActionViewItem(action: IAction): IActionViewItem | undefined {
		switch (action.id) {
			case TestCommandId.FilterAction:
				return this.filter = this.instantiationService.createInstance(TestingExplorerFilter, action);
			case TestCommandId.RunSelectedAction:
				return this.getRunGroupDropdown(TestRunProfileBitset.Run, action);
			case TestCommandId.DebugSelectedAction:
				return this.getRunGroupDropdown(TestRunProfileBitset.Debug, action);
			default:
				return super.getActionViewItem(action);
		}
	}

	/** @inheritdoc */
	private getTestConfigGroupActions(group: TestRunProfileBitset) {
		const profileActions: IAction[] = [];

		let participatingGroups = 0;
		let hasConfigurable = false;
		const defaults = this.testProfileService.getGroupDefaultProfiles(group);
		for (const { profiles, controller } of this.testProfileService.all()) {
			let hasAdded = false;

			for (const profile of profiles) {
				if (profile.group !== group) {
					continue;
				}

				if (!hasAdded) {
					hasAdded = true;
					participatingGroups++;
					profileActions.push(new Action(`${controller.id}.$root`, controller.label.value, undefined, false));
				}

				hasConfigurable = hasConfigurable || profile.hasConfigurationHandler;
				profileActions.push(new Action(
					`${controller.id}.${profile.profileId}`,
					defaults.includes(profile) ? localize('defaultTestProfile', '{0} (Default)', profile.label) : profile.label,
					undefined,
					undefined,
					() => {
						const { include, exclude } = this.getSelectedOrVisibleItems(profile);
						this.testService.runResolvedTests({
							exclude: exclude.map(e => e.item.extId),
							targets: [{
								profileGroup: profile.group,
								profileId: profile.profileId,
								controllerId: profile.controllerId,
								testIds: include.map(i => i.item.extId),
							}]
						});
					},
				));
			}
		}

		// If there's only one group, don't add a heading for it in the dropdown.
		if (participatingGroups === 1) {
			profileActions.shift();
		}

		const postActions: IAction[] = [];
		if (profileActions.length > 1) {
			postActions.push(new Action(
				'selectDefaultTestConfigurations',
				localize('selectDefaultConfigs', 'Select Default Profile'),
				undefined,
				undefined,
				() => this.commandService.executeCommand<ITestRunProfile>(TestCommandId.SelectDefaultTestProfiles, group),
			));
		}

		if (hasConfigurable) {
			postActions.push(new Action(
				'configureTestProfiles',
				localize('configureTestProfiles', 'Configure Test Profiles'),
				undefined,
				undefined,
				() => this.commandService.executeCommand<ITestRunProfile>(TestCommandId.ConfigureTestProfilesAction, group),
			));
		}

		return Separator.join(profileActions, postActions);
	}

	/**
	 * @override
	 */
	public override saveState() {
		this.filter?.saveState();
		super.saveState();
	}

	private getRunGroupDropdown(group: TestRunProfileBitset, defaultAction: IAction) {
		const dropdownActions = this.getTestConfigGroupActions(group);
		if (dropdownActions.length < 2) {
			return super.getActionViewItem(defaultAction);
		}

		const primaryAction = this.instantiationService.createInstance(MenuItemAction, {
			id: defaultAction.id,
			title: defaultAction.label,
			icon: group === TestRunProfileBitset.Run
				? icons.testingRunAllIcon
				: icons.testingDebugAllIcon,
		}, undefined, undefined, undefined);

		const dropdownAction = new Action('selectRunConfig', 'Select Configuration...', 'codicon-chevron-down', true);

		return this.instantiationService.createInstance(
			DropdownWithPrimaryActionViewItem,
			primaryAction, dropdownAction, dropdownActions,
			'',
			this.contextMenuService,
			{}
		);
	}

	private createFilterActionBar() {
		const bar = new ActionBar(this.treeHeader, {
			actionViewItemProvider: action => this.getActionViewItem(action),
			triggerKeys: { keyDown: false, keys: [] },
		});
		bar.push(new Action(TestCommandId.FilterAction));
		bar.getContainer().classList.add('testing-filter-action-bar');
		return bar;
	}

	private updateDiscoveryProgress(busy: number) {
		if (!busy && this.discoveryProgress) {
			this.discoveryProgress.clear();
		} else if (busy && !this.discoveryProgress.value) {
			this.discoveryProgress.value = this.instantiationService.createInstance(UnmanagedProgress, { location: this.getProgressLocation() });
		}
	}

	/**
	 * @override
	 */
	protected override layoutBody(height = this.dimensions.height, width = this.dimensions.width): void {
		super.layoutBody(height, width);
		this.dimensions.height = height;
		this.dimensions.width = width;
		this.container.style.height = `${height}px`;
		this.viewModel.layout(height - this.treeHeader.clientHeight, width);
		this.filter?.layout(width);
	}
}

const enum WelcomeExperience {
	None,
	ForWorkspace,
	ForDocument,
}

export class TestingExplorerViewModel extends Disposable {
	public tree: ObjectTree<TestExplorerTreeElement, FuzzyScore>;
	private filter: TestsFilter;
	public projection = this._register(new MutableDisposable<ITestTreeProjection>());

	private readonly revealTimeout = new MutableDisposable();
	private readonly _viewMode = TestingContextKeys.viewMode.bindTo(this.contextKeyService);
	private readonly _viewSorting = TestingContextKeys.viewSorting.bindTo(this.contextKeyService);
	private readonly welcomeVisibilityEmitter = new Emitter<WelcomeExperience>();
	private readonly actionRunner = new TestExplorerActionRunner(() => this.tree.getSelection().filter(isDefined));
	private readonly lastViewState = new StoredValue<IAbstractTreeViewState>({
		key: 'testing.treeState',
		scope: StorageScope.WORKSPACE,
		target: StorageTarget.MACHINE,
	}, this.storageService);
	private readonly noTestForDocumentWidget: NoTestsForDocumentWidget;

	/**
	 * Whether there's a reveal request which has not yet been delivered. This
	 * can happen if the user asks to reveal before the test tree is loaded.
	 * We check to see if the reveal request is present on each tree update,
	 * and do it then if so.
	 */
	private hasPendingReveal = false;
	/**
	 * Fires when the visibility of the placeholder state changes.
	 */
	public readonly onChangeWelcomeVisibility = this.welcomeVisibilityEmitter.event;

	/**
	 * Gets whether the welcome should be visible.
	 */
	public welcomeExperience = WelcomeExperience.None;

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
		return this._viewSorting.get() ?? TestExplorerViewSorting.ByStatus;
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
		@IConfigurationService configurationService: IConfigurationService,
		@IEditorService editorService: IEditorService,
		@IMenuService private readonly menuService: IMenuService,
		@IContextMenuService private readonly contextMenuService: IContextMenuService,
		@ITestService private readonly testService: ITestService,
		@ITestExplorerFilterState private readonly filterState: TestExplorerFilterState,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IStorageService private readonly storageService: IStorageService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@ITestResultService private readonly testResults: ITestResultService,
		@ITestingPeekOpener private readonly peekOpener: ITestingPeekOpener,
		@ITestProfileService private readonly testProfileService: ITestProfileService,
	) {
		super();

		this.hasPendingReveal = !!filterState.reveal.value;
		this.noTestForDocumentWidget = this._register(instantiationService.createInstance(NoTestsForDocumentWidget, listContainer));
		this._viewMode.set(this.storageService.get('testing.viewMode', StorageScope.WORKSPACE, TestExplorerViewMode.Tree) as TestExplorerViewMode);
		this._viewSorting.set(this.storageService.get('testing.viewSorting', StorageScope.WORKSPACE, TestExplorerViewSorting.ByLocation) as TestExplorerViewSorting);

		this.reevaluateWelcomeState();
		this.filter = this.instantiationService.createInstance(TestsFilter, testService.collection);
		this.tree = instantiationService.createInstance(
			WorkbenchObjectTree,
			'Test Explorer List',
			listContainer,
			new ListDelegate(),
			[
				instantiationService.createInstance(TestItemRenderer, this.actionRunner),
				instantiationService.createInstance(ErrorRenderer),
			],
			{
				simpleKeyboardNavigation: true,
				identityProvider: instantiationService.createInstance(IdentityProvider),
				hideTwistiesOfChildlessElements: false,
				sorter: instantiationService.createInstance(TreeSorter, this),
				keyboardNavigationLabelProvider: instantiationService.createInstance(TreeKeyboardNavigationLabelProvider),
				accessibilityProvider: instantiationService.createInstance(ListAccessibilityProvider),
				filter: this.filter,
			}) as WorkbenchObjectTree<TestExplorerTreeElement, FuzzyScore>;

		this._register(this.tree.onDidChangeCollapseState(evt => {
			if (evt.node.element instanceof TestItemTreeElement) {
				this.projection.value?.expandElement(evt.node.element, evt.deep ? Infinity : 0);
			}
		}));

		this._register(onDidChangeVisibility(visible => {
			if (visible) {
				this.ensureProjection();
			}
		}));

		this._register(this.tree.onContextMenu(e => this.onContextMenu(e)));

		this._register(Event.any(
			filterState.text.onDidChange,
			filterState.fuzzy.onDidChange,
			testService.excluded.onTestExclusionsChanged,
		)(this.tree.refilter, this.tree));

		this._register(this.tree);

		this._register(this.onChangeWelcomeVisibility(e => {
			this.noTestForDocumentWidget.setVisible(e === WelcomeExperience.ForDocument);
		}));

		this._register(dom.addStandardDisposableListener(this.tree.getHTMLElement(), 'keydown', evt => {
			if (evt.equals(KeyCode.Enter)) {
				this.handleExecuteKeypress(evt);
			} else if (DefaultKeyboardNavigationDelegate.mightProducePrintableCharacter(evt)) {
				filterState.text.value = evt.browserEvent.key;
				filterState.focusInput();
			}
		}));

		this._register(filterState.reveal.onDidChange(id => this.revealById(id, undefined, false)));

		this._register(onDidChangeVisibility(visible => {
			if (visible) {
				filterState.focusInput();
			}
		}));

		this._register(this.tree.onDidChangeSelection(evt => {
			if (evt.browserEvent instanceof MouseEvent && (evt.browserEvent.altKey || evt.browserEvent.shiftKey)) {
				return; // don't focus when alt-clicking to multi select
			}

			const selected = evt.elements[0];
			if (selected && evt.browserEvent && selected instanceof TestItemTreeElement
				&& selected.children.size === 0 && selected.test.expand === TestItemExpandState.NotExpandable) {
				this.tryPeekError(selected);
			}
		}));

		let followRunningTests = getTestingConfiguration(configurationService, TestingConfigKeys.FollowRunningTest);
		this._register(configurationService.onDidChangeConfiguration(() => {
			followRunningTests = getTestingConfiguration(configurationService, TestingConfigKeys.FollowRunningTest);
		}));

		let alwaysRevealTestAfterStateChange = getTestingConfiguration(configurationService, TestingConfigKeys.AlwaysRevealTestOnStateChange);
		this._register(configurationService.onDidChangeConfiguration(() => {
			alwaysRevealTestAfterStateChange = getTestingConfiguration(configurationService, TestingConfigKeys.AlwaysRevealTestOnStateChange);
		}));

		this._register(testResults.onTestChanged(evt => {
			if (!followRunningTests) {
				return;
			}

			if (evt.reason !== TestResultItemChangeReason.OwnStateChange) {
				return;
			}

			// follow running tests, or tests whose state changed. Tests that
			// complete very fast may not enter the running state at all.
			if (evt.item.ownComputedState !== TestResultState.Running && !(evt.previousState === TestResultState.Queued && isStateWithResult(evt.item.ownComputedState))) {
				return;
			}

			this.revealById(evt.item.item.extId, alwaysRevealTestAfterStateChange, false);
		}));

		this._register(testResults.onResultsChanged(() => {
			this.tree.resort(null);
		}));

		this._register(this.testProfileService.onDidChange(() => {
			this.tree.rerender();
		}));

		const onEditorChange = () => {
			this.filter.filterToDocumentUri(editorService.activeEditor?.resource);
			if (this.filterState.isFilteringFor(TestFilterTerm.CurrentDoc)) {
				this.tree.refilter();
			}
		};

		this._register(editorService.onDidActiveEditorChange(onEditorChange));

		this._register(this.storageService.onWillSaveState(({ reason }) => {
			if (reason === WillSaveStateReason.SHUTDOWN) {
				this.lastViewState.store(this.tree.getViewState({
					getId: e => e instanceof TestItemTreeElement ? e.test.item.extId : '',
				}));
			}
		}));

		onEditorChange();
	}

	/**
	 * Re-layout the tree.
	 */
	public layout(height?: number, width?: number): void {
		this.tree.layout(height, width);
	}

	/**
	 * Tries to reveal by extension ID. Queues the request if the extension
	 * ID is not currently available.
	 */
	private revealById(id: string | undefined, expand = true, focus = true) {
		if (!id) {
			this.hasPendingReveal = false;
			return;
		}

		const projection = this.ensureProjection();

		// If the item itself is visible in the tree, show it. Otherwise, expand
		// its closest parent.
		let expandToLevel = 0;
		const idPath = [...TestId.fromString(id).idsFromRoot()];
		for (let i = idPath.length - 1; i >= expandToLevel; i--) {
			const element = projection.getElementByTestId(idPath[i].toString());
			// Skip all elements that aren't in the tree.
			if (!element || !this.tree.hasElement(element)) {
				continue;
			}

			// If this 'if' is true, we're at the closest-visible parent to the node
			// we want to expand. Expand that, and then start the loop again because
			// we might already have children for it.
			if (i < idPath.length - 1) {
				if (expand) {
					this.tree.expand(element);
					expandToLevel = i + 1; // avoid an infinite loop if the test does not exist
					i = idPath.length - 1; // restart the loop since new children may now be visible
					continue;
				}
			}

			// Otherwise, we've arrived!

			// If the node or any of its children are excluded, flip on the 'show
			// excluded tests' checkbox automatically. If we didn't expand, then set
			// target focus target to the first collapsed element.

			let focusTarget = element;
			for (let n: TestItemTreeElement | null = element; n instanceof TestItemTreeElement; n = n.parent) {
				if (n.test && this.testService.excluded.contains(n.test)) {
					this.filterState.toggleFilteringFor(TestFilterTerm.Hidden, true);
					break;
				}

				if (!expand && (this.tree.hasElement(n) && this.tree.isCollapsed(n))) {
					focusTarget = n;
				}
			}

			this.filterState.reveal.value = undefined;
			this.hasPendingReveal = false;
			if (focus) {
				this.tree.domFocus();
			}

			if (this.tree.getRelativeTop(focusTarget) === null) {
				this.tree.reveal(focusTarget, 0.5);
			}

			this.revealTimeout.value = disposableTimeout(() => {
				this.tree.setFocus([focusTarget]);
				this.tree.setSelection([focusTarget]);
			}, 1);

			return;
		}

		// If here, we've expanded all parents we can. Waiting on data to come
		// in to possibly show the revealed test.
		this.hasPendingReveal = true;
	}

	/**
	 * Collapse all items in the tree.
	 */
	public async collapseAll() {
		this.tree.collapseAll();
	}

	/**
	 * Tries to peek the first test error, if the item is in a failed state.
	 */
	private tryPeekError(item: TestItemTreeElement) {
		const lookup = item.test && this.testResults.getStateById(item.test.item.extId);
		return lookup && lookup[1].tasks.some(s => isFailedState(s.state))
			? this.peekOpener.tryPeekFirstError(lookup[0], lookup[1], { preserveFocus: true })
			: false;
	}

	private onContextMenu(evt: ITreeContextMenuEvent<TestExplorerTreeElement | null>) {
		const element = evt.element;
		if (!(element instanceof TestItemTreeElement)) {
			return;
		}

		const actions = getActionableElementActions(this.contextKeyService, this.menuService, this.testService, this.testProfileService, element);
		this.contextMenuService.showContextMenu({
			getAnchor: () => evt.anchor,
			getActions: () => actions.value.secondary,
			getActionsContext: () => element,
			onHide: () => actions.dispose(),
			actionRunner: this.actionRunner,
		});
	}

	private handleExecuteKeypress(evt: IKeyboardEvent) {
		const focused = this.tree.getFocus();
		const selected = this.tree.getSelection();
		let targeted: (TestExplorerTreeElement | null)[];
		if (focused.length === 1 && selected.includes(focused[0])) {
			evt.browserEvent?.preventDefault();
			targeted = selected;
		} else {
			targeted = focused;
		}

		const toRun = targeted
			.filter((e): e is TestItemTreeElement => e instanceof TestItemTreeElement);

		if (toRun.length) {
			this.testService.runTests({
				group: TestRunProfileBitset.Run,
				tests: toRun.map(t => t.test),
			});
		}
	}

	private reevaluateWelcomeState() {
		const shouldShowWelcome = this.testService.collection.busyProviders === 0 && testCollectionIsEmpty(this.testService.collection);
		const welcomeExperience = shouldShowWelcome
			? (this.filterState.isFilteringFor(TestFilterTerm.CurrentDoc) ? WelcomeExperience.ForDocument : WelcomeExperience.ForWorkspace)
			: WelcomeExperience.None;

		if (welcomeExperience !== this.welcomeExperience) {
			this.welcomeExperience = welcomeExperience;
			this.welcomeVisibilityEmitter.fire(welcomeExperience);
		}
	}

	private ensureProjection() {
		return this.projection.value ?? this.updatePreferredProjection();
	}

	private updatePreferredProjection() {
		this.projection.clear();

		const lastState = AbstractTreeViewState.lift(this.lastViewState.get() ?? AbstractTreeViewState.empty());
		if (this._viewMode.get() === TestExplorerViewMode.List) {
			this.projection.value = this.instantiationService.createInstance(HierarchicalByNameProjection, lastState);
		} else {
			this.projection.value = this.instantiationService.createInstance(HierarchicalByLocationProjection, lastState);
		}

		const scheduler = new RunOnceScheduler(() => this.applyProjectionChanges(), 200);
		this.projection.value.onUpdate(() => {
			if (!scheduler.isScheduled()) {
				scheduler.schedule();
			}
		});

		this.applyProjectionChanges();
		return this.projection.value;
	}

	private applyProjectionChanges() {
		this.reevaluateWelcomeState();
		this.projection.value?.applyTo(this.tree);

		if (this.hasPendingReveal) {
			this.revealById(this.filterState.reveal.value);
		}
	}

	/**
	 * Gets the selected tests from the tree.
	 */
	public getSelectedTests() {
		return this.tree.getSelection();
	}
}

const enum FilterResult {
	Exclude,
	Inherit,
	Include,
}

const hasNodeInOrParentOfUri = (collection: IMainThreadTestCollection, ident: IUriIdentityService, testUri: URI, fromNode?: string) => {
	const queue: Iterable<string>[] = [fromNode ? [fromNode] : collection.rootIds];
	while (queue.length) {
		for (const id of queue.pop()!) {
			const node = collection.getNodeById(id);
			if (!node) {
				continue;
			}

			if (!node.item.uri || !ident.extUri.isEqualOrParent(testUri, node.item.uri)) {
				continue;
			}

			// Only show nodes that can be expanded (and might have a child with
			// a range) or ones that have a physical location.
			if (node.item.range || node.expand === TestItemExpandState.Expandable) {
				return true;
			}

			queue.push(node.children);
		}
	}

	return false;
};

class TestsFilter implements ITreeFilter<TestExplorerTreeElement> {
	private documentUri: URI | undefined;

	constructor(
		private readonly collection: IMainThreadTestCollection,
		@ITestExplorerFilterState private readonly state: ITestExplorerFilterState,
		@ITestService private readonly testService: ITestService,
		@IUriIdentityService private readonly uriIdentityService: IUriIdentityService,
	) { }

	/**
	 * @inheritdoc
	 */
	public filter(element: TestItemTreeElement): TreeFilterResult<void> {
		if (element instanceof TestTreeErrorMessage) {
			return TreeVisibility.Visible;
		}

		if (
			element.test
			&& !this.state.isFilteringFor(TestFilterTerm.Hidden)
			&& this.testService.excluded.contains(element.test)
		) {
			return TreeVisibility.Hidden;
		}

		switch (Math.min(this.testFilterText(element), this.testLocation(element), this.testState(element), this.testTags(element))) {
			case FilterResult.Exclude:
				return TreeVisibility.Hidden;
			case FilterResult.Include:
				return TreeVisibility.Visible;
			default:
				return TreeVisibility.Recurse;
		}
	}

	public filterToDocumentUri(uri: URI | undefined) {
		this.documentUri = uri;
	}

	private testTags(element: TestItemTreeElement): FilterResult {
		if (!this.state.includeTags.size && !this.state.excludeTags.size) {
			return FilterResult.Include;
		}

		return (this.state.includeTags.size ?
			element.test.item.tags.some(t => this.state.includeTags.has(t)) :
			true) && element.test.item.tags.every(t => !this.state.excludeTags.has(t))
			? FilterResult.Include
			: FilterResult.Inherit;
	}

	private testState(element: TestItemTreeElement): FilterResult {
		if (this.state.isFilteringFor(TestFilterTerm.Failed)) {
			return isFailedState(element.state) ? FilterResult.Include : FilterResult.Inherit;
		}

		if (this.state.isFilteringFor(TestFilterTerm.Executed)) {
			return element.state !== TestResultState.Unset ? FilterResult.Include : FilterResult.Inherit;
		}

		return FilterResult.Include;
	}

	private testLocation(element: TestItemTreeElement): FilterResult {
		if (!this.documentUri) {
			return FilterResult.Include;
		}

		if (!this.state.isFilteringFor(TestFilterTerm.CurrentDoc) || !(element instanceof TestItemTreeElement)) {
			return FilterResult.Include;
		}

		if (hasNodeInOrParentOfUri(this.collection, this.uriIdentityService, this.documentUri, element.test.item.extId)) {
			return FilterResult.Include;
		}

		return FilterResult.Inherit;
	}

	private testFilterText(element: TestItemTreeElement) {
		if (this.state.globList.length === 0) {
			return FilterResult.Include;
		}

		const fuzzy = this.state.fuzzy.value;
		for (let e: TestItemTreeElement | null = element; e; e = e.parent) {
			// start as included if the first glob is a negation
			let included = this.state.globList[0].include === false ? FilterResult.Include : FilterResult.Inherit;
			const data = e.label.toLowerCase();

			for (const { include, text } of this.state.globList) {
				if (fuzzy ? fuzzyContains(data, text) : data.includes(text)) {
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

class TreeSorter implements ITreeSorter<TestExplorerTreeElement> {
	constructor(private readonly viewModel: TestingExplorerViewModel) { }

	public compare(a: TestExplorerTreeElement, b: TestExplorerTreeElement): number {
		if (a instanceof TestTreeErrorMessage || b instanceof TestTreeErrorMessage) {
			return (a instanceof TestTreeErrorMessage ? -1 : 0) + (b instanceof TestTreeErrorMessage ? 1 : 0);
		}

		const durationDelta = (b.duration || 0) - (a.duration || 0);
		if (this.viewModel.viewSorting === TestExplorerViewSorting.ByDuration && durationDelta !== 0) {
			return durationDelta;
		}

		const stateDelta = cmpPriority(a.state, b.state);
		if (this.viewModel.viewSorting === TestExplorerViewSorting.ByStatus && stateDelta !== 0) {
			return stateDelta;
		}

		if (a instanceof TestItemTreeElement && b instanceof TestItemTreeElement && a.test.item.uri && b.test.item.uri && a.test.item.uri.toString() === b.test.item.uri.toString() && a.test.item.range && b.test.item.range) {
			const delta = a.test.item.range.startLineNumber - b.test.item.range.startLineNumber;
			if (delta !== 0) {
				return delta;
			}
		}

		return (a.sortText || a.label).localeCompare(b.sortText || b.label);
	}
}

class NoTestsForDocumentWidget extends Disposable {
	private readonly el: HTMLElement;
	constructor(
		container: HTMLElement,
		@ITestExplorerFilterState filterState: ITestExplorerFilterState,
		@IThemeService themeService: IThemeService,
	) {
		super();
		const el = this.el = dom.append(container, dom.$('.testing-no-test-placeholder'));
		const emptyParagraph = dom.append(el, dom.$('p'));
		emptyParagraph.innerText = localize('testingNoTest', 'No tests were found in this file.');
		const buttonLabel = localize('testingFindExtension', 'Show Workspace Tests');
		const button = this._register(new Button(el, { title: buttonLabel }));
		button.label = buttonLabel;
		this._register(attachButtonStyler(button, themeService));
		this._register(button.onDidClick(() => filterState.toggleFilteringFor(TestFilterTerm.CurrentDoc, false)));
	}

	public setVisible(isVisible: boolean) {
		this.el.classList.toggle('visible', isVisible);
	}
}

class TestExplorerActionRunner extends ActionRunner {
	constructor(private getSelectedTests: () => ReadonlyArray<TestExplorerTreeElement>) {
		super();
	}

	override async runAction(action: IAction, context: TestExplorerTreeElement): Promise<any> {
		if (!(action instanceof MenuItemAction)) {
			return super.runAction(action, context);
		}

		const selection = this.getSelectedTests();
		const contextIsSelected = selection.some(s => s === context);
		const actualContext = contextIsSelected ? selection : [context];
		const actionable = actualContext.filter((t): t is TestItemTreeElement => t instanceof TestItemTreeElement);
		await action.run(...actionable);
	}
}

const getLabelForTestTreeElement = (element: TestItemTreeElement) => {
	let label = labelForTestInState(element.label, element.state);

	if (element instanceof TestItemTreeElement) {
		if (element.duration !== undefined) {
			label = localize({
				key: 'testing.treeElementLabelDuration',
				comment: ['{0} is the original label in testing.treeElementLabel, {1} is a duration'],
			}, '{0}, in {1}', label, formatDuration(element.duration));
		}
	}

	return label;
};

class ListAccessibilityProvider implements IListAccessibilityProvider<TestExplorerTreeElement> {
	getWidgetAriaLabel(): string {
		return localize('testExplorer', "Test Explorer");
	}

	getAriaLabel(element: TestExplorerTreeElement): string {
		return element instanceof TestTreeErrorMessage
			? element.description
			: getLabelForTestTreeElement(element);
	}
}

class TreeKeyboardNavigationLabelProvider implements IKeyboardNavigationLabelProvider<TestExplorerTreeElement> {
	getKeyboardNavigationLabel(element: TestExplorerTreeElement) {
		return element instanceof TestTreeErrorMessage ? element.message : element.label;
	}
}

class ListDelegate implements IListVirtualDelegate<TestExplorerTreeElement> {
	getHeight(_element: TestExplorerTreeElement) {
		return 22;
	}

	getTemplateId(element: TestExplorerTreeElement) {
		if (element instanceof TestTreeErrorMessage) {
			return ErrorRenderer.ID;
		}

		return TestItemRenderer.ID;
	}
}

class IdentityProvider implements IIdentityProvider<TestExplorerTreeElement> {
	public getId(element: TestExplorerTreeElement) {
		return element.treeId;
	}
}

interface IErrorTemplateData {
	label: HTMLElement;
}

class ErrorRenderer implements ITreeRenderer<TestTreeErrorMessage, FuzzyScore, IErrorTemplateData> {
	static readonly ID = 'error';

	private readonly renderer: MarkdownRenderer;

	constructor(@IInstantiationService instantionService: IInstantiationService) {
		this.renderer = instantionService.createInstance(MarkdownRenderer, {});
	}

	get templateId(): string {
		return ErrorRenderer.ID;
	}

	renderTemplate(container: HTMLElement): IErrorTemplateData {
		const label = dom.append(container, dom.$('.error'));
		return { label };
	}

	renderElement({ element }: ITreeNode<TestTreeErrorMessage, FuzzyScore>, _: number, data: IErrorTemplateData): void {
		if (typeof element.message === 'string') {
			data.label.innerText = element.message;
		} else {
			const result = this.renderer.render(element.message, { inline: true });
			data.label.appendChild(result.element);
		}

		data.label.title = element.description;
	}

	disposeTemplate(): void {
		// noop
	}
}

interface IActionableElementTemplateData {
	label: HTMLElement;
	icon: HTMLElement;
	wrapper: HTMLElement;
	actionBar: ActionBar;
	elementDisposable: IDisposable[];
	templateDisposable: IDisposable[];
}

abstract class ActionableItemTemplateData<T extends TestItemTreeElement> extends Disposable
	implements ITreeRenderer<T, FuzzyScore, IActionableElementTemplateData> {
	constructor(
		private readonly actionRunner: TestExplorerActionRunner,
		@IMenuService private readonly menuService: IMenuService,
		@ITestService protected readonly testService: ITestService,
		@ITestProfileService protected readonly profiles: ITestProfileService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super();
	}

	/**
	 * @inheritdoc
	 */
	abstract get templateId(): string;

	/**
	 * @inheritdoc
	 */
	public renderTemplate(container: HTMLElement): IActionableElementTemplateData {
		const wrapper = dom.append(container, dom.$('.test-item'));

		const icon = dom.append(wrapper, dom.$('.computed-state'));
		const label = dom.append(wrapper, dom.$('.label'));

		dom.append(wrapper, dom.$(ThemeIcon.asCSSSelector(icons.testingHiddenIcon)));
		const actionBar = new ActionBar(wrapper, {
			actionRunner: this.actionRunner,
			actionViewItemProvider: action =>
				action instanceof MenuItemAction
					? this.instantiationService.createInstance(MenuEntryActionViewItem, action, undefined)
					: undefined
		});

		return { wrapper, label, actionBar, icon, elementDisposable: [], templateDisposable: [actionBar] };
	}

	/**
	 * @inheritdoc
	 */
	public renderElement({ element }: ITreeNode<T, FuzzyScore>, _: number, data: IActionableElementTemplateData): void {
		this.fillActionBar(element, data);
	}

	/**
	 * @inheritdoc
	 */
	disposeTemplate(templateData: IActionableElementTemplateData): void {
		dispose(templateData.templateDisposable);
		templateData.templateDisposable = [];
	}

	/**
	 * @inheritdoc
	 */
	disposeElement(_element: ITreeNode<T, FuzzyScore>, _: number, templateData: IActionableElementTemplateData): void {
		dispose(templateData.elementDisposable);
		templateData.elementDisposable = [];
	}

	private fillActionBar(element: T, data: IActionableElementTemplateData) {
		const actions = getActionableElementActions(this.contextKeyService, this.menuService, this.testService, this.profiles, element);
		data.elementDisposable.push(actions);
		data.actionBar.clear();
		data.actionBar.context = element;
		data.actionBar.push(actions.value.primary, { icon: true, label: false });
	}
}

class TestItemRenderer extends ActionableItemTemplateData<TestItemTreeElement> {
	public static readonly ID = 'testItem';

	/**
	 * @inheritdoc
	 */
	get templateId(): string {
		return TestItemRenderer.ID;
	}

	/**
	 * @inheritdoc
	 */
	public override renderElement(node: ITreeNode<TestItemTreeElement, FuzzyScore>, depth: number, data: IActionableElementTemplateData): void {
		super.renderElement(node, depth, data);

		const testHidden = this.testService.excluded.contains(node.element.test);
		data.wrapper.classList.toggle('test-is-hidden', testHidden);

		const icon = icons.testingStatesToIcons.get(
			node.element.test.expand === TestItemExpandState.BusyExpanding || node.element.test.item.busy
				? TestResultState.Running
				: node.element.state);

		data.icon.className = 'computed-state ' + (icon ? ThemeIcon.asClassName(icon) : '');

		data.label.title = getLabelForTestTreeElement(node.element);
		dom.reset(data.label, ...renderLabelWithIcons(node.element.label));

		let description = node.element.description;
		if (node.element.duration !== undefined) {
			description = description
				? `${description}: ${formatDuration(node.element.duration)}`
				: formatDuration(node.element.duration);
		}

		if (description) {
			dom.append(data.label, dom.$('span.test-label-description', {}, description));
		}
	}
}

const formatDuration = (ms: number) => {
	if (ms < 10) {
		return `${ms.toFixed(1)}ms`;
	}

	if (ms < 1_000) {
		return `${ms.toFixed(0)}ms`;
	}

	return `${(ms / 1000).toFixed(1)}s`;
};

const getActionableElementActions = (
	contextKeyService: IContextKeyService,
	menuService: IMenuService,
	testService: ITestService,
	profiles: ITestProfileService,
	element: TestItemTreeElement,
) => {
	const test = element instanceof TestItemTreeElement ? element.test : undefined;
	const contextKeys: [string, unknown][] = getTestItemContextOverlay(test, test ? profiles.capabilitiesForTest(test) : 0);
	contextKeys.push(['view', Testing.ExplorerViewId]);
	if (test) {
		contextKeys.push([
			TestingContextKeys.canRefreshTests.key,
			TestId.isRoot(test.item.extId) && testService.getTestController(test.item.extId)?.canRefresh.value
		]);
		contextKeys.push([
			TestingContextKeys.testItemIsHidden.key,
			testService.excluded.contains(test)
		]);
	}

	const contextOverlay = contextKeyService.createOverlay(contextKeys);
	const menu = menuService.createMenu(MenuId.TestItem, contextOverlay);

	try {
		const primary: IAction[] = [];
		const secondary: IAction[] = [];
		const result = { primary, secondary };
		const actionsDisposable = createAndFillInActionBarActions(menu, {
			shouldForwardArgs: true,
		}, result, 'inline');

		return { value: result, dispose: () => actionsDisposable.dispose };
	} finally {
		menu.dispose();
	}
};

registerThemingParticipant((theme, collector) => {
	if (theme.type === 'dark') {
		const foregroundColor = theme.getColor(foreground);
		if (foregroundColor) {
			const fgWithOpacity = new Color(new RGBA(foregroundColor.rgba.r, foregroundColor.rgba.g, foregroundColor.rgba.b, 0.65));
			collector.addRule(`.test-explorer .test-explorer-messages { color: ${fgWithOpacity}; }`);
		}
	}
});
