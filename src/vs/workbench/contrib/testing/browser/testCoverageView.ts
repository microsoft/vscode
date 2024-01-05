/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IIdentityProvider, IListVirtualDelegate } from 'vs/base/browser/ui/list/list';
import { ICompressedTreeElement, ICompressedTreeNode } from 'vs/base/browser/ui/tree/compressedObjectTreeModel';
import { ICompressibleTreeRenderer } from 'vs/base/browser/ui/tree/objectTree';
import { ITreeNode } from 'vs/base/browser/ui/tree/tree';
import { assertNever } from 'vs/base/common/assert';
import { Codicon } from 'vs/base/common/codicons';
import { memoize } from 'vs/base/common/decorators';
import { FuzzyScore, createMatches } from 'vs/base/common/filters';
import { Iterable } from 'vs/base/common/iterator';
import { Disposable, DisposableStore, MutableDisposable } from 'vs/base/common/lifecycle';
import { autorun } from 'vs/base/common/observable';
import { IPrefixTreeNode } from 'vs/base/common/prefixTree';
import { basenameOrAuthority } from 'vs/base/common/resources';
import { ThemeIcon } from 'vs/base/common/themables';
import { URI } from 'vs/base/common/uri';
import { Range } from 'vs/editor/common/core/range';
import { localize } from 'vs/nls';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { EditorOpenSource } from 'vs/platform/editor/common/editor';
import { FileKind } from 'vs/platform/files/common/files';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { ILabelService } from 'vs/platform/label/common/label';
import { WorkbenchCompressibleObjectTree } from 'vs/platform/list/browser/listService';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { IResourceLabel, ResourceLabels } from 'vs/workbench/browser/labels';
import { IViewPaneOptions, ViewPane } from 'vs/workbench/browser/parts/views/viewPane';
import { IViewDescriptorService } from 'vs/workbench/common/views';
import { CoverageBarSource, ManagedTestCoverageBars } from 'vs/workbench/contrib/testing/browser/testCoverageBars';
import { ComputedFileCoverage, FileCoverage, TestCoverage } from 'vs/workbench/contrib/testing/common/testCoverage';
import { ITestCoverageService } from 'vs/workbench/contrib/testing/common/testCoverageService';
import { CoverageDetails, DetailType, ICoveredCount, IFunctionCoverage } from 'vs/workbench/contrib/testing/common/testTypes';
import { ACTIVE_GROUP, IEditorService, SIDE_GROUP } from 'vs/workbench/services/editor/common/editorService';

export class TestCoverageView extends ViewPane {
	private readonly tree = new MutableDisposable<TestCoverageTree>();

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
		@ITelemetryService telemetryService: ITelemetryService,
		@ITestCoverageService private readonly coverageService: ITestCoverageService,
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, telemetryService);
	}

	protected override renderBody(container: HTMLElement): void {
		super.renderBody(container);

		const labels = this._register(this.instantiationService.createInstance(ResourceLabels, { onDidChangeVisibility: this.onDidChangeBodyVisibility }));

		this._register(autorun(reader => {
			const coverage = this.coverageService.selected.read(reader);
			if (coverage) {
				const t = (this.tree.value ??= this.instantiationService.createInstance(TestCoverageTree, container, labels));
				t.setInput(coverage);
			} else {
				this.tree.clear();
			}
		}));
	}

	protected override layoutBody(height: number, width: number): void {
		super.layoutBody(height, width);
		this.tree.value?.layout(height, width);
	}
}

let fnNodeId = 0;

class FunctionCoverageNode {
	public readonly id = String(fnNodeId++);

	public get hits() {
		return this.data.count;
	}

	public get name() {
		return this.data.name;
	}

	constructor(
		private readonly data: IFunctionCoverage,
		private readonly details: CoverageDetails[],
	) { }

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

		const statement: ICoveredCount = { covered: 0, total: 0 };
		const branch: ICoveredCount = { covered: 0, total: 0 };
		for (const detail of this.details) {
			if (detail.type !== DetailType.Statement) {
				continue;
			}
			const withinFn = detail.location instanceof Range ? location.containsRange(detail.location) : location.containsPosition(detail.location);
			if (!withinFn) {
				continue;
			}

			statement.covered += detail.count > 0 ? 0 : 1;
			statement.total++;

			if (detail.branches) {
				for (const { count } of detail.branches) {
					branch.covered += count > 0 ? 0 : 1;
					branch.total++;
				}
			}
		}

		return { statement, branch } satisfies CoverageBarSource;
	}
}

