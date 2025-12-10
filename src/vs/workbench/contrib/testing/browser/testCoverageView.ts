/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { ActionBar } from '../../../../base/browser/ui/actionbar/actionbar.js';
import { IIdentityProvider, IListVirtualDelegate } from '../../../../base/browser/ui/list/list.js';
import { ICompressedTreeElement, ICompressedTreeNode } from '../../../../base/browser/ui/tree/compressedObjectTreeModel.js';
import { ICompressibleTreeRenderer } from '../../../../base/browser/ui/tree/objectTree.js';
import { ITreeNode, ITreeSorter } from '../../../../base/browser/ui/tree/tree.js';
import { findLast } from '../../../../base/common/arraysFind.js';
import { assertNever } from '../../../../base/common/assert.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { memoize } from '../../../../base/common/decorators.js';
import { FuzzyScore, createMatches } from '../../../../base/common/filters.js';
import { Iterable } from '../../../../base/common/iterator.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { IObservable, autorun, observableValue } from '../../../../base/common/observable.js';
import { IPrefixTreeNode } from '../../../../base/common/prefixTree.js';
import { basenameOrAuthority } from '../../../../base/common/resources.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { URI } from '../../../../base/common/uri.js';
import { Position } from '../../../../editor/common/core/position.js';
import { Range } from '../../../../editor/common/core/range.js';
import { localize, localize2 } from '../../../../nls.js';
import { Categories } from '../../../../platform/action/common/actionCommonCategories.js';
import { getActionBarActions } from '../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { Action2, IMenuService, MenuId, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { EditorOpenSource, TextEditorSelectionRevealType } from '../../../../platform/editor/common/editor.js';
import { FileKind } from '../../../../platform/files/common/files.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { WorkbenchCompressibleObjectTree } from '../../../../platform/list/browser/listService.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IQuickInputService, IQuickPickItem, QuickPickInput } from '../../../../platform/quickinput/common/quickInput.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { IResourceLabel, ResourceLabels } from '../../../browser/labels.js';
import { IViewPaneOptions, ViewAction, ViewPane } from '../../../browser/parts/views/viewPane.js';
import { IViewDescriptorService } from '../../../common/views.js';
import { ACTIVE_GROUP, IEditorService, SIDE_GROUP } from '../../../services/editor/common/editorService.js';
import { TestCommandId, Testing } from '../common/constants.js';
import { onObservableChange } from '../common/observableUtils.js';
import { BypassedFileCoverage, ComputedFileCoverage, FileCoverage, TestCoverage, getTotalCoveragePercent } from '../common/testCoverage.js';
import { ITestCoverageService } from '../common/testCoverageService.js';
import { TestId } from '../common/testId.js';
import { TestingContextKeys } from '../common/testingContextKeys.js';
import { CoverageDetails, DetailType, ICoverageCount, IDeclarationCoverage, ITestItem, TestResultState } from '../common/testTypes.js';
import * as coverUtils from './codeCoverageDisplayUtils.js';
import { testingStatesToIcons, testingWasCovered } from './icons.js';
import { CoverageBarSource, ManagedTestCoverageBars } from './testCoverageBars.js';

const enum CoverageSortOrder {
	Coverage,
	Location,
	Name,
}

export class TestCoverageView extends ViewPane {
	private readonly tree = new MutableDisposable<TestCoverageTree>();
	public readonly sortOrder = observableValue('sortOrder', CoverageSortOrder.Location);

	constructor(
		options: IViewPaneOptions,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IOpenerService openerService: IOpenerService,
		@IThemeService themeService: IThemeService,
		@IHoverService hoverService: IHoverService,
		@ITestCoverageService private readonly coverageService: ITestCoverageService,
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);
	}

	protected override renderBody(container: HTMLElement): void {
		super.renderBody(container);

		const labels = this._register(this.instantiationService.createInstance(ResourceLabels, { onDidChangeVisibility: this.onDidChangeBodyVisibility }));

		this._register(autorun(reader => {
			const coverage = this.coverageService.selected.read(reader);
			if (coverage) {
				const t = (this.tree.value ??= this.instantiationService.createInstance(TestCoverageTree, container, labels, this.sortOrder));
				t.setInput(coverage, this.coverageService.filterToTest.read(reader));
			} else {
				this.tree.clear();
			}
		}));
	}

	protected override layoutBody(height: number, width: number): void {
		super.layoutBody(height, width);
		this.tree.value?.layout(height, width);
	}

	public collapseAll(): void {
		this.tree.value?.collapseAll();
	}
}

