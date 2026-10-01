/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, Dimension, getWindow, scheduleAtNextAnimationFrame } from '../../../../../base/browser/dom.js';
import { Action } from '../../../../../base/common/actions.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Event } from '../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../base/common/network.js';
import { basename, dirname } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { localize } from '../../../../../nls.js';
import { IMenuService, MenuId } from '../../../../../platform/actions/common/actions.js';
import { MenuService } from '../../../../../platform/actions/common/menuService.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { ContextKeyService } from '../../../../../platform/contextkey/browser/contextKeyService.js';
import { listErrorForeground, listWarningForeground } from '../../../../../platform/theme/common/colors/listColors.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { TestThemeService } from '../../../../../platform/theme/test/common/testThemeService.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { testWorkspace } from '../../../../../platform/workspace/test/common/testWorkspace.js';
import { ITreeViewsDnDService } from '../../../../../editor/common/services/treeViewsDndService.js';
import { TreeViewsDnDService } from '../../../../../editor/common/services/treeViewsDnd.js';
import { CodeEditorWidget } from '../../../../../editor/browser/widget/codeEditor/codeEditorWidget.js';
import { EditorInput } from '../../../../common/editor/editorInput.js';
import { EditorInputCapabilities, EditorsOrder, IEditorPartOptions, IToolbarActions, Verbosity } from '../../../../common/editor.js';
import { EditorGroupModel } from '../../../../common/editor/editorGroupModel.js';
import {
	EDITOR_GROUP_HEADER_NO_TABS_BACKGROUND,
	EDITOR_GROUP_HEADER_TABS_BACKGROUND,
} from '../../../../common/theme.js';
import { DEFAULT_EDITOR_PART_OPTIONS, IEditorGroupMenuIds, IEditorGroupsView, IEditorGroupView, IEditorPartsView } from '../../../../browser/parts/editor/editor.js';
import { BreadcrumbsService, IBreadcrumbsService } from '../../../../browser/parts/editor/breadcrumbs.js';
import { EditorTitleControl } from '../../../../browser/parts/editor/editorTitleControl.js';
import { IDecorationData, IDecorationsProvider, IDecorationsService } from '../../../../services/decorations/common/decorations.js';
import { DecorationsService } from '../../../../services/decorations/browser/decorationsService.js';
import { INotebookDocumentService, NotebookDocumentWorkbenchService } from '../../../../services/notebook/common/notebookDocumentService.js';
import { IOutlineService } from '../../../../services/outline/browser/outline.js';
import { LayoutSettings, ModernUIEditorTabStyle } from '../../../../services/layout/browser/layoutService.js';
import { TestContextService } from '../../../common/workbenchTestServices.js';
import { workbenchInstantiationService } from '../../workbenchTestServices.js';
import { ComponentFixtureAdditionalTheme, ComponentFixtureContext, createEditorServices, createTextModel, defineComponentFixture, defineThemedFixtureGroup } from '../fixtureUtils.js';
import '../../../../contrib/modernUI/browser/media/tabs.css';
import '../../../../contrib/modernUI/browser/connectedEditorTabs.js';

// ============================================================================
// Fixture editor input
// ============================================================================

interface IFixtureEditorInputOptions {
	readonly typeId?: string;
	readonly dirty?: boolean;
	readonly capabilities?: EditorInputCapabilities;
	readonly icon?: ThemeIcon | URI;
}

/**
 * A lightweight {@link EditorInput} used purely to populate the tab bar for
 * screenshot fixtures. It never resolves a real editor pane; it only provides
 * the label, description (folder path), icon and dirty state that the tab bar
 * renders.
 */
class FixtureEditorInput extends EditorInput {

	constructor(
		readonly resource: URI,
		private readonly _options: IFixtureEditorInputOptions = {}
	) {
		super();
	}

	override get typeId(): string { return this._options.typeId ?? 'workbench.editors.fixtureEditorInput'; }
	override get editorId(): string | undefined { return this.typeId; }

