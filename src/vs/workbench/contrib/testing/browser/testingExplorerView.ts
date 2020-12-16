/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { ActionBar } from 'vs/base/browser/ui/actionbar/actionbar';
import { IIdentityProvider, IListVirtualDelegate } from 'vs/base/browser/ui/list/list';
import { IListAccessibilityProvider } from 'vs/base/browser/ui/list/listWidget';
import { ICompressedTreeElement, ICompressedTreeNode } from 'vs/base/browser/ui/tree/compressedObjectTreeModel';
import { ICompressibleKeyboardNavigationLabelProvider, ICompressibleTreeRenderer } from 'vs/base/browser/ui/tree/objectTree';
import { ITreeEvent, ITreeFilter, ITreeNode, ITreeSorter, TreeFilterResult, TreeVisibility } from 'vs/base/browser/ui/tree/tree';
import { Action } from 'vs/base/common/actions';
import { Emitter, Event } from 'vs/base/common/event';
import { createMatches, FuzzyScore } from 'vs/base/common/filters';
import { Iterable } from 'vs/base/common/iterator';
import { Disposable, IDisposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import 'vs/css!./media/testing';
import { localize } from 'vs/nls';
import { MenuEntryActionViewItem } from 'vs/platform/actions/browser/menuEntryActionViewItem';
import { MenuItemAction } from 'vs/platform/actions/common/actions';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { FileKind } from 'vs/platform/files/common/files';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { WorkbenchCompressibleObjectTree } from 'vs/platform/list/browser/listService';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IThemeService, ThemeIcon } from 'vs/platform/theme/common/themeService';
import { TestRunState } from 'vs/workbench/api/common/extHostTypes';
import { IResourceLabel, IResourceLabelOptions, IResourceLabelProps, ResourceLabels } from 'vs/workbench/browser/labels';
import { ViewPane } from 'vs/workbench/browser/parts/views/viewPane';
import { IViewletViewOptions } from 'vs/workbench/browser/parts/views/viewsViewlet';
import { IViewDescriptorService } from 'vs/workbench/common/views';
import { testingStatesToIcons } from 'vs/workbench/contrib/testing/browser/icons';
import { getLabel, isTestItem, maxPriority, statePriority, TreeElement } from 'vs/workbench/contrib/testing/browser/testExplorerTree';
import { ITestingCollectionService, ITestSubscriptionItem } from 'vs/workbench/contrib/testing/browser/testingCollectionService';
import { ITestService } from 'vs/workbench/contrib/testing/common/testService';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { CancelTestRunAction, DebugAction, DebugSelectedAction, FilterableAction, filterVisibleActions, RunAction, RunSelectedAction, ToggleViewModeAction, ViewMode } from './testExplorerActions';

export const TESTING_EXPLORER_VIEW_ID = 'workbench.view.testing';

export class TestingExplorerView extends ViewPane {
	private primaryActions: Action[] = [];
	private secondaryActions: Action[] = [];
	private viewModel!: TestingExplorerViewModel;
	private currentSubscription?: IDisposable;
	private listContainer!: HTMLElement;

	constructor(
		options: IViewletViewOptions,
		@ITestingCollectionService private readonly testCollection: ITestingCollectionService,
		@ITestService private readonly testService: ITestService,
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

		this.listContainer = dom.append(container, dom.$('.test-explorer'));
		this.viewModel = this.instantiationService.createInstance(TestingExplorerViewModel, this.listContainer, this.onDidChangeBodyVisibility);
		this._register(this.viewModel);

		this.secondaryActions = [
			this.instantiationService.createInstance(ToggleViewModeAction, this.viewModel)
		];
		this.secondaryActions.forEach(this._register, this);

		this.primaryActions = [
			this.instantiationService.createInstance(RunSelectedAction, this.viewModel),
			this.instantiationService.createInstance(DebugSelectedAction, this.viewModel),
			this.instantiationService.createInstance(CancelTestRunAction),
		];
		this.primaryActions.forEach(this._register, this);

		for (const action of [...this.primaryActions, ...this.secondaryActions]) {
			if (action instanceof FilterableAction) {
				action.onDidChangeVisibility(this.updateActions, this);
			}
		}

		this._register(this.onDidChangeBodyVisibility(visible => {
			if (!visible && this.currentSubscription) {
				this.currentSubscription.dispose();
				this.currentSubscription = undefined;
			} else if (visible && !this.currentSubscription) {
				this.currentSubscription = this.createSubscription();
			}
		}));
	}

