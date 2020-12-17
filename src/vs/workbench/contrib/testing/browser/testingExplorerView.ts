/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { ActionBar } from 'vs/base/browser/ui/actionbar/actionbar';
import { IIdentityProvider, IKeyboardNavigationLabelProvider, IListVirtualDelegate } from 'vs/base/browser/ui/list/list';
import { IListAccessibilityProvider } from 'vs/base/browser/ui/list/listWidget';
import { ObjectTree } from 'vs/base/browser/ui/tree/objectTree';
import { ITreeElement, ITreeEvent, ITreeFilter, ITreeNode, ITreeRenderer, ITreeSorter, TreeFilterResult, TreeVisibility } from 'vs/base/browser/ui/tree/tree';
import { Action } from 'vs/base/common/actions';
import { throttle } from 'vs/base/common/decorators';
import { Emitter, Event } from 'vs/base/common/event';
import { FuzzyScore } from 'vs/base/common/filters';
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
import { ITextEditorSelection } from 'vs/platform/editor/common/editor';
import { FileKind } from 'vs/platform/files/common/files';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { WorkbenchObjectTree } from 'vs/platform/list/browser/listService';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IThemeService, ThemeIcon } from 'vs/platform/theme/common/themeService';
import { IWorkspaceFolder, IWorkspaceFoldersChangeEvent } from 'vs/platform/workspace/common/workspace';
import { TestRunState } from 'vs/workbench/api/common/extHostTypes';
import { IResourceLabel, IResourceLabelOptions, IResourceLabelProps, ResourceLabels } from 'vs/workbench/browser/labels';
import { ViewPane } from 'vs/workbench/browser/parts/views/viewPane';
import { IViewletViewOptions } from 'vs/workbench/browser/parts/views/viewsViewlet';
import { IViewDescriptorService } from 'vs/workbench/common/views';
import { testingStatesToIcons } from 'vs/workbench/contrib/testing/browser/icons';
import { maxPriority, statePriority } from 'vs/workbench/contrib/testing/browser/testExplorerTree';
import { ITestingCollectionService, TestSubscriptionListener } from 'vs/workbench/contrib/testing/browser/testingCollectionService';
import { InternalTestItem, TestDiffOpType, TestsDiff } from 'vs/workbench/contrib/testing/common/testCollection';
import { ITestService } from 'vs/workbench/contrib/testing/common/testService';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { CancelTestRunAction, DebugAction, DebugSelectedAction, FilterableAction, filterVisibleActions, RunAction, RunSelectedAction, ToggleViewModeAction, ViewMode } from './testExplorerActions';

export const TESTING_EXPLORER_VIEW_ID = 'workbench.view.testing';

export class TestingExplorerView extends ViewPane {
	private primaryActions: Action[] = [];
	private secondaryActions: Action[] = [];
	private viewModel!: TestingExplorerViewModel;
	private currentSubscription?: TestSubscriptionListener;
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
		this.viewModel = this.instantiationService.createInstance(TestingExplorerViewModel, this.listContainer, this.onDidChangeBodyVisibility, this.currentSubscription);
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
				this.viewModel.replaceSubscription(undefined);
			} else if (visible && !this.currentSubscription) {
				this.currentSubscription = this.createSubscription();
				this.viewModel.replaceSubscription(this.currentSubscription);
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
		return this.testCollection.subscribeToWorkspaceTests();
	}
}

export class TestingExplorerViewModel extends Disposable {
	private tree: ObjectTree<ITestTreeElement, FuzzyScore>;
	private filter: TestsFilter;
	private projection!: ITestTreeProjection;
	private _viewMode = Number(this.storageService.get('testing.viewMode', StorageScope.WORKSPACE, String(ViewMode.Tree))) as ViewMode;
	private viewModeChangeEmitter = new Emitter<ViewMode>();

	/**
	 * Fires when the tree view mode changes.
	 */
	public readonly onViewModeChange = this.viewModeChangeEmitter.event;

	/**
	 * Fires when the selected tests change.
	 */
	public readonly onDidChangeSelection: Event<ITreeEvent<ITestTreeElement | null>>;

	public get viewMode() {
		return this._viewMode;
	}

	public set viewMode(newMode: ViewMode) {
		if (newMode === this._viewMode) {
			return;
		}

		this._viewMode = newMode;
		this.updatePreferredProjection();
		this.storageService.store('testing.viewMode', newMode, StorageScope.WORKSPACE, StorageTarget.USER);
		this.viewModeChangeEmitter.fire(newMode);
	}

