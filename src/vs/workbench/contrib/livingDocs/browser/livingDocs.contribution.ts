/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { disposableTimeout } from '../../../../base/common/async.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { lockAllSashes } from '../../../../base/browser/ui/sash/sash.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import { IKeybindings, KeybindingsRegistry } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { localize, localize2 } from '../../../../nls.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { IConfigurationRegistry, Extensions as ConfigurationExtensions } from '../../../../platform/configuration/common/configurationRegistry.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { registerIcon } from '../../../../platform/theme/common/iconRegistry.js';
import { EditorPaneDescriptor, IEditorPaneRegistry } from '../../../browser/editor.js';
import { ViewPaneContainer } from '../../../browser/parts/views/viewPaneContainer.js';
import { registerWorkbenchContribution2, WorkbenchPhase, IWorkbenchContribution } from '../../../common/contributions.js';
import { EditorExtensions } from '../../../common/editor.js';
import { Extensions as ViewExtensions, IViewContainersRegistry, IViewDescriptor, IViewsRegistry, ViewContainer, ViewContainerLocation } from '../../../common/views.js';
import { IEditorResolverService, RegisteredEditorPriority } from '../../../services/editor/common/editorResolverService.js';
import { IEditorGroupsService } from '../../../services/editor/common/editorGroupsService.js';
import { IWorkbenchLayoutService, Parts } from '../../../services/layout/browser/layoutService.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { DOCUMENTS_CONTAINER_ID, DOCUMENTS_VIEW_ID, ILivingDocsService, REVIEW_RAIL_CONTAINER_ID, REVIEW_RAIL_VIEW_ID } from '../common/livingDocs.js';
import { LivingDocEditor } from './livingDocEditor.js';
import { LivingDocEditorInput, LIVING_DOC_EDITOR_ID } from './livingDocEditorInput.js';
import { LivingDocsService } from './livingDocsService.js';
import { ReviewRailView } from './reviewRailView.js';
import { TreeRailView } from './treeRailView.js';
import { ScreenEditor } from './screenEditor.js';
import { ScreenEditorInput } from './screenEditorInput.js';
import { ScreenLauncherView } from './screenLauncherView.js';
import { EditorNavLauncherView, openEditorNavTarget } from './editorNavLauncherView.js';
import { ScreenId } from './screenRender.js';

// The built-in IDE view containers (Search, Source Control, Run and Debug, Extensions) are the
// icon-nav "this is an IDE" tells, so they are deregistered, leaving the living-docs nav items.
// v6 (decision 42, plan 14): the native File Explorer was previously KEPT so the core authoring
// loop could create folders/files on disk from a real file tree (F1).
// plan 25 iter 2 (decision D25-C): the redesign comp (Part C1) shows EXACTLY five nav items
// (Home . Editor . Templates . Knowledge . Agents) over a single tree-rail. The Explorer's own
// activity-bar icon is redundant with that tree-rail (Files / Context / Outline already fronts the
// on-disk folder) and its long "Explorer" label overflowed the 60px labeled item, so the Explorer
// container is now deregistered here too. This does NOT remove disk access: the custom Workspace
// tree-rail (DOCUMENTS_CONTAINER_ID, isDefault below) remains the primary sidebar and still lists /
// creates real files. Logged in 03-merge-tax-ledger.md + 07-decision-log.md.
const IDE_VIEW_CONTAINER_IDS = [
	'workbench.view.search',
	'workbench.view.scm',
	'workbench.view.debug',
	'workbench.view.extensions',
	'workbench.view.explorer',
];

// --- service ---
registerSingleton(ILivingDocsService, LivingDocsService, InstantiationType.Delayed);

