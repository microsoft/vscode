/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { ActionBar } from 'vs/base/browser/ui/actionbar/actionbar';
import { IIdentityProvider, IListVirtualDelegate } from 'vs/base/browser/ui/list/list';
import { IListAccessibilityProvider } from 'vs/base/browser/ui/list/listWidget';
import { ICompressedTreeNode } from 'vs/base/browser/ui/tree/compressedObjectTreeModel';
import { CompressibleObjectTree, ICompressibleKeyboardNavigationLabelProvider, ICompressibleTreeRenderer } from 'vs/base/browser/ui/tree/objectTree';
import { ITreeEvent, ITreeFilter, ITreeNode, ITreeSorter, TreeFilterResult, TreeVisibility } from 'vs/base/browser/ui/tree/tree';
import { throttle } from 'vs/base/common/decorators';
import { Event } from 'vs/base/common/event';
import { FuzzyScore } from 'vs/base/common/filters';
import { Iterable } from 'vs/base/common/iterator';
import { Disposable, DisposableStore, toDisposable } from 'vs/base/common/lifecycle';
import 'vs/css!./media/testing';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
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
import { IProgressService } from 'vs/platform/progress/common/progress';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IThemeService, ThemeIcon } from 'vs/platform/theme/common/themeService';
import { ExtHostTestingResource } from 'vs/workbench/api/common/extHost.protocol';
import { TestRunState } from 'vs/workbench/api/common/extHostTypes';
import { IResourceLabel, IResourceLabelOptions, IResourceLabelProps, ResourceLabels } from 'vs/workbench/browser/labels';
import { ViewPane } from 'vs/workbench/browser/parts/views/viewPane';
import { IViewletViewOptions } from 'vs/workbench/browser/parts/views/viewsViewlet';
import { IViewDescriptorService } from 'vs/workbench/common/views';
import { ITestTreeElement, ITestTreeProjection } from 'vs/workbench/contrib/testing/browser/explorerProjections';
import { HierarchicalByLocationProjection } from 'vs/workbench/contrib/testing/browser/explorerProjections/hierarchalByLocation';
import { HierarchicalByNameElement, HierarchicalByNameProjection, ListElementType } from 'vs/workbench/contrib/testing/browser/explorerProjections/hierarchalByName';
import { getComputedState } from 'vs/workbench/contrib/testing/browser/explorerProjections/hierarchalNodes';
import { StateByLocationProjection } from 'vs/workbench/contrib/testing/browser/explorerProjections/stateByLocation';
import { StateByNameProjection } from 'vs/workbench/contrib/testing/browser/explorerProjections/stateByName';
import { StateElement } from 'vs/workbench/contrib/testing/browser/explorerProjections/stateNodes';
import { testingStatesToIcons } from 'vs/workbench/contrib/testing/browser/icons';
import { cmpPriority } from 'vs/workbench/contrib/testing/browser/testExplorerTree';
import { ITestingCollectionService, TestSubscriptionListener } from 'vs/workbench/contrib/testing/browser/testingCollectionService';
import { TestExplorerViewGrouping, TestExplorerViewMode } from 'vs/workbench/contrib/testing/common/constants';
import { TestingContextKeys } from 'vs/workbench/contrib/testing/common/testingContextKeys';
import { ITestService } from 'vs/workbench/contrib/testing/common/testService';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { DebugAction, RunAction } from './testExplorerActions';

export class TestingExplorerView extends ViewPane {
	public viewModel!: TestingExplorerViewModel;
	private currentSubscription?: TestSubscriptionListener;
	private listContainer!: HTMLElement;
	private finishDiscovery?: () => void;

	constructor(
		options: IViewletViewOptions,
		@ITestingCollectionService private readonly testCollection: ITestingCollectionService,
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

		this.updateProgressIndicator();
		this._register(this.testService.onBusyStateChange(t => {
			if (t.resource === ExtHostTestingResource.Workspace && t.busy !== (!!this.finishDiscovery)) {
				this.updateProgressIndicator();
			}
		}));

		this.getProgressIndicator().show(true);

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

	private updateProgressIndicator() {
		const busy = Iterable.some(this.testService.busyTestLocations, s => s.resource === ExtHostTestingResource.Workspace);
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
		this.listContainer.style.height = `${height}px`;
		this.viewModel.layout(height, width);
	}

	private createSubscription() {
		return this.testCollection.subscribeToWorkspaceTests();
	}
}

export class TestingExplorerViewModel extends Disposable {
	public tree: CompressibleObjectTree<ITestTreeElement, FuzzyScore>;
	private filter: TestsFilter;
	public projection!: ITestTreeProjection;

	private readonly _viewMode = TestingContextKeys.viewMode.bindTo(this.contextKeyService);
	private readonly _viewGrouping = TestingContextKeys.viewGrouping.bindTo(this.contextKeyService);

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


	public get viewGrouping() {
		return this._viewGrouping.get() ?? TestExplorerViewGrouping.ByLocation;
	}

	public set viewGrouping(newGrouping: TestExplorerViewGrouping) {
		if (newGrouping === this._viewGrouping.get()) {
			return;
		}

		this._viewGrouping.set(newGrouping);
		this.updatePreferredProjection();
		this.storageService.store('testing.viewGrouping', newGrouping, StorageScope.WORKSPACE, StorageTarget.USER);
	}

