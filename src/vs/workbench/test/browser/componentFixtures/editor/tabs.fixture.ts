/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, Dimension, getWindow, scheduleAtNextAnimationFrame } from '../../../../../base/browser/dom.js';
import { Action } from '../../../../../base/common/actions.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Color } from '../../../../../base/common/color.js';
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
import { isDark, isHighContrast } from '../../../../../platform/theme/common/theme.js';
import { asCssVariableName } from '../../../../../platform/theme/common/colorUtils.js';
import { IColorTheme, IThemeService } from '../../../../../platform/theme/common/themeService.js';
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
	EDITOR_BORDER,
	EDITOR_GROUP_HEADER_CONNECTED_TABS_BACKGROUND,
	EDITOR_GROUP_HEADER_NO_TABS_BACKGROUND,
	EDITOR_GROUP_HEADER_TABS_BACKGROUND,
	EDITOR_GROUP_HEADER_TABS_BORDER,
	MODERN_EDITOR_TAB_ACTIVE_ACTION_BACKGROUND,
	MODERN_EDITOR_TAB_ACTIVE_BACKGROUND,
	MODERN_EDITOR_TAB_ACTIVE_FOREGROUND,
	MODERN_EDITOR_TAB_ACTIVE_HOVER_ACTION_BACKGROUND,
	MODERN_EDITOR_TAB_ACTIVE_HOVER_BACKGROUND,
	MODERN_EDITOR_TAB_HOVER_ACTION_BACKGROUND,
	MODERN_EDITOR_TAB_HOVER_BACKGROUND,
	MODERN_EDITOR_TAB_HOVER_FOREGROUND,
	MODERN_EDITOR_TAB_INACTIVE_BACKGROUND,
	MODERN_EDITOR_TAB_SELECTED_ACTION_BACKGROUND,
	TAB_ACTIVE_BORDER,
	TAB_ACTIVE_BORDER_TOP,
	TAB_BORDER,
	TAB_DIVIDER,
	TAB_HOVER_BORDER,
	TAB_SELECTED_BORDER_TOP,
	TAB_UNFOCUSED_ACTIVE_BORDER,
	TAB_UNFOCUSED_ACTIVE_BORDER_TOP,
	TAB_UNFOCUSED_HOVER_BORDER,
} from '../../../../common/theme.js';
import { DEFAULT_EDITOR_PART_OPTIONS, IEditorGroupMenuIds, IEditorGroupsView, IEditorGroupView, IEditorPartsView } from '../../../../browser/parts/editor/editor.js';
import { BreadcrumbsService, IBreadcrumbsService } from '../../../../browser/parts/editor/breadcrumbs.js';
import { EditorTitleControl } from '../../../../browser/parts/editor/editorTitleControl.js';
import { IDecorationData, IDecorationsProvider, IDecorationsService } from '../../../../services/decorations/common/decorations.js';
import { DecorationsService } from '../../../../services/decorations/browser/decorationsService.js';
import { collectModernTabColorCustomizations } from '../../../../services/themes/browser/modernTabColorCustomizations.js';
import { ColorThemeData } from '../../../../services/themes/common/colorThemeData.js';
import { INotebookDocumentService, NotebookDocumentWorkbenchService } from '../../../../services/notebook/common/notebookDocumentService.js';
import { IOutlineService } from '../../../../services/outline/browser/outline.js';
import { LayoutSettings, ModernUIEditorTabStyle } from '../../../../services/layout/browser/layoutService.js';
import { TestContextService } from '../../../common/workbenchTestServices.js';
import { workbenchInstantiationService } from '../../workbenchTestServices.js';
import { ComponentFixtureAdditionalTheme, ComponentFixtureContext, createEditorServices, createTextModel, defineComponentFixture, defineThemedFixtureGroup } from '../fixtureUtils.js';
import '../../../../contrib/modernUI/browser/media/tabs.css';
import '../../../../contrib/modernUI/browser/connectedEditorTabs.js';
import '../../../../contrib/modernUI/browser/media/editorBorder.css';

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