// --- configuration ---
Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration({
	id: 'livingDocs',
	order: 100,
	title: localize('livingDocs.config.title', "Living Documents"),
	type: 'object',
	properties: {
		'livingDocs.useModel': {
			type: 'boolean',
			default: true,
			description: localize('livingDocs.useModel', "Use a language model to rewrite narrative commentary when a source changes. When off, or when no model is available, a deterministic built-in heuristic is used instead."),
		},
		'livingDocs.commentaryModel': {
			type: 'string',
			default: '',
			description: localize('livingDocs.commentaryModel', "Claude model id used for narrative rewrites and the Strategy grader. Leave empty to use the default ({0}).", 'claude-opus-4-8'),
		},
		'livingDocs.modelProxyUrl': {
			type: 'string',
			default: 'http://localhost:8090',
			description: localize('livingDocs.modelProxyUrl', "Base URL of the local Anthropic OAuth proxy (scripts/lwd-anthropic-proxy.js) the renderer calls for model-backed features. The proxy holds the developer's OAuth token server-side; no credential is ever embedded in the app."),
		},
	},
});

// --- calm shell: hide the IDE chrome by registering product setting defaults ---
// (plan 16 iter 1, decision 54). The product is a document tool, not an editor, so the workbench
// shell parts are OFF by default: the status-bar footer, the activity-bar icon column, the editor
// tab strip, and the breadcrumb. These are all real, user-overridable settings, so this is an
// ADDITIVE CONTRIBUTION (no core patch) -- a user who wants the IDE shell back can flip any of them.
// The calm topbar + the tree-rail inside the document surface are the chrome that stays; the desktop
// title bar (OS window controls) is intentionally NOT touched here. Logged in 06-design-notes ledger.
// Registered at module load (an import side effect, the earliest phase) so the layout reads these as
// the effective defaults on its first startup pass, before any part is laid out.
// (plan 16 iter 2, decision 55) ALSO kill the cold-launch noise + trust leaks by the same additive
// config-default route: trust the product's own workspaces (no Restricted-Mode banner), skip the
// Copilot onboarding modal + the welcome page, hide the built-in GitHub Copilot AI chrome (the
// Sign-In button + Copilot status -- the product has its OWN chat in the Review rail), and replace
// the "${rootName} [remote]" title with just the document name. All user-overridable settings, so
// still 0 core patches. Logged in 06-design-notes ledger D8.
Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerDefaultConfigurations([{
	overrides: {
		// iter 1 -- strip the IDE shell parts
		'workbench.statusBar.visible': false,
		'workbench.activityBar.location': 'hidden',
		'workbench.editor.showTabs': 'none',
		'breadcrumbs.enabled': false,
		// iter 2 -- kill the cold-launch noise + trust leaks
		'security.workspace.trust.enabled': false,
		'workbench.welcomePage.experimentalOnboarding': false,
		'workbench.startupEditor': 'none',
		'chat.disableAIFeatures': true,
		// (plan 33 iter 1, decision 95, leaks L1/L2/L4) -- close the last title-bar leaks by the SAME
		// additive config-default route (no core patch). The native title bar on screen surfaces was still
		// showing the command-centre "Review Project" search pill, the layout-toggle icons and the
		// editor-group action icons; the window/tab title still read the old brand. All three are real,
		// user-overridable workbench settings, so turning them off by default stays an additive contribution.
		'window.commandCenter': false,
		'workbench.layoutControl.enabled': false,
		'workbench.editor.editorActionsLocation': 'hidden',
		// The window/tab title is the workspace (project) name then the brand, e.g. "Project Brief - Abstract".
		// ${separator} collapses when a token is empty, so a no-folder window reads simply "Abstract".
		'window.title': '${rootName}${separator}Abstract',
		// (plan 33 iter 3, L4 follow-up) VS Code's default title separator on macOS is " — " (an EM DASH),
		// so the brand title rendered "Project - Abstract" with an em dash - an old-brand-adjacent leak the
		// iter-1 verification missed (the web tab title, not the OS title bar). Pin it to a plain " - " so the
		// user-visible window/tab title carries no em dash, on every platform. Settings tier, no core patch.
		'window.titleSeparator': ' - ',
		// iter 4 (decision 57) -- hide the internal plumbing from the native Explorer. `.lock.json`
		// (provenance/claim sidecars) and `agents.json` (the agent registry) are implementation detail, not
		// documents. Object-valued default configurations MERGE in VS Code, so these patterns ADD to the
		// built-in excludes (`.git`, `.DS_Store`, ...) rather than replacing them. The files stay on disk;
		// the user just never sees them in their document list. The custom tree-rail already shows only `.md`.
		'files.exclude': {
			'**/*.lock.json': true,
			'**/agents.json': true,
			// (plan 33 iter 2, L5) the project-name marker is plumbing, not a document.
			'**/.abstract-name': true,
		},
	}
}]);