let fnNodeId = 0;

class DeclarationCoverageNode {
	public readonly id = String(fnNodeId++);
	public readonly containedDetails = new Set<CoverageDetails>();
	public readonly children: DeclarationCoverageNode[] = [];

	public get hits() {
		return this.data.count;
	}

	public get label() {
		return this.data.name;
	}

	public get location() {
		return this.data.location;
	}

	public get tpc() {
		const attr = this.attributableCoverage();
		return attr && getTotalCoveragePercent(attr.statement, attr.branch, undefined);
	}

	constructor(
		public readonly uri: URI,
		private readonly data: IDeclarationCoverage,
		details: readonly CoverageDetails[],
	) {
		if (data.location instanceof Range) {
			for (const detail of details) {
				if (this.contains(detail.location)) {
					this.containedDetails.add(detail);
				}
			}
		}
	}

	/** Gets whether this function has a defined range and contains the given range. */
	public contains(location: Range | Position) {
		const own = this.data.location;
		return own instanceof Range && (location instanceof Range ? own.containsRange(location) : own.containsPosition(location));
	}

	/**
	 * If the function defines a range, we can look at statements within the
	 * function to get total coverage for the function, rather than a boolean
	 * yes/no.
	 */
	@memoize
	public attributableCoverage() {
		const { location, count } = this.data;
		if (!(location instanceof Range) || !count) {
			return;
		}

		const statement: ICoverageCount = { covered: 0, total: 0 };
		const branch: ICoverageCount = { covered: 0, total: 0 };
		for (const detail of this.containedDetails) {
			if (detail.type !== DetailType.Statement) {
				continue;
			}

			statement.covered += detail.count ? 1 : 0;
			statement.total++;
			if (detail.branches) {
				for (const { count } of detail.branches) {
					branch.covered += count ? 1 : 0;
					branch.total++;
				}
			}
		}

		return { statement, branch } satisfies CoverageBarSource;
	}
}

class RevealUncoveredDeclarations {
	public readonly id = String(fnNodeId++);

	public get label() {
		return localize('functionsWithoutCoverage', "{0} declarations without coverage...", this.n);
	}

	constructor(public readonly n: number) { }
}

class CurrentlyFilteredTo {
	public readonly id = String(fnNodeId++);

	public get label() {
		return localize('filteredToTest', "Showing coverage for \"{0}\"", this.testItem.label);
	}

	constructor(public readonly testItem: ITestItem) { }
}

class LoadingDetails {
	public readonly id = String(fnNodeId++);
	public readonly label = localize('loadingCoverageDetails', "Loading Coverage Details...");
}

/** Type of nodes returned from {@link TestCoverage}. Note: value is *always* defined. */
type TestCoverageFileNode = IPrefixTreeNode<ComputedFileCoverage | FileCoverage>;
type CoverageTreeElement = TestCoverageFileNode | DeclarationCoverageNode | LoadingDetails | RevealUncoveredDeclarations | CurrentlyFilteredTo;

const isFileCoverage = (c: CoverageTreeElement): c is TestCoverageFileNode => typeof c === 'object' && 'value' in c;
const isDeclarationCoverage = (c: CoverageTreeElement): c is DeclarationCoverageNode => c instanceof DeclarationCoverageNode;
const shouldShowDeclDetailsOnExpand = (c: CoverageTreeElement): c is IPrefixTreeNode<FileCoverage> =>
	isFileCoverage(c) && c.value instanceof FileCoverage && !!c.value.declaration?.total;

class TestCoverageTree extends Disposable {
	private readonly tree: WorkbenchCompressibleObjectTree<CoverageTreeElement, void>;
	private readonly inputDisposables = this._register(new DisposableStore());