const LoadingDetails = Symbol();
const loadingDetailsLabel = localize('loadingCoverageDetails', "Loading Coverage Details...");
/** Type of nodes returned from {@link TestCoverage}. Note: value is *always* defined. */
type TestCoverageFileNode = IPrefixTreeNode<ComputedFileCoverage | FileCoverage>;
type CoverageTreeElement = TestCoverageFileNode | FunctionCoverageNode | typeof LoadingDetails;

const isFileCoverage = (c: CoverageTreeElement): c is TestCoverageFileNode => typeof c === 'object' && 'value' in c;
const isFunctionCoverage = (c: CoverageTreeElement): c is FunctionCoverageNode => c instanceof FunctionCoverageNode;
const shouldShowFunctionDetailsOnExpand = (c: CoverageTreeElement): c is IPrefixTreeNode<FileCoverage> =>
	isFileCoverage(c) && c.value instanceof FileCoverage && !!c.value.function?.total;

class TestCoverageTree extends Disposable {
	private readonly tree: WorkbenchCompressibleObjectTree<CoverageTreeElement, void>;

	constructor(
		container: HTMLElement,
		labels: ResourceLabels,
		@IInstantiationService instantiationService: IInstantiationService,
		@IEditorService editorService: IEditorService,
	) {
		super();

		this.tree = <WorkbenchCompressibleObjectTree<CoverageTreeElement, void>>instantiationService.createInstance(
			WorkbenchCompressibleObjectTree,
			'TestCoverageView',
			container,
			new TestCoverageTreeListDelegate(),
			[
				instantiationService.createInstance(FileCoverageRenderer, labels),
				instantiationService.createInstance(FunctionCoverageRenderer, labels),
				instantiationService.createInstance(LoadingDetailsRenderer),
			],
			{
				expandOnlyOnTwistieClick: true,
				accessibilityProvider: {
					getAriaLabel(element: CoverageTreeElement) {
						if (isFileCoverage(element)) {
							const name = basenameOrAuthority(element.value!.uri);
							return localize('testCoverageItemLabel', "{0} coverage: {0}%", name, (element.value!.tpc * 100).toFixed(2));
						}
						if (isFunctionCoverage(element)) {
							return element.name;
						}
						if (element === LoadingDetails) {
							return loadingDetailsLabel;
						}

						assertNever(element);
					},
					getWidgetAriaLabel() {
						return localize('testCoverageTreeLabel', "Test Coverage Explorer");
					}
				},
				identityProvider: new TestCoverageIdentityProvider(),
			}
		);

		this._register(this.tree);
		this._register(this.tree.onDidChangeCollapseState(e => {
			const el = e.node.element;
			if (!e.node.collapsed && !e.node.children.length && el && shouldShowFunctionDetailsOnExpand(el)) {
				if (el.value!.hasSynchronousDetails) {
					this.tree.setChildren(el, [{ element: LoadingDetails, incompressible: true }]);
				}

				el.value!.details().then(details => {
					if (!this.tree.hasElement(el)) {
						return; // avoid any issues if the tree changes in the meanwhile
					}

					this.tree.setChildren(el, details
						.filter((d): d is IFunctionCoverage => d.type === DetailType.Function)
						.map(fn => ({ element: new FunctionCoverageNode(fn, details), incompressible: true })));
				});
			}
		}));
		this._register(this.tree.onDidOpen(e => {
			let resource: URI | undefined;
			if (e.element && isFileCoverage(e.element) && !e.element.children?.size) {
				resource = e.element.value!.uri;
			}
			if (!resource) {
				return;
			}

			editorService.openEditor({
				resource,
				options: { preserveFocus: e.editorOptions.preserveFocus, pinned: e.editorOptions.pinned, source: EditorOpenSource.USER }
			}, e.sideBySide ? SIDE_GROUP : ACTIVE_GROUP);
		}));
	}

	public setInput(coverage: TestCoverage) {
		const files = [];
		for (let node of coverage.tree.nodes) {
			// when showing initial children, only show from the first file or tee
			while (!(node.value instanceof FileCoverage) && node.children?.size === 1) {
				node = Iterable.first(node.children.values())!;
			}
			files.push(node);
		}

		const toChild = (file: TestCoverageFileNode): ICompressedTreeElement<CoverageTreeElement> => {
			const isFile = !file.children?.size;
			return {
				element: file,
				incompressible: isFile,
				collapsed: isFile,
				// directories can be expanded, and items with function info can be expanded
				collapsible: !isFile || !!file.value?.function?.total,
				children: file.children && Iterable.map(file.children?.values(), toChild)
			};
		};

		this.tree.setChildren(null, Iterable.map(files, toChild));
	}