// --- calm shell: neutralise the residual IDE keyboard chords (plan 33 iter 3, L3/L6) ---
// The command-palette + quick-open chords were already removed at the core seam (the decision-30 pattern,
// v3 iter 2, guarded by check-seams). A SECOND tier of IDE chords still fired on our surfaces: the
// view-container switches (Cmd+Shift+E/F/G/X/M) open containers we have DEREGISTERED (Explorer, Search,
// SCM, Extensions, Problems), and the panel / integrated-terminal / secondary-side-bar toggles surface IDE
// affordances that the contextual rails (decision 94: the rails are editor companions) have made redundant.
// We neutralise each leaking chord the cheapest way - an ADDITIVE keybinding contribution that shadows the
// chord with the built-in `noop` command at a weight above every core/extension binding, so the chord is
// swallowed with NO core patch (KeybindingsRegistry is a public registry, called from our own module).
// The primary Side Bar chord (Cmd+B) is deliberately KEPT: it collapses the tree-rail (a first-class
// product surface) and doubles as Bold inside the ProseMirror writing surface. Full verdict per chord in
// docs/plans/33-verify/keyboard-audit.md.
const NEUTRALISED_IDE_CHORDS: readonly IKeybindings[] = [
	{ primary: KeyMod.CtrlCmd | KeyCode.KeyJ },																// workbench.action.togglePanel - no panel in the calm shell
	{ primary: KeyMod.CtrlCmd | KeyCode.Backquote, mac: { primary: KeyMod.WinCtrl | KeyCode.Backquote } },	// terminal.toggleTerminal
	{ primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KeyB },													// toggleAuxiliaryBar (Secondary Side Bar) - the L3 tooltip chord
	{ primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyE },													// Explorer viewlet (deregistered)
	{ primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyF },													// Search viewlet (deregistered)
	{ primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyG, mac: { primary: KeyMod.WinCtrl | KeyMod.Shift | KeyCode.KeyG } },	// SCM (deregistered)
	{ primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyX },													// Extensions viewlet (deregistered)
	{ primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyM },													// Problems panel
];
for (const chord of NEUTRALISED_IDE_CHORDS) {
	// Weight 1000 sits above ExternalExtension (400) so this swallow always wins the chord resolution.
	KeybindingsRegistry.registerKeybindingRule({ id: 'noop', weight: 1000, when: undefined, ...chord });
}

// --- editor pane ---
Registry.as<IEditorPaneRegistry>(EditorExtensions.EditorPane).registerEditorPane(
	EditorPaneDescriptor.create(LivingDocEditor, LivingDocEditor.ID, localize('livingDocEditor', "Living Document")),
	[new SyncDescriptor(LivingDocEditorInput)]
);

// The main-area Abstract screens (Templates / Knowledge / Agents) share one webview editor.
Registry.as<IEditorPaneRegistry>(EditorExtensions.EditorPane).registerEditorPane(
	EditorPaneDescriptor.create(ScreenEditor, ScreenEditor.ID, localize('livingDocsScreen', "Abstract")),
	[new SyncDescriptor(ScreenEditorInput)]
);

// --- editor resolver: open Markdown in the Living Document editor by default ---
// The product is a word processor, so we claim every *.md as the default editor (rendered view
// with an in-editor Raw Markdown toggle). The built-in text editor stays one click away via
// "Reopen Editor With... > Text Editor", so README-style raw editing is never blocked.
class LivingDocsEditorResolverContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.livingDocs.editorResolver';

	constructor(
		@IEditorResolverService editorResolverService: IEditorResolverService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();
		this._register(editorResolverService.registerEditor(
			'**/*.md',
			{
				id: LIVING_DOC_EDITOR_ID,
				label: localize('livingDoc.label', "Living Document"),
				priority: RegisteredEditorPriority.default,
			},
			{
				singlePerResource: true,
				canSupportResource: uri => uri.path.endsWith('.md'),
			},
			{
				createEditorInput: ({ resource, options }) => ({
					editor: instantiationService.createInstance(LivingDocEditorInput, resource),
					options,
				}),
			}
		));
	}
}
registerWorkbenchContribution2(LivingDocsEditorResolverContribution.ID, LivingDocsEditorResolverContribution, WorkbenchPhase.BlockRestore);

