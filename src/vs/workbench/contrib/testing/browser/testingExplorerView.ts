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
import { ITreeFilter, ITreeNode, ITreeSorter, TreeFilterResult, TreeVisibility } from 'vs/base/browser/ui/tree/tree';
import { Emitter } from 'vs/base/common/event';
import { createMatches, FuzzyScore } from 'vs/base/common/filters';
import { Iterable } from 'vs/base/common/iterator';
import { IDisposable } from 'vs/base/common/lifecycle';
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
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { IResourceLabel, IResourceLabelOptions, IResourceLabelProps, ResourceLabels } from 'vs/workbench/browser/labels';
import { ViewPane } from 'vs/workbench/browser/parts/views/viewPane';
import { IViewletViewOptions } from 'vs/workbench/browser/parts/views/viewsViewlet';
import { IViewDescriptorService } from 'vs/workbench/common/views';
import { isTestItem, ITestingCollectionService, ITestSubscriptionFolder, ITestSubscriptionItem } from 'vs/workbench/contrib/testing/browser/testingCollectionService';
import { ITestService } from 'vs/workbench/contrib/testing/common/testService';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { DebugAction, RunAction, ToggleViewModeAction, ViewMode } from './testExplorerActions';

export const TESTING_EXPLORER_VIEW_ID = 'workbench.view.testing';

export class TestingExplorerView extends ViewPane {
	private listContainer!: HTMLElement;
	private tree!: WorkbenchCompressibleObjectTree<TreeElement, FuzzyScore>;
	private filter!: TestsFilter;
	private toggleViewModeAction!: ToggleViewModeAction;
	private currentSubscription?: IDisposable;
	private _viewMode = Number(this.storageService.get('testing.viewMode', StorageScope.WORKSPACE, String(ViewMode.Tree))) as ViewMode;
	private viewModeChangeEmitter = new Emitter<ViewMode>();

	/**
	 * Fires when the tree view mode changes.
	 */
	public readonly onViewModeChange = this.viewModeChangeEmitter.event;

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
				this.renderListChildren(folder);
			}
		}

		this.storageService.store('testing.viewMode', newMode, StorageScope.WORKSPACE, StorageTarget.USER);
		this.viewModeChangeEmitter.fire(newMode);
	}

	constructor(
		options: IViewletViewOptions,
		@ITestingCollectionService private readonly testCollection: ITestingCollectionService,
		@ITestService private readonly testService: ITestService,
		@IEditorService private readonly _editorService: IEditorService,
		@IStorageService private readonly storageService: IStorageService,
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
		this.toggleViewModeAction = this._register(new ToggleViewModeAction(this));
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

		const labels = this._register(this.instantiationService.createInstance(ResourceLabels, { onDidChangeVisibility: this.onDidChangeBodyVisibility }));

		this.filter = new TestsFilter();
		this.listContainer = dom.append(container, dom.$('.test-explorer'));
		this.tree = this.instantiationService.createInstance(
			WorkbenchCompressibleObjectTree,
			'Test Explorer List',
			this.listContainer,
			new ListDelegate(),
			[
				this.instantiationService.createInstance(TestsRenderer, labels, this)
			],
			{
				identityProvider: this.instantiationService.createInstance(IdentityProvider),
				hideTwistiesOfChildlessElements: true,
				sorter: this.instantiationService.createInstance(TreeSorter),
				keyboardNavigationLabelProvider: this.instantiationService.createInstance(TreeKeyboardNavigationLabelProvider),
				accessibilityProvider: this.instantiationService.createInstance(ListAccessibilityProvider),
				filter: this.filter,
			}) as WorkbenchCompressibleObjectTree<TreeElement, FuzzyScore>;

		this._register(this.tree);

		this._register(this.tree.onDidChangeSelection(evt => {
			const [first] = evt.elements;
			if (!first || !isTestItem(first) || !first.item.location) {
				return;
			}

			this._editorService.openEditor({
				resource: URI.revive(first.item.location.uri),
				options: { selection: first.item.location.range, preserveFocus: true }
			});
		}));


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
		return [this.toggleViewModeAction, ...super.getActions()];
	}

	/**
	 * @override
	 */
	protected layoutBody(height: number, width: number): void {
		super.layoutBody(height, width);
		this.tree.layout(height, width);
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
	private renderListChildren(node: ITestSubscriptionFolder) {
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

		this.tree.setChildren(node, leafNodes);
	}

	private createSubscription() {
		const updateParent = (node: TreeElement) => {
			if (!isTestItem(node)) {
				this.tree.setChildren(null, Iterable.map(this.testCollection.workspaceFolders(), renderElement));
			} else if (this.viewMode === ViewMode.Tree) {
				this.renderTreeChildren(node.parentItem);
			} else {
				this.renderListChildren(node.root);
			}
		};

		return this.testCollection.subscribeToWorkspaceTests({
			add: updateParent,
			remove: updateParent,
			update: node => this.tree.rerender(node)
		});
	}
}

const renderElement = (item: TreeElement): ICompressedTreeElement<TreeElement> => {
	return {
		element: item,
		children: Iterable.map(item.getChildren(), renderElement),
		incompressible: item.depth > 2, // compress workspace folders (0) and provider roots (1)
	};
};

const getLabel = (item: TreeElement) => isTestItem(item) ? item.item.label : item.folder.name;

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

type TreeElement = ITestSubscriptionFolder | ITestSubscriptionItem;

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
	actionBar: ActionBar;
}

class TestsRenderer implements ICompressibleTreeRenderer<TreeElement, FuzzyScore, TestTemplateData> {
	public static readonly ID = 'testExplorer';

	constructor(
		private labels: ResourceLabels,
		private readonly view: TestingExplorerView,
		@IInstantiationService private readonly instantiationService: IInstantiationService
	) { }

	get templateId(): string {
		return TestsRenderer.ID;
	}

	public renderTemplate(container: HTMLElement): TestTemplateData {
		const wrapper = dom.append(container, dom.$('.test-item'));

		const name = dom.append(wrapper, dom.$('.name'));
		const label = this.labels.create(name, { supportHighlights: true });

		const actionBar = new ActionBar(wrapper, {
			actionViewItemProvider: action =>
				action instanceof MenuItemAction
					? this.instantiationService.createInstance(MenuEntryActionViewItem, action)
					: undefined
		});

		return { label, actionBar };
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
