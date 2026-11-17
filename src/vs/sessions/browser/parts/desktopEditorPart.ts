/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { scheduleAtNextAnimationFrame } from '../../../base/browser/dom.js';
import { mainWindow } from '../../../base/browser/window.js';
import { DisposableMap, IDisposable, MutableDisposable } from '../../../base/common/lifecycle.js';
import { Event } from '../../../base/common/event.js';
import { ThemeIcon } from '../../../base/common/themables.js';
import { localize } from '../../../nls.js';
import { IConfigurationService } from '../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../platform/instantiation/common/instantiation.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../platform/storage/common/storage.js';
import { IThemeService } from '../../../platform/theme/common/themeService.js';
import { IEditorGroupView, IEditorGroupViewOptions, IEditorPartCreationOptions, IEditorPartsView } from '../../../workbench/browser/parts/editor/editor.js';
import { IEditorPartUIState } from '../../../workbench/browser/parts/editor/editorPart.js';
import { EditorGroupView } from '../../../workbench/browser/parts/editor/editorGroupView.js';
import { PaneComposite } from '../../../workbench/browser/panecomposite.js';
import { GroupIdentifier } from '../../../workbench/common/editor.js';
import { EditorGroupLayout, GroupDirection, GroupLayoutArgument, IEditorDropTargetDelegate } from '../../../workbench/services/editor/common/editorGroupsService.js';
import { Parts } from '../../../workbench/services/layout/browser/layoutService.js';
import { IHostService } from '../../../workbench/services/host/browser/host.js';
import { DockedEditorInput } from '../../../workbench/browser/parts/editor/dockedEditorInput.js';
import { DockedAuxiliaryBarController } from '../dockedAuxiliaryBarController.js';
import { CHANGES_VIEW_CONTAINER_ID } from '../../../workbench/contrib/sessions/common/changes.js';
import { Menus } from '../../../workbench/contrib/sessions/browser/menus.js';
import { AgentsWindowMenus } from '../agentsWindowMenus.js';
import { FloatingAuxiliaryBarController } from '../floatingAuxiliaryBarController.js';
import { IAgentWorkbenchLayoutService } from '../workbench.js';
import { AGENTS_SIDE_PANE_MULTIPLE_TABS_CLASS } from '../../../workbench/browser/parts/sessions/agentsPartCard.js';
import { MainEditorPart } from './editorPart.js';
import { DesktopAuxiliaryBarPart } from './desktopAuxiliaryBarPart.js';
import { applySingleGroupEditorStateInPlace } from './editorGroupStateInPlace.js';
import { EmptyEditorGroupAddTab } from '../../../workbench/browser/parts/sessions/emptyEditorGroupAddTab.js';

/**
 * Desktop editor part: owns the docked auxiliary bar so "tab bar + editor
 * header + editor + auxiliary bar" is a single unit. It creates the
 * {@link DesktopAuxiliaryBarPart} (lazily, so the pane composite service and
 * the editor part share one instance) and the {@link DockedAuxiliaryBarController}
 * that docks and sizes the auxiliary bar inside the editor part. The header itself
 * is rendered by the editor group from the group's configured header
 * menus, supplied via {@link getGroupViewOptions}, and also hosts breadcrumbs in
 * that row for text file editors. The part only reacts to the tab row's height to
 * reposition the docked auxiliary bar.
 */
export class DesktopMainEditorPart extends MainEditorPart {

	private _auxiliaryBar: DesktopAuxiliaryBarPart | undefined;
	private _dockedAuxBar: DockedAuxiliaryBarController | undefined;
	private readonly _groupRelayoutListeners = this._register(new DisposableMap<EditorGroupView>());
	private readonly _emptyGroupAddTabControls = this._register(new DisposableMap<EditorGroupView>());
	private readonly _tabsOverride = this._register(new MutableDisposable());
	private readonly _tabsPresentationRelayout = this._register(new MutableDisposable());
	private _enforcedShowTabs: 'multiple' | 'single' | undefined;

	protected override getGroupViewOptions(): IEditorGroupViewOptions {
		return {
			menuIds: {
				headerPrimary: Menus.SessionsEditorHeaderPrimary,
				headerSecondary: Menus.SessionsEditorHeaderSecondary,
				headerLayout: Menus.SessionsEditorHeaderLayout,
				editorActions: Menus.SessionsEditorTitle,
				tabsBarContext: AgentsWindowMenus.SessionsEditorTabsBarContext,
				tabsBarAddTab: AgentsWindowMenus.SessionsEditorTabsBarAddTab
			},
			showHeader: true,
			useModernUITabs: true,
			reserveHeaderSpace: editor => editor instanceof DockedEditorInput && this.agentWorkbenchLayoutService.isVisible(Parts.EDITOR_PART, mainWindow)
		};
	}