// --- the left tree-rail in the primary sidebar (one rail: Files / Context / Outline / Search + a
// folder tree, replacing the file Explorer AND the spike-era separate Documents + Context containers).
// The single TreeRailView holds the tabbed rail (decision log 23). ADDITIVE-CONTRIBUTION (merge-tax ledger).
const workspaceIcon = registerIcon('living-docs-workspace', Codicon.listTree, localize('livingDocs.workspaceIcon', "Workspace tree-rail"));

const workspaceContainer: ViewContainer = Registry.as<IViewContainersRegistry>(ViewExtensions.ViewContainersRegistry).registerViewContainer({
	id: DOCUMENTS_CONTAINER_ID,
	title: localize2('livingDocs.workspace', "Workspace"),
	icon: workspaceIcon,
	ctorDescriptor: new SyncDescriptor(ViewPaneContainer, [DOCUMENTS_CONTAINER_ID, { mergeViewWithContainerWhenSingleView: true }]),
	storageId: DOCUMENTS_CONTAINER_ID,
	hideIfEmpty: false,
	order: 0,
}, ViewContainerLocation.Sidebar, { isDefault: true });

const treeRailViewDescriptor: IViewDescriptor = {
	id: DOCUMENTS_VIEW_ID,
	name: localize2('livingDocs.workspaceView', "Workspace"),
	containerIcon: workspaceIcon,
	ctorDescriptor: new SyncDescriptor(TreeRailView),
	canToggleVisibility: false,
	canMoveView: false,
};
Registry.as<IViewsRegistry>(ViewExtensions.ViewsRegistry).registerViews([treeRailViewDescriptor], workspaceContainer);

// Hide the built-in IDE view containers additively: deregister them once registries are populated,
// rather than patching each contribution. ADDITIVE-CONTRIBUTION (merge-tax ledger). NOTE: this leans
// on internal container ids and fails unsafely if an id changes upstream -- re-pin on rebase.
class HideIdeContainersContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.livingDocs.hideIdeContainers';

	constructor() {
		super();
		const registry = Registry.as<IViewContainersRegistry>(ViewExtensions.ViewContainersRegistry);
		for (const id of IDE_VIEW_CONTAINER_IDS) {
			const container = registry.get(id);
			if (container) {
				registry.deregisterViewContainer(container);
			}
		}
	}
}
registerWorkbenchContribution2(HideIdeContainersContribution.ID, HideIdeContainersContribution, WorkbenchPhase.BlockRestore);

// G4 (remove IDE optionality): the calm shell has no user-resizable panes. Lock every layout
// sash into a non-draggable state at startup. The lock is global + sticky, so sashes created
// later (and re-evaluated on every layout) stay non-interactive. CORE-PATCH (merge-tax ledger).
class LockLayoutSashesContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.livingDocs.lockLayoutSashes';

	constructor() {
		super();
		lockAllSashes();
	}
}
registerWorkbenchContribution2(LockLayoutSashesContribution.ID, LockLayoutSashesContribution, WorkbenchPhase.BlockRestore);

// --- Studio right panel (Chat / Review / History) in the auxiliary bar ---
const reviewIcon = registerIcon('living-docs-review', Codicon.checklist, localize('livingDocs.reviewIcon', "Living Documents review rail"));

const reviewContainer: ViewContainer = Registry.as<IViewContainersRegistry>(ViewExtensions.ViewContainersRegistry).registerViewContainer({
	id: REVIEW_RAIL_CONTAINER_ID,
	title: localize2('livingDocs.review', "Review"),
	icon: reviewIcon,
	ctorDescriptor: new SyncDescriptor(ViewPaneContainer, [REVIEW_RAIL_CONTAINER_ID, { mergeViewWithContainerWhenSingleView: true }]),
	storageId: REVIEW_RAIL_CONTAINER_ID,
	hideIfEmpty: false,
	order: 0,
}, ViewContainerLocation.AuxiliaryBar, { isDefault: true });