	/**
	 * @override
	 */
	public getActions() {
		return [...filterVisibleActions(this.primaryActions), ...super.getActions()];
	}

	/**
	 * @override
	 */
	public getSecondaryActions() {
		return [...filterVisibleActions(this.secondaryActions), ...super.getSecondaryActions()];
	}


	/**
	 * @override
	 */
	protected layoutBody(height: number, width: number): void {
		super.layoutBody(height, width);
		this.listContainer.style.height = `${height}px`;
		this.viewModel.layout(height, width);
	}

	private createSubscription() {
		return this.testCollection.subscribeToWorkspaceTests({
			add: node => this.viewModel.onNodeAddedOrRemoved(node),
			remove: node => this.viewModel.onNodeAddedOrRemoved(node),
			update: node => this.viewModel.onNodeChanged(node)
		});
	}
}

export class TestingExplorerViewModel extends Disposable {
	private tree: WorkbenchCompressibleObjectTree<TreeElement, FuzzyScore>;
	private filter: TestsFilter;
	private _viewMode = Number(this.storageService.get('testing.viewMode', StorageScope.WORKSPACE, String(ViewMode.Tree))) as ViewMode;
	private viewModeChangeEmitter = new Emitter<ViewMode>();

	/**
	 * Fires when the tree view mode changes.
	 */
	public readonly onViewModeChange = this.viewModeChangeEmitter.event;

	/**
	 * Fires when the selected tests change.
	 */
	public readonly onDidChangeSelection: Event<ITreeEvent<TreeElement | null>>;

	public get viewMode() {
		return this._viewMode;
	}

	public set viewMode(newMode: ViewMode) {
		if (newMode === this._viewMode) {
			return;
		}

		this._viewMode = newMode;
		for (const folder of this.testCollection.workspaceFolders()) {
			if (newMode === ViewMode.Tree) {
				this.renderTreeChildren(folder);
			} else {
				for (const root of folder.getChildren()) {
					this.renderListChildren(root);
				}
			}
		}

		this.storageService.store('testing.viewMode', newMode, StorageScope.WORKSPACE, StorageTarget.USER);
		this.viewModeChangeEmitter.fire(newMode);
	}

	constructor(
		listContainer: HTMLElement,
		onDidChangeVisibility: Event<boolean>,
		@IInstantiationService instantiationService: IInstantiationService,
		@IEditorService editorService: IEditorService,
		@IStorageService private readonly storageService: IStorageService,
		@ITestingCollectionService private readonly testCollection: ITestingCollectionService,
	) {
		super();
		const labels = this._register(instantiationService.createInstance(ResourceLabels, { onDidChangeVisibility: onDidChangeVisibility }));

		this.filter = new TestsFilter();
		this.tree = instantiationService.createInstance(
			WorkbenchCompressibleObjectTree,
			'Test Explorer List',
			listContainer,
			new ListDelegate(),
			[
				instantiationService.createInstance(TestsRenderer, labels, this)
			],
			{
				identityProvider: instantiationService.createInstance(IdentityProvider),
				hideTwistiesOfChildlessElements: true,
				sorter: instantiationService.createInstance(TreeSorter),
				keyboardNavigationLabelProvider: instantiationService.createInstance(TreeKeyboardNavigationLabelProvider),
				accessibilityProvider: instantiationService.createInstance(ListAccessibilityProvider),
				filter: this.filter,
			}) as WorkbenchCompressibleObjectTree<TreeElement, FuzzyScore>;

		this.onDidChangeSelection = this.tree.onDidChangeSelection;

		this._register(this.tree);

		this._register(this.tree.onDidChangeSelection(evt => {
			const [first] = evt.elements;
			if (!first || !isTestItem(first) || !first.item.location) {
				return;
			}

			editorService.openEditor({
				resource: URI.revive(first.item.location.uri),
				options: { selection: first.item.location.range, preserveFocus: true }
			});
		}));
	}

	/**
	 * Re-layout the tree.
	 */
	public layout(height: number, width: number): void {
		this.tree.layout(height, width);
	}

	/**
	 * Called when a node property changes.
	 */
	public onNodeChanged(node: TreeElement) {
		this.refreshComputedState(node);
		this.tree.rerender(node);
	}