	constructor(
		listContainer: HTMLElement,
		onDidChangeVisibility: Event<boolean>,
		private listener: TestSubscriptionListener | undefined,
		@IInstantiationService instantiationService: IInstantiationService,
		@IEditorService editorService: IEditorService,
		@IStorageService private readonly storageService: IStorageService,
	) {
		super();
		const labels = this._register(instantiationService.createInstance(ResourceLabels, { onDidChangeVisibility: onDidChangeVisibility }));

		this.filter = new TestsFilter();
		this.tree = instantiationService.createInstance(
			WorkbenchObjectTree,
			'Test Explorer List',
			listContainer,
			new ListDelegate(),
			[
				instantiationService.createInstance(TestsRenderer, labels)
			],
			{
				identityProvider: instantiationService.createInstance(IdentityProvider),
				hideTwistiesOfChildlessElements: true,
				sorter: instantiationService.createInstance(TreeSorter),
				keyboardNavigationLabelProvider: instantiationService.createInstance(TreeKeyboardNavigationLabelProvider),
				accessibilityProvider: instantiationService.createInstance(ListAccessibilityProvider),
				filter: this.filter,
			}) as ObjectTree<ITestTreeElement, FuzzyScore>;
		this._register(this.tree);

		this.updatePreferredProjection();

		this.onDidChangeSelection = this.tree.onDidChangeSelection;
		this._register(this.tree.onDidChangeSelection(evt => {
			const location = evt.elements[0]?.location;
			if (!location) {
				return;
			}

			editorService.openEditor({
				resource: URI.revive(location.uri),
				options: { selection: location.range, preserveFocus: true }
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
	 * Replaces the test listener and recalculates the tree.
	 */
	public replaceSubscription(listener: TestSubscriptionListener | undefined) {
		this.listener = listener;
		this.updatePreferredProjection();
	}

	private updatePreferredProjection() {
		this.projection?.dispose();
		if (!this.listener) {
			this.tree.setChildren(null, []);
			return;
		}

		if (this._viewMode === ViewMode.List) {
			this.projection = new ListProjection(this.listener);
		} else {
			this.projection = new HierarchalProjection(this.listener);
		}

		this.projection.onUpdate(this.deferUpdate, this);
		this.projection.applyTo(this.tree);
	}

	@throttle(200)
	private deferUpdate() {
		this.projection.applyTo(this.tree);
	}

	/**
	 * Gets the selected tests from the tree.
	 */
	public getSelectedTests() {
		return this.tree.getSelection();
	}
}

/**
 * Gets the computed state for the node.
 */
const getComputedState = (node: ITestTreeElement) => {
	if (node.computedState === undefined) {
		node.computedState = node.state ?? TestRunState.Unset;
		for (const child of node.getChildren()) {
			node.computedState = maxPriority(node.computedState, getComputedState(child));
		}
	}

	return node.computedState;
};

/**
 * Refreshes the computed state for the node and its parents. Any changes
 * elements will be added to the `changedNodes` set.
 */
const refreshComputedState = (node: ITestTreeElement, addUpdated: (n: ITestTreeElement) => void) => {
	if (node.computedState === undefined) {
		return;
	}

	const oldPriority = statePriority[node.computedState];
	node.computedState = undefined;
	const newState = getComputedState(node);
	const newPriority = statePriority[getComputedState(node)];
	if (newPriority === oldPriority) {
		return;
	}

	addUpdated(node);
	if (newPriority > oldPriority) {
		// Update all parents to ensure they're at least this priority.
		for (let parent = node.parentItem; parent; parent = parent.parentItem) {
			const prev = parent.computedState;
			if (prev !== undefined && statePriority[prev] >= newPriority) {
				break;
			}

			parent.computedState = newState;
			addUpdated(parent);
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
			addUpdated(parent);
		}
	}
};

class TestsFilter implements ITreeFilter<ITestTreeElement, FuzzyScore> {
	private filterText: string | undefined;

	public setFilter(filterText: string) {
		this.filterText = filterText;
	}

	public filter(element: ITestTreeElement): TreeFilterResult<FuzzyScore> {
		if (element instanceof ListElement && element.elementType !== ListElementType.TestLeaf && !element.isTestRoot) {
			return TreeVisibility.Hidden;
		}

		if (!this.filterText) {
			return TreeVisibility.Visible;
		}

		if (element.label.includes(this.filterText)) {
			return TreeVisibility.Visible;
		}

		return TreeVisibility.Recurse;
	}
}
class TreeSorter implements ITreeSorter<ITestTreeElement> {
	public compare(a: ITestTreeElement, b: ITestTreeElement): number {
		return a.label.localeCompare(b.label);
	}
}

class ListAccessibilityProvider implements IListAccessibilityProvider<ITestTreeElement> {
	getWidgetAriaLabel(): string {
		return localize('testExplorer', "Test Explorer");
	}

	getAriaLabel(element: ITestTreeElement): string {
		return element.label;
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
	actionBar: ActionBar;
}

class TestsRenderer implements ITreeRenderer<ITestTreeElement, FuzzyScore, TestTemplateData> {
	public static readonly ID = 'testExplorer';

	constructor(
		private labels: ResourceLabels,
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

	public renderElement(node: ITreeNode<ITestTreeElement, FuzzyScore>, index: number, data: TestTemplateData): void {
		const element = node.element;
		const label: IResourceLabelProps = { name: element.label };
		const options: IResourceLabelOptions = {};
		data.actionBar.clear();

		const icon = testingStatesToIcons.get(getComputedState(element));
		data.icon.className = 'computed-state ' + (icon ? ThemeIcon.asClassName(icon) : '');

		const test = element.test;
		if (test) {
			if (test.item.location) {
				label.resource = URI.revive(test.item.location.uri);
			}

			options.title = 'hover title';
			options.fileKind = FileKind.FILE;

			if (test.item.runnable) {
				data.actionBar.push(this.instantiationService.createInstance(RunAction, test), { icon: true, label: false });
			}

			if (test.item.debuggable) {
				data.actionBar.push(this.instantiationService.createInstance(DebugAction, test), { icon: true, label: false });
			}

			label.description = element.description;
		} else {
			options.fileKind = FileKind.ROOT_FOLDER;
		}

		data.label.setResource(label, options);
	}

	disposeTemplate(templateData: TestTemplateData): void {
		templateData.label.dispose();
		templateData.actionBar.dispose();
	}
}


export interface ITestTreeProjection extends IDisposable {
	/**
	 * Event that fires when the projection changes.
	 */
	onUpdate: Event<void>;

	/**
	 * Applies pending update to the tree.
	 */
	applyTo(tree: ObjectTree<ITestTreeElement, FuzzyScore>): void;
}

export interface ITestTreeElement {
	/**
	 * Computed element state. Will be set automatically if not initially provided.
	 * The projection is responsible for clearing (or updating) this if it
	 * becomes invalid.
	 */
	computedState: TestRunState | undefined;

	/**
	 * Unique ID of the element in the tree.
	 */
	readonly treeId: string;

	/**
	 * Location of the test, if any.
	 */
	readonly location?: { uri: URI; range: ITextEditorSelection };

	/**
	 * Test item, if any.
	 */
	readonly test?: Readonly<InternalTestItem>;

	/**
	 * Tree description.
	 */
	readonly description?: string;

	/**
	 * State of of the tree item. Mostly used for deriving the computed state.
	 */
	readonly state?: TestRunState;
	readonly label: string;
	readonly parentItem: ITestTreeElement | null;
	getChildren(): Iterable<ITestTreeElement>;
}

class HierarchalElement implements ITestTreeElement {
	public readonly children = new Set<HierarchalElement>();
	public computedState: TestRunState | undefined;

	public get treeId() {
		return `test:${this.test.id}`;
	}

	public get label() {
		return this.test.item.label;
	}

	public get state() {
		return this.test.item.state.runState;
	}

	public get location() {
		const location = this.test.item.location;
		if (!location) {
			return;
		}

		return {
			uri: URI.revive(location.uri),
			range: location.range,
		};
	}

	constructor(public readonly test: InternalTestItem, public readonly parentItem: HierarchalFolder | HierarchalElement) {
		this.test = { ...test, item: { ...test.item } }; // clone since we Object.assign updatese
	}

	public getChildren() {
		return this.children;
	}

	public update(actual: InternalTestItem, addUpdated: (n: ITestTreeElement) => void) {
		const stateChange = actual.item.state.runState !== this.state;
		Object.assign(this.test, actual);
		if (stateChange) {
			refreshComputedState(this, addUpdated);
		}
	}
}

class HierarchalFolder implements ITestTreeElement {
	public readonly children = new Set<HierarchalElement>();
	public readonly parentItem = null;
	public computedState: TestRunState | undefined;

	public get treeId() {
		return `folder:${this.folder.index}`;
	}

	constructor(private readonly folder: IWorkspaceFolder) { }

	public get label() {
		return this.folder.name;
	}

	public getChildren() {
		return this.children;
	}
}

const enum ListElementType {
	TestLeaf,
	BranchWithLeaf,
	BranchWithoutLeaf,
	Unset,
}

class ListElement extends HierarchalElement {
	public elementType: ListElementType = ListElementType.Unset;
	public readonly isTestRoot = !this.actualParent;
	private readonly actualChildren = new Set<ListElement>();

	public get description() {
		let description: string | undefined;
		for (let parent = this.actualParent; parent && !parent.isTestRoot; parent = parent.actualParent) {
			description = description ? `${parent.label} › ${description}` : parent.label;
		}

		return description;
	}

	/**
	 * @param actualParent Parent of the item in the test heirarchy
	 */
	constructor(
		internal: InternalTestItem,
		parentItem: HierarchalFolder | HierarchalElement,
		private readonly addUpdated: (n: ITestTreeElement) => void,
		private readonly actualParent?: ListElement,
	) {
		super(internal, parentItem);
		actualParent?.addChild(this);
		this.updateLeafTestState();
	}

	/**
	 * @override
	 */
	public update(actual: InternalTestItem, addUpdated: (n: ITestTreeElement) => void) {
		const wasRunnable = this.test.item.runnable;
		super.update(actual, addUpdated);

		if (this.test.item.runnable !== wasRunnable) {
			this.updateLeafTestState();
		}
	}

	/**
	 * Should be called when the list element is removed.
	 */
	public remove() {
		this.actualParent?.removeChild(this);
	}

	private removeChild(element: ListElement) {
		this.actualChildren.delete(element);
		this.updateLeafTestState();
	}

	private addChild(element: ListElement) {
		this.actualChildren.add(element);
		this.updateLeafTestState();
	}

	/**
	 * Updates the test leaf state for this node. Should be called when a child
	 * or this node is modified. Note that we never need to look at the children
	 * here, the children will already be leaves, or not.
	 */
	private updateLeafTestState() {
		const newType = Iterable.some(this.actualChildren, c => c.elementType !== ListElementType.BranchWithoutLeaf)
			? ListElementType.BranchWithLeaf
			: this.test.item.runnable
				? ListElementType.TestLeaf
				: ListElementType.BranchWithoutLeaf;

		if (newType !== this.elementType) {
			this.elementType = newType;
			this.addUpdated(this);
		}

		this.actualParent?.updateLeafTestState();
	}
}

/**
 * Projection that lists tests in their traditional tree view.
 */
class HierarchalProjection extends Disposable implements ITestTreeProjection {
	private readonly updateEmitter = new Emitter<void>();
	private lastHadMultipleFolders = true;
	private newlyRenderedNodes = new Set<HierarchalElement | HierarchalFolder>();
	private updatedNodes = new Set<HierarchalElement | HierarchalFolder>();
	private removedNodes = new Set<HierarchalElement | HierarchalFolder>();

	/**
	 * Map of item IDs to test item objects.
	 */
	protected readonly items = new Map<string, HierarchalElement>();

	/**
	 * Root folders
	 */
	protected readonly folders = new Map<string, HierarchalFolder>();

	/**
	 * @inheritdoc
	 */
	public readonly onUpdate = this.updateEmitter.event;

	constructor(listener: TestSubscriptionListener) {
		super();
		this._register(listener.onDiff(([folder, diff]) => this.applyDiff(folder, diff)));
		this._register(listener.onFolderChange(this.applyFolderChange, this));

		for (const [folder, collection] of listener.workspaceFolderCollections) {
			const queue = [collection.rootNodes];
			while (queue.length) {
				for (const id of queue.pop()!) {
					const node = collection.getNodeById(id)!;
					const item = this.createItem(node, folder.folder);
					item.parentItem.children.add(item);
					this.items.set(item.test.id, item);
					queue.push(node.children);
				}
			}
		}

		for (const folder of this.folders.values()) {
			this.newlyRenderedNodes.add(folder);
		}
	}

	private applyFolderChange(evt: IWorkspaceFoldersChangeEvent) {
		for (const folder of evt.removed) {
			const existing = this.folders.get(folder.uri.toString());
			if (existing) {
				this.folders.delete(folder.uri.toString());
				this.removedNodes.add(existing);
			}
			this.updateEmitter.fire();
		}
	}

	/**
	 * Applies the diff to the collection.
	 */
	private applyDiff(folder: IWorkspaceFolder, diff: TestsDiff) {
		for (const op of diff) {
			switch (op[0]) {
				case TestDiffOpType.Add: {
					const item = this.createItem(op[1], folder);
					item.parentItem.children.add(item);
					this.items.set(item.test.id, item);
					this.newlyRenderedNodes.add(item);
					break;
				}

				case TestDiffOpType.Update: {
					const item = op[1];
					const existing = this.items.get(item.id);
					if (existing) {
						existing.update(item, this.addUpdated);
						this.addUpdated(existing);
					}
					break;
				}

				case TestDiffOpType.Remove: {
					const toRemove = this.items.get(op[1]);
					if (!toRemove) {
						break;
					}

					this.deleteItem(toRemove);
					toRemove.parentItem.children.delete(toRemove);
					this.removedNodes.add(toRemove);

					const queue: Iterable<HierarchalElement>[] = [[toRemove]];
					while (queue.length) {
						for (const item of queue.pop()!) {
							this.items.delete(item.test.id);
							this.newlyRenderedNodes.delete(item);
						}
					}
				}
			}
		}

		for (const [key, folder] of this.folders) {
			if (folder.children.size === 0) {
				this.removedNodes.add(folder);
				this.folders.delete(key);
			}
		}

		if (diff.length !== 0) {
			this.updateEmitter.fire();
		}
	}

	/**
	 * @inheritdoc
	 */
	public applyTo(tree: ObjectTree<ITestTreeElement, FuzzyScore>) {
		const firstFolder = Iterable.first(this.folders.values());

		if (!this.lastHadMultipleFolders && this.folders.size !== 1) {
			tree.setChildren(null, Iterable.map(this.folders.values(), this.renderNode));
			this.lastHadMultipleFolders = true;
		} else if (this.lastHadMultipleFolders && this.folders.size === 1) {
			tree.setChildren(null, Iterable.map(firstFolder!.children, this.renderNode));
			this.lastHadMultipleFolders = false;
		} else {
			const alreadyUpdatedChildren = new Set<HierarchalElement | HierarchalFolder | null>();
			for (const nodeList of [this.newlyRenderedNodes, this.removedNodes]) {
				for (let { parentItem, children } of nodeList) {
					if (!alreadyUpdatedChildren.has(parentItem)) {
						if (!this.lastHadMultipleFolders && parentItem === firstFolder) {
							tree.setChildren(null, Iterable.map(firstFolder.children, this.renderNode));
						} else {
							const pchildren: Iterable<HierarchalElement | HierarchalFolder> = parentItem?.children ?? this.folders.values();
							tree.setChildren(parentItem, Iterable.map(pchildren, this.renderNode));
						}

						alreadyUpdatedChildren.add(parentItem);
					}

					for (const child of children) {
						alreadyUpdatedChildren.add(child);
					}
				}
			}

			if (!this.lastHadMultipleFolders) {
				this.updatedNodes.delete(firstFolder!);
			}

			for (const node of this.updatedNodes) {
				tree.rerender(node);
			}
		}

		this.newlyRenderedNodes.clear();
		this.removedNodes.clear();
		this.updatedNodes.clear();
	}

	protected createItem(item: InternalTestItem, folder: IWorkspaceFolder): HierarchalElement {
		const parent = item.parent ? this.items.get(item.parent)! : this.getOrCreateFolderElement(folder);
		return new HierarchalElement(item, parent);
	}

	protected deleteItem(item: HierarchalElement) {
		// no-op
	}

	protected getOrCreateFolderElement(folder: IWorkspaceFolder) {
		let f = this.folders.get(folder.uri.toString());
		if (!f) {
			f = new HierarchalFolder(folder);
			this.newlyRenderedNodes.add(f);
			this.folders.set(folder.uri.toString(), f);
		}

		return f;
	}

	protected readonly addUpdated = (item: ITestTreeElement) => {
		const cast = item as HierarchalElement | HierarchalFolder;
		if (!this.newlyRenderedNodes.has(cast)) {
			this.updatedNodes.add(cast);
		}
	};

	private readonly renderNode = (node: HierarchalElement | HierarchalFolder): ITreeElement<ITestTreeElement> => {
		return {
			element: node,
			children: Iterable.map(node.children, this.renderNode),
		};
	};
}

/**
 * Projection that shows tests in a flat list (grouped by provider). The only
 * change is that, while creating the item, the item parent is set to the
 * test root rather than the heirarchal parent.
 */
class ListProjection extends HierarchalProjection {
	/**
	 * @override
	 */
	protected createItem(item: InternalTestItem, folder: IWorkspaceFolder): HierarchalElement {
		const parent = this.getOrCreateFolderElement(folder);
		const actualParent = item.parent ? this.items.get(item.parent) as ListElement : undefined;
		for (const testRoot of parent.children) {
			if (testRoot.test.providerId === item.providerId) {
				return new ListElement(item, testRoot, this.addUpdated, actualParent);
			}
		}

		return new ListElement(item, parent, this.addUpdated);
	}

	/**
	 * @override
	 */
	protected deleteItem(item: HierarchalElement) {
		(item as ListElement).remove();
	}
}