	// Double-click balances Sessions against editor content while reserving Details.
	get preferredWidth(): number | undefined {
		return this.agentWorkbenchLayoutService.getPreferredEditorPartWidth();
	}

	// Matches the sessions list's minimum while only the detail panel is shown.
	override get minimumWidth(): number {
		if (!this.agentWorkbenchLayoutService.isVisible(Parts.EDITOR_PART, mainWindow)) {
			return DockedAuxiliaryBarController.NO_EDITOR_MIN_WIDTH;
		}
		return super.minimumWidth;
	}

	// Snap-collapse via sash-drag, like the sessions list, only when detail-only.
	override get snap(): boolean {
		return !this.agentWorkbenchLayoutService.isVisible(Parts.EDITOR_PART, mainWindow);
	}

	constructor(
		editorPartsView: IEditorPartsView,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IThemeService themeService: IThemeService,
		@IConfigurationService configurationService: IConfigurationService,
		@IStorageService private readonly _storageService: IStorageService,
		@IAgentWorkbenchLayoutService private readonly agentWorkbenchLayoutService: IAgentWorkbenchLayoutService,
		@IHostService hostService: IHostService,
		@IContextKeyService contextKeyService: IContextKeyService,
	) {
		super(editorPartsView, _instantiationService, themeService, configurationService, _storageService, agentWorkbenchLayoutService, hostService, contextKeyService);

		this._register(configurationService.onDidChangeConfiguration(event => {
			if (event.affectsConfiguration('workbench.editor.showTabs')) {
				this._updateTabsOverride();
			}
		}));
		this._register(agentWorkbenchLayoutService.onDidChangePartVisibility(event => {
			if (event.partId === Parts.EDITOR_PART || event.partId === Parts.AUXILIARYBAR_PART) {
				this._updateTabsOverride();
			}
		}));
	}

	private _updateTabsOverride(): void {
		const nextShowTabs = this._getShowTabsOverride(
			this.configurationService.getValue('workbench.editor.showTabs'),
			this.agentWorkbenchLayoutService.isVisible(Parts.EDITOR_PART, mainWindow),
			this.agentWorkbenchLayoutService.isVisible(Parts.AUXILIARYBAR_PART, mainWindow)
		);
		if (nextShowTabs === this._enforcedShowTabs) {
			return;
		}
		this._enforcedShowTabs = nextShowTabs;
		this._tabsOverride.value = nextShowTabs ? this.enforcePartOptions({ showTabs: nextShowTabs }) : undefined;
	}

	private _getShowTabsOverride(configuredShowTabs: 'multiple' | 'single' | 'none', editorVisible: boolean, auxiliaryBarVisible: boolean): 'multiple' | 'single' | undefined {
		if (auxiliaryBarVisible && !editorVisible) {
			return 'multiple';
		}
		return configuredShowTabs === 'none' ? 'single' : undefined;
	}

	/**
	 * The auxiliary bar owned by this editor part, created on first access. The
	 * pane composite service reads this so both share the same instance.
	 */
	get auxiliaryBar(): DesktopAuxiliaryBarPart {
		if (!this._auxiliaryBar) {
			this._auxiliaryBar = this._register(this._instantiationService.createInstance(DesktopAuxiliaryBarPart));
			this._auxiliaryBar.beforeFocus = () => this.revealFloatingDetails();
		}
		return this._auxiliaryBar;
	}

	private _updateSidePaneTabsClass(scheduleRelayout: boolean): void {
		const root = this.agentWorkbenchLayoutService.mainContainer;
		const multiple = this.partOptions.showTabs === 'multiple';
		if (root.classList.contains(AGENTS_SIDE_PANE_MULTIPLE_TABS_CLASS) === multiple) {
			return;
		}

		root.classList.toggle(AGENTS_SIDE_PANE_MULTIPLE_TABS_CLASS, multiple);
		if (scheduleRelayout) {
			this._tabsPresentationRelayout.value = scheduleAtNextAnimationFrame(mainWindow, () => this.agentWorkbenchLayoutService.layout());
		}
	}