	constructor(
		listContainer: HTMLElement,
		onDidChangeVisibility: Event<boolean>,
		private listener: TestSubscriptionListener | undefined,
		@IInstantiationService instantiationService: IInstantiationService,
		@IEditorService editorService: IEditorService,
		@ICodeEditorService codeEditorService: ICodeEditorService,
		@IStorageService private readonly storageService: IStorageService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
	) {
		super();

		this._viewMode.set(this.storageService.get('testing.viewMode', StorageScope.WORKSPACE, TestExplorerViewMode.Tree) as TestExplorerViewMode);
		this._viewGrouping.set(this.storageService.get('testing.viewGrouping', StorageScope.WORKSPACE, TestExplorerViewGrouping.ByLocation) as TestExplorerViewGrouping);

		const labels = this._register(instantiationService.createInstance(ResourceLabels, { onDidChangeVisibility: onDidChangeVisibility }));

		this.filter = new TestsFilter();
		this.tree = instantiationService.createInstance(
			WorkbenchCompressibleObjectTree,
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
			}) as WorkbenchCompressibleObjectTree<ITestTreeElement, FuzzyScore>;
		this._register(this.tree);

		this.updatePreferredProjection();

		this.onDidChangeSelection = this.tree.onDidChangeSelection;
		this._register(this.tree.onDidChangeSelection(evt => {
			const location = evt.elements[0]?.location;
			if (!location || !evt.browserEvent) {
				return;
			}

			editorService.openEditor({
				resource: location.uri,
				options: { selection: location.range, preserveFocus: true }
			});
		}));

		const tracker = this._register(new CodeEditorTracker(codeEditorService, this));
		this._register(onDidChangeVisibility(visible => {
			if (visible) {
				tracker.activate();
			} else {
				tracker.deactivate();
			}
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

	/**
	 * Reveals and moves focus to the item.
	 */
	public async revealItem(item: ITestTreeElement, reveal = true): Promise<void> {
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

	private updatePreferredProjection() {
		this.projection?.dispose();
		if (!this.listener) {
			this.tree.setChildren(null, []);
			return;
		}

		if (this._viewGrouping.get() === TestExplorerViewGrouping.ByLocation) {
			if (this._viewMode.get() === TestExplorerViewMode.List) {
				this.projection = new HierarchicalByNameProjection(this.listener);
			} else {
				this.projection = new HierarchicalByLocationProjection(this.listener);
			}
		} else {
			if (this._viewMode.get() === TestExplorerViewMode.List) {
				this.projection = new StateByNameProjection(this.listener);
			} else {
				this.projection = new StateByLocationProjection(this.listener);
			}
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

class CodeEditorTracker {
	private store = new DisposableStore();
	private lastRevealed?: ITestTreeElement;

	constructor(@ICodeEditorService private readonly codeEditorService: ICodeEditorService, private readonly model: TestingExplorerViewModel) {
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
			store.add(editor.onDidChangeCursorPosition(evt => {
				const uri = editor.getModel()?.uri;
				if (!uri) {
					return;
				}

				const test = this.model.projection.getTestAtPosition(uri, evt.position);
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


class TestsFilter implements ITreeFilter<ITestTreeElement, FuzzyScore> {
	private filterText: string | undefined;

	public setFilter(filterText: string) {
		this.filterText = filterText;
	}

	public filter(element: ITestTreeElement): TreeFilterResult<FuzzyScore> {
		if (element instanceof HierarchicalByNameElement && element.elementType !== ListElementType.TestLeaf && !element.isTestRoot) {
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
		if (a instanceof StateElement && b instanceof StateElement) {
			return cmpPriority(a.computedState, b.computedState);
		}

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

class TreeKeyboardNavigationLabelProvider implements ICompressibleKeyboardNavigationLabelProvider<ITestTreeElement> {
	getCompressedNodeKeyboardNavigationLabel(elements: ITestTreeElement[]) {
		return this.getKeyboardNavigationLabel(elements[elements.length - 1]);
	}

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

class TestsRenderer implements ICompressibleTreeRenderer<ITestTreeElement, FuzzyScore, TestTemplateData> {
	public static readonly ID = 'testExplorer';

	constructor(
		private labels: ResourceLabels,
		@IInstantiationService private readonly instantiationService: IInstantiationService
	) { }

	renderCompressedElements(node: ITreeNode<ICompressedTreeNode<ITestTreeElement>, FuzzyScore>, index: number, templateData: TestTemplateData): void {
		const element = node.element.elements[node.element.elements.length - 1];
		this.renderElementDirect(element, templateData);
	}

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
		this.renderElementDirect(node.element, data);
	}

	private renderElementDirect(element: ITestTreeElement, data: TestTemplateData) {
		const label: IResourceLabelProps = { name: element.label };
		const options: IResourceLabelOptions = {};
		data.actionBar.clear();

		const state = getComputedState(element);
		const icon = testingStatesToIcons.get(state);
		data.icon.className = 'computed-state ' + (icon ? ThemeIcon.asClassName(icon) : '');
		if (state === TestRunState.Running) {
			data.icon.className += ' codicon-modifier-spin';
		}

		const test = element.test;
		if (test) {
			if (test.item.location) {
				label.resource = test.item.location.uri;
			}

			options.title = 'hover title';
			options.fileKind = FileKind.FILE;

			label.description = element.description;
		} else {
			options.fileKind = FileKind.ROOT_FOLDER;
		}

		const running = state === TestRunState.Running;
		if (!Iterable.isEmpty(element.runnable)) {
			data.actionBar.push(
				this.instantiationService.createInstance(RunAction, element.runnable, running),
				{ icon: true, label: false },
			);
		}

		if (!Iterable.isEmpty(element.debuggable)) {
			data.actionBar.push(
				this.instantiationService.createInstance(DebugAction, element.debuggable, running),
				{ icon: true, label: false },
			);
		}

		data.label.setResource(label, options);
	}

	disposeTemplate(templateData: TestTemplateData): void {
		templateData.label.dispose();
		templateData.actionBar.dispose();
	}
}
