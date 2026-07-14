/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, Dimension } from '../../../../../base/browser/dom.js';
import { SubmenuAction } from '../../../../../base/common/actions.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Event } from '../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../base/common/network.js';
import { basename, dirname } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { localize2 } from '../../../../../nls.js';
import { getActionBarActions } from '../../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { IMenuService, MenuId, MenuRegistry } from '../../../../../platform/actions/common/actions.js';
import { MenuService } from '../../../../../platform/actions/common/menuService.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { ContextKeyService } from '../../../../../platform/contextkey/browser/contextKeyService.js';
import { listErrorForeground, listWarningForeground } from '../../../../../platform/theme/common/colors/listColors.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { TestThemeService } from '../../../../../platform/theme/test/common/testThemeService.js';
import { ITreeViewsDnDService } from '../../../../../editor/common/services/treeViewsDndService.js';
import { TreeViewsDnDService } from '../../../../../editor/common/services/treeViewsDnd.js';
import { EditorInput } from '../../../../common/editor/editorInput.js';
import { EditorInputCapabilities, EditorsOrder, IEditorPartOptions, Verbosity } from '../../../../common/editor.js';
import { EditorGroupModel } from '../../../../common/editor/editorGroupModel.js';
import { EDITOR_GROUP_HEADER_NO_TABS_BACKGROUND, EDITOR_GROUP_HEADER_TABS_BACKGROUND } from '../../../../common/theme.js';
import { DEFAULT_EDITOR_PART_OPTIONS, IEditorGroupsView, IEditorGroupView, IEditorPartsView } from '../../../../browser/parts/editor/editor.js';
import { EditorTitleControl } from '../../../../browser/parts/editor/editorTitleControl.js';
import { IDecorationData, IDecorationsProvider, IDecorationsService } from '../../../../services/decorations/common/decorations.js';
import { DecorationsService } from '../../../../services/decorations/browser/decorationsService.js';
import { INotebookDocumentService, NotebookDocumentWorkbenchService } from '../../../../services/notebook/common/notebookDocumentService.js';
import { workbenchInstantiationService } from '../../workbenchTestServices.js';
import { ComponentFixtureContext, defineComponentFixture, defineThemedFixtureGroup } from '../fixtureUtils.js';

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

/** Two editors sharing a name but living in different folders (to show descriptions). */
function duplicateNameEditorSpecs(): IEditorSpec[] {
	return [
		{ resource: file('/project/src/app/index.ts'), pinned: true, active: true },
		{ resource: file('/project/src/lib/index.ts'), pinned: true },
		{ resource: file('/project/src/lib/util/index.ts'), pinned: true },
		{ resource: file('/project/tests/index.ts'), pinned: true },
	];
}

/** A larger set of editors, useful for wrapping / scrollbar / label variants. */
function manyEditorSpecs(): IEditorSpec[] {
	const names = [
		'main.ts', 'index.ts', 'button.tsx', 'input.tsx', 'list.tsx', 'tree.tsx',
		'model.ts', 'service.ts', 'view.ts', 'controller.ts', 'utils.ts', 'types.ts',
		'app.css', 'theme.css', 'README.md', 'package.json',
	];
	return names.map((name, index) => ({
		resource: file(`/project/src/module${index % 4}/${name}`),
		pinned: true,
		active: index === 0,
		dirty: index % 5 === 0,
	}));
}

