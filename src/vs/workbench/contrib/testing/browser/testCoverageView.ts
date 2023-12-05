/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IIdentityProvider, IListVirtualDelegate } from 'vs/base/browser/ui/list/list';
import { ITreeCompressionDelegate } from 'vs/base/browser/ui/tree/asyncDataTree';
import { ICompressedTreeNode } from 'vs/base/browser/ui/tree/compressedObjectTreeModel';
import { ICompressibleTreeRenderer } from 'vs/base/browser/ui/tree/objectTree';
import { IAsyncDataSource, ITreeNode } from 'vs/base/browser/ui/tree/tree';
import { FuzzyScore, createMatches } from 'vs/base/common/filters';
import { Iterable } from 'vs/base/common/iterator';
import { Disposable, DisposableStore, MutableDisposable } from 'vs/base/common/lifecycle';
import { autorun } from 'vs/base/common/observable';
import { IPrefixTreeNode, WellDefinedPrefixTree } from 'vs/base/common/prefixTree';
import { basenameOrAuthority } from 'vs/base/common/resources';
import { URI } from 'vs/base/common/uri';
import { localize } from 'vs/nls';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { EditorOpenSource } from 'vs/platform/editor/common/editor';
import { FileKind } from 'vs/platform/files/common/files';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { ILabelService } from 'vs/platform/label/common/label';
import { WorkbenchCompressibleAsyncDataTree } from 'vs/platform/list/browser/listService';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { IResourceLabel, ResourceLabels } from 'vs/workbench/browser/labels';
import { IViewPaneOptions, ViewPane } from 'vs/workbench/browser/parts/views/viewPane';
import { IViewDescriptorService } from 'vs/workbench/common/views';
import { ManagedTestCoverageBars } from 'vs/workbench/contrib/testing/browser/testCoverageBars';
import { ComputedFileCoverage, FileCoverage, TestCoverage } from 'vs/workbench/contrib/testing/common/testCoverage';
import { ITestCoverageService } from 'vs/workbench/contrib/testing/common/testCoverageService';
import { DetailType, IFunctionCoverage } from 'vs/workbench/contrib/testing/common/testTypes';
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

class TestCoverageInput {
	public readonly tree: WellDefinedPrefixTree<ComputedFileCoverage>;

	constructor(coverage: TestCoverage) {
		this.tree = coverage.tree;
	}
}


/** Type of nodes returned from {@link TestCoverage}. Note: value is *always* defined. */
type TestCoverageFileNode = IPrefixTreeNode<ComputedFileCoverage | FileCoverage>;

type CoverageTreeElement = TestCoverageFileNode | IFunctionCoverage;

const isFileCoverage = (c: CoverageTreeElement): c is TestCoverageFileNode => 'value' in c;
const isFunctionCoverage = (c: CoverageTreeElement): c is IFunctionCoverage => 'type' in c && c.type === DetailType.Function;

class TestCoverageTree extends Disposable {
	private readonly tree: WorkbenchCompressibleAsyncDataTree<TestCoverageInput | undefined, CoverageTreeElement, void>;

	constructor(
		container: HTMLElement,
		labels: ResourceLabels,
		@IInstantiationService instantiationService: IInstantiationService,
		@IEditorService editorService: IEditorService,
	) {
		super();

		this.tree = <WorkbenchCompressibleAsyncDataTree<TestCoverageInput | undefined, CoverageTreeElement, void>>instantiationService.createInstance(
			WorkbenchCompressibleAsyncDataTree,
			'TestCoverageView',
			container,
			new TestCoverageTreeListDelegate(),
			new TestCoverageCompressionDelegate(),
			[instantiationService.createInstance(FileCoverageRenderer, labels)],
			instantiationService.createInstance(TestCoverageDataSource),
			{
				accessibilityProvider: {
					getAriaLabel(element: CoverageTreeElement) {
						if (isFileCoverage(element)) {
							const name = basenameOrAuthority(element.value!.uri);
							return localize('testCoverageItemLabel', "{0} coverage: {0}%", name, (element.value!.tpc * 100).toFixed(2));
						}

						return element.name;
					},
					getWidgetAriaLabel() {
						return localize('testCoverageTreeLabel', "Test Coverage Explorer");
					}
				},
				autoExpandSingleChildren: true,
				identityProvider: new TestCoverageIdentityProvider(),
			}
		);

		this._register(this.tree);
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
		this.tree.setInput(new TestCoverageInput(coverage));
	}

	public layout(height: number, width: number) {
		this.tree.layout(height, width);
	}
}

class TestCoverageDataSource implements IAsyncDataSource<TestCoverageInput, CoverageTreeElement> {

	public hasChildren(element: CoverageTreeElement | TestCoverageInput): boolean {
		return element instanceof TestCoverageInput || (isFileCoverage(element) && !!element.children?.size);
	}

	public async getChildren(element: CoverageTreeElement | TestCoverageInput): Promise<Iterable<CoverageTreeElement>> {
		if (element instanceof TestCoverageInput) {
			const files = [];
			for (let node of element.tree.nodes) {
				// when showing initial children, only show from the first file or tee
				while (!(node.value instanceof FileCoverage) && node.children?.size === 1) {
					node = Iterable.first(node.children.values())!;
				}
				files.push(node);
			}
			return files;
		}

		if (isFileCoverage(element) && element.children) {
			return element.children.values();
		}

		return Iterable.empty();
	}
}

class TestCoverageCompressionDelegate implements ITreeCompressionDelegate<CoverageTreeElement> {
	isIncompressible(element: CoverageTreeElement): boolean {
		return isFunctionCoverage(element) || !element.children?.size;
	}
}

class TestCoverageTreeListDelegate implements IListVirtualDelegate<CoverageTreeElement> {
	getHeight(element: CoverageTreeElement): number {
		return 22;
	}

	getTemplateId(_element: CoverageTreeElement): string {
		return FileCoverageRenderer.ID;
	}
}

interface TemplateData {
	container: HTMLElement;
	bars: ManagedTestCoverageBars;
	templateDisposables: DisposableStore;
	label: IResourceLabel;
}

class FileCoverageRenderer implements ICompressibleTreeRenderer<CoverageTreeElement, FuzzyScore, TemplateData> {
	public static readonly ID = 'F';
	public readonly templateId = FileCoverageRenderer.ID;

	constructor(
		private readonly labels: ResourceLabels,
		@ILabelService private readonly labelService: ILabelService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) { }

	/** @inheritdoc */
	public renderTemplate(container: HTMLElement): TemplateData {
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
	public renderElement(node: ITreeNode<CoverageTreeElement, FuzzyScore>, _index: number, templateData: TemplateData): void {
		this.doRender(node.element as TestCoverageFileNode, templateData, node.filterData);
	}

	/** @inheritdoc */
	public renderCompressedElements(node: ITreeNode<ICompressedTreeNode<CoverageTreeElement>, FuzzyScore>, _index: number, templateData: TemplateData): void {
		this.doRender(node.element.elements, templateData, node.filterData);
	}

	public disposeTemplate(templateData: TemplateData) {
		templateData.templateDisposables.dispose();
	}

	/** @inheritdoc */
	private doRender(element: CoverageTreeElement | CoverageTreeElement[], templateData: TemplateData, filterData: FuzzyScore | undefined) {
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

class TestCoverageIdentityProvider implements IIdentityProvider<CoverageTreeElement> {
	public getId(element: CoverageTreeElement) {
		return isFileCoverage(element) ? element.value!.uri.toString() : element.name;
	}
}