	constructor(
		container: HTMLElement,
		labels: ResourceLabels,
		sortOrder: IObservable<CoverageSortOrder>,
		@IInstantiationService instantiationService: IInstantiationService,
		@IEditorService editorService: IEditorService,
		@ICommandService commandService: ICommandService,
	) {
		super();

		container.classList.add('testing-stdtree');

		this.tree = instantiationService.createInstance(
			WorkbenchCompressibleObjectTree<CoverageTreeElement, void>,
			'TestCoverageView',
			container,
			new TestCoverageTreeListDelegate(),
			[
				instantiationService.createInstance(FileCoverageRenderer, labels),
				instantiationService.createInstance(DeclarationCoverageRenderer),
				instantiationService.createInstance(BasicRenderer),
				instantiationService.createInstance(CurrentlyFilteredToRenderer),
			],
			{
				expandOnlyOnTwistieClick: true,
				sorter: new Sorter(sortOrder),
				keyboardNavigationLabelProvider: {
					getCompressedNodeKeyboardNavigationLabel(elements: CoverageTreeElement[]) {
						return elements.map(e => this.getKeyboardNavigationLabel(e)).join('/');
					},
					getKeyboardNavigationLabel(e: CoverageTreeElement) {
						return isFileCoverage(e)
							? basenameOrAuthority(e.value!.uri)
							: e.label;
					},
				},
				accessibilityProvider: {
					getAriaLabel(element: CoverageTreeElement) {
						if (isFileCoverage(element)) {
							const name = basenameOrAuthority(element.value!.uri);
							return localize('testCoverageItemLabel', "{0} coverage: {0}%", name, (element.value!.tpc * 100).toFixed(2));
						} else {
							return element.label;
						}
					},
					getWidgetAriaLabel() {
						return localize('testCoverageTreeLabel', "Test Coverage Explorer");
					}
				},
				identityProvider: new TestCoverageIdentityProvider(),
			}
		);

		this._register(autorun(reader => {
			sortOrder.read(reader);
			this.tree.resort(null, true);
		}));

		this._register(this.tree);
		this._register(this.tree.onDidChangeCollapseState(e => {
			const el = e.node.element;
			if (!e.node.collapsed && !e.node.children.length && el && shouldShowDeclDetailsOnExpand(el)) {
				if (el.value!.hasSynchronousDetails) {
					this.tree.setChildren(el, [{ element: new LoadingDetails(), incompressible: true }]);
				}

				el.value!.details().then(details => this.updateWithDetails(el, details));
			}
		}));
		this._register(this.tree.onDidOpen(e => {
			let resource: URI | undefined;
			let selection: Range | Position | undefined;
			if (e.element) {
				if (isFileCoverage(e.element) && !e.element.children?.size) {
					resource = e.element.value!.uri;
				} else if (isDeclarationCoverage(e.element)) {
					resource = e.element.uri;
					selection = e.element.location;
				} else if (e.element instanceof CurrentlyFilteredTo) {
					commandService.executeCommand(TestCommandId.CoverageFilterToTest);
					return;
				}
			}
			if (!resource) {
				return;
			}

			editorService.openEditor({
				resource,
				options: {
					selection: selection instanceof Position ? Range.fromPositions(selection, selection) : selection,
					revealIfOpened: true,
					selectionRevealType: TextEditorSelectionRevealType.NearTopIfOutsideViewport,
					preserveFocus: e.editorOptions.preserveFocus,
					pinned: e.editorOptions.pinned,
					source: EditorOpenSource.USER,
				},
			}, e.sideBySide ? SIDE_GROUP : ACTIVE_GROUP);
		}));
	}

	public setInput(coverage: TestCoverage, showOnlyTest?: TestId) {
		this.inputDisposables.clear();

		let tree = coverage.tree;

		// Filter to only a test, generate a new tree with only those items selected
		if (showOnlyTest) {
			tree = coverage.filterTreeForTest(showOnlyTest);
		}

		const files: TestCoverageFileNode[] = [];
		for (let node of tree.nodes) {
			// when showing initial children, only show from the first file or tee
			while (!(node.value instanceof FileCoverage) && node.children?.size === 1) {
				node = Iterable.first(node.children.values())!;
			}
			files.push(node);
		}

		const toChild = (value: TestCoverageFileNode): ICompressedTreeElement<CoverageTreeElement> => {
			const isFile = !value.children?.size;
			return {
				element: value,
				incompressible: isFile,
				collapsed: isFile,
				// directories can be expanded, and items with function info can be expanded
				collapsible: !isFile || !!value.value?.declaration?.total,
				children: value.children && Iterable.map(value.children?.values(), toChild)
			};
		};

		this.inputDisposables.add(onObservableChange(coverage.didAddCoverage, nodes => {
			const toRender = findLast(nodes, n => this.tree.hasElement(n));
			if (toRender) {
				this.tree.setChildren(
					toRender,
					Iterable.map(toRender.children?.values() || [], toChild),
					{ diffIdentityProvider: { getId: el => (el as TestCoverageFileNode).value!.id } }
				);
			}
		}));

		let children = Iterable.map(files, toChild);
		const filteredTo = showOnlyTest && coverage.result.getTestById(showOnlyTest.toString());
		if (filteredTo) {
			children = Iterable.concat(
				Iterable.single<ICompressedTreeElement<CoverageTreeElement>>({
					element: new CurrentlyFilteredTo(filteredTo),
					incompressible: true,
				}),
				children,
			);
		}

		this.tree.setChildren(null, children);
	}