export interface IEditorTabsFixtureOptions {
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
	readonly colorCustomizations?: Readonly<Record<string, string>>;
	readonly editorFrame?: boolean;
}

function customizeTheme(theme: IColorTheme, customizations: Readonly<Record<string, string>> | undefined): IColorTheme {
	if (!customizations) {
		return theme;
	}

	const colors = new Map(Object.entries(customizations).map(([colorId, value]) => [colorId, Color.fromHex(value)]));
	return new Proxy(theme, {
		get(target, property, receiver) {
			if (property === 'getColor') {
				return (colorId: string, useDefault?: boolean) => colors.get(colorId) ?? target.getColor(colorId, useDefault);
			}
			if (property === 'defines') {
				return (colorId: string) => colors.has(colorId) || target.defines(colorId);
			}
			if (property === 'getColorCustomization') {
				return (colorId: string) => colors.get(colorId);
			}
			return Reflect.get(target, property, receiver);
		}
	});
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

export function renderEditorTabsFixture(ctx: ComponentFixtureContext, options: IEditorTabsFixtureOptions): void {
	const { container, disposableStore, theme, fileIconTheme } = ctx;

	const width = options.width ?? 820;
	const isGroupActive = options.active ?? true;
	const partOptions = createPartOptions(options.partOptions);

	for (const [colorId, color] of Object.entries(options.colorCustomizations ?? {})) {
		container.style.setProperty(asCssVariableName(colorId), color);
	}

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
	const fixtureTheme = customizeTheme(theme, options.colorCustomizations);
	themeService.setTheme(fixtureTheme);
	themeService.setFileIconTheme(fileIconTheme);
	if (options.colorCustomizations) {
		collectModernTabColorCustomizations(fixtureTheme as ColorThemeData, (name, color) => container.style.setProperty(name, color.toString()));
	}

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

	const headerBackground = fixtureTheme.getColor(partOptions.showTabs === 'multiple' ? EDITOR_GROUP_HEADER_TABS_BACKGROUND : EDITOR_GROUP_HEADER_NO_TABS_BACKGROUND);
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
	if (options.editorFrame) {
		container.classList.add('floating-panels');
		const grid = $('.monaco-grid-view');
		grid.appendChild(editorPart);
		container.appendChild(grid);
	} else {
		container.appendChild(editorPart);
	}

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

function render(modernUI: boolean, options: Omit<IEditorTabsFixtureOptions, 'modernUI'>): (ctx: ComponentFixtureContext) => void {
	return (ctx: ComponentFixtureContext) => {
		ctx.container.classList.toggle('modern-ui', modernUI);
		renderEditorTabsFixture(ctx, { ...options, modernUI });
	};
}

function getLegacyEditorTabBorderCustomizations(): Readonly<Record<string, string>> {
	return {
		[TAB_ACTIVE_BORDER]: '#F43F5E',
		[TAB_ACTIVE_BORDER_TOP]: '#22D3EE',
		[TAB_BORDER]: '#FACC15',
		[TAB_DIVIDER]: '#FFFFFF',
		[TAB_HOVER_BORDER]: '#F97316',
		[TAB_UNFOCUSED_ACTIVE_BORDER]: '#FB923C',
		[TAB_UNFOCUSED_ACTIVE_BORDER_TOP]: '#C084FC',
		[TAB_UNFOCUSED_HOVER_BORDER]: '#A855F7',
		[TAB_SELECTED_BORDER_TOP]: '#A3E635',
	};
}

function getModernEditorTabColorCustomizations(theme: ComponentFixtureContext['theme']): Readonly<Record<string, string>> {
	const dark = isDark(theme.type);
	return {
		[MODERN_EDITOR_TAB_ACTIVE_BACKGROUND]: dark ? '#164E63' : '#BAE6FD',
		[MODERN_EDITOR_TAB_ACTIVE_ACTION_BACKGROUND]: dark ? '#0E3747' : '#7DD3FC',
		[MODERN_EDITOR_TAB_ACTIVE_FOREGROUND]: dark ? '#CFFAFE' : '#0C4A6E',
		[MODERN_EDITOR_TAB_INACTIVE_BACKGROUND]: dark ? '#1E293B' : '#E2E8F0',
		[MODERN_EDITOR_TAB_HOVER_BACKGROUND]: dark ? '#7C2D12' : '#FED7AA',
		[MODERN_EDITOR_TAB_HOVER_ACTION_BACKGROUND]: dark ? '#5A1F0C' : '#FDBA74',
		[MODERN_EDITOR_TAB_HOVER_FOREGROUND]: dark ? '#FFEDD5' : '#7C2D12',
		[MODERN_EDITOR_TAB_ACTIVE_HOVER_BACKGROUND]: dark ? '#6B21A8' : '#E9D5FF',
		[MODERN_EDITOR_TAB_ACTIVE_HOVER_ACTION_BACKGROUND]: dark ? '#4C1678' : '#D8B4FE',
		[MODERN_EDITOR_TAB_SELECTED_ACTION_BACKGROUND]: dark ? '#166534' : '#BBF7D0',
	};
}

function renderBorderOwnership(modernUI: boolean, editorTabStyle?: ModernUIEditorTabStyle): (ctx: ComponentFixtureContext) => void {
	return ctx => renderEditorTabsFixture(ctx, {
		modernUI,
		editorTabStyle,
		width: 1200,
		editors: [
			{ resource: file('/project/alpha.ts'), pinned: true },
			{ resource: file('/project/beta.ts'), pinned: true },
			{ resource: file('/project/gamma.ts'), pinned: true },
			{ resource: file('/project/delta.ts'), pinned: true, active: true },
			{ resource: file('/project/epsilon.ts'), pinned: true },
			{ resource: file('/project/zeta.ts'), pinned: true },
			{ resource: file('/project/eta.ts'), pinned: true },
			{ resource: file('/project/theta.ts'), pinned: true },
		],
		colorCustomizations: isHighContrast(ctx.theme.type) ? undefined : getLegacyEditorTabBorderCustomizations(),
	});
}

function renderConnectedLegacyBorders(active: boolean): (ctx: ComponentFixtureContext) => void {
	return render(true, {
		active,
		editors: multiSelectEditorSpecs(),
		colorCustomizations: getLegacyEditorTabBorderCustomizations(),
	});
}

function renderConnectedBorderContinuity(activeTabIndex: number): (ctx: ComponentFixtureContext) => void {
	return render(true, {
		editorFrame: true,
		editors: [
			{ resource: file('/project/alpha.ts'), pinned: true, active: activeTabIndex === 0 },
			{ resource: file('/project/beta.ts'), pinned: true, active: activeTabIndex === 1 },
			{ resource: file('/project/gamma.ts'), pinned: true, active: activeTabIndex === 2 },
		],
		colorCustomizations: {
			[EDITOR_BORDER]: '#22D3EE',
			[TAB_ACTIVE_BORDER_TOP]: '#22D3EE',
			[TAB_BORDER]: '#22D3EE',
			[TAB_DIVIDER]: '#00000000',
		},
	});
}

function renderWrappedConnectedBorderOwnership(): (ctx: ComponentFixtureContext) => void {
	return render(true, {
		width: 820,
		editors: manyEditorSpecs().slice(0, 10).map((spec, index) => ({ ...spec, active: index === 0 })),
		partOptions: { wrapTabs: true, editorActionsLocation: 'hidden' },
		colorCustomizations: getLegacyEditorTabBorderCustomizations(),
	});
}

function renderConnectedModernEditorTabCustomizations(): (ctx: ComponentFixtureContext) => void {
	return ctx => renderEditorTabsFixture(ctx, {
		modernUI: true,
		editorTabStyle: ModernUIEditorTabStyle.Connected,
		editors: [
			{ resource: file('/project/alpha.ts'), pinned: true, selected: true },
			{ resource: file('/project/beta.ts'), pinned: true, active: true, selected: true },
			{ resource: file('/project/gamma.ts'), pinned: true },
		],
		colorCustomizations: getModernEditorTabColorCustomizations(ctx.theme),
	});
}

function renderDensityLayout(layout: 'singleRow' | 'wrapped' | 'pinnedSeparateRow', tabHeight: IEditorPartOptions['tabHeight']): (ctx: ComponentFixtureContext) => Promise<void> | void {
	const wrapped = layout === 'wrapped';
	const renderFixture = layout === 'pinnedSeparateRow'
		? renderPinnedSeparateRow(tabHeight)
		: render(true, {
			partOptions: { wrapTabs: wrapped, tabHeight },
			editors: wrapped ? manyEditorSpecs() : undefined,
			width: wrapped ? 520 : undefined,
		});
	if (!wrapped) {
		return renderFixture;
	}
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

function createDensityFixtures() {
	return {
		PinnedSeparateRow: defineThemedFixtureGroup({
			Default: defineComponentFixture({
				render: renderDensityLayout('pinnedSeparateRow', 'default'),
				expectedVisualDescriptions: ['Default-density pinned and ordinary rows keep equal action targets and balanced edge clearance.'],
			}),
			Compact: defineComponentFixture({
				render: renderDensityLayout('pinnedSeparateRow', 'compact'),
				expectedVisualDescriptions: ['Compact-density pinned and ordinary rows stay aligned with centered actions.'],
			}),
		}),
		SingleRow: defineThemedFixtureGroup({
			Default: defineComponentFixture({
				render: renderDensityLayout('singleRow', 'default'),
				expectedVisualDescriptions: ['Default-density tabs preserve their standard hitbox height and centered actions.'],
			}),
			Compact: defineComponentFixture({
				render: renderDensityLayout('singleRow', 'compact'),
				expectedVisualDescriptions: ['Compact-density tabs preserve the same structure with shorter hitboxes and centered actions.'],
			}),
		}),
		Wrapped: defineThemedFixtureGroup({
			Default: defineComponentFixture({
				render: renderDensityLayout('wrapped', 'default'),
				additionalThemes: extendedTabThemes,
				expectedVisualDescriptions: ['Default-density tabs wrap into equal-height rows. Upper connected rows remain separate pills and the bottom selected tab joins the editor.'],
			}),
			Compact: defineComponentFixture({
				render: renderDensityLayout('wrapped', 'compact'),
				expectedVisualDescriptions: ['Compact-density tabs wrap into equal-height rows while labels and actions remain vertically centered.'],
			}),
		}),
	};
}

function createLayoutFixtures() {
	return {
		ActionsLeading: defineComponentFixture({
			render: render(true, { partOptions: { tabActionLocation: 'left' } }),
			expectedVisualDescriptions: ['Leading tab actions mirror the default trailing-action spacing without changing label alignment.'],
		}),
		CloseActionsHidden: defineComponentFixture({
			render: render(true, { partOptions: { tabActionCloseVisibility: false } }),
			expectedVisualDescriptions: ['Hiding Close actions removes their reserved controls without changing tab height or modified indicators.'],
		}),
		LongNamesFit: defineComponentFixture({
			render: render(true, { partOptions: { tabSizing: 'fit' }, editors: longLabelEditorSpecs(), width: 520 }),
			expectedVisualDescriptions: ['Fit-sized long labels use their natural widths and scroll rather than overlap actions.'],
		}),
		LongNamesFixed: defineComponentFixture({
			render: render(true, { partOptions: { tabSizing: 'fixed', tabSizingFixedMinWidth: 120, tabSizingFixedMaxWidth: 120 }, editors: longLabelEditorSpecs(), width: 520 }),
			expectedVisualDescriptions: ['Fixed-size long labels use equal tab widths, real ellipses, and stable action columns.'],
		}),
		LongNamesShrink: defineComponentFixture({
			render: render(true, { partOptions: { tabSizing: 'shrink' }, editors: longLabelEditorSpecs(), width: 520 }),
			expectedVisualDescriptions: ['Shrink-sized long labels ellipsize while preserving extensions and action targets.'],
		}),
		ModifiedAndMultiSelected: defineComponentFixture({
			render: render(true, { editors: multiSelectEditorSpecs() }),
			expectedVisualDescriptions: ['Modified and multi-selected tabs retain their indicators, selected boundaries, and active document connection.'],
		}),
		PinnedIconOnly: defineComponentFixture({
			render: render(true, { partOptions: { pinnedTabSizing: 'compact' }, editors: stickyEditorSpecs() }),
			expectedVisualDescriptions: ['Compact pinned tabs remain distinct from the normal active tab and preserve their icon-only hit targets.'],
		}),
		SingleEditor: defineComponentFixture({
			render: render(true, {
				editors: [{ resource: file('/project/README.md'), pinned: true, active: true }],
				partOptions: { editorActionsLocation: 'hidden' },
			}),
			additionalThemes: ['darkHighContrast', 'lightHighContrast'],
			expectedVisualDescriptions: ['A single editor retains balanced label and Close action spacing without crowding either connected shoulder.'],
		}),
	};
}

function renderPinnedSeparateRow(tabHeight: IEditorPartOptions['tabHeight']): (ctx: ComponentFixtureContext) => void {
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
			tabHeight,
			tabActionUnpinVisibility: true,
		},
	});
}

