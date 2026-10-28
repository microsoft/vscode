/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $, getWindow } from '../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { ITreeNode } from '../../../../../base/browser/ui/tree/tree.js';
import { AsyncDataTree } from '../../../../../base/browser/ui/tree/asyncDataTree.js';
import { IDelayedHoverAtMouseOptions } from '../../../../../base/browser/ui/hover/hover.js';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { FuzzyScore } from '../../../../../base/common/filters.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { ResourceTree } from '../../../../../base/common/resourceTree.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ICodeEditor, IDiffEditor } from '../../../../../editor/browser/editorBrowser.js';
import { IRange, Range } from '../../../../../editor/common/core/range.js';
import { ISelection, Selection } from '../../../../../editor/common/core/selection.js';
import { EditorType, ScrollType } from '../../../../../editor/common/editorCommon.js';
import { StructuralDiffClassification, SymbolKind } from '../../../../../editor/common/languages.js';
import { IAccessibilityService } from '../../../../../platform/accessibility/common/accessibility.js';
import { isICommandActionToggleInfo } from '../../../../../platform/action/common/action.js';
import { MenuId, MenuRegistry, isIMenuItem } from '../../../../../platform/actions/common/actions.js';
import { CommandsRegistry } from '../../../../../platform/commands/common/commands.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IEditorOptions } from '../../../../../platform/editor/common/editor.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { NullHoverService } from '../../../../../platform/hover/test/browser/nullHoverService.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { DEFAULT_EDITOR_ASSOCIATION, ITextDiffEditorPane, IUntypedEditorInput } from '../../../../common/editor.js';
import { IEditorService, PreferredGroup, SIDE_GROUP } from '../../../../services/editor/common/editorService.js';
import { IViewsService } from '../../../../services/views/common/viewsService.js';
import { ContextKeys, SCMAccessibilityProvider, SCMTreeDataSource, SCMTreeKeyboardNavigationLabelProvider, SCMTreeSorter, SCMViewPane, isSCMTreeElementCollapsedByDefault } from '../../browser/scmViewPane.js';
import { SCMStructuralDiffRenderer, openSCMStructuralDiff } from '../../browser/scmStructuralDiffRenderer.js';
import { ISCMProvider, ISCMResource, ISCMResourceGroup, ISCMViewService, ViewMode } from '../../common/scm.js';
import { SCMStructuralDiffElement, SCMStructuralDiffModel, SCMStructuralDiffNode } from '../../common/scmStructuralDiff.js';

class TestCodeEditor extends mock<ICodeEditor>() {
	readonly selections: IRange[] = [];
	readonly reveals: IRange[] = [];
	focused = false;
	override setSelection(selection: IRange | ISelection): void { this.selections.push(Range.isIRange(selection) ? selection : Selection.liftSelection(selection)); }
	override revealRangeInCenterIfOutsideViewport(range: IRange, _scrollType?: ScrollType): void { this.reveals.push(range); }
	override focus(): void { this.focused = true; }
}

class TestStatusHoverService extends mock<IHoverService>() {
	readonly labels: string[] = [];
	active = 0;

	override setupDelayedHoverAtMouse(_target: HTMLElement, options: IDelayedHoverAtMouseOptions | (() => IDelayedHoverAtMouseOptions)) {
		const content = (typeof options === 'function' ? options() : options).content;
		assert.ok(typeof content === 'string');
		this.labels.push(content);
		this.active++;
		return toDisposable(() => this.active--);
	}
}