/** Editors with dirty state to show modified indicators. */
function dirtyEditorSpecs(): IEditorSpec[] {
	return [
		{ resource: file('/project/src/app/main.ts'), pinned: true, dirty: true, active: true },
		{ resource: file('/project/src/app/index.ts'), pinned: true, dirty: true },
		{ resource: file('/project/README.md'), pinned: true },
		{ resource: file('/project/package.json'), pinned: true, dirty: true },
	];
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

/** A single dirty, pinned editor for the single-tab control. */
function singleDirtyEditorSpecs(): IEditorSpec[] {
	return [
		{ resource: file('/project/src/app/main.ts'), icon: ThemeIcon.fromId(Codicon.symbolFile.id), pinned: true, dirty: true, active: true },
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

/**
 * Contributes fake actions to `MenuId.EditorTitle` so the editor-actions toolbar
 * renders through the real menu path (like production): one in the `navigation`
 * group (shown inline) and one in a non-navigation group (shown in the overflow
 * `...` menu). None declare a `when` clause so they survive context filtering.
 */
function registerFixtureEditorTitleActions(store: DisposableStore): void {
	store.add(MenuRegistry.appendMenuItem(MenuId.EditorTitle, {
		command: {
			id: 'fixture.splitEditorRight',
			title: localize2('fixtureSplitEditorRight', 'Split Editor Right'),
			icon: Codicon.splitHorizontal,
		},
		group: 'navigation',
		order: 1,
	}));
	store.add(MenuRegistry.appendMenuItem(MenuId.EditorTitle, {
		command: {
			id: 'fixture.openEditor',
			title: localize2('fixtureOpenEditor', 'Open Editor...'),
			icon: Codicon.goToFile,
		},
		group: '1_fixture',
		order: 1,
	}));
}

// ============================================================================
// Rendering
// ============================================================================

interface IRenderOptions {
	readonly partOptions?: Partial<IEditorPartOptions>;
	readonly editors?: IEditorSpec[];
	readonly width?: number;
	/** Whether this group is the active group. Inactive groups exercise the
	 *  `alwaysShowEditorActions` filtering and unfocused tab styling. */
	readonly active?: boolean;
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

function renderTabBar(ctx: ComponentFixtureContext, options: IRenderOptions): void {
	const { container, disposableStore, theme } = ctx;

	const width = options.width ?? 820;
	const isGroupActive = options.active ?? true;
	const partOptions = createPartOptions(options.partOptions);

	// Breadcrumbs are disabled so the tab bar renders without the breadcrumbs picker/model deps.
	const configurationService = new TestConfigurationService();
	configurationService.setUserConfiguration('breadcrumbs', { enabled: false });

	const instantiationService = workbenchInstantiationService({
		configurationService: () => configurationService,
	}, disposableStore);

	// Feed the fixture's themed colors to the shared theme service so tab-bar `getColor(...)` resolves.
	(instantiationService.get(IThemeService) as TestThemeService).setTheme(theme);

	// Services the base workbench harness does not stub but the tab bar needs.
	instantiationService.stub(ITreeViewsDnDService, new TreeViewsDnDService());
	instantiationService.stub(INotebookDocumentService, new NotebookDocumentWorkbenchService());

	// Real menu service (the harness stubs an empty one) + fake `MenuId.EditorTitle` actions so the
	// editor-actions toolbar is populated through the production menu path. A real context key service
	// is required too: the mock's `contextMatchesRules` rejects every item (even those without a
	// `when`), which would filter our actions out of the menu.
	const contextKeyService = disposableStore.add(instantiationService.createInstance(ContextKeyService));
	instantiationService.stub(IContextKeyService, contextKeyService);
	const menuService = disposableStore.add(instantiationService.createInstance(MenuService));
	instantiationService.stub(IMenuService, menuService);
	registerFixtureEditorTitleActions(disposableStore);

	// Real decorations service + provider so resource labels get deterministic badges/colors
	// (the `decorations` setting then has something to toggle).
	const decorationsService = disposableStore.add(instantiationService.createInstance(DecorationsService));
	instantiationService.stub(IDecorationsService, decorationsService);
	registerFixtureDecorations(decorationsService, disposableStore);

	// Real editor group model populated with the fixture editors.
	const model = disposableStore.add(instantiationService.createInstance(EditorGroupModel, undefined));
	populateModel(model, options.editors ?? defaultEditorSpecs(), disposableStore);

	// Builds the editor-title actions from the real menu, mirroring `EditorGroupView.createEditorActions`:
	// `navigation`-group items become primary (inline), all others become secondary (overflow `...`).
	const createEditorActions = (disposables: DisposableStore, menuId: MenuId) => {
		const menu = disposables.add(menuService.createMenu(menuId, contextKeyService, { emitEventsForSubmenuChanges: true, eventDebounceDelay: 0 }));
		const shouldInlineGroup = (action: SubmenuAction, group: string) => group === 'navigation' && action.actions.length <= 1;
		const actions = getActionBarActions(menu.getActions({ shouldForwardArgs: true, renderShortTitle: true }), 'navigation', shouldInlineGroup);
		return { actions, onDidChange: menu.onDidChange };
	};

	// Lightweight stand-ins for the production `EditorGroupView` / `EditorPart` views.
	const groupView = new class extends mock<IEditorGroupView>() {
		relayoutFn: () => void = () => { };
		override get id() { return model.id; }
		override get count() { return model.count; }
		override get activeEditor() { return model.activeEditor; }
		override get activeEditorPane() { return undefined; }
		override get selectedEditors() { return model.selectedEditors; }
		override get ariaLabel() { return 'Editor Group 1'; }
		override getEditorByIndex(index: number) { return model.getEditorByIndex(index); }
		override getIndexOfEditor(editor: EditorInput) { return model.indexOf(editor); }
		override getEditors(order: EditorsOrder, opts?: { excludeSticky?: boolean }) { return model.getEditors(order, opts); }
		override isActive(editor: EditorInput) { return model.isActive(editor); }
		override isPinned(editorOrIndex: EditorInput | number) { return model.isPinned(editorOrIndex); }
		override isSticky(editorOrIndex: EditorInput | number) { return model.isSticky(editorOrIndex); }
		override isSelected(editorOrIndex: EditorInput | number) { return model.isSelected(editorOrIndex); }
		override createEditorActions(disposables: DisposableStore, menuId = MenuId.EditorTitle) { return createEditorActions(disposables, menuId); }
		override relayout() { this.relayoutFn(); }
	};

	// Separate reference returned as the active group when this group is inactive, so that
	// `groupsView.activeGroup === groupView` is false and inactive-group behavior is exercised.
	const otherActiveGroup = new class extends mock<IEditorGroupView>() {
		override focus() { }
	};

	const groupsView = new class extends mock<IEditorGroupsView>() {
		override get partOptions() { return partOptions; }
		override get activeGroup() { return isGroupActive ? groupView : otherActiveGroup; }
		override get groups() { return [groupView]; }
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
	const content = $('.content');
	const groupContainer = $(isGroupActive ? '.editor-group-container.active' : '.editor-group-container');
	const titleContainer = $('.title');
	titleContainer.classList.toggle('tabs', partOptions.showTabs === 'multiple');
	titleContainer.classList.toggle('show-file-icons', partOptions.showIcons);

	const headerBackground = theme.getColor(partOptions.showTabs === 'multiple' ? EDITOR_GROUP_HEADER_TABS_BACKGROUND : EDITOR_GROUP_HEADER_NO_TABS_BACKGROUND);
	if (headerBackground) {
		titleContainer.style.backgroundColor = headerBackground.toString();
	}

	const editorContainer = $('.editor-container');
	editorContainer.style.height = '96px';
	editorContainer.style.opacity = '0.6';

	editorPart.appendChild(content);
	content.appendChild(groupContainer);
	groupContainer.appendChild(titleContainer);
	groupContainer.appendChild(editorContainer);
	container.appendChild(editorPart);

	container.style.width = `${width}px`;
	groupContainer.style.width = `${width}px`;

	const titleControl = disposableStore.add(instantiationService.createInstance(
		EditorTitleControl,
		titleContainer,
		editorPartsView,
		groupsView,
		groupView,
		model,
		undefined,
	));

	const layout = () => {
		titleControl.layout({
			container: new Dimension(width, titleControl.getHeight().total),
			available: new Dimension(width, 200),
		});
	};
	groupView.relayoutFn = layout;

	titleControl.openEditors(model.getEditors(EditorsOrder.SEQUENTIAL));
	titleControl.setActive(isGroupActive);
	layout();
}

function render(options: IRenderOptions): (ctx: ComponentFixtureContext) => void {
	return (ctx: ComponentFixtureContext) => renderTabBar(ctx, options);
}

// ============================================================================
// Fixtures — at least one per setting that affects the tab bar, plus notable
// UI states / edge cases and setting combinations.
// ============================================================================

export default defineThemedFixtureGroup({ path: 'editor/editorTabBar/' }, {
	// Baseline: multiple tabs with mixed sticky / pinned / preview / dirty state.
	Default: defineComponentFixture({ render: render({}) }),

	// showTabs
	ShowTabsSingle: defineComponentFixture({ render: render({ partOptions: { showTabs: 'single' } }) }),
	ShowTabsNone: defineComponentFixture({ render: render({ partOptions: { showTabs: 'none' } }) }),

	// pinnedTabsOnSeparateRow
	PinnedTabsOnSeparateRow: defineComponentFixture({ render: render({ partOptions: { pinnedTabsOnSeparateRow: true }, editors: stickyEditorSpecs() }) }),

	// tabSizing
	TabSizingShrink: defineComponentFixture({ render: render({ partOptions: { tabSizing: 'shrink' }, editors: manyEditorSpecs() }) }),
	TabSizingFixed: defineComponentFixture({ render: render({ partOptions: { tabSizing: 'fixed', tabSizingFixedMinWidth: 60, tabSizingFixedMaxWidth: 120 }, editors: manyEditorSpecs() }) }),

	// tabHeight
	TabHeightCompact: defineComponentFixture({ render: render({ partOptions: { tabHeight: 'compact' } }) }),

	// wrapTabs
	WrapTabs: defineComponentFixture({ render: render({ partOptions: { wrapTabs: true }, editors: manyEditorSpecs(), width: 520 }) }),

	// tabActionLocation
	TabActionLocationLeft: defineComponentFixture({ render: render({ partOptions: { tabActionLocation: 'left' } }) }),

	// tabActionCloseVisibility
	TabActionCloseHidden: defineComponentFixture({ render: render({ partOptions: { tabActionCloseVisibility: false } }) }),

	// tabActionUnpinVisibility (with sticky/compact tabs where the unpin action shows)
	TabActionUnpinHidden: defineComponentFixture({ render: render({ partOptions: { tabActionUnpinVisibility: false, pinnedTabSizing: 'normal' }, editors: stickyEditorSpecs() }) }),

	// showTabIndex
	ShowTabIndex: defineComponentFixture({ render: render({ partOptions: { showTabIndex: true } }) }),

	// highlightModifiedTabs
	HighlightModifiedTabs: defineComponentFixture({ render: render({ partOptions: { highlightModifiedTabs: true }, editors: dirtyEditorSpecs() }) }),

	// labelFormat
	LabelFormatShort: defineComponentFixture({ render: render({ partOptions: { labelFormat: 'short' }, editors: duplicateNameEditorSpecs() }) }),
	LabelFormatMedium: defineComponentFixture({ render: render({ partOptions: { labelFormat: 'medium' }, editors: duplicateNameEditorSpecs() }) }),
	LabelFormatLong: defineComponentFixture({ render: render({ partOptions: { labelFormat: 'long' }, editors: duplicateNameEditorSpecs() }) }),

	// showIcons
	ShowIconsOff: defineComponentFixture({ render: render({ partOptions: { showIcons: false } }) }),

	// decorations (file-decoration badges + colors)
	DecorationsOff: defineComponentFixture({ render: render({ partOptions: { decorations: { badges: false, colors: false } } }) }),

	// pinnedTabSizing
	PinnedTabSizingCompact: defineComponentFixture({ render: render({ partOptions: { pinnedTabSizing: 'compact' }, editors: stickyEditorSpecs() }) }),
	PinnedTabSizingShrink: defineComponentFixture({ render: render({ partOptions: { pinnedTabSizing: 'shrink' }, editors: stickyEditorSpecs() }) }),

	// titleScrollbarSizing
	TitleScrollbarLarge: defineComponentFixture({ render: render({ partOptions: { titleScrollbarSizing: 'large' }, editors: manyEditorSpecs(), width: 520 }) }),

	// titleScrollbarVisibility (always-visible scrollbar with overflowing tabs)
	TitleScrollbarVisible: defineComponentFixture({ render: render({ partOptions: { titleScrollbarVisibility: 'visible' }, editors: manyEditorSpecs(), width: 520 }) }),

	// editorActionsLocation
	EditorActionsHidden: defineComponentFixture({ render: render({ partOptions: { editorActionsLocation: 'hidden' } }) }),

	// alwaysShowEditorActions (only affects inactive groups, so render this group inactive)
	AlwaysShowEditorActions: defineComponentFixture({ render: render({ partOptions: { alwaysShowEditorActions: true }, active: false }) }),

	// --- UI states / edge cases (not tied to a single setting) ---

	// Multi-selection: several tabs in the selected state at once.
	MultiSelect: defineComponentFixture({ render: render({ editors: multiSelectEditorSpecs() }) }),

	// Inactive group: unfocused tab styling and the unfocused modified-tab borders.
	InactiveGroup: defineComponentFixture({ render: render({ active: false }) }),

	// Inactive group with dirty editors: exercises the unfocused modified-border color path.
	InactiveGroupDirty: defineComponentFixture({ render: render({ editors: dirtyEditorSpecs(), active: false }) }),

	// Very long labels: tab-label truncation / ellipsis with shrinking tabs.
	LongLabelsShrink: defineComponentFixture({ render: render({ partOptions: { tabSizing: 'shrink' }, editors: longLabelEditorSpecs(), width: 520 }) }),

	// --- Notable setting combinations ---

	// Sticky compact tabs with icons disabled: the sticky tab falls back to the
	// first letter of the name instead of an icon.
	StickyCompactNoIcons: defineComponentFixture({ render: render({ partOptions: { pinnedTabSizing: 'compact', showIcons: false }, editors: stickyEditorSpecs() }) }),

	// Single-tab mode with a dirty editor: the single tab control renders the dirty dot.
	SingleTabDirty: defineComponentFixture({ render: render({ partOptions: { showTabs: 'single' }, editors: singleDirtyEditorSpecs() }) }),

	// Pinned tabs on a separate row combined with compact pinned sizing.
	PinnedSeparateRowCompact: defineComponentFixture({ render: render({ partOptions: { pinnedTabsOnSeparateRow: true, pinnedTabSizing: 'compact' }, editors: stickyEditorSpecs() }) }),
});