	public layout(height: number, width: number) {
		this.tree.layout(height, width);
	}

	public collapseAll() {
		this.tree.collapseAll();
	}

	private updateWithDetails(el: IPrefixTreeNode<FileCoverage>, details: readonly CoverageDetails[]) {
		if (!this.tree.hasElement(el)) {
			return; // avoid any issues if the tree changes in the meanwhile
		}

		const decl: DeclarationCoverageNode[] = [];
		for (const fn of details) {
			if (fn.type !== DetailType.Declaration) {
				continue;
			}

			let arr = decl;
			while (true) {
				const parent = arr.find(p => p.containedDetails.has(fn));
				if (parent) {
					arr = parent.children;
				} else {
					break;
				}
			}

			arr.push(new DeclarationCoverageNode(el.value!.uri, fn, details));
		}

		const makeChild = (fn: DeclarationCoverageNode): ICompressedTreeElement<CoverageTreeElement> => ({
			element: fn,
			incompressible: true,
			collapsed: true,
			collapsible: fn.children.length > 0,
			children: fn.children.map(makeChild)
		});

		this.tree.setChildren(el, decl.map(makeChild));
	}
}

class TestCoverageTreeListDelegate implements IListVirtualDelegate<CoverageTreeElement> {
	getHeight(element: CoverageTreeElement): number {
		return 22;
	}

	getTemplateId(element: CoverageTreeElement): string {
		if (isFileCoverage(element)) {
			return FileCoverageRenderer.ID;
		}
		if (isDeclarationCoverage(element)) {
			return DeclarationCoverageRenderer.ID;
		}
		if (element instanceof LoadingDetails || element instanceof RevealUncoveredDeclarations) {
			return BasicRenderer.ID;
		}
		if (element instanceof CurrentlyFilteredTo) {
			return CurrentlyFilteredToRenderer.ID;
		}
		assertNever(element);
	}
}

class Sorter implements ITreeSorter<CoverageTreeElement> {
	constructor(private readonly order: IObservable<CoverageSortOrder>) { }
	compare(a: CoverageTreeElement, b: CoverageTreeElement): number {
		const order = this.order.get();
		if (isFileCoverage(a) && isFileCoverage(b)) {
			switch (order) {
				case CoverageSortOrder.Location:
				case CoverageSortOrder.Name:
					return a.value!.uri.toString().localeCompare(b.value!.uri.toString());
				case CoverageSortOrder.Coverage:
					return b.value!.tpc - a.value!.tpc;
			}
		} else if (isDeclarationCoverage(a) && isDeclarationCoverage(b)) {
			switch (order) {
				case CoverageSortOrder.Location:
					return Position.compare(
						a.location instanceof Range ? a.location.getStartPosition() : a.location,
						b.location instanceof Range ? b.location.getStartPosition() : b.location,
					);
				case CoverageSortOrder.Name:
					return a.label.localeCompare(b.label);
				case CoverageSortOrder.Coverage: {
					const attrA = a.tpc;
					const attrB = b.tpc;
					return (attrA !== undefined && attrB !== undefined && attrB - attrA)
						|| (+b.hits - +a.hits)
						|| a.label.localeCompare(b.label);
				}
			}
		} else {
			return 0;
		}
	}
}

interface IFilteredToTemplate {
	label: HTMLElement;
	actions: ActionBar;
}

class CurrentlyFilteredToRenderer implements ICompressibleTreeRenderer<CoverageTreeElement, FuzzyScore, IFilteredToTemplate> {
	public static readonly ID = 'C';
	public readonly templateId = CurrentlyFilteredToRenderer.ID;