	override get capabilities(): EditorInputCapabilities {
		return this._options.capabilities ?? EditorInputCapabilities.None;
	}

	override getName(): string {
		return basename(this.resource);
	}

	/**
	 * Returns a distinct parent-folder label per {@link Verbosity}, matching how
	 * real resource editor inputs vary their description. `MultiEditorTabsControl`
	 * maps `labelFormat` (short/medium/long) to a verbosity, so distinct values
	 * here are what make the label-format fixtures differ.
	 */
	override getDescription(verbosity: Verbosity = Verbosity.MEDIUM): string | undefined {
		const parent = dirname(this.resource);
		if (parent.path === '/' || parent.path === '.' || parent.path === '') {
			return undefined;
		}
		switch (verbosity) {
			case Verbosity.SHORT:
				return basename(parent); // containing folder name
			case Verbosity.LONG:
				return parent.path; // full absolute path
			case Verbosity.MEDIUM:
			default:
				return parent.path.replace(/^\//, ''); // path relative to root
		}
	}

	override getIcon(): ThemeIcon | URI | undefined {
		return this._options.icon;
	}

	override isDirty(): boolean {
		return !!this._options.dirty;
	}
}

// ============================================================================
// Editor specs used to populate the group model
// ============================================================================

interface IEditorSpec {
	readonly resource: URI;
	readonly typeId?: string;
	readonly dirty?: boolean;
	readonly icon?: ThemeIcon | URI;
	readonly capabilities?: EditorInputCapabilities;
	readonly pinned?: boolean;
	readonly sticky?: boolean;
	readonly active?: boolean;
	/** Include this editor in the multi-selection (the active editor is always selected). */
	readonly selected?: boolean;
}

function file(path: string): URI {
	return URI.file(path);
}

/** A varied set of editors: different input kinds, file names and folder paths. */
function defaultEditorSpecs(): IEditorSpec[] {
	return [
		{ resource: file('/project/src/app/main.ts'), icon: ThemeIcon.fromId(Codicon.symbolFile.id), sticky: true, pinned: true },
		{ resource: file('/project/src/app/index.ts'), pinned: true },
		{ resource: file('/project/README.md'), icon: ThemeIcon.fromId(Codicon.markdown.id), pinned: true },
		{ resource: file('/project/package.json'), icon: ThemeIcon.fromId(Codicon.json.id), pinned: true, dirty: true, active: true },
		{ resource: URI.from({ scheme: Schemas.untitled, path: 'Untitled-1' }), typeId: 'workbench.editors.untitledFixture', icon: ThemeIcon.fromId(Codicon.file.id), pinned: false /* preview */ },
		{ resource: file('/project/.vscode/settings.json'), icon: ThemeIcon.fromId(Codicon.settingsGear.id), pinned: true },
		{ resource: file('/project/src/app/components/button.tsx'), pinned: true },
		{ resource: file('/project/tests/app/main.test.ts'), pinned: true },
	];
}

/** A larger set of editors, useful for wrapping / scrollbar / label variants. */
function manyEditorSpecs(activeIndex = 0): IEditorSpec[] {
	const names = [
		'main.ts', 'index.ts', 'button.tsx', 'input.tsx', 'list.tsx', 'tree.tsx',
		'model.ts', 'service.ts', 'view.ts', 'controller.ts', 'utils.ts', 'types.ts',
		'app.css', 'theme.css', 'README.md', 'package.json',
	];
	return names.map((name, index) => ({
		resource: file(`/project/src/module${index % 4}/${name}`),
		pinned: true,
		active: index === activeIndex,
		dirty: index % 5 === 0,
	}));
}

/** Sticky (pinned) editors to show the sticky tab styling. */
function stickyEditorSpecs(): IEditorSpec[] {
	return [
		{ resource: file('/project/src/app/main.ts'), icon: ThemeIcon.fromId(Codicon.symbolFile.id), sticky: true, pinned: true },
		{ resource: file('/project/README.md'), icon: ThemeIcon.fromId(Codicon.markdown.id), sticky: true, pinned: true },
		{ resource: file('/project/package.json'), icon: ThemeIcon.fromId(Codicon.json.id), sticky: true, pinned: true },
		{ resource: file('/project/src/app/index.ts'), pinned: true, active: true },
		{ resource: file('/project/src/app/components/button.tsx'), pinned: true },
	];
}

/** Editors with several tabs in the multi-selection (active + additional selected). */
function multiSelectEditorSpecs(): IEditorSpec[] {
	return [
		{ resource: file('/project/src/app/main.ts'), icon: ThemeIcon.fromId(Codicon.symbolFile.id), pinned: true, selected: true },
		{ resource: file('/project/src/app/index.ts'), pinned: true },
		{ resource: file('/project/README.md'), icon: ThemeIcon.fromId(Codicon.markdown.id), pinned: true, selected: true },
		{ resource: file('/project/package.json'), icon: ThemeIcon.fromId(Codicon.json.id), pinned: true, dirty: true, active: true, selected: true },
		{ resource: file('/project/src/app/components/button.tsx'), pinned: true },
		{ resource: file('/project/tests/app/main.test.ts'), pinned: true, selected: true },
	];
}

/** Editors with very long names/paths to exercise tab-label truncation and ellipsis. */
function longLabelEditorSpecs(): IEditorSpec[] {
	return [
		{ resource: file('/project/src/features/authentication/providers/veryLongAuthenticationProviderImplementation.ts'), pinned: true, active: true },
		{ resource: file('/project/src/features/authentication/providers/anotherExtremelyLongProviderFactoryModule.ts'), pinned: true },
		{ resource: file('/project/documentation/architecture/decisions/0001-use-a-really-long-descriptive-file-name.md'), icon: ThemeIcon.fromId(Codicon.markdown.id), pinned: true },
	];
}

// ============================================================================
// File decorations
// ============================================================================

/**
 * Deterministic file decorations (badge letter + color) keyed by resource path.
 * These drive the resource-label badges/colors that the `decorations` setting
 * toggles — dirty state alone only affects the separate modified-tab indicator.
 */
const FIXTURE_DECORATIONS = new Map<string, IDecorationData>([
	['/project/package.json', { weight: 10, letter: 'M', color: listWarningForeground, tooltip: 'Modified', bubble: false }],
	['/project/src/app/main.ts', { weight: 20, letter: '2', color: listErrorForeground, tooltip: '2 problems', bubble: false }],
	['/project/src/app/index.ts', { weight: 20, letter: 'U', color: listWarningForeground, tooltip: 'Untracked', bubble: false }],
]);

function registerFixtureDecorations(decorationsService: IDecorationsService, store: DisposableStore): void {
	const provider: IDecorationsProvider = {
		label: 'Fixture Decorations',
		onDidChange: Event.None,
		provideDecorations(uri: URI, _token: CancellationToken): IDecorationData | undefined {
			return FIXTURE_DECORATIONS.get(uri.path);
		},
	};
	store.add(decorationsService.registerDecorationsProvider(provider));
}

// ============================================================================
// Editor-title toolbar actions
// ============================================================================

function createFixtureEditorTitleActions(store: DisposableStore, menuId: MenuId): IToolbarActions {
	if (menuId !== MenuId.EditorTitle) {
		return { primary: [], secondary: [] };
	}

	return {
		primary: [
			store.add(new Action(
				'fixture.splitEditorRight',
				localize('fixtureSplitEditorRight', "Split Editor Right"),
				ThemeIcon.asClassName(Codicon.splitHorizontal)
			))
		],
		secondary: [
			store.add(new Action(
				'fixture.openEditor',
				localize('fixtureOpenEditor', "Open Editor..."),
				ThemeIcon.asClassName(Codicon.goToFile)
			))
		]
	};
}

// ============================================================================
// Rendering
// ============================================================================

export interface IEditorTabBarFixtureOptions {
	readonly modernUI: boolean;
	readonly partOptions?: Partial<IEditorPartOptions>;
	readonly editorTabStyle?: ModernUIEditorTabStyle;
	readonly editors?: IEditorSpec[];
	readonly breadcrumbs?: {
		readonly filePath?: 'on' | 'off' | 'last';
		readonly icons?: boolean;
	};
	readonly width?: number;
	/** Whether this group is the active group. Inactive groups exercise the
	 *  `alwaysShowEditorActions` filtering and unfocused tab styling. */
	readonly active?: boolean;
	readonly showHeader?: boolean;
	readonly useModernUITabs?: boolean;
	readonly reserveHeaderSpace?: boolean;
	readonly headerWidth?: number;
	readonly headerMenuIds?: IEditorGroupMenuIds;
	readonly editorContents?: string;
	readonly activeTabClipping?: 'left' | 'right' | 'left-shoulder' | 'right-shoulder';
}

function createPartOptions(overrides?: Partial<IEditorPartOptions>): IEditorPartOptions {
	return {
		...DEFAULT_EDITOR_PART_OPTIONS,
		hasIcons: true,
		...overrides,
	};
}

function populateModel(model: EditorGroupModel, specs: IEditorSpec[], disposableStore: DisposableStore): void {
	// Open sticky editors first so their indices stay at the front.
	const ordered = [...specs].sort((a, b) => (a.sticky === b.sticky) ? 0 : a.sticky ? -1 : 1);
	const inputBySpec = new Map<IEditorSpec, FixtureEditorInput>();
	for (const spec of ordered) {
		const input = disposableStore.add(new FixtureEditorInput(spec.resource, {
			typeId: spec.typeId,
			dirty: spec.dirty,
			icon: spec.icon,
			capabilities: spec.capabilities,
		}));
		inputBySpec.set(spec, input);
		model.openEditor(input, {
			pinned: spec.pinned ?? true,
			sticky: spec.sticky,
			active: spec.active,
		});
	}

	// Apply multi-selection: the active editor plus any additionally selected ones.
	const inactiveSelected = ordered.filter(spec => spec.selected && !spec.active).map(spec => inputBySpec.get(spec)!);
	if (inactiveSelected.length && model.activeEditor) {
		model.setSelection(model.activeEditor, inactiveSelected);
	}
}

export function renderEditorTabBarFixture(ctx: ComponentFixtureContext, options: IEditorTabBarFixtureOptions): void {
	const { container, disposableStore, theme, fileIconTheme } = ctx;

	const width = options.width ?? 820;
	const isGroupActive = options.active ?? true;
	const partOptions = createPartOptions(options.partOptions);

	const configurationService = new TestConfigurationService();
	configurationService.setUserConfiguration('breadcrumbs', {
		enabled: Boolean(options.breadcrumbs),
		filePath: options.breadcrumbs?.filePath ?? 'on',
		symbolPath: 'off',
		icons: options.breadcrumbs?.icons ?? true,
	});
	configurationService.setUserConfiguration(LayoutSettings.MODERN_UI, options.modernUI);
	configurationService.setUserConfiguration(LayoutSettings.MODERN_UI_EDITOR_TAB_STYLE, options.editorTabStyle ?? ModernUIEditorTabStyle.Connected);

	const instantiationService = workbenchInstantiationService({
		configurationService: () => configurationService,
	}, disposableStore);

	// Feed the fixture's themes to the shared theme service so tab-bar theme lookups resolve.
	const themeService = instantiationService.get(IThemeService) as TestThemeService;
	themeService.setTheme(theme);
	themeService.setFileIconTheme(fileIconTheme);

	// Services the base workbench harness does not stub but the tab bar needs.
	instantiationService.stub(ITreeViewsDnDService, new TreeViewsDnDService());
	instantiationService.stub(INotebookDocumentService, new NotebookDocumentWorkbenchService());

	const contextKeyService = disposableStore.add(instantiationService.createInstance(ContextKeyService));
	instantiationService.stub(IContextKeyService, contextKeyService);

	if (options.headerMenuIds) {
		instantiationService.stub(IMenuService, disposableStore.add(instantiationService.createInstance(MenuService)));
	}

	if (options.breadcrumbs) {
		instantiationService.stub(IBreadcrumbsService, new BreadcrumbsService());
		instantiationService.stub(IOutlineService, new class extends mock<IOutlineService>() { }());
		instantiationService.stub(IWorkspaceContextService, new TestContextService(testWorkspace(file('/project'))));
	}

	// Real decorations service + provider so resource labels get deterministic badges/colors
	// (the `decorations` setting then has something to toggle).
	const decorationsService = disposableStore.add(instantiationService.createInstance(DecorationsService));
	instantiationService.stub(IDecorationsService, decorationsService);
	registerFixtureDecorations(decorationsService, disposableStore);

	// Real editor group model populated with the fixture editors.
	const model = disposableStore.add(instantiationService.createInstance(EditorGroupModel, undefined));
	populateModel(model, options.editors ?? defaultEditorSpecs(), disposableStore);

	const createEditorActions = (disposables: DisposableStore, menuId: MenuId) => {
		return { actions: createFixtureEditorTitleActions(disposables, menuId), onDidChange: Event.None };
	};

	// Lightweight stand-ins for the production `EditorGroupView` / `EditorPart` views.
	const groupView = new class extends mock<IEditorGroupView>() {
		relayoutFn: () => void = () => { };
		override get id() { return model.id; }
		override get count() { return model.count; }
		override get stickyCount() { return model.stickyCount; }
		override get activeEditor() { return model.activeEditor; }
		override get activeEditorPane() { return undefined; }
		override get selectedEditors() { return model.selectedEditors; }
		override get ariaLabel() { return 'Editor Group 1'; }
		override get groupsView(): IEditorGroupsView { return groupsView; }
		override getEditorByIndex(index: number) { return model.getEditorByIndex(index); }
		override getIndexOfEditor(editor: EditorInput) { return model.indexOf(editor); }
		override getEditors(order: EditorsOrder, opts?: { excludeSticky?: boolean }) { return model.getEditors(order, opts); }
		override isActive(editor: EditorInput) { return model.isActive(editor); }
		override isPinned(editorOrIndex: EditorInput | number) { return model.isPinned(editorOrIndex); }
		override isSticky(editorOrIndex: EditorInput | number) { return model.isSticky(editorOrIndex); }
		override isSelected(editorOrIndex: EditorInput | number) { return model.isSelected(editorOrIndex); }
		override createEditorActions(disposables: DisposableStore, menuId = MenuId.EditorTitle) { return createEditorActions(disposables, menuId); }
		override relayout() { this.relayoutFn(); }
		override readonly onDidActiveEditorChange = Event.None;
	};

	// Separate reference returned as the active group when this group is inactive, so that
	// `groupsView.activeGroup === groupView` is false and inactive-group behavior is exercised.
	const otherActiveGroup = new class extends mock<IEditorGroupView>() {
		override focus() { }
	};

	const groupsView = new class extends mock<IEditorGroupsView>() {
		override get partOptions() { return partOptions; }
		override get activeGroup(): IEditorGroupView { return isGroupActive ? groupView : otherActiveGroup; }
		override get groups(): IEditorGroupView[] { return [groupView]; }
		override readonly onDidChangeEditorPartOptions = Event.None;
		override readonly onDidVisibilityChange = Event.None;
	};

	const editorPartsView = new class extends mock<IEditorPartsView>() {
		override get count() { return 1; }
		override getGroup() { return groupView; }
	};

	// Recreate the ancestor chain the tab-bar CSS is scoped to; the fixture container already
	// carries `.monaco-workbench` + theme classes.
	const editorPart = $('.part.editor');
	editorPart.classList.toggle('editor-tabs-multiple', partOptions.showTabs === 'multiple');
	const content = $('.content');
	const groupContainer = $(isGroupActive ? '.editor-group-container.active' : '.editor-group-container');
	const titleContainer = $('.title');
	container.classList.toggle('modern-ui-tabs', options.modernUI);
	container.classList.toggle('modern-ui-connected-editor-tabs', options.modernUI && (options.editorTabStyle ?? ModernUIEditorTabStyle.Connected) === ModernUIEditorTabStyle.Connected);
	titleContainer.classList.toggle('tabs', partOptions.showTabs === 'multiple');
	titleContainer.classList.toggle('show-file-icons', partOptions.showIcons);

	const headerBackground = theme.getColor(partOptions.showTabs === 'multiple' ? EDITOR_GROUP_HEADER_TABS_BACKGROUND : EDITOR_GROUP_HEADER_NO_TABS_BACKGROUND);
	if (headerBackground) {
		titleContainer.style.backgroundColor = headerBackground.toString();
	}

	const editorContainer = $('.editor-container');
	editorContainer.style.height = '96px';
	editorContainer.style.backgroundColor = 'var(--vscode-editor-background)';

	editorPart.appendChild(content);
	content.appendChild(groupContainer);
	groupContainer.appendChild(titleContainer);
	groupContainer.appendChild(editorContainer);
	container.appendChild(editorPart);

	if (options.editorContents !== undefined && model.activeEditor instanceof FixtureEditorInput) {
		editorContainer.style.height = '240px';
		const editorServices = createEditorServices(disposableStore, { colorTheme: theme });
		const textModel = disposableStore.add(createTextModel(editorServices, options.editorContents, model.activeEditor.resource, 'typescript'));
		const editor = disposableStore.add(editorServices.createInstance(CodeEditorWidget, editorContainer, {
			readOnly: true,
			minimap: { enabled: false },
			scrollBeyondLastLine: false,
			lineNumbers: 'on',
			folding: false,
			renderLineHighlight: 'none',
			padding: { top: 16 },
		}, { contributions: [] }));
		editor.setModel(textModel);
		editor.layout(new Dimension(width, 240));
	}

	container.style.width = `${width}px`;
	groupContainer.style.width = `${width}px`;

	const titleControl = disposableStore.add(instantiationService.createInstance(
		EditorTitleControl,
		titleContainer,
		editorPartsView,
		groupsView,
		groupView,
		model,
		options.headerMenuIds,
		options.showHeader ?? false,
		options.reserveHeaderSpace ? () => true : undefined,
		options.useModernUITabs ?? false,
	));

	const layout = () => {
		titleControl.layout({
			container: new Dimension(width, titleControl.getHeight().total),
			available: new Dimension(width, 200),
		}, options.headerWidth);
	};
	groupView.relayoutFn = layout;

	titleControl.openEditors(model.getEditors(EditorsOrder.SEQUENTIAL));
	titleControl.setActive(isGroupActive);
	layout();
	if (options.activeTabClipping) {
		disposableStore.add(scheduleAtNextAnimationFrame(getWindow(container), () => {
			const tabsContainer = titleContainer.querySelector<HTMLElement>('.tabs-container');
			const activeTab = tabsContainer?.querySelector<HTMLElement>('.tab.active');
			if (!tabsContainer || !activeTab) {
				throw new Error('The clipped tab fixture requires an active tab');
			}
			tabsContainer.classList.add('scroll');
			switch (options.activeTabClipping) {
				case 'left':
					tabsContainer.scrollLeft = activeTab.offsetLeft + activeTab.offsetWidth / 2;
					break;
				case 'right':
					tabsContainer.scrollLeft = activeTab.offsetLeft + activeTab.offsetWidth / 2 - tabsContainer.clientWidth;
					break;
				case 'left-shoulder':
					tabsContainer.scrollLeft = activeTab.offsetLeft - 4;
					break;
				case 'right-shoulder':
					tabsContainer.scrollLeft = activeTab.offsetLeft + activeTab.offsetWidth - tabsContainer.clientWidth;
					break;
			}
			tabsContainer.dispatchEvent(new UIEvent('scroll'));
		}));
	}
}

function render(modernUI: boolean, options: Omit<IEditorTabBarFixtureOptions, 'modernUI'>): (ctx: ComponentFixtureContext) => void {
	return (ctx: ComponentFixtureContext) => {
		ctx.container.classList.toggle('modern-ui', modernUI);
		renderEditorTabBarFixture(ctx, { ...options, modernUI });
	};
}

function renderWrappedLayout(tabHeight: IEditorPartOptions['tabHeight']): (ctx: ComponentFixtureContext) => Promise<void> {
	const renderFixture = render(true, { partOptions: { wrapTabs: true, tabHeight }, editors: manyEditorSpecs(), width: 520 });
	return async ctx => {
		renderFixture(ctx);
		let previousLayout: string | undefined;
		for (let attempt = 0; attempt < 10; attempt++) {
			await new Promise<void>(resolve => ctx.disposableStore.add(scheduleAtNextAnimationFrame(getWindow(ctx.container), () => resolve())));
			const strip = ctx.container.querySelector<HTMLElement>('.tabs-and-actions-container');
			const tabs = Array.from(ctx.container.querySelectorAll<HTMLElement>('.tabs-container > .tab'));
			if (!strip || !tabs.length) {
				throw new Error('Wrapped tab fixture did not render its tab strip');
			}
			const layout = JSON.stringify({
				height: strip.offsetHeight,
				tabs: tabs.map(tab => [tab.offsetLeft, tab.offsetTop, tab.offsetWidth, tab.offsetHeight]),
			});
			if (layout === previousLayout) {
				return;
			}
			previousLayout = layout;
		}
		throw new Error('Wrapped tab fixture did not reach a stable layout');
	};
}

function createLayoutFixtures() {
	return {
		CompactDensity: defineComponentFixture({
			render: render(true, { partOptions: { tabHeight: 'compact' } }),
			expectedVisualDescriptions: ['Compact density preserves the same tab structure with shorter hitboxes and centered actions.'],
		}),
		WrappedDefault: defineComponentFixture({
			render: renderWrappedLayout('default'),
			additionalThemes: extendedTabThemes,
			expectedVisualDescriptions: ['Default-density tabs wrap into equal-height rows. Upper connected rows remain separate pills and the bottom selected tab joins the editor.'],
		}),
		WrappedCompact: defineComponentFixture({
			render: renderWrappedLayout('compact'),
			expectedVisualDescriptions: ['Compact tabs wrap into equal-height rows while labels and actions remain vertically centered.'],
		}),
		PinnedSeparateRow: defineComponentFixture({
			render: renderPinnedSeparateRow(),
			expectedVisualDescriptions: ['The separate pinned row uses full-height pills. Unpin and Close retain equal targets and edge clearance.'],
		}),
		PinnedCompact: defineComponentFixture({
			render: render(true, { partOptions: { pinnedTabSizing: 'compact' }, editors: stickyEditorSpecs() }),
			expectedVisualDescriptions: ['Compact pinned tabs remain distinct from the normal active tab and preserve their icon-only hit targets.'],
		}),
		CloseHidden: defineComponentFixture({
			render: render(true, { partOptions: { tabActionCloseVisibility: false } }),
			expectedVisualDescriptions: ['Hiding Close actions removes their reserved controls without changing tab height or modified indicators.'],
		}),
		ActionLeft: defineComponentFixture({
			render: render(true, { partOptions: { tabActionLocation: 'left' } }),
			expectedVisualDescriptions: ['Leading tab actions mirror the default trailing-action spacing without changing label alignment.'],
		}),
		ModifiedMultiSelect: defineComponentFixture({
			render: render(true, { editors: multiSelectEditorSpecs() }),
			expectedVisualDescriptions: ['Modified and multi-selected tabs retain their indicators, selected boundaries, and active document connection.'],
		}),
		LongNamesFit: defineComponentFixture({
			render: render(true, { partOptions: { tabSizing: 'fit' }, editors: longLabelEditorSpecs(), width: 520 }),
			expectedVisualDescriptions: ['Fit-sized long labels use their natural widths and scroll rather than overlap actions.'],
		}),
		LongNamesShrink: defineComponentFixture({
			render: render(true, { partOptions: { tabSizing: 'shrink' }, editors: longLabelEditorSpecs(), width: 520 }),
			expectedVisualDescriptions: ['Shrink-sized long labels ellipsize while preserving extensions and action targets.'],
		}),
		LongNamesFixed: defineComponentFixture({
			render: render(true, { partOptions: { tabSizing: 'fixed', tabSizingFixedMinWidth: 120, tabSizingFixedMaxWidth: 120 }, editors: longLabelEditorSpecs(), width: 520 }),
			expectedVisualDescriptions: ['Fixed-size long labels use equal tab widths, real ellipses, and stable action columns.'],
		}),
	};
}

function renderPinnedSeparateRow(): (ctx: ComponentFixtureContext) => void {
	const editors = defaultEditorSpecs().slice(0, 3).map((spec, index) => ({
		...spec,
		sticky: index === 0,
		pinned: true,
		dirty: false,
		active: index === 1,
	}));
	return render(true, {
		editors,
		partOptions: {
			editorActionsLocation: 'hidden',
			pinnedTabsOnSeparateRow: true,
			pinnedTabSizing: 'normal',
			tabActionUnpinVisibility: true,
		},
	});
}

const extendedTabThemes: readonly ComponentFixtureAdditionalTheme[] = ['darkModern', 'light2026', 'darkPlus', 'lightPlus', 'visualStudioDark', 'visualStudioLight', 'darkHighContrast', 'lightHighContrast', 'abyss', 'monokai', 'quietLight', 'solarizedDark', 'solarizedLight'];

export default defineThemedFixtureGroup({ path: 'editor/editorTabBar/' }, {
	FileIconThemes: defineThemedFixtureGroup({
		Minimal: defineComponentFixture({ fileIconTheme: 'vs-minimal', render: render(true, {}) }),
		None: defineComponentFixture({
			fileIconTheme: 'none',
			render: render(true, {}),
			expectedVisualDescriptions: ['Tabs without a file icon theme use the same balanced iconless leading spacing as the Show Icons disabled setting.'],
		}),
	}),
	LayoutSettings: defineThemedFixtureGroup(createLayoutFixtures()),
	TabStyleCompatibility: defineThemedFixtureGroup({
		Legacy: defineComponentFixture({
			render: render(false, {}),
			expectedVisualDescriptions: [
				'With Modern UI disabled, the legacy tab strip and inactive tabs retain the theme legacy background instead of adopting the connected-tab strip color.',
			],
		}),
		Connected: defineComponentFixture({
			render: render(true, {}),
			additionalThemes: extendedTabThemes,
			expectedVisualDescriptions: [
				'Connected tabs use the dedicated connected strip color while the active tab remains joined to the editor surface.',
			],
		}),
		Pill: defineComponentFixture({
			render: render(true, { editorTabStyle: ModernUIEditorTabStyle.Pill }),
			expectedVisualDescriptions: [
				'Pill tabs retain their transparent modern surface and separate rounded geometry instead of adopting the connected-tab strip color.',
			],
		}),
	}),
	ConnectedStress: defineThemedFixtureGroup({
		StickyViewport: defineComponentFixture({
			render: render(true, {
				partOptions: { pinnedTabSizing: 'compact', editorActionsLocation: 'hidden' },
				editors: stickyEditorSpecs(),
				width: 250,
				activeTabClipping: 'left',
			}),
			expectedVisualDescriptions: ['Compact pinned tabs fully occlude scrolled content. The adjacent selected cap remains rounded with no seam or content leakage.'],
		}),
		ClippedViewport: defineComponentFixture({
			render: render(true, { editors: manyEditorSpecs(), width: 360, activeTabClipping: 'left' }),
			expectedVisualDescriptions: ['A partially scrolled selected tab closes its stationary outside stroke with a rounded cap and continuous separator.'],
		}),
	}),
});
