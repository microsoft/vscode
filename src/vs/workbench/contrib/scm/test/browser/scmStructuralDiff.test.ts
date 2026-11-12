/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $, append, getWindow } from '../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { ITreeNode } from '../../../../../base/browser/ui/tree/tree.js';
import { AsyncDataTree } from '../../../../../base/browser/ui/tree/asyncDataTree.js';
import { IDelayedHoverAtMouseOptions } from '../../../../../base/browser/ui/hover/hover.js';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { Event } from '../../../../../base/common/event.js';
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
import { StructuralDiffClassification, StructuralDiffProvider, SymbolKind } from '../../../../../editor/common/languages.js';
import { ILanguageFeaturesService } from '../../../../../editor/common/services/languageFeatures.js';
import { LanguageFeaturesService } from '../../../../../editor/common/services/languageFeaturesService.js';
import { IAccessibilityService } from '../../../../../platform/accessibility/common/accessibility.js';
import { isICommandActionToggleInfo } from '../../../../../platform/action/common/action.js';
import { MenuId, MenuRegistry, isIMenuItem } from '../../../../../platform/actions/common/actions.js';
import { CommandsRegistry, ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ContextKeyService } from '../../../../../platform/contextkey/browser/contextKeyService.js';
import { IEditorOptions } from '../../../../../platform/editor/common/editor.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { NullHoverService } from '../../../../../platform/hover/test/browser/nullHoverService.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { DEFAULT_LABELS_CONTAINER, ResourceLabels } from '../../../../browser/labels.js';
import { DEFAULT_EDITOR_ASSOCIATION, ITextDiffEditorPane, IUntypedEditorInput } from '../../../../common/editor.js';
import { DecorationsService } from '../../../../services/decorations/browser/decorationsService.js';
import { IDecorationsService } from '../../../../services/decorations/common/decorations.js';
import { IEditorService, PreferredGroup, SIDE_GROUP } from '../../../../services/editor/common/editorService.js';
import { IViewsService } from '../../../../services/views/common/viewsService.js';
import { workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { SCMAccessibilityHelp } from '../../browser/scmAccessibilityHelp.js';
import { ContextKeys, SCMAccessibilityProvider, SCMTreeDataSource, SCMTreeKeyboardNavigationLabelProvider, SCMTreeSorter, SCMViewPane, getSCMTreeTwistieCssClass, isSCMTreeElementCollapsedByDefault } from '../../browser/scmViewPane.js';
import { SCMStructuralDiffRenderer, openSCMStructuralDiff } from '../../browser/scmStructuralDiffRenderer.js';
import { ISCMProvider, ISCMResource, ISCMResourceGroup, ISCMViewService, ViewMode } from '../../common/scm.js';
import { SCMStructuralDiffElement, SCMStructuralDiffModel, SCMStructuralDiffNode } from '../../common/scmStructuralDiff.js';
import '../../../modernUI/browser/media/padding.css';

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
				id: 'class', originalItem: { name: 'Calculator', kind: SymbolKind.Class, range }, modifiedItem: { name: 'Calculator', kind: SymbolKind.Class, range },
				originalChanges: [], modifiedChanges: [], children: [],
			},
		};
		child = {
			type: 'structuralDiff', id: 'method', generation: 1, resource, parent, order: 0, children: [],
			node: {
				id: 'method',
				originalItem: { name: 'run', kind: SymbolKind.Method, range: new Range(2, 1, 4, 1), selectionRange: new Range(2, 2, 2, 5) },
				modifiedItem: { name: 'run', kind: SymbolKind.Method, range: new Range(3, 1, 5, 1), selectionRange: new Range(3, 2, 3, 5) },
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
			const first = { ...child, order: 0, node: { ...child.node, modifiedItem: { ...child.node.modifiedItem!, name: 'zeta' } } };
			const second = { ...child, id: 'second', order: 1, node: { ...child.node, modifiedItem: { ...child.node.modifiedItem!, name: 'alpha' } } };
			assert.strictEqual(sorter.compare(first, second), -1);
		});
	}

	test('forces the twistie of expandable files and symbols, which expand only through it, so that file icon themes cannot hide it', async () => {
		const other = new class extends mock<ISCMResource>() {
			override readonly sourceUri = URI.file('/repo/folder/notes.md');
			override readonly resourceGroup = group;
		};
		const files = new class extends mock<ISCMResourceGroup>() {
			override readonly provider = group.provider;
			override readonly resources = [resource, other];
		};
		const structuralDiff = new class extends mock<SCMStructuralDiffModel>() {
			override get enabled(): boolean { return true; }
			override hasChildren(candidate: ISCMResource): boolean { return candidate === resource; }
			override async getChildren(): Promise<readonly SCMStructuralDiffElement[]> { return [parent]; }
		};
		const viewService = new class extends mock<ISCMViewService>() {
			override readonly visibleRepositories = [];
		};
		const dataSource = store.add(new SCMTreeDataSource(() => ViewMode.List, structuralDiff, new TestConfigurationService(), viewService));
		const names = new Map<unknown, string>([[resource, 'file.ts'], [parent, 'Calculator'], [child, 'run'], [other, 'notes.md']]);
		const container = $('.scm-view');
		type Element = Parameters<SCMTreeDataSource['getParent']>[0];
		const tree = store.add(new AsyncDataTree<ISCMResourceGroup, Element>('SCM twisties', container, {
			getHeight: () => 22,
			getTemplateId: () => 'element',
		}, [{
			templateId: 'element',
			renderTemplate: (template: HTMLElement) => template,
			renderElement: (node: ITreeNode<Element>, _index: number, template: HTMLElement) => { template.textContent = names.get(node.element) ?? ''; },
			disposeTemplate: () => { },
		}], {
			hasChildren: element => dataSource.hasChildren(element),
			getChildren: element => dataSource.getChildren(element),
		}, { collapseByDefault: isSCMTreeElementCollapsedByDefault, twistieAdditionalCssClass: element => getSCMTreeTwistieCssClass(element, dataSource) }));
		tree.layout(200);
		await tree.setInput(files);
		await tree.expand(resource);
		const rows = [...container.querySelectorAll('.monaco-list-row')];
		assert.deepStrictEqual(Object.fromEntries(rows.map(row => [row.textContent, row.querySelector('.monaco-tl-twistie')?.classList.contains('force-twistie')])), {
			'file.ts': true, Calculator: true, run: false, 'notes.md': false,
		});
	});

	test('adds Show Structural Diff as a checkable action in a separate View & Sort group while enabled and a provider is registered', () => {
		const item = MenuRegistry.getMenuItems(MenuId.for('SCMViewSort'))
			.find(item => isIMenuItem(item) && item.command.id === 'workbench.scm.action.toggleShowStructuralDiff');
		assert.ok(item && isIMenuItem(item));
		const toggled = isICommandActionToggleInfo(item.command.toggled) ? item.command.toggled.condition : item.command.toggled;
		const isShown = (enabled: boolean, hasProvider: boolean) => {
			const contextKeyService = store.add(new ContextKeyService(new TestConfigurationService({ 'scm.structuralDiff.enabled': enabled })));
			ContextKeys.SCMViewHasStructuralDiffProvider.bindTo(contextKeyService).set(hasProvider);
			return contextKeyService.contextMatchesRules(item.when);
		};
		assert.deepStrictEqual({
			title: item.command.title, group: item.group, order: item.order, toggled: toggled?.serialize(),
			shown: { disabled: isShown(false, true), withoutProvider: isShown(true, false), enabled: isShown(true, true) },
		}, {
			title: 'Show Structural Diff', group: '3_structuralDiff', order: 1,
			toggled: ContextKeys.SCMViewShowStructuralDiff.serialize(),
			shown: { disabled: false, withoutProvider: false, enabled: true },
		});
	});

	test('describes structural diff in the accessibility help only while enabled and a provider is registered', async () => {
		const features = new LanguageFeaturesService();
		const configurationService = new TestConfigurationService({ 'scm.structuralDiff.enabled': true });
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(ICommandService, {});
		instantiationService.stub(IConfigurationService, configurationService);
		instantiationService.stub(ISCMViewService, { visibleRepositories: [] });
		instantiationService.stub(IViewsService, { getFocusedViewName: () => '' });
		instantiationService.set(ILanguageFeaturesService, features);
		const mentionsStructuralDiff = () => {
			const provider = store.add(instantiationService.invokeFunction(accessor => new SCMAccessibilityHelp().getProvider(accessor)));
			return provider.provideContent().includes('Show Structural Diff');
		};
		const withoutProvider = mentionsStructuralDiff();
		const registration = features.structuralDiffProvider.register('*', new class extends mock<StructuralDiffProvider>() { });
		const enabled = mentionsStructuralDiff();
		await configurationService.setUserConfiguration('scm.structuralDiff.enabled', false);
		const disabled = mentionsStructuralDiff();
		registration.dispose();
		assert.deepStrictEqual({ withoutProvider, enabled, disabled }, { withoutProvider: false, enabled: true, disabled: false });
	});

	test('the menu command toggles the active Source Control view', async () => {
		const view = new class extends mock<SCMViewPane>() {
			private show = true;
			override get showStructuralDiff(): boolean { return this.show; }
			override set showStructuralDiff(value: boolean) { this.show = value; }
		};
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IViewsService, {}, 'getActiveViewWithId', () => view);
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

	test('renders symbol icons and a textual deletion marker without file actions', () => {
		const renderer = new SCMStructuralDiffRenderer(NullHoverService);
		const container = $('.scm-view');
		const template = store.add(renderer.renderTemplate(container));
		const render = (element: SCMStructuralDiffElement) => renderer.renderElement(new class extends mock<ITreeNode<SCMStructuralDiffElement, FuzzyScore>>() {
			override readonly element = element;
			override readonly filterData = FuzzyScore.Default;
		}, 0, template);
		render(parent);
		const classIcon = !!container.querySelector('.codicon-colored.codicon-symbol-class');
		render({ ...child, node: { ...child.node, modifiedItem: undefined } });
		const methodIcon = !!container.querySelector('.codicon-colored.codicon-symbol-method');
		const deletedText = template.label.element.textContent;
		const deletedMarker = template.status.textContent;
		render({ type: 'structuralDiffStatus', id: 'partial', status: 'incomplete', parent: resource, resource, generation: 1, order: 1 });
		assert.deepStrictEqual({
			classIcon, methodIcon, deletedText, deletedMarker, status: template.label.element.textContent,
			marker: template.status.textContent,
			warning: !!container.querySelector('.codicon-warning'),
			warningColored: template.icon.classList.contains('codicon-colored'),
			actions: container.querySelectorAll('.actions').length,
		}, { classIcon: true, methodIcon: true, deletedText: 'run', deletedMarker: 'D', status: 'Partial structural changes', marker: '', warning: true, warningColored: false, actions: 0 });
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

	test('renders themed textual status markers with accessible descriptions and disposes hovers on row reuse', () => {
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
		const added = { ...child, node: { ...child.node, originalItem: undefined, modifiedItem: { ...child.node.modifiedItem!, detail: '(value: number)' } } };
		const deleted = { ...child, node: { ...child.node, modifiedItem: undefined } };
		const modified = {
			...child,
			node: {
				...child.node,
				modifiedChanges: [{ textChangeIndex: 0, range: new Range(3, 2, 3, 5), classification: StructuralDiffClassification.Implementation }],
			},
		};
		const renamed = { ...modified, node: { ...modified.node, modifiedItem: { ...modified.node.modifiedItem!, name: 'runNext' } } };
		const rows = [added, deleted, modified, renamed, modified].map(element => {
			renderer.renderElement(makeNode(element), 0, template);
			const color = getWindow(container).getComputedStyle(template.status).color;
			return {
				marker: template.status.textContent,
				iconClasses: [...template.status.classList].filter(value => value.startsWith('codicon')),
				color,
				text: template.label.element.textContent,
				annotation: template.annotation.textContent,
				activeHovers: hoverService.active,
				aria: template.label.element.getAttribute('aria-label'),
			};
		});
		renderer.renderElement(makeNode(parent), 0, template);
		const containerState = { hidden: template.metadata.style.display === 'none', marker: template.status.textContent, activeHovers: hoverService.active };
		renderer.renderElement(makeNode(modified), 0, template);
		renderer.disposeElement(makeNode(modified), 0, template);
		assert.deepStrictEqual({
			rows, containerState, hovers: hoverService.labels, activeAfterUnrender: hoverService.active,
			decorative: template.status.getAttribute('aria-hidden'),
		}, {
			rows: [
				{ marker: 'A', iconClasses: [], color: 'rgb(10, 110, 30)', text: 'run(value: number)', annotation: '', activeHovers: 1, aria: 'run, method, Added, (value: number)' },
				{ marker: 'D', iconClasses: [], color: 'rgb(160, 20, 40)', text: 'run', annotation: '', activeHovers: 1, aria: 'run, method, Deleted' },
				{ marker: 'M', iconClasses: [], color: 'rgb(30, 80, 170)', text: 'run', annotation: 'impl', activeHovers: 1, aria: 'run, method, Implementation changed' },
				{ marker: 'R', iconClasses: [], color: 'rgb(30, 80, 170)', text: 'runNext', annotation: '', activeHovers: 1, aria: 'runNext, method, Renamed from run to runNext' },
				{ marker: 'M', iconClasses: [], color: 'rgb(30, 80, 170)', text: 'run', annotation: 'impl', activeHovers: 1, aria: 'run, method, Implementation changed' },
			],
			containerState: { hidden: true, marker: '', activeHovers: 0 }, hovers: ['Added', 'Deleted', 'Implementation changed', 'Renamed from run to runNext', 'Implementation changed', 'Implementation changed'],
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
				modifiedItem: { ...child.node.modifiedItem!, detail: '(value: number)' },
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
				marker: template.status.textContent,
			};
		};
		const rows = [
			withChanges([StructuralDiffClassification.Header], []),
			withChanges([], [StructuralDiffClassification.Implementation]),
			withChanges([StructuralDiffClassification.Header], [StructuralDiffClassification.Implementation]),
		].map(render);
		const ancestor = render(parent);
		const added = render({ ...child, node: { ...withChanges([], [StructuralDiffClassification.Header]).node, originalItem: undefined } });
		assert.deepStrictEqual({ rows, ancestor, added, hovers: hoverService.labels }, {
			rows: [
				{ text: 'run(value: number)', annotation: 'decl', aria: 'run, method, Declaration changed, (value: number)', marker: 'M' },
				{ text: 'run(value: number)', annotation: 'impl', aria: 'run, method, Implementation changed, (value: number)', marker: 'M' },
				{ text: 'run(value: number)', annotation: 'decl+impl', aria: 'run, method, Declaration and implementation changed, (value: number)', marker: 'M' },
			],
			ancestor: { text: 'Calculator', annotation: '', aria: 'Calculator, class', marker: '' },
			added: { text: 'run(value: number)', annotation: '', aria: 'run, method, Added, (value: number)', marker: 'A' },
			hovers: ['Declaration changed', 'Implementation changed', 'Declaration and implementation changed', 'Added'],
		});
	});

	test('renders renames with R and no annotation, preserving both names in hovers and accessible labels', () => {
		const hoverService = new TestStatusHoverService();
		const renderer = new SCMStructuralDiffRenderer(hoverService);
		const template = store.add(renderer.renderTemplate($('.scm-view')));
		const element = {
			...child,
			node: {
				...child.node,
				originalItem: { ...child.node.originalItem!, name: 'runNext' },
				modifiedItem: { ...child.node.modifiedItem!, name: 'runNext2' },
				modifiedChanges: [{ textChangeIndex: 0, range: new Range(3, 9, 3, 10), classification: StructuralDiffClassification.Header }],
			},
		};
		renderer.renderElement(new class extends mock<ITreeNode<SCMStructuralDiffElement, FuzzyScore>>() {
			override readonly element = element;
			override readonly filterData = FuzzyScore.Default;
		}, 0, template);
		assert.deepStrictEqual({
			text: template.label.element.textContent,
			annotation: template.annotation.textContent,
			annotationHidden: template.annotation.style.display === 'none',
			marker: template.status.textContent,
			renamed: template.status.classList.contains('renamed'),
			modified: template.status.classList.contains('modified'),
			added: template.status.classList.contains('added'),
			hovers: hoverService.labels,
			aria: template.label.element.getAttribute('aria-label'),
		}, {
			text: 'runNext2', annotation: '', annotationHidden: true, marker: 'R', renamed: true, modified: false, added: false,
			hovers: ['Renamed from runNext to runNext2'],
			aria: 'runNext2, method, Renamed from runNext to runNext2',
		});
	});

	test('right-aligns unbracketed annotations before textual status markers without squeezing them for long names', () => {
		const container = $('.monaco-workbench.scm-view');
		container.style.width = '240px';
		mainWindow.document.body.appendChild(container);
		store.add(toDisposable(() => container.remove()));
		const renderer = new SCMStructuralDiffRenderer(NullHoverService);
		const cases = [
			{ name: 'aVeryLongMethodNameThatMustBeTruncatedBeforeTheAnnotation', classifications: [StructuralDiffClassification.Header], change: 'modified' },
			{ name: 'run', classifications: [StructuralDiffClassification.Implementation], change: 'modified' },
			{ name: 'calculate', classifications: [StructuralDiffClassification.Header, StructuralDiffClassification.Implementation], change: 'modified' },
			{ name: 'newMethod', classifications: [], change: 'added' },
			{ name: 'oldMethod', classifications: [], change: 'deleted' },
			{ name: 'renamedMethod', classifications: [StructuralDiffClassification.Header], change: 'renamed' },
		];
		const templates = cases.map(({ name, classifications, change }) => {
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
					originalItem: change === 'added' ? undefined : { ...child.node.originalItem!, name: change === 'renamed' ? 'previousName' : name },
					modifiedItem: change === 'deleted' ? undefined : { ...child.node.modifiedItem!, name },
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
		const annotatedTemplates = templates.filter(template => template.annotation.style.display !== 'none');
		const nameContainer = templates[0].label.element.querySelector('.monaco-icon-label-container');
		assert.ok(nameContainer);
		assert.deepStrictEqual({
			annotations: templates.map(template => template.annotation.textContent),
			markers: templates.map(template => template.status.textContent),
			annotationEdgesAligned: annotatedTemplates.every(template => Math.abs(template.annotation.getBoundingClientRect().right - firstAnnotationRight) < 1),
			statusEdgesAligned: templates.every(template => Math.abs(template.status.getBoundingClientRect().right - firstStatusRight) < 1),
			noOverlap: templates.every(template => template.label.element.getBoundingClientRect().right <= template.metadata.getBoundingClientRect().left),
			annotationsNotClipped: annotatedTemplates.every(template => template.annotation.scrollWidth <= template.annotation.clientWidth),
			markersNotClipped: templates.every(template => template.status.scrollWidth <= template.status.clientWidth),
			longNameTruncated: nameContainer.scrollWidth > nameContainer.clientWidth,
			metadataHiddenFromScreenReaders: templates.every(template => template.metadata.getAttribute('aria-hidden') === 'true'),
		}, {
			annotations: ['decl', 'impl', 'decl+impl', '', '', ''],
			markers: ['M', 'M', 'M', 'A', 'D', 'R'],
			annotationEdgesAligned: true, statusEdgesAligned: true, noOverlap: true,
			annotationsNotClipped: true, markersNotClipped: true, longNameTruncated: true, metadataHiddenFromScreenReaders: true,
		});
	});

	for (const [width, modernUI] of [[220, false], [420, false], [220, true], [420, true]] as const) {
		test(`aligns and dims structural status boxes like file badge boxes at ${width}px${modernUI ? ' in the Modern UI' : ''}, including diagnostic counts`, () => {
			const root = $('.monaco-workbench');
			root.classList.toggle('modern-ui', modernUI);
			const container = append(root, $('.scm-view.monaco-list'));
			container.style.width = `${width}px`;
			container.style.setProperty('--vscode-spacing-size40', '4px');
			container.style.setProperty('--vscode-spacing-size160', '16px');
			container.style.setProperty('--vscode-fontSize-label2', '11px');
			container.style.setProperty('--vscode-fontWeight-semiBold', '600');
			mainWindow.document.body.appendChild(root);
			store.add(toDisposable(() => root.remove()));
			const instantiationService = workbenchInstantiationService(undefined, store);
			const decorations = store.add(instantiationService.createInstance(DecorationsService));
			instantiationService.stub(IDecorationsService, decorations);
			const labels = store.add(instantiationService.createInstance(ResourceLabels, DEFAULT_LABELS_CONTAINER));
			const renderer = new SCMStructuralDiffRenderer(NullHoverService);
			const cases = ['M', 'D', 'A', 'R'].flatMap(letter => [undefined, '5', '123'].map(count => ({
				letter, count, uri: URI.file(`/repo/${letter}-${count ?? 'none'}.ts`),
			})));
			store.add(decorations.registerDecorationsProvider({
				label: 'SCM status',
				onDidChange: Event.None,
				provideDecorations: uri => ({ letter: cases.find(candidate => candidate.uri.toString() === uri.toString())?.letter, weight: 1 }),
			}));
			store.add(decorations.registerDecorationsProvider({
				label: 'Problems',
				onDidChange: Event.None,
				provideDecorations: uri => {
					const count = cases.find(candidate => candidate.uri.toString() === uri.toString())?.count;
					return count ? { letter: count, weight: 10 } : undefined;
				},
			}));
			const createRow = (indent: number) => {
				const row = append(container, $('.monaco-list-row'));
				row.style.position = 'relative';
				row.style.height = '22px';
				const contents = append(row, $('.monaco-tl-contents'));
				contents.style.paddingLeft = `${indent}px`;
				return contents;
			};
			// The tree contents' right padding plus the badges' right margin: 12px and 3px, or 4px each in the Modern UI.
			const expectedRight = container.getBoundingClientRect().right - (modernUI ? 8 : 15);
			const results = cases.map(({ letter, count, uri }) => {
				const fileRow = append(createRow(0), $('.resource'));
				const fileLabel = labels.create(append(fileRow, $('.name')));
				fileLabel.setFile(uri, { hidePath: true, fileDecorations: { colors: false, badges: true } });
				const template = store.add(renderer.renderTemplate(createRow(32)));
				const name = 'aVeryLongMethodNameThatMustLeaveRoomForTheStatus';
				const element = {
					...child,
					node: {
						...child.node,
						originalItem: letter === 'A' ? undefined : { ...child.node.originalItem!, name: letter === 'R' ? 'previousName' : name },
						modifiedItem: letter === 'D' ? undefined : { ...child.node.modifiedItem!, name },
						modifiedChanges: [{ textChangeIndex: 0, range: new Range(3, 2, 3, 5), classification: StructuralDiffClassification.Implementation }],
					},
				};
				renderer.renderElement(new class extends mock<ITreeNode<SCMStructuralDiffElement, FuzzyScore>>() {
					override readonly element = element;
					override readonly filterData = FuzzyScore.Default;
				}, 0, template);
				const fileStyle = getWindow(container).getComputedStyle(fileLabel.element, '::after');
				const structuralStyle = getWindow(container).getComputedStyle(template.status);
				const fileRight = fileLabel.element.getBoundingClientRect().right - parseFloat(fileStyle.marginRight);
				const structuralRight = template.status.getBoundingClientRect().right;
				return {
					fileText: fileStyle.content,
					structuralText: template.status.textContent,
					rightEdgesAligned: Math.abs(fileRight - structuralRight) < 1 && Math.abs(fileRight - expectedRight) < 1,
					justifyContent: [fileStyle.justifyContent, structuralStyle.justifyContent],
					minWidth: [fileStyle.minWidth, structuralStyle.minWidth],
					opacity: [fileStyle.opacity, structuralStyle.opacity],
					sameTypography: fileStyle.fontSize === structuralStyle.fontSize && fileStyle.fontWeight === structuralStyle.fontWeight,
					badgeFits: template.status.scrollWidth <= template.status.clientWidth,
				};
			});
			assert.deepStrictEqual(results, cases.map(({ letter, count }) => ({
				fileText: JSON.stringify(count ? `${count}, ${letter}` : letter),
				structuralText: letter,
				rightEdgesAligned: true, justifyContent: ['center', 'center'], minWidth: ['16px', '16px'], opacity: ['0.75', '0.75'], sameTypography: true, badgeFits: true,
			})));
		});
	}

	for (const [side, staged] of [['original', false], ['modified', false], ['original', true], ['modified', true]] as const) {
		for (const preserveFocus of [false, true]) {
			test(`opens the ${side} side of ${staged ? 'staged' : 'working-tree'} changes and respects preserveFocus=${preserveFocus}`, async () => {
				const comparisonResource = staged ? new class extends mock<ISCMResource>() {
					override readonly sourceUri = resource.sourceUri;
					override readonly multiDiffEditorOriginalUri = this.sourceUri.with({ scheme: 'git', query: JSON.stringify({ path: this.sourceUri.fsPath, ref: 'HEAD' }) });
					override readonly multiDiffEditorModifiedUri = this.sourceUri.with({ scheme: 'git', query: JSON.stringify({ path: this.sourceUri.fsPath, ref: '' }) });
				} : resource;
				const originalEditor = new TestCodeEditor();
				const modifiedEditor = new TestCodeEditor();
				const diffEditor = new class extends mock<IDiffEditor>() {
					override readonly renderSideBySide = true;
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
				const element = { ...child, resource: comparisonResource, node: side === 'modified' ? child.node : { ...child.node, modifiedItem: undefined } };
				await openSCMStructuralDiff(element, { preserveFocus, pinned: true }, editorService, () => true);
				const range = (side === 'original' ? element.node.originalItem : element.node.modifiedItem)!.selectionRange!;
				assert.deepStrictEqual({
					inputs,
					original: { selections: originalEditor.selections, reveals: originalEditor.reveals, focused: originalEditor.focused },
					modified: { selections: modifiedEditor.selections, reveals: modifiedEditor.reveals, focused: modifiedEditor.focused },
				}, {
					inputs: [{
						original: { resource: comparisonResource.multiDiffEditorOriginalUri },
						modified: { resource: comparisonResource.multiDiffEditorModifiedUri },
						options: { preserveFocus, pinned: true, override: DEFAULT_EDITOR_ASSOCIATION.id },
					}],
					original: { selections: side === 'original' ? [range] : [], reveals: side === 'original' ? [range] : [], focused: side === 'original' && !preserveFocus },
					modified: { selections: side === 'modified' ? [range] : [], reveals: side === 'modified' ? [range] : [], focused: side === 'modified' && !preserveFocus },
				});
			});
		}
	}

	test('opens deleted symbols in the modified editor where they were deleted when the diff is inline', async () => {
		const originalEditor = new TestCodeEditor();
		const modifiedEditor = new TestCodeEditor();
		const diffEditor = new class extends mock<IDiffEditor>() {
			override readonly renderSideBySide = false;
			override getEditorType(): string { return EditorType.IDiffEditor; }
			override getOriginalEditor(): ICodeEditor { return originalEditor; }
			override getModifiedEditor(): ICodeEditor { return modifiedEditor; }
		};
		const pane = new class extends mock<ITextDiffEditorPane>() {
			override getControl(): IDiffEditor { return diffEditor; }
		};
		const editorService = new class extends mock<IEditorService>() {
			override async openEditor(): Promise<ITextDiffEditorPane> { return pane; }
		};
		await openSCMStructuralDiff({ ...child, node: { ...child.node, modifiedItem: undefined }, deletedAt: { lineNumber: 2, column: 1 } }, {}, editorService, () => true);
		const range = new Range(2, 1, 2, 1);
		assert.deepStrictEqual({
			original: { selections: originalEditor.selections, reveals: originalEditor.reveals, focused: originalEditor.focused },
			modified: { selections: modifiedEditor.selections, reveals: modifiedEditor.reveals, focused: modifiedEditor.focused },
		}, {
			original: { selections: [], reveals: [], focused: false },
			modified: { selections: [range], reveals: [range], focused: true },
		});
	});

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