	/**
	 * Updates the computed state of the node, bubbling the update to parents
	 * if necessary. Returns whether the node's computed state was changed.
	 */
	private refreshComputedState(node: TreeElement) {
		if (node.computedState === undefined) {
			return false;
		}

		const oldPriority = statePriority[node.computedState];
		node.computedState = undefined;
		const newState = getComputedState(node);
		const newPriority = statePriority[getComputedState(node)];

		if (newPriority > oldPriority) {
			// Update all parents to ensure they're at least this priority.
			for (let parent = node.parentItem; parent; parent = parent.parentItem) {
				const prev = parent.computedState;
				if (prev !== undefined && statePriority[prev] >= newPriority) {
					break;
				}

				parent.computedState = newState;
				if (this.isRendered(parent)) {
					this.tree.rerender(parent);
				}
			}
		} else if (newPriority < oldPriority) {
			// Re-render all parents of this node whose computed priority might have come from this node
			for (let parent = node.parentItem; parent; parent = parent.parentItem) {
				const prev = parent.computedState;
				if (prev === undefined || statePriority[prev] > oldPriority) {
					break;
				}

				parent.computedState = undefined;
				parent.computedState = getComputedState(parent);
				if (this.isRendered(parent)) {
					this.tree.rerender(parent);
				}
			}
		} else {
			return false;
		}

		return true;
	}

	/**
	 * Called to rerender the children for a node.
	 */
	public onNodeAddedOrRemoved(node: TreeElement) {
		if (!isTestItem(node)) {
			this.tree.setChildren(null, Iterable.map(this.testCollection.workspaceFolders(), renderElement));
			return;
		}

		const parent = node.parentItem;
		if (this.viewMode === ViewMode.Tree) {
			this.renderTreeChildren(node.parentItem);
		} else {
			let testRoot = node.parentItem;
			while (isTestItem(testRoot.parentItem)) {
				testRoot = testRoot.parentItem;
			}
			this.renderListChildren(testRoot);
		}

		// Refresh parent's computed state, and rerender if needed
		if (parent && this.refreshComputedState(parent) && this.isRendered(node)) {
			this.tree.rerender(parent);
		}
	}

	/**
	 * Gets the selected tests from the tree.
	 */
	public getSelectedTests() {
		return this.tree.getSelection();
	}

	/**
	 * Renders children of the node as a tree.
	 */
	private renderTreeChildren(node: TreeElement) {
		this.tree.setChildren(node, Iterable.map(node.getChildren(), renderElement));
	}

	/**
	 * Renders the tests in a folder as a list. Effectively, this filters
	 * non-runnable nodes from the test tree, and shows the runnable leaf nodes
	 * in the list.
	 */
	private renderListChildren(node: TreeElement) {
		if (isTestItem(node)) {
			this.tree.setChildren(node, this.getListChildrenOf(node));
		} else {
			this.tree.setChildren(node, Iterable.map(node.getChildren(), test => ({
				element: test,
				children: this.getListChildrenOf(test)
			})));
		}
	}

	private isRendered(node: TreeElement) {
		return this.viewMode === ViewMode.Tree || node.depth <= 1;
	}

	private getListChildrenOf(node: ITestSubscriptionItem) {
		const leafNodes: ICompressedTreeElement<TreeElement>[] = [];

		// returns true if the current node is a runnable leaf, or one of its children is
		const traverse = (node: ITestSubscriptionItem): boolean => {
			let hadRunnableLeaf = false;
			for (const child of node.getChildren()) {
				if (traverse(child)) {
					hadRunnableLeaf = true;
				}
			}

			if (hadRunnableLeaf) {
				return true;
			}

			if (node.item.runnable || node.item.debuggable) {
				leafNodes.push({ element: node });
				return true;
			}

			return false;
		};

		for (const child of node.getChildren()) {
			traverse(child);
		}

		return leafNodes;
	}
}

/**
 * Gets the computed state for the node.
 */
const getComputedState = (node: TreeElement) => {
	if (node.computedState === undefined) {
		node.computedState = isTestItem(node) ? node.item.state.runState : TestRunState.Unset;
		for (const child of node.getChildren()) {
			node.computedState = maxPriority(node.computedState, getComputedState(child));
		}
	}

	return node.computedState;
};

const renderElement = (item: TreeElement): ICompressedTreeElement<TreeElement> => {
	return {
		element: item,
		children: Iterable.map(item.getChildren(), renderElement),
		incompressible: item.depth > 2, // compress workspace folders (0) and provider roots (1)
	};
};

class TestsFilter implements ITreeFilter<TreeElement, FuzzyScore> {
	private filterText: string | undefined;

	public setFilter(filterText: string) {
		this.filterText = filterText;
	}