const reviewViewDescriptor: IViewDescriptor = {
	id: REVIEW_RAIL_VIEW_ID,
	name: localize2('livingDocs.reviewView', "Review"),
	containerIcon: reviewIcon,
	ctorDescriptor: new SyncDescriptor(ReviewRailView),
	canToggleVisibility: true,
	canMoveView: true,
};
Registry.as<IViewsRegistry>(ViewExtensions.ViewsRegistry).registerViews([reviewViewDescriptor], reviewContainer);

// --- icon-nav screens (Templates / Knowledge / Agents) in the activity bar ---
// Each is an activity-bar container whose slim launcher view opens the full-width screen in the
// editor area, mirroring the comp's icon nav. ADDITIVE-CONTRIBUTION (merge-tax ledger).
interface IScreenNavEntry {
	readonly screen: ScreenId;
	readonly containerId: string;
	readonly viewId: string;
	readonly title: string;
	readonly icon: ThemeIcon;
	readonly order: number;
}

// The comp's nav order is Home . Editor . Templates . Knowledge . Agents. Editor (order 2) is the
// document surface and is registered separately below (it opens a Living Document, not a screen);
// the screens carry orders 1/3/4/5 around it.
const SCREEN_NAV: readonly IScreenNavEntry[] = [
	{ screen: 'home', containerId: 'workbench.viewContainer.livingDocs.home', viewId: 'workbench.view.livingDocs.home', title: 'Home', icon: Codicon.home, order: 1 },
	{ screen: 'templates', containerId: 'workbench.viewContainer.livingDocs.templates', viewId: 'workbench.view.livingDocs.templates', title: 'Templates', icon: Codicon.layout, order: 3 },
	{ screen: 'knowledge', containerId: 'workbench.viewContainer.livingDocs.knowledge', viewId: 'workbench.view.livingDocs.knowledge', title: 'Knowledge', icon: Codicon.library, order: 4 },
	{ screen: 'agents', containerId: 'workbench.viewContainer.livingDocs.agents', viewId: 'workbench.view.livingDocs.agents', title: 'Agents', icon: Codicon.sync, order: 5 },
];

for (const entry of SCREEN_NAV) {
	const icon = registerIcon(`living-docs-${entry.screen}`, entry.icon, localize('livingDocs.screenIcon', "Abstract {0}", entry.title));
	const container = Registry.as<IViewContainersRegistry>(ViewExtensions.ViewContainersRegistry).registerViewContainer({
		id: entry.containerId,
		title: { value: entry.title, original: entry.title },
		icon,
		ctorDescriptor: new SyncDescriptor(ViewPaneContainer, [entry.containerId, { mergeViewWithContainerWhenSingleView: true }]),
		storageId: entry.containerId,
		hideIfEmpty: false,
		order: entry.order,
	}, ViewContainerLocation.Sidebar);

	Registry.as<IViewsRegistry>(ViewExtensions.ViewsRegistry).registerViews([{
		id: entry.viewId,
		name: { value: entry.title, original: entry.title },
		containerIcon: icon,
		ctorDescriptor: new SyncDescriptor(ScreenLauncherView),
		canToggleVisibility: false,
		canMoveView: false,
	}], container);

	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: `livingDocs.open.${entry.screen}`,
				title: localize2('livingDocs.openScreen', "Open {0}", entry.title),
				category: localize2('livingDocs.category', "Abstract"),
				f1: true,
			});
		}
		override async run(accessor: ServicesAccessor): Promise<void> {
			const editorService = accessor.get(IEditorService);
			const instantiationService = accessor.get(IInstantiationService);
			await editorService.openEditor(instantiationService.createInstance(ScreenEditorInput, entry.screen), { pinned: true });
		}
	});
}

// Cross-document review (C5, plan 24) is a project-scale destination reached FROM a project-wide run, not
// a top-level nav item, so it is not in SCREEN_NAV. Register a palette command to open it directly - the
// real in-product entry (the fan-out's "Review across the project ->") is wired in plan 24.3.
registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'livingDocs.open.review-project',
			title: localize2('livingDocs.openReviewProject', "Review Across the Project"),
			category: localize2('livingDocs.category', "Abstract"),
			f1: true,
		});
	}
	override async run(accessor: ServicesAccessor): Promise<void> {
		const editorService = accessor.get(IEditorService);
		const instantiationService = accessor.get(IInstantiationService);
		await editorService.openEditor(instantiationService.createInstance(ScreenEditorInput, 'review-project'), { pinned: true });
	}
});