	/**
	 * Creates the editor part's DOM. Besides the base content (the editor grid), the
	 * desktop part docks the auxiliary bar here — in the same place the base part
	 * creates its content — and enables the header separator border on every group.
	 */
	protected override createContentArea(parent: HTMLElement, options?: IEditorPartCreationOptions): HTMLElement {
		this._updateTabsOverride();
		const container = super.createContentArea(parent, options);
		this._updateSidePaneTabsClass(false);
		this._register(this.onDidChangeEditorPartOptions(event => {
			if (event.oldPartOptions.showTabs !== event.newPartOptions.showTabs) {
				this._updateSidePaneTabsClass(true);
			}
		}));

		this._registerGroupRelayoutListeners();
		this._registerEmptyGroupAddTabControls();

		const layoutService = this.agentWorkbenchLayoutService;
		this._dockedAuxBar = this._register(new DockedAuxiliaryBarController(
			this.element,
			this.auxiliaryBar,
			{
				getPosition: () => layoutService.getDetailsPosition(),
				getWidth: () => layoutService.getDockedAuxiliaryBarWidth(),
				setWidth: (width: number) => layoutService.setDockedAuxiliaryBarWidth(width),
				getHeight: () => layoutService.getDockedAuxiliaryBarHeight(),
				setHeight: height => layoutService.setDockedAuxiliaryBarHeight(height),
				isEditorAreaVisible: () => layoutService.isVisible(Parts.EDITOR_PART, mainWindow) || layoutService.isVisible(Parts.AUXILIARYBAR_PART),
				isEditorVisible: () => layoutService.isVisible(Parts.EDITOR_PART, mainWindow),
				isAuxiliaryBarVisible: () => layoutService.isVisible(Parts.AUXILIARYBAR_PART),
				hideAuxiliaryBar: () => layoutService.setAuxiliaryBarHiddenForResize(true),
				setEditorContentInsets: (right, top, bottom, left) => {
					this.setContentRightInset(right);
					for (const group of this.groups) {
						(group as EditorGroupView).setContentHorizontalInsets(left, right);
						(group as EditorGroupView).setContentVerticalInsets(top, bottom);
					}
					this.element.style.setProperty('--sessions-editor-content-left-inset', `${left}px`);
					this.element.style.setProperty('--sessions-editor-content-top-inset', `${top}px`);
					this.element.style.setProperty('--sessions-editor-content-bottom-inset', `${bottom}px`);
				},
				getTabsHeight: () => (this.activeGroup as EditorGroupView).titleHeight.offset,
				getEditorContentTop: () => (this.activeGroup as EditorGroupView).titleHeight.total,
			},
			{
				isEnabled: () => layoutService.isAuxiliaryBarFloating(),
				createController: () => this._instantiationService.createInstance(FloatingAuxiliaryBarController, this.element, this.auxiliaryBar, {
					getTitle: () => this._getFloatingPanelTitle(),
					isChangesViewActive: () => this.auxiliaryBar.getActivePaneComposite()?.getId() === CHANGES_VIEW_CONTAINER_ID,
					getIcon: () => {
						const composite = this.auxiliaryBar.getActivePaneComposite();
						const icon = composite instanceof PaneComposite ? composite.getViewPaneContainer()?.viewContainer.icon : undefined;
						return ThemeIcon.isThemeIcon(icon) ? icon : undefined;
					},
					onDidChangeTitle: Event.map(Event.any(this.auxiliaryBar.onDidPaneCompositeOpen, this.auxiliaryBar.onDidPaneCompositeClose), () => undefined),
					getWidth: () => layoutService.getDockedAuxiliaryBarWidth(),
					setWidth: width => layoutService.setDockedAuxiliaryBarWidth(width),
					getHeight: () => this._storageService.getNumber('sessions.floatingDetails.height', StorageScope.WORKSPACE, 400),
					setHeight: height => this._storageService.store('sessions.floatingDetails.height', height, StorageScope.WORKSPACE, StorageTarget.MACHINE),
					getContentHeight: () => this.auxiliaryBar.getContentHeight(),
					onDidChangeContentHeight: this.auxiliaryBar.onDidChangeContentHeight,
					setSizeToContent: enabled => this.auxiliaryBar.setSizeToContent(enabled),
					focusEditor: () => this.activeGroup.focus(),
				}),
			},
		));

		return container;
	}

	private _getFloatingPanelTitle(): string {
		const activeComposite = this.auxiliaryBar.getActivePaneComposite();
		return (activeComposite && this.auxiliaryBar.getPaneComposite(activeComposite.getId())?.name) || localize('floatingPanel.title', "Details");
	}

	handleEditorOpeningFromDetails(): void {
		this._dockedAuxBar?.onDidOpenItem();
	}