	public layout(height: number, width: number) {
		this.tree.layout(height, width);
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
		if (isFunctionCoverage(element)) {
			return FunctionCoverageRenderer.ID;
		}
		if (element === LoadingDetails) {
			return LoadingDetailsRenderer.ID;
		}
		assertNever(element);
	}
}

interface FileTemplateData {
	container: HTMLElement;
	bars: ManagedTestCoverageBars;
	templateDisposables: DisposableStore;
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
		container.classList.add('test-coverage-list-item');

		return {
			container,
			bars: templateDisposables.add(this.instantiationService.createInstance(ManagedTestCoverageBars, { compact: false, container })),
			label: templateDisposables.add(this.labels.create(container, {
				supportHighlights: true,
			})),
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
		const stat = (element instanceof Array ? element[element.length - 1] : element) as TestCoverageFileNode;
		const file = stat.value!;
		const name = element instanceof Array ? element.map(e => basenameOrAuthority((e as TestCoverageFileNode).value!.uri)) : basenameOrAuthority(file.uri);

		templateData.bars.setCoverageInfo(file);
		templateData.label.setResource({ resource: file.uri, name }, {
			fileKind: stat.children?.size ? FileKind.FOLDER : FileKind.FILE,
			matches: createMatches(filterData),
			separator: this.labelService.getSeparator(file.uri.scheme, file.uri.authority),
			extraClasses: ['test-coverage-list-item-label'],
		});
	}
}

interface FunctionTemplateData {
	container: HTMLElement;
	bars: ManagedTestCoverageBars;
	templateDisposables: DisposableStore;
	label: IResourceLabel;
}

class FunctionCoverageRenderer implements ICompressibleTreeRenderer<CoverageTreeElement, FuzzyScore, FunctionTemplateData> {
	public static readonly ID = 'N';
	public readonly templateId = FunctionCoverageRenderer.ID;

	constructor(
		private readonly labels: ResourceLabels,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) { }

	/** @inheritdoc */
	public renderTemplate(container: HTMLElement): FileTemplateData {
		const templateDisposables = new DisposableStore();
		container.classList.add('test-coverage-list-item');

		return {
			container,
			bars: templateDisposables.add(this.instantiationService.createInstance(ManagedTestCoverageBars, { compact: false, container })),
			label: templateDisposables.add(this.labels.create(container, {
				supportHighlights: true,
			})),
			templateDisposables,
		};
	}

	/** @inheritdoc */
	public renderElement(node: ITreeNode<CoverageTreeElement, FuzzyScore>, _index: number, templateData: FileTemplateData): void {
		this.doRender(node.element as FunctionCoverageNode, templateData, node.filterData);
	}

	/** @inheritdoc */
	public renderCompressedElements(node: ITreeNode<ICompressedTreeNode<CoverageTreeElement>, FuzzyScore>, _index: number, templateData: FileTemplateData): void {
		this.doRender(node.element.elements[node.element.elements.length - 1] as FunctionCoverageNode, templateData, node.filterData);
	}

	public disposeTemplate(templateData: FileTemplateData) {
		templateData.templateDisposables.dispose();
	}

	/** @inheritdoc */
	private doRender(element: FunctionCoverageNode, templateData: FileTemplateData, filterData: FuzzyScore | undefined) {
		const classes = ['test-coverage-list-item-label'];
		if (element.hits > 0) {
			classes.push(...ThemeIcon.asClassNameArray(Codicon.pass));
		}

		templateData.bars.setCoverageInfo(element.attributableCoverage());
		templateData.label.setLabel(element.name, undefined, {
			matches: createMatches(filterData),
			extraClasses: ['test-coverage-list-item-label'],
		});
	}
}

class LoadingDetailsRenderer implements ICompressibleTreeRenderer<CoverageTreeElement, FuzzyScore, void> {
	public static readonly ID = 'L';
	public readonly templateId = LoadingDetailsRenderer.ID;

	renderCompressedElements(): void {
		// no-op
	}

	renderTemplate(container: HTMLElement): void {
		container.innerText = loadingDetailsLabel;
	}

	renderElement(): void {
		// no-op
	}

	disposeTemplate(): void {
		// no-op
	}
}

class TestCoverageIdentityProvider implements IIdentityProvider<CoverageTreeElement> {
	public getId(element: CoverageTreeElement) {
		return isFileCoverage(element)
			? element.value!.uri.toString()
			: isFunctionCoverage(element)
				? element.id
				: element.toString();
	}
}