suite('SCM structural diff tree', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	let resource: ISCMResource;
	let group: ISCMResourceGroup;
	let parent: SCMStructuralDiffNode;
	let child: SCMStructuralDiffNode;

	setup(() => {
		const provider = new class extends mock<ISCMProvider>() {
			override readonly id = 'test';
		};
		const resources: ISCMResource[] = [];
		group = new class extends mock<ISCMResourceGroup>() {
			override readonly id = 'workingTree';
			override readonly provider = provider;
			override readonly resources = resources;
			override readonly resourceTree: ResourceTree<ISCMResource, ISCMResourceGroup> = new ResourceTree(this, URI.file('/repo'));
		};
		resource = new class extends mock<ISCMResource>() {
			override readonly sourceUri = URI.file('/repo/folder/file.ts');
			override readonly resourceGroup = group;
			override readonly multiDiffEditorOriginalUri = URI.parse('git:/repo/folder/file.ts');
			override readonly multiDiffEditorModifiedUri = this.sourceUri;
		};
		resources.push(resource);
		group.resourceTree.add(resource.sourceUri, resource);
		const range = new Range(1, 1, 10, 1);
		const children: SCMStructuralDiffNode[] = [];
		parent = {
			type: 'structuralDiff', id: 'class', generation: 1, resource, parent: resource, order: 0, children,
			node: {
				id: 'class', original: { name: 'Calculator', kind: SymbolKind.Class, range }, modified: { name: 'Calculator', kind: SymbolKind.Class, range },
				originalChanges: [], modifiedChanges: [], children: [],
			},
		};
		child = {
			type: 'structuralDiff', id: 'method', generation: 1, resource, parent, order: 0, children: [],
			node: {
				id: 'method',
				original: { name: 'run', kind: SymbolKind.Method, range: new Range(2, 1, 4, 1), selectionRange: new Range(2, 2, 2, 5) },
				modified: { name: 'run', kind: SymbolKind.Method, range: new Range(3, 1, 5, 1), selectionRange: new Range(3, 2, 3, 5) },
				originalChanges: [], modifiedChanges: [], children: [],
			},
		};
		children.push(child);
	});

	for (const mode of [ViewMode.List, ViewMode.Tree]) {
		test(`exposes structural children and correct parents in ${mode} mode`, async () => {
			const structuralDiff = new class extends mock<SCMStructuralDiffModel>() {
				override get enabled(): boolean { return true; }
				override hasChildren(candidate: ISCMResource): boolean { return candidate === resource; }
				override async getChildren(): Promise<readonly SCMStructuralDiffElement[]> { return [parent]; }
			};
			const viewService = new class extends mock<ISCMViewService>() {
				override readonly visibleRepositories = [];
			};
			const dataSource = store.add(new SCMTreeDataSource(() => mode, structuralDiff, new TestConfigurationService(), viewService));
			const top = [...await dataSource.getChildren(group)];
			const files = mode === ViewMode.Tree ? [...await dataSource.getChildren(top[0])] : top;
			assert.deepStrictEqual({
				files,
				expandable: [dataSource.hasChildren(resource), dataSource.hasChildren(parent), dataSource.hasChildren(child)],
				children: [...await dataSource.getChildren(resource)],
				nested: [...await dataSource.getChildren(parent)],
				parents: [dataSource.getParent(parent), dataSource.getParent(child)],
			}, { files: [resource], expandable: [true, true, false], children: [parent], nested: [child], parents: [resource, parent] });
		});

		test(`hides structural children in ${mode} mode while disabled`, async () => {
			let enabled = true;
			const structuralDiff = new class extends mock<SCMStructuralDiffModel>() {
				override get enabled(): boolean { return enabled; }
				override hasChildren(): boolean { return enabled; }
				override async getChildren(): Promise<readonly SCMStructuralDiffElement[]> { return enabled ? [parent] : []; }
			};
			const viewService = new class extends mock<ISCMViewService>() {
				override readonly visibleRepositories = [];
			};
			const dataSource = store.add(new SCMTreeDataSource(() => mode, structuralDiff, new TestConfigurationService(), viewService));
			await dataSource.getChildren(resource);
			enabled = false;
			assert.deepStrictEqual({
				fileChildren: [...await dataSource.getChildren(resource)],
				nestedChildren: [...await dataSource.getChildren(parent)],
				expandable: [dataSource.hasChildren(resource), dataSource.hasChildren(parent)],
				filesRemain: [...await dataSource.getChildren(group)].length,
			}, { fileChildren: [], nestedChildren: [], expandable: [false, false], filesRemain: 1 });
		});

		test(`expands all structural descendants when a file is expanded in ${mode} mode`, async () => {
			const classChildren: SCMStructuralDiffNode[] = [];
			const classNode = { ...parent, children: classChildren };
			const methodChildren: SCMStructuralDiffNode[] = [];
			const methodNode = { ...child, parent: classNode, children: methodChildren };
			const leaf = { ...child, id: 'nested-function', parent: methodNode, children: [] };
			classChildren.push(methodNode);
			methodChildren.push(leaf);
			let requests = 0;
			const structuralDiff = new class extends mock<SCMStructuralDiffModel>() {
				override get enabled(): boolean { return true; }
				override hasChildren(candidate: ISCMResource): boolean { return candidate === resource; }
				override async getChildren(): Promise<readonly SCMStructuralDiffElement[]> {
					requests++;
					return [classNode];
				}
			};
			const viewService = new class extends mock<ISCMViewService>() {
				override readonly visibleRepositories = [];
			};
			const dataSource = store.add(new SCMTreeDataSource(() => mode, structuralDiff, new TestConfigurationService(), viewService));
			type Element = Parameters<SCMTreeDataSource['getParent']>[0];
			const tree = store.add(new AsyncDataTree<ISCMResourceGroup, Element>('SCM structural expansion', $('.scm-view'), {
				getHeight: () => 22,
				getTemplateId: () => 'element',
			}, [{
				templateId: 'element',
				renderTemplate: container => container,
				renderElement: () => { },
				disposeTemplate: () => { },
			}], {
				hasChildren: element => dataSource.hasChildren(element),
				getChildren: element => dataSource.getChildren(element),
			}, { collapseByDefault: isSCMTreeElementCollapsedByDefault }));
			await tree.setInput(group);
			const before = { collapsed: tree.isCollapsed(resource), requests };
			await tree.expand(resource);
			const expanded = [resource, classNode, methodNode].map(element => tree.isCollapsed(element));
			const leafLoaded = tree.hasNode(leaf);
			tree.collapse(classNode);
			assert.deepStrictEqual({
				before, expanded, leafLoaded, requests, canCollapseManually: tree.isCollapsed(classNode),
			}, {
				before: { collapsed: true, requests: 0 }, expanded: [false, false, false],
				leafLoaded: true, requests: 1, canCollapseManually: true,
			});
		});

		test(`preserves provider order instead of applying file sorting in ${mode} mode`, () => {
			const sorter = new SCMTreeSorter(() => mode, () => { throw new Error('Must not sort structural children as files'); });
			const first = { ...child, order: 0, node: { ...child.node, modified: { ...child.node.modified!, name: 'zeta' } } };
			const second = { ...child, id: 'second', order: 1, node: { ...child.node, modified: { ...child.node.modified!, name: 'alpha' } } };
			assert.strictEqual(sorter.compare(first, second), -1);
		});
	}

	test('adds Show Structural Diff as a checkable action in a separate View & Sort group', () => {
		const item = MenuRegistry.getMenuItems(MenuId.for('SCMViewSort'))
			.find(item => isIMenuItem(item) && item.command.id === 'workbench.scm.action.toggleShowStructuralDiff');
		assert.ok(item && isIMenuItem(item));
		const toggled = isICommandActionToggleInfo(item.command.toggled) ? item.command.toggled.condition : item.command.toggled;
		assert.deepStrictEqual({
			title: item.command.title, group: item.group, order: item.order, toggled: toggled?.serialize(),
		}, {
			title: 'Show Structural Diff', group: '3_structuralDiff', order: 1,
			toggled: ContextKeys.SCMViewShowStructuralDiff.serialize(),
		});
	});

	test('the menu command toggles the active Source Control view', async () => {
		const view = new class extends mock<SCMViewPane>() {
			private show = true;
			override get showStructuralDiff(): boolean { return this.show; }
			override set showStructuralDiff(value: boolean) { this.show = value; }
		};
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IViewsService, 'getActiveViewWithId', () => view);
		const command = CommandsRegistry.getCommand('workbench.scm.action.toggleShowStructuralDiff');
		assert.ok(command);
		await instantiationService.invokeFunction(command.handler);
		const unchecked = view.showStructuralDiff;
		await instantiationService.invokeFunction(command.handler);
		assert.deepStrictEqual([unchecked, view.showStructuralDiff], [false, true]);
	});

	test('supports symbol-name keyboard navigation and meaningful screen-reader labels', () => {
		const labelService = new class extends mock<ILabelService>() { };
		const keyboard = new SCMTreeKeyboardNavigationLabelProvider(() => ViewMode.List, labelService);
		const accessibility = new SCMAccessibilityProvider(
			new class extends mock<IAccessibilityService>() { },
			new TestConfigurationService(),
			new class extends mock<IKeybindingService>() { },
			labelService,
		);
		assert.deepStrictEqual({
			keyboard: keyboard.getKeyboardNavigationLabel(child),
			aria: accessibility.getAriaLabel(child),
		}, { keyboard: 'run', aria: 'run, method' });
	});

	test('renders symbol and deletion icons without status text or file actions', () => {
		const renderer = new SCMStructuralDiffRenderer(NullHoverService);
		const container = $('.scm-view');
		const template = store.add(renderer.renderTemplate(container));
		const render = (element: SCMStructuralDiffElement) => renderer.renderElement(new class extends mock<ITreeNode<SCMStructuralDiffElement, FuzzyScore>>() {
			override readonly element = element;
			override readonly filterData = FuzzyScore.Default;
		}, 0, template);
		render(parent);
		const classIcon = !!container.querySelector('.codicon-colored.codicon-symbol-class');
		render({ ...child, node: { ...child.node, modified: undefined } });
		const methodIcon = !!container.querySelector('.codicon-colored.codicon-symbol-method');
		const deletedText = template.label.element.textContent;
		const deletedIcon = !!container.querySelector('.codicon-diff-removed');
		render({ type: 'structuralDiffStatus', id: 'partial', status: 'incomplete', parent: resource, resource, generation: 1, order: 1 });
		assert.deepStrictEqual({
			classIcon, methodIcon, deletedText, deletedIcon, status: template.label.element.textContent,
			warning: !!container.querySelector('.codicon-warning'),
			warningColored: template.icon.classList.contains('codicon-colored'),
			actions: container.querySelectorAll('.actions').length,
		}, { classIcon: true, methodIcon: true, deletedText: 'run', deletedIcon: true, status: 'Partial structural changes', warning: true, warningColored: false, actions: 0 });
	});

	test('applies the same symbol theme colors as Outline when reusing a row', () => {
		const container = $('.monaco-workbench.scm-view');
		mainWindow.document.body.appendChild(container);
		store.add(toDisposable(() => container.remove()));
		container.style.setProperty('--vscode-symbolIcon-classForeground', 'rgb(200, 120, 10)');
		container.style.setProperty('--vscode-symbolIcon-methodForeground', 'rgb(150, 100, 200)');
		const renderer = new SCMStructuralDiffRenderer(NullHoverService);
		const template = store.add(renderer.renderTemplate(container));
		const render = (element: SCMStructuralDiffElement) => renderer.renderElement(new class extends mock<ITreeNode<SCMStructuralDiffElement, FuzzyScore>>() {
			override readonly element = element;
			override readonly filterData = FuzzyScore.Default;
		}, 0, template);
		render(parent);
		const classColor = getWindow(container).getComputedStyle(template.icon).color;
		render(child);
		const methodColor = getWindow(container).getComputedStyle(template.icon).color;
		container.style.setProperty('--vscode-symbolIcon-methodForeground', 'rgb(100, 50, 180)');
		assert.deepStrictEqual({
			classColor, methodColor,
			updatedMethodColor: getWindow(container).getComputedStyle(template.icon).color,
			oldClassIcon: template.icon.classList.contains('codicon-symbol-class'),
			iconHiddenFromScreenReaders: template.icon.getAttribute('aria-hidden'),
		}, {
			classColor: 'rgb(200, 120, 10)', methodColor: 'rgb(150, 100, 200)',
			updatedMethodColor: 'rgb(100, 50, 180)', oldClassIcon: false, iconHiddenFromScreenReaders: 'true',
		});
	});

	test('renders themed diff status icons with accessible text and disposes hovers on row reuse', () => {
		const container = $('.monaco-workbench.scm-view');
		mainWindow.document.body.appendChild(container);
		store.add(toDisposable(() => container.remove()));
		container.style.setProperty('--vscode-gitDecoration-addedResourceForeground', 'rgb(10, 110, 30)');
		container.style.setProperty('--vscode-gitDecoration-deletedResourceForeground', 'rgb(160, 20, 40)');
		container.style.setProperty('--vscode-gitDecoration-modifiedResourceForeground', 'rgb(30, 80, 170)');
		const hoverService = new TestStatusHoverService();
		const renderer = new SCMStructuralDiffRenderer(hoverService);
		const template = store.add(renderer.renderTemplate(container));
		const makeNode = (element: SCMStructuralDiffElement) => new class extends mock<ITreeNode<SCMStructuralDiffElement, FuzzyScore>>() {
			override readonly element = element;
			override readonly filterData = FuzzyScore.Default;
		};
		const added = { ...child, node: { ...child.node, original: undefined, modified: { ...child.node.modified!, detail: '(value: number)' } } };
		const deleted = { ...child, node: { ...child.node, modified: undefined } };
		const modified = {
			...child,
			node: {
				...child.node,
				modifiedChanges: [{ textChangeIndex: 0, range: new Range(3, 2, 3, 5), classification: StructuralDiffClassification.Implementation }],
			},
		};
		const rows = [added, deleted, modified].map(element => {
			renderer.renderElement(makeNode(element), 0, template);
			const color = getWindow(container).getComputedStyle(template.status).color;
			return {
				glyph: [...template.status.classList].filter(value => value.startsWith('codicon-')),
				color,
				text: template.label.element.textContent,
				annotation: template.annotation.textContent,
				activeHovers: hoverService.active,
				aria: template.label.element.getAttribute('aria-label'),
			};
		});
		renderer.renderElement(makeNode(parent), 0, template);
		const containerState = { hidden: template.metadata.style.display === 'none', activeHovers: hoverService.active };
		renderer.renderElement(makeNode(modified), 0, template);
		renderer.disposeElement(makeNode(modified), 0, template);
		assert.deepStrictEqual({
			rows, containerState, hovers: hoverService.labels, activeAfterUnrender: hoverService.active,
			decorative: template.status.getAttribute('aria-hidden'),
		}, {
			rows: [
				{ glyph: ['codicon-diff-added'], color: 'rgb(10, 110, 30)', text: 'run(value: number)', annotation: '', activeHovers: 1, aria: 'run, method, Added, (value: number)' },
				{ glyph: ['codicon-diff-removed'], color: 'rgb(160, 20, 40)', text: 'run', annotation: '', activeHovers: 1, aria: 'run, method, Deleted' },
				{ glyph: ['codicon-diff-modified'], color: 'rgb(30, 80, 170)', text: 'run', annotation: '[impl]', activeHovers: 1, aria: 'run, method, Implementation changed' },
			],
			containerState: { hidden: true, activeHovers: 0 }, hovers: ['Added', 'Deleted', 'Implementation changed', 'Implementation changed'],
			activeAfterUnrender: 0, decorative: 'true',
		});
	});

	test('renders change-part annotations without losing signatures or retaining stale row descriptions', () => {
		const hoverService = new TestStatusHoverService();
		const renderer = new SCMStructuralDiffRenderer(hoverService);
		const template = store.add(renderer.renderTemplate($('.scm-view')));
		const withChanges = (original: StructuralDiffClassification[], modified: StructuralDiffClassification[]) => ({
			...child,
			node: {
				...child.node,
				modified: { ...child.node.modified!, detail: '(value: number)' },
				originalChanges: original.map(classification => ({ textChangeIndex: 0, range: new Range(2, 2, 2, 5), classification })),
				modifiedChanges: modified.map(classification => ({ textChangeIndex: 0, range: new Range(3, 2, 3, 5), classification })),
			},
		});
		const render = (element: SCMStructuralDiffElement) => {
			renderer.renderElement(new class extends mock<ITreeNode<SCMStructuralDiffElement, FuzzyScore>>() {
				override readonly element = element;
				override readonly filterData = FuzzyScore.Default;
			}, 0, template);
			return {
				text: template.label.element.textContent,
				annotation: template.annotation.textContent,
				aria: template.label.element.getAttribute('aria-label'),
				modifiedIcon: template.status.classList.contains('codicon-diff-modified'),
			};
		};
		const rows = [
			withChanges([StructuralDiffClassification.Header], []),
			withChanges([], [StructuralDiffClassification.Implementation]),
			withChanges([StructuralDiffClassification.Header], [StructuralDiffClassification.Implementation]),
		].map(render);
		const ancestor = render(parent);
		const added = render({ ...child, node: { ...withChanges([], [StructuralDiffClassification.Header]).node, original: undefined } });
		assert.deepStrictEqual({ rows, ancestor, added, hovers: hoverService.labels }, {
			rows: [
				{ text: 'run(value: number)', annotation: '[decl]', aria: 'run, method, Declaration changed, (value: number)', modifiedIcon: true },
				{ text: 'run(value: number)', annotation: '[impl]', aria: 'run, method, Implementation changed, (value: number)', modifiedIcon: true },
				{ text: 'run(value: number)', annotation: '[decl+impl]', aria: 'run, method, Declaration and implementation changed, (value: number)', modifiedIcon: true },
			],
			ancestor: { text: 'Calculator', annotation: '', aria: 'Calculator, class', modifiedIcon: false },
			added: { text: 'run(value: number)', annotation: '', aria: 'run, method, Added, (value: number)', modifiedIcon: false },
			hovers: ['Declaration changed', 'Implementation changed', 'Declaration and implementation changed', 'Added'],
		});
	});

	test('right-aligns bracketed annotations before status icons without squeezing them for long names', () => {
		const container = $('.monaco-workbench.scm-view');
		container.style.width = '240px';
		mainWindow.document.body.appendChild(container);
		store.add(toDisposable(() => container.remove()));
		const renderer = new SCMStructuralDiffRenderer(NullHoverService);
		const cases = [
			{ name: 'aVeryLongMethodNameThatMustBeTruncatedBeforeTheAnnotation', classifications: [StructuralDiffClassification.Header] },
			{ name: 'run', classifications: [StructuralDiffClassification.Implementation] },
			{ name: 'calculate', classifications: [StructuralDiffClassification.Header, StructuralDiffClassification.Implementation] },
		];
		const templates = cases.map(({ name, classifications }) => {
			const row = $('.monaco-list-row');
			row.style.position = 'relative';
			row.style.width = '100%';
			row.style.height = '22px';
			container.appendChild(row);
			const template = store.add(renderer.renderTemplate(row));
			const element = {
				...child,
				node: {
					...child.node,
					modified: { ...child.node.modified!, name },
					modifiedChanges: classifications.map(classification => ({ textChangeIndex: 0, range: new Range(3, 2, 3, 5), classification })),
				},
			};
			renderer.renderElement(new class extends mock<ITreeNode<SCMStructuralDiffElement, FuzzyScore>>() {
				override readonly element = element;
				override readonly filterData = FuzzyScore.Default;
			}, 0, template);
			return template;
		});
		const firstAnnotationRight = templates[0].annotation.getBoundingClientRect().right;
		const firstStatusRight = templates[0].status.getBoundingClientRect().right;
		const nameContainer = templates[0].label.element.querySelector('.monaco-icon-label-container');
		assert.ok(nameContainer);
		assert.deepStrictEqual({
			annotations: templates.map(template => template.annotation.textContent),
			annotationEdgesAligned: templates.every(template => Math.abs(template.annotation.getBoundingClientRect().right - firstAnnotationRight) < 1),
			statusEdgesAligned: templates.every(template => Math.abs(template.status.getBoundingClientRect().right - firstStatusRight) < 1),
			noOverlap: templates.every(template => template.label.element.getBoundingClientRect().right <= template.annotation.getBoundingClientRect().left),
			annotationsNotClipped: templates.every(template => template.annotation.scrollWidth <= template.annotation.clientWidth),
			longNameTruncated: nameContainer.scrollWidth > nameContainer.clientWidth,
			metadataHiddenFromScreenReaders: templates.every(template => template.metadata.getAttribute('aria-hidden') === 'true'),
		}, {
			annotations: ['[decl]', '[impl]', '[decl+impl]'],
			annotationEdgesAligned: true, statusEdgesAligned: true, noOverlap: true,
			annotationsNotClipped: true, longNameTruncated: true, metadataHiddenFromScreenReaders: true,
		});
	});

	for (const side of ['original', 'modified'] as const) {
		for (const preserveFocus of [false, true]) {
			test(`opens the ${side} side and respects preserveFocus=${preserveFocus}`, async () => {
				const originalEditor = new TestCodeEditor();
				const modifiedEditor = new TestCodeEditor();
				const diffEditor = new class extends mock<IDiffEditor>() {
					override getEditorType(): string { return EditorType.IDiffEditor; }
					override getOriginalEditor(): ICodeEditor { return originalEditor; }
					override getModifiedEditor(): ICodeEditor { return modifiedEditor; }
				};
				const pane = new class extends mock<ITextDiffEditorPane>() {
					override getControl(): IDiffEditor { return diffEditor; }
				};
				const inputs: (IUntypedEditorInput | undefined)[] = [];
				const editorService = new class extends mock<IEditorService>() {
					override async openEditor(input: IUntypedEditorInput): Promise<ITextDiffEditorPane> { inputs.push(input); return pane; }
				};
				const element = side === 'modified' ? child : { ...child, node: { ...child.node, modified: undefined } };
				await openSCMStructuralDiff(element, { preserveFocus, pinned: true }, editorService, () => true);
				const range = element.node[side]!.selectionRange!;
				assert.deepStrictEqual({
					inputs,
					original: { selections: originalEditor.selections, reveals: originalEditor.reveals, focused: originalEditor.focused },
					modified: { selections: modifiedEditor.selections, reveals: modifiedEditor.reveals, focused: modifiedEditor.focused },
				}, {
					inputs: [{
						original: { resource: resource.multiDiffEditorOriginalUri },
						modified: { resource: resource.multiDiffEditorModifiedUri },
						options: { preserveFocus, pinned: true, override: DEFAULT_EDITOR_ASSOCIATION.id },
					}],
					original: { selections: side === 'original' ? [range] : [], reveals: side === 'original' ? [range] : [], focused: side === 'original' && !preserveFocus },
					modified: { selections: side === 'modified' ? [range] : [], reveals: side === 'modified' ? [range] : [], focused: side === 'modified' && !preserveFocus },
				});
			});
		}
	}

	test('does not navigate a stale result after asynchronous editor opening', async () => {
		const pending = new DeferredPromise<ITextDiffEditorPane | undefined>();
		const target = new TestCodeEditor();
		const control = new class extends mock<IDiffEditor>() {
			override getEditorType(): string { return EditorType.IDiffEditor; }
			override getOriginalEditor(): ICodeEditor { return target; }
			override getModifiedEditor(): ICodeEditor { return target; }
		};
		const pane = new class extends mock<ITextDiffEditorPane>() {
			override getControl(): IDiffEditor { return control; }
		};
		let current = true;
		const editorService = new class extends mock<IEditorService>() {
			override openEditor(_input: IUntypedEditorInput): Promise<ITextDiffEditorPane | undefined> { return pending.p; }
		};
		const opened = openSCMStructuralDiff(child, {}, editorService, () => current);
		current = false;
		await pending.complete(pane);
		await opened;
		assert.deepStrictEqual({ selections: target.selections, reveals: target.reveals, focused: target.focused }, { selections: [], reveals: [], focused: false });
	});

	test('supports side-by-side opening', async () => {
		const groups: (PreferredGroup | IEditorOptions | undefined)[] = [];
		const editorService = new class extends mock<IEditorService>() {
			override async openEditor(_input: IUntypedEditorInput, group?: PreferredGroup | IEditorOptions): Promise<ITextDiffEditorPane | undefined> {
				groups.push(group);
				return undefined;
			}
		};
		await openSCMStructuralDiff(child, {}, editorService, () => true, true);
		assert.deepStrictEqual(groups, [SIDE_GROUP]);
	});
});