	constructor(
		@IMenuService private readonly menuService: IMenuService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
	) { }

	renderCompressedElements(node: ITreeNode<ICompressedTreeNode<CoverageTreeElement>, FuzzyScore>, index: number, templateData: IFilteredToTemplate): void {
		this.renderInner(node.element.elements[node.element.elements.length - 1] as CurrentlyFilteredTo, templateData);
	}

	renderTemplate(container: HTMLElement): IFilteredToTemplate {
		container.classList.add('testing-stdtree-container');
		const label = dom.append(container, dom.$('.label'));
		const menu = this.menuService.getMenuActions(MenuId.TestCoverageFilterItem, this.contextKeyService, {
			shouldForwardArgs: true,
		});

		const actions = new ActionBar(container);
		actions.push(getActionBarActions(menu, 'inline').primary, { icon: true, label: false });
		actions.domNode.style.display = 'block';

		return { label, actions };
	}

	renderElement(element: ITreeNode<CoverageTreeElement, FuzzyScore>, index: number, templateData: IFilteredToTemplate): void {
		this.renderInner(element.element as CurrentlyFilteredTo, templateData);
	}

	disposeTemplate(templateData: IFilteredToTemplate): void {
		templateData.actions.dispose();
	}

	private renderInner(element: CurrentlyFilteredTo, container: IFilteredToTemplate) {
		container.label.innerText = element.label;
	}
}

interface FileTemplateData {
	container: HTMLElement;
	bars: ManagedTestCoverageBars;
	templateDisposables: DisposableStore;
	elementsDisposables: DisposableStore;
	label: IResourceLabel;
}

class FileCoverageRenderer implements ICompressibleTreeRenderer<CoverageTreeElement, FuzzyScore, FileTemplateData> {
	public static readonly ID = 'F';
	public readonly templateId = FileCoverageRenderer.ID;

	constructor(
		private readonly labels: ResourceLabels,
		@ILabelService private readonly labelService: ILabelService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) { }

	/** @inheritdoc */
	public renderTemplate(container: HTMLElement): FileTemplateData {
		const templateDisposables = new DisposableStore();
		container.classList.add('testing-stdtree-container', 'test-coverage-list-item');

		return {
			container,
			bars: templateDisposables.add(this.instantiationService.createInstance(ManagedTestCoverageBars, { compact: false, container })),
			label: templateDisposables.add(this.labels.create(container, {
				supportHighlights: true,
			})),
			elementsDisposables: templateDisposables.add(new DisposableStore()),
			templateDisposables,
		};
	}

	/** @inheritdoc */
	public renderElement(node: ITreeNode<CoverageTreeElement, FuzzyScore>, _index: number, templateData: FileTemplateData): void {
		this.doRender(node.element as TestCoverageFileNode, templateData, node.filterData);
	}

	/** @inheritdoc */
	public renderCompressedElements(node: ITreeNode<ICompressedTreeNode<CoverageTreeElement>, FuzzyScore>, _index: number, templateData: FileTemplateData): void {
		this.doRender(node.element.elements, templateData, node.filterData);
	}

	public disposeTemplate(templateData: FileTemplateData) {
		templateData.templateDisposables.dispose();
	}

	/** @inheritdoc */
	private doRender(element: CoverageTreeElement | CoverageTreeElement[], templateData: FileTemplateData, filterData: FuzzyScore | undefined) {
		templateData.elementsDisposables.clear();

		const stat = (element instanceof Array ? element[element.length - 1] : element) as TestCoverageFileNode;
		const file = stat.value!;
		const name = element instanceof Array ? element.map(e => basenameOrAuthority((e as TestCoverageFileNode).value!.uri)) : basenameOrAuthority(file.uri);
		if (file instanceof BypassedFileCoverage) {
			templateData.bars.setCoverageInfo(undefined);
		} else {
			templateData.elementsDisposables.add(autorun(reader => {
				stat.value?.didChange.read(reader);
				templateData.bars.setCoverageInfo(file);
			}));

			templateData.bars.setCoverageInfo(file);
		}

		templateData.label.setResource({ resource: file.uri, name }, {
			fileKind: stat.children?.size ? FileKind.FOLDER : FileKind.FILE,
			matches: createMatches(filterData),
			separator: this.labelService.getSeparator(file.uri.scheme, file.uri.authority),
			extraClasses: ['label'],
		});
	}
}