// --- the "Editor" nav item (order 2, first after Home) ---
// Unlike the screens above, Editor opens the actual document surface: the active/last Living Document,
// or the first document in the folder (D25-B, see editorNavLauncherView.ts). It is an activity-bar
// container + slim launcher view (same icon-nav mechanics as the screens) plus a palette command.
// ADDITIVE-CONTRIBUTION (merge-tax ledger): no core edit; the 76px labeled bar is the pre-existing
// activity-bar width patch (v2 iter 9) + the studio.css label layer.
const EDITOR_NAV_CONTAINER_ID = 'workbench.viewContainer.livingDocs.editor';
const EDITOR_NAV_VIEW_ID = 'workbench.view.livingDocs.editor';
const editorNavIcon = registerIcon('living-docs-editor', Codicon.edit, localize('livingDocs.editorIcon', "Abstract {0}", 'Editor'));
const editorNavContainer = Registry.as<IViewContainersRegistry>(ViewExtensions.ViewContainersRegistry).registerViewContainer({
	id: EDITOR_NAV_CONTAINER_ID,
	title: { value: 'Editor', original: 'Editor' },
	icon: editorNavIcon,
	ctorDescriptor: new SyncDescriptor(ViewPaneContainer, [EDITOR_NAV_CONTAINER_ID, { mergeViewWithContainerWhenSingleView: true }]),
	storageId: EDITOR_NAV_CONTAINER_ID,
	hideIfEmpty: false,
	order: 2,
}, ViewContainerLocation.Sidebar);

Registry.as<IViewsRegistry>(ViewExtensions.ViewsRegistry).registerViews([{
	id: EDITOR_NAV_VIEW_ID,
	name: { value: 'Editor', original: 'Editor' },
	containerIcon: editorNavIcon,
	ctorDescriptor: new SyncDescriptor(EditorNavLauncherView),
	canToggleVisibility: false,
	canMoveView: false,
}], editorNavContainer);

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'livingDocs.open.editor',
			title: localize2('livingDocs.openScreen', "Open {0}", 'Editor'),
			category: localize2('livingDocs.category', "Abstract"),
			f1: true,
		});
	}
	override async run(accessor: ServicesAccessor): Promise<void> {
		await openEditorNavTarget(accessor, true);
	}
});

// --- first-run flow: launch reads as a document app, not an IDE ---
// The Welcome / Getting Started editor is the last IDE tell on launch. Close it so the workspace
// lands on the Documents home (sidebar) with a clean editor area, and reveal the Studio right panel
// so Review is one glance away. ADDITIVE-CONTRIBUTION (merge-tax ledger).
const WELCOME_INPUT_TYPE_ID = 'workbench.editors.gettingStartedInput';

class StudioStartupContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.livingDocs.studioStartup';

	constructor(
		@IEditorGroupsService private readonly _editorGroups: IEditorGroupsService,
		@IEditorService private readonly _editorService: IEditorService,
		@IInstantiationService private readonly _instantiation: IInstantiationService,
	) {
		super();
		// First-run only: the Getting Started / Welcome editor can be opened a tick late by the
		// startup-page logic, so close any that exist now, then watch exactly ONE more editor-change
		// to catch the late open -- and then stop, so a user who later opens Welcome themselves keeps it.
		this._closeWelcomeEditors();
		const once = this._register(new DisposableStore());
		once.add(this._editorService.onDidActiveEditorChange(() => {
			this._closeWelcomeEditors();
			once.dispose();
		}));
		// Land on the Home dashboard (the comp's default screen) when nothing else is open, so launch
		// reads as a document app rather than an empty editor.
		if (this._editorService.editors.length === 0) {
			void this._editorService.openEditor(this._instantiation.createInstance(ScreenEditorInput, 'home'), { pinned: true });
		}
		// The two rails (tree-rail + review rail) are EDITOR companions, not global chrome: they are
		// revealed + sized only when the document editor is the active surface, and hidden on the screen
		// surfaces (Home / Templates / Knowledge / Agents / project-run / review-project). That is owned by
		// RailVisibilityContribution below -- startup lands on Home, so both rails begin hidden and the
		// Workspace-rail selection + the 264/392 pinning happen there when the editor surface opens.
	}

	private _closeWelcomeEditors(): void {
		for (const group of this._editorGroups.groups) {
			for (const editor of [...group.editors]) {
				if (editor.typeId === WELCOME_INPUT_TYPE_ID) {
					void group.closeEditor(editor);
				}
			}
		}
	}
}
registerWorkbenchContribution2(StudioStartupContribution.ID, StudioStartupContribution, WorkbenchPhase.AfterRestored);