	public filter(element: TreeElement): TreeFilterResult<FuzzyScore> {
		if (!this.filterText) {
			return TreeVisibility.Visible;
		}

		if (getLabel(element).includes(this.filterText)) {
			return TreeVisibility.Visible;
		}

		return element.childCount ? TreeVisibility.Recurse : TreeVisibility.Hidden;
	}
}
class TreeSorter implements ITreeSorter<TreeElement> {
	public compare(a: TreeElement, b: TreeElement): number {
		return getLabel(a).localeCompare(getLabel(b));
	}
}

class ListAccessibilityProvider implements IListAccessibilityProvider<TreeElement> {
	getWidgetAriaLabel(): string {
		return localize('testExplorer', "Test Explorer");
	}

	getAriaLabel(element: TreeElement): string {
		return getLabel(element);
	}
}

class TreeKeyboardNavigationLabelProvider implements ICompressibleKeyboardNavigationLabelProvider<TreeElement> {
	getKeyboardNavigationLabel(element: TreeElement) {
		return getLabel(element);
	}

	getCompressedNodeKeyboardNavigationLabel(elements: TreeElement[]) {
		return elements.map(getLabel).join('/');
	}
}

class ListDelegate implements IListVirtualDelegate<TreeElement> {
	getHeight(_element: TreeElement) {
		return 22;
	}

	getTemplateId(_element: TreeElement) {
		return TestsRenderer.ID;
	}
}

class IdentityProvider implements IIdentityProvider<TreeElement> {
	public getId(element: TreeElement) {
		return isTestItem(element) ? `test:${element.id}` : `folder:${element.folder.index}`;
	}
}

interface TestTemplateData {
	label: IResourceLabel;
	icon: HTMLElement;
	actionBar: ActionBar;
}

class TestsRenderer implements ICompressibleTreeRenderer<TreeElement, FuzzyScore, TestTemplateData> {
	public static readonly ID = 'testExplorer';

	constructor(
		private labels: ResourceLabels,
		private readonly view: TestingExplorerViewModel,
		@IInstantiationService private readonly instantiationService: IInstantiationService
	) { }

	get templateId(): string {
		return TestsRenderer.ID;
	}

	public renderTemplate(container: HTMLElement): TestTemplateData {
		const wrapper = dom.append(container, dom.$('.test-item'));

		const icon = dom.append(wrapper, dom.$('.computed-state'));
		const name = dom.append(wrapper, dom.$('.name'));
		const label = this.labels.create(name, { supportHighlights: true });

		const actionBar = new ActionBar(wrapper, {
			actionViewItemProvider: action =>
				action instanceof MenuItemAction
					? this.instantiationService.createInstance(MenuEntryActionViewItem, action)
					: undefined
		});

		return { label, actionBar, icon };
	}

	public renderElement(node: ITreeNode<TreeElement, FuzzyScore>, index: number, data: TestTemplateData): void {
		const element = node.element;
		this.render(element, getLabel(element), data, node.filterData);
	}

	public renderCompressedElements(node: ITreeNode<ICompressedTreeNode<TreeElement>, FuzzyScore>, index: number, data: TestTemplateData): void {
		const element = node.element.elements[node.element.elements.length - 1];
		this.render(element, getLabel(element), data, node.filterData);
	}

	private render(element: TreeElement, labels: string | string[], data: TestTemplateData, filterData: FuzzyScore | undefined) {
		const label: IResourceLabelProps = {
			name: labels,
		};
		const options: IResourceLabelOptions = {};
		data.actionBar.clear();

		const icon = testingStatesToIcons.get(getComputedState(element));
		data.icon.className = 'computed-state ' + (icon ? ThemeIcon.asClassName(icon) : '');

		if (isTestItem(element)) {
			if (element.item.location) {
				label.resource = URI.revive(element.item.location.uri);
			}

			options.title = 'hover title';
			options.fileKind = FileKind.FILE;

			if (element.item.runnable) {
				data.actionBar.push(this.instantiationService.createInstance(RunAction, element), { icon: true, label: false });
			}

			if (element.item.debuggable) {
				data.actionBar.push(this.instantiationService.createInstance(DebugAction, element), { icon: true, label: false });
			}

			if (this.view.viewMode === ViewMode.List && element.depth > 1) {
				label.description = getLabel(element.parentItem);
			}
		} else {
			options.fileKind = FileKind.ROOT_FOLDER;
		}


		options.matches = createMatches(filterData);
		data.label.setResource(label, options);
	}

	disposeTemplate(templateData: TestTemplateData): void {
		templateData.label.dispose();
		templateData.actionBar.dispose();
	}
}