const extendedTabThemes: readonly ComponentFixtureAdditionalTheme[] = ['darkModern', 'light2026', 'darkPlus', 'lightPlus', 'visualStudioDark', 'visualStudioLight', 'darkHighContrast', 'lightHighContrast', 'abyss', 'monokai', 'quietLight', 'solarizedDark', 'solarizedLight'];

export default defineThemedFixtureGroup({ path: 'editor/' }, {
	Colors: defineThemedFixtureGroup({
		ConnectedLegacyBorders: defineThemedFixtureGroup({
			ActiveGroup: defineComponentFixture({
				render: renderConnectedLegacyBorders(true),
				expectedVisualDescriptions: ['The active connected tab shows customized focused top and bottom borders; selected tabs retain their selected accent.'],
			}),
			InactiveGroup: defineComponentFixture({
				render: renderConnectedLegacyBorders(false),
				expectedVisualDescriptions: ['The active connected tab shows customized unfocused top and bottom borders; selected tabs retain their selected accent.'],
			}),
		}),
		BorderOwnership: defineThemedFixtureGroup({
			Legacy: defineComponentFixture({
				render: renderBorderOwnership(false),
				themes: ['dark'],
				expectedVisualDescriptions: ['Legacy tabs retain standard indicators and use tab.border as the only shared-edge separator.'],
			}),
			Pill: defineComponentFixture({
				render: renderBorderOwnership(true, ModernUIEditorTabStyle.Pill),
				themes: ['dark'],
				additionalThemes: ['darkHighContrast', 'lightHighContrast'],
				expectedVisualDescriptions: ['Pill tabs use rounded tab boundaries and dedicated dividers in standard themes, without redundant HC dividers.'],
			}),
			Connected: defineComponentFixture({
				render: renderBorderOwnership(true, ModernUIEditorTabStyle.Connected),
				themes: ['dark'],
				additionalThemes: ['darkHighContrast', 'lightHighContrast'],
				expectedVisualDescriptions: ['Connected tabs give the active cap boundary ownership and show dividers only between inactive tabs in standard themes.'],
			}),
			ConnectedWrapped: defineComponentFixture({
				render: renderWrappedConnectedBorderOwnership(),
				themes: ['dark'],
				expectedVisualDescriptions: ['Upper wrapped tabs retain pill geometry with inset customized accents.'],
			}),
			ConnectedModernEditorTokens: defineComponentFixture({
				render: renderConnectedModernEditorTabCustomizations(),
				themes: ['dark'],
				expectedVisualDescriptions: ['Connected tabs honor every explicitly customized modernEditorTab fill, label, and action color.'],
			}),
		}),
		Continuity: defineThemedFixtureGroup({
			FirstActive: defineComponentFixture({
				render: renderConnectedBorderContinuity(0),
				themes: ['dark'],
				expectedVisualDescriptions: ['The first active connected tab joins the customized outer editor frame without a duplicate left edge.'],
			}),
			MiddleActive: defineComponentFixture({
				render: renderConnectedBorderContinuity(1),
				themes: ['dark'],
				expectedVisualDescriptions: ['The middle active connected tab has one continuous customized cap and document boundary.'],
			}),
		}),
	}),
	Density: defineThemedFixtureGroup(createDensityFixtures()),
	FileIcons: defineThemedFixtureGroup({
		Disabled: defineComponentFixture({
			fileIconTheme: 'none',
			render: render(true, {}),
			expectedVisualDescriptions: ['Tabs without a file icon theme use the same balanced iconless leading spacing as the Show Icons disabled setting.'],
		}),
		Minimal: defineComponentFixture({ fileIconTheme: 'vs-minimal', render: render(true, {}) }),
	}),
	Layout: defineThemedFixtureGroup(createLayoutFixtures()),
	Scrolling: defineThemedFixtureGroup({
		Breadcrumbs: defineComponentFixture({
			render: render(true, {
				partOptions: { titleScrollbarVisibility: 'visible' },
				breadcrumbs: {},
				editors: manyEditorSpecs(5),
				width: 360,
			}),
			expectedVisualDescriptions: ['The horizontal tab scrollbar, connected strip separator, and breadcrumb border remain distinct and aligned while the active tab is revealed within an overflowing strip.'],
		}),
		ClippedActiveTab: defineComponentFixture({
			render: render(true, { editors: manyEditorSpecs(), width: 360, activeTabClipping: 'left' }),
			expectedVisualDescriptions: ['A partially scrolled selected tab closes its stationary outside stroke with a rounded cap and continuous separator.'],
		}),
		StickyPinnedTabs: defineComponentFixture({
			render: render(true, {
				partOptions: { pinnedTabSizing: 'compact', editorActionsLocation: 'hidden' },
				editors: stickyEditorSpecs(),
				width: 250,
				activeTabClipping: 'left',
			}),
			expectedVisualDescriptions: ['Compact pinned tabs fully occlude scrolled content. The adjacent selected cap remains rounded with no seam or content leakage.'],
		}),
	}),
	TabStyles: defineThemedFixtureGroup({
		Connected: defineComponentFixture({
			render: render(true, {}),
			additionalThemes: extendedTabThemes,
			expectedVisualDescriptions: [
				'Connected tabs use the dedicated connected strip color while the active tab remains joined to the editor surface.',
			],
		}),
		Legacy: defineComponentFixture({
			render: render(false, {}),
			additionalThemes: extendedTabThemes,
			expectedVisualDescriptions: [
				'With Modern UI disabled, the legacy tab strip and inactive tabs retain the theme legacy background instead of adopting the connected-tab strip color.',
			],
		}),
		Pill: defineComponentFixture({
			render: render(true, { editorTabStyle: ModernUIEditorTabStyle.Pill }),
			additionalThemes: extendedTabThemes,
			expectedVisualDescriptions: [
				'Pill tabs retain their transparent modern surface and separate rounded geometry instead of adopting the connected-tab strip color.',
			],
		}),
	}),
});