// --- rails are editor companions (Part C1 / shell) ---
// The tree-rail (SIDEBAR_PART, 264px: Files / Context / Outline / Search) and the review rail
// (AUXILIARYBAR_PART, 392px: Chat / Review / History) are companions to the DOCUMENT being edited,
// not global chrome. They belong to the editor surface only; the screen surfaces (Home / Templates /
// Knowledge / Agents, and the project-run / review-project screens) are full-width with neither rail.
// The rails stay collapsible on the editor surface -- this only asserts the default when CROSSING
// between a screen and the editor, so a user who pops a rail closed while editing keeps it closed as
// they move document to document. The 76px labeled nav (ACTIVITYBAR_PART) is intentionally NOT touched
// here: it is how you move between surfaces. ADDITIVE-CONTRIBUTION (our-surface, no core patch): it
// only reads the active editor and toggles part visibility + the comp widths via IWorkbenchLayoutService.
class RailVisibilityContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.livingDocs.railVisibility';

	private _lastKind: 'doc' | 'screen' | undefined;
	// The single pending re-assert/pin timeout (replaced each sync so repeated editor changes never
	// accumulate disposables on the class store).
	private readonly _deferred = this._register(new MutableDisposable());

	constructor(
		@IEditorService private readonly _editorService: IEditorService,
		@IViewsService private readonly _viewsService: IViewsService,
		@IWorkbenchLayoutService private readonly _layoutService: IWorkbenchLayoutService,
	) {
		super();
		this._sync();
		this._register(this._editorService.onDidActiveEditorChange(() => this._sync()));
	}

	private _surfaceKind(): 'doc' | 'screen' {
		// The editor surface is any open Living Document (living or plain .md); everything else -- the
		// ScreenEditor screens and the no-editor case -- is a screen surface.
		return this._editorService.activeEditor instanceof LivingDocEditorInput ? 'doc' : 'screen';
	}

	private _sync(): void {
		const kind = this._surfaceKind();
		if (kind === 'screen') {
			// A screen surface is always full-width: assert both rails hidden. Clicking a nav item is itself
			// an activity-bar action that re-opens the sidebar (the slim launcher bounces it to the Workspace
			// rail), so re-assert the hide on the next tick to win that race; otherwise the tree-rail lingers.
			this._lastKind = 'screen';
			const hide = () => {
				this._layoutService.setPartHidden(true, Parts.SIDEBAR_PART);
				this._layoutService.setPartHidden(true, Parts.AUXILIARYBAR_PART);
			};
			hide();
			this._deferred.value = disposableTimeout(hide, 0);
			return;
		}
		// kind === 'doc': only force the rails open when CROSSING into the editor from a screen, so a user who
		// popped a rail closed while editing keeps it closed as they move document to document.
		if (this._lastKind === 'doc') {
			return;
		}
		this._lastKind = 'doc';
		this._layoutService.setPartHidden(false, Parts.SIDEBAR_PART);
		this._layoutService.setPartHidden(false, Parts.AUXILIARYBAR_PART);
		// Land the sidebar on the calm Workspace tree-rail (not the native Explorer) and reveal the review
		// rail without stealing focus, then pin the comp widths. Sizing runs after a layout tick (and once
		// more) so it wins the workbench's own size restore; setSize is a no-op while a part is hidden.
		void this._viewsService.openView(DOCUMENTS_VIEW_ID, false);
		void this._viewsService.openView(REVIEW_RAIL_VIEW_ID, false);
		const pin = () => {
			try {
				this._layoutService.setSize(Parts.SIDEBAR_PART, { width: 264, height: this._layoutService.getSize(Parts.SIDEBAR_PART).height });
				this._layoutService.setSize(Parts.AUXILIARYBAR_PART, { width: 392, height: this._layoutService.getSize(Parts.AUXILIARYBAR_PART).height });
			} catch (e) { /* layout not ready in some hosts; the default widths still apply */ }
		};
		this._deferred.value = disposableTimeout(pin, 0);
		pin();
	}
}
registerWorkbenchContribution2(RailVisibilityContribution.ID, RailVisibilityContribution, WorkbenchPhase.AfterRestored);