	revealFloatingDetails(): void {
		this._dockedAuxBar?.revealFloatingDetails();
	}

	get floatingDetails(): FloatingAuxiliaryBarController | undefined {
		return this._dockedAuxBar?.floatingDetails;
	}

	override get supportsSplitting(): boolean {
		return false;
	}

	override addGroup(location: IEditorGroupView | GroupIdentifier, _direction: GroupDirection, _groupToCopy?: IEditorGroupView): IEditorGroupView {
		return this.assertGroupView(location);
	}

	override applyLayout(layout: EditorGroupLayout): void {
		if (countEditorGroups(layout.groups) > 1) {
			return;
		}
		super.applyLayout(layout);
	}

	override createEditorDropTarget(container: unknown, delegate: IEditorDropTargetDelegate): IDisposable {
		return super.createEditorDropTarget(container, { ...delegate, supportsSplitting: this.supportsSplitting });
	}

	override async applyState(state: IEditorPartUIState | 'empty', options?: IEditorGroupViewOptions): Promise<void> {
		if (state !== 'empty' && this.count === 1 && await applySingleGroupEditorStateInPlace(this.activeGroup, state, this._instantiationService)) {
			return;
		}
		await super.applyState(state, options);
		this._ensureSingleEditorGroup();
	}

	private _ensureSingleEditorGroup(): void {
		if (this.count > 1) {
			this.mergeAllGroups(this.activeGroup);
		}
	}

	/**
	 * Keeps the docked auxiliary bar aligned after group-local relayouts.
	 */
	private _registerGroupRelayoutListeners(): void {
		for (const group of this.groups) {
			this._registerGroupRelayoutListener(group as EditorGroupView);
		}
		this._register(this.onDidAddGroup(group => this._registerGroupRelayoutListener(group as EditorGroupView)));
		this._register(this.onDidRemoveGroup(group => this._groupRelayoutListeners.deleteAndDispose(group as EditorGroupView)));
	}

	private _registerGroupRelayoutListener(group: EditorGroupView): void {
		this._groupRelayoutListeners.set(group, group.onDidRelayout(() => this._dockedAuxBar?.layout()));
	}

	/**
	 * Empty groups hide their tab bar, so each group also renders the Add Tab
	 * actions (a `+` dropdown and a centered list) that are only shown while empty.
	 */
	private _registerEmptyGroupAddTabControls(): void {
		for (const group of this.groups) {
			this._emptyGroupAddTabControls.set(group as EditorGroupView, this._createEmptyGroupAddTabControl(group as EditorGroupView));
		}
		this._register(this.onDidAddGroup(group => this._emptyGroupAddTabControls.set(group as EditorGroupView, this._createEmptyGroupAddTabControl(group as EditorGroupView))));
		this._register(this.onDidRemoveGroup(group => this._emptyGroupAddTabControls.deleteAndDispose(group as EditorGroupView)));
	}

	private _createEmptyGroupAddTabControl(group: EditorGroupView): IDisposable {
		return this._instantiationService.createInstance(EmptyEditorGroupAddTab, group, AgentsWindowMenus.SessionsEditorTabsBarAddTab, AgentsWindowMenus.SessionsEmptyEditorGroupAddTab);
	}

	/** Also exposes the inset to CSS so content centered in an empty group avoids the docked detail panel. */
	override setContentRightInset(inset: number): void {
		super.setContentRightInset(inset);
		this.element?.style.setProperty('--sessions-editor-content-right-inset', `${Math.max(0, Math.round(inset))}px`);
	}

	override layout(width: number, height: number, top: number, left: number): void {
		super.layout(width, height, top, left);
		this.agentWorkbenchLayoutService.handleDockedEditorPartLayout(width);

		// The editor part owns the docked auxiliary bar (and its resize sash), so it
		// must re-position it whenever it is itself laid out (window/grid resize,
		// sidebar toggle). Otherwise the aux bar keeps sticking to the right edge
		// while the sash's absolute position goes stale and drifts off the border.
		// The header lays out with its group (flow), so it needs no repositioning here.
		this._dockedAuxBar?.layout();
	}

	/** Re-layouts the docked auxiliary bar. Called by the workbench on layout changes. */
	layoutDockedAuxiliaryBar(): void {
		this._dockedAuxBar?.layout();
	}
}

function countEditorGroups(groups: GroupLayoutArgument[]): number {
	let count = 0;
	for (const group of groups) {
		count += group.groups ? countEditorGroups(group.groups) : 1;
	}
	return count;
}