interface DeclarationTemplateData {
	container: HTMLElement;
	bars: ManagedTestCoverageBars;
	templateDisposables: DisposableStore;
	icon: HTMLElement;
	label: HTMLElement;
}

class DeclarationCoverageRenderer implements ICompressibleTreeRenderer<CoverageTreeElement, FuzzyScore, DeclarationTemplateData> {
	public static readonly ID = 'N';
	public readonly templateId = DeclarationCoverageRenderer.ID;

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) { }

	/** @inheritdoc */
	public renderTemplate(container: HTMLElement): DeclarationTemplateData {
		const templateDisposables = new DisposableStore();
		container.classList.add('test-coverage-list-item', 'testing-stdtree-container');

		const icon = dom.append(container, dom.$('.state'));
		const label = dom.append(container, dom.$('.label'));

		return {
			container,
			bars: templateDisposables.add(this.instantiationService.createInstance(ManagedTestCoverageBars, { compact: false, container })),
			templateDisposables,
			icon,
			label,
		};
	}

	/** @inheritdoc */
	public renderElement(node: ITreeNode<CoverageTreeElement, FuzzyScore>, _index: number, templateData: DeclarationTemplateData): void {
		this.doRender(node.element as DeclarationCoverageNode, templateData, node.filterData);
	}

	/** @inheritdoc */
	public renderCompressedElements(node: ITreeNode<ICompressedTreeNode<CoverageTreeElement>, FuzzyScore>, _index: number, templateData: DeclarationTemplateData): void {
		this.doRender(node.element.elements[node.element.elements.length - 1] as DeclarationCoverageNode, templateData, node.filterData);
	}

	public disposeTemplate(templateData: DeclarationTemplateData) {
		templateData.templateDisposables.dispose();
	}

	/** @inheritdoc */
	private doRender(element: DeclarationCoverageNode, templateData: DeclarationTemplateData, _filterData: FuzzyScore | undefined) {
		const covered = !!element.hits;
		const icon = covered ? testingWasCovered : testingStatesToIcons.get(TestResultState.Unset);
		templateData.container.classList.toggle('not-covered', !covered);
		templateData.icon.className = `computed-state ${ThemeIcon.asClassName(icon!)}`;
		templateData.label.innerText = element.label;
		templateData.bars.setCoverageInfo(element.attributableCoverage());
	}
}

class BasicRenderer implements ICompressibleTreeRenderer<CoverageTreeElement, FuzzyScore, HTMLElement> {
	public static readonly ID = 'B';
	public readonly templateId = BasicRenderer.ID;

	renderCompressedElements(node: ITreeNode<ICompressedTreeNode<CoverageTreeElement>, FuzzyScore>, _index: number, container: HTMLElement): void {
		this.renderInner(node.element.elements[node.element.elements.length - 1], container);
	}

	renderTemplate(container: HTMLElement): HTMLElement {
		return container;
	}

	renderElement(node: ITreeNode<CoverageTreeElement, FuzzyScore>, index: number, container: HTMLElement): void {
		this.renderInner(node.element, container);
	}

	disposeTemplate(): void {
		// no-op
	}

	private renderInner(element: CoverageTreeElement, container: HTMLElement) {
		container.innerText = (element as RevealUncoveredDeclarations | LoadingDetails).label;
	}
}

class TestCoverageIdentityProvider implements IIdentityProvider<CoverageTreeElement> {
	public getId(element: CoverageTreeElement) {
		return isFileCoverage(element)
			? element.value!.uri.toString()
			: element.id;
	}
}