// --- active nav chip (Part C1) ---
// The comp marks the CURRENT surface with a white chip in the icon-nav. The activity bar's own
// `.checked` state tracks the active sidebar CONTAINER, but the living-docs nav items are slim
// launchers that open a screen / document in the editor and then bounce the sidebar back to the
// Workspace tree-rail -- so `.checked` is always Workspace and never lands on a visible nav item.
// The right signal is therefore the active EDITOR, not the active container. This contribution maps
// the active editor to its nav item and toggles an `lwd-nav-active` class on that item's action-item;
// studio.css paints the chip off that class. ADDITIVE-CONTRIBUTION (our-surface, no core patch): it
// only reads IEditorService + the activity-bar part container and toggles a class on existing DOM, it
// does not modify the activity bar part. NOTE: it addresses nav items by their `codicon-living-docs-<id>`
// label class (fragile if the icon ids change) because the activity bar exposes no per-item API; the DOM
// walk uses `element.children` (not the lint-banned query APIs). Re-pin if the icon ids move.
const NAV_ACTIVE_CLASS = 'lwd-nav-active';
const NAV_ITEM_CODICON_CLASS: Record<string, string> = {
	home: 'codicon-living-docs-home',
	editor: 'codicon-living-docs-editor',
	templates: 'codicon-living-docs-templates',
	knowledge: 'codicon-living-docs-knowledge',
	agents: 'codicon-living-docs-agents',
};

class ActiveNavChipContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.livingDocs.activeNavChip';

	constructor(
		@IEditorService private readonly _editorService: IEditorService,
		@IWorkbenchLayoutService private readonly _layoutService: IWorkbenchLayoutService,
	) {
		super();
		this._sync();
		this._register(this._editorService.onDidActiveEditorChange(() => this._sync()));
	}

	private _activeNavId(): string | undefined {
		const active = this._editorService.activeEditor;
		if (active instanceof ScreenEditorInput) {
			// The 'home' screen maps to the Home nav item; the other screens map 1:1 by id.
			return active.screen;
		}
		if (active instanceof LivingDocEditorInput) {
			// Any open Living Document is the "Editor" surface.
			return 'editor';
		}
		return undefined;
	}

	private _sync(): void {
		const bar = this._layoutService.getContainer(mainWindow, Parts.ACTIVITYBAR_PART);
		if (!bar) {
			return;
		}
		const activeNavId = this._activeNavId();
		const activeCodicon = activeNavId ? NAV_ITEM_CODICON_CLASS[activeNavId] : undefined;
		const knownCodicons = new Set(Object.values(NAV_ITEM_CODICON_CLASS));
		// Walk the activity-bar part's descendants (via `children`, avoiding the fragile-selector query
		// APIs the house lint bans) and match each nav item by its `codicon-living-docs-<id>` label class
		// (the bar exposes no per-item API). Each label's `.action-item` ancestor carries the chip class.
		const visit = (element: Element): void => {
			for (const codicon of knownCodicons) {
				if (element.classList.contains(codicon)) {
					const item = element.closest('.action-item');
					if (item) {
						item.classList.toggle(NAV_ACTIVE_CLASS, codicon === activeCodicon);
					}
					break;
				}
			}
			for (let i = 0; i < element.children.length; i++) {
				visit(element.children[i]);
			}
		};
		visit(bar);
	}
}
registerWorkbenchContribution2(ActiveNavChipContribution.ID, ActiveNavChipContribution, WorkbenchPhase.AfterRestored);