registerAction2(class TestCoverageChangePerTestFilterAction extends Action2 {
	constructor() {
		super({
			id: TestCommandId.CoverageFilterToTest,
			category: Categories.Test,
			title: localize2('testing.changeCoverageFilter', 'Filter Coverage by Test'),
			icon: Codicon.filter,
			toggled: {
				icon: Codicon.filterFilled,
				condition: TestingContextKeys.isCoverageFilteredToTest,
			},
			menu: [
				{ id: MenuId.CommandPalette, when: TestingContextKeys.hasPerTestCoverage },
				{ id: MenuId.TestCoverageFilterItem, group: 'inline' },
				{
					id: MenuId.ViewTitle,
					when: ContextKeyExpr.and(TestingContextKeys.hasPerTestCoverage, ContextKeyExpr.equals('view', Testing.CoverageViewId)),
					group: 'navigation',
				},
			]
		});
	}

	override run(accessor: ServicesAccessor): void {
		const coverageService = accessor.get(ITestCoverageService);
		const quickInputService = accessor.get(IQuickInputService);
		const coverage = coverageService.selected.get();
		if (!coverage) {
			return;
		}

		const tests = [...coverage.allPerTestIDs()].map(TestId.fromString);
		const commonPrefix = TestId.getLengthOfCommonPrefix(tests.length, i => tests[i]);
		const result = coverage.result;
		const previousSelection = coverageService.filterToTest.get();
		const previousSelectionStr = previousSelection?.toString();

		type TItem = { label: string; testId?: TestId };

		const items: QuickPickInput<TItem>[] = [
			{ label: coverUtils.labels.allTests, id: undefined },
			{ type: 'separator' },
			...tests.map(testId => ({ label: coverUtils.getLabelForItem(result, testId, commonPrefix), testId })),
		];

		quickInputService.pick(items, {
			activeItem: items.find((item): item is TItem => 'testId' in item && item.testId?.toString() === previousSelectionStr),
			placeHolder: coverUtils.labels.pickShowCoverage,
			onDidFocus: (entry) => {
				coverageService.filterToTest.set(entry.testId, undefined);
			},
		}).then(selected => {
			coverageService.filterToTest.set(selected ? selected.testId : previousSelection, undefined);
		});
	}
});

registerAction2(class TestCoverageChangeSortingAction extends ViewAction<TestCoverageView> {
	constructor() {
		super({
			id: TestCommandId.CoverageViewChangeSorting,
			viewId: Testing.CoverageViewId,
			title: localize2('testing.changeCoverageSort', 'Change Sort Order'),
			icon: Codicon.sortPrecedence,
			menu: {
				id: MenuId.ViewTitle,
				when: ContextKeyExpr.equals('view', Testing.CoverageViewId),
				group: 'navigation',
				order: 1,
			}
		});
	}

	override runInView(accessor: ServicesAccessor, view: TestCoverageView) {
		type Item = IQuickPickItem & { value: CoverageSortOrder };

		const disposables = new DisposableStore();
		const quickInput = disposables.add(accessor.get(IQuickInputService).createQuickPick<Item>());
		const items: Item[] = [
			{ label: localize('testing.coverageSortByLocation', 'Sort by Location'), value: CoverageSortOrder.Location, description: localize('testing.coverageSortByLocationDescription', 'Files are sorted alphabetically, declarations are sorted by position') },
			{ label: localize('testing.coverageSortByCoverage', 'Sort by Coverage'), value: CoverageSortOrder.Coverage, description: localize('testing.coverageSortByCoverageDescription', 'Files and declarations are sorted by total coverage') },
			{ label: localize('testing.coverageSortByName', 'Sort by Name'), value: CoverageSortOrder.Name, description: localize('testing.coverageSortByNameDescription', 'Files and declarations are sorted alphabetically') },
		];

		quickInput.placeholder = localize('testing.coverageSortPlaceholder', 'Sort the Test Coverage view...');
		quickInput.items = items;
		quickInput.show();
		disposables.add(quickInput.onDidHide(() => disposables.dispose()));
		disposables.add(quickInput.onDidAccept(() => {
			const picked = quickInput.selectedItems[0]?.value;
			if (picked !== undefined) {
				view.sortOrder.set(picked, undefined);
				quickInput.dispose();
			}
		}));
	}
});

registerAction2(class TestCoverageCollapseAllAction extends ViewAction<TestCoverageView> {
	constructor() {
		super({
			id: TestCommandId.CoverageViewCollapseAll,
			viewId: Testing.CoverageViewId,
			title: localize2('testing.coverageCollapseAll', 'Collapse All Coverage'),
			icon: Codicon.collapseAll,
			menu: {
				id: MenuId.ViewTitle,
				when: ContextKeyExpr.equals('view', Testing.CoverageViewId),
				group: 'navigation',
				order: 2,
			}
		});
	}

	override runInView(_accessor: ServicesAccessor, view: TestCoverageView) {
		view.collapseAll();
	}
});
