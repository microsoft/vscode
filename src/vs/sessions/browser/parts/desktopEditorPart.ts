/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, append, scheduleAtNextAnimationFrame } from '../../../base/browser/dom.js';
import { mainWindow } from '../../../base/browser/window.js';
import { Event } from '../../../base/common/event.js';
import { DisposableMap, IDisposable, MutableDisposable, toDisposable } from '../../../base/common/lifecycle.js';
import { autorun, constObservable, derived, IObservable, observableSignalFromEvent, observableValue } from '../../../base/common/observable.js';
import { IConfigurationService } from '../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../platform/instantiation/common/instantiation.js';
import { IStorageService } from '../../../platform/storage/common/storage.js';
import { IThemeService } from '../../../platform/theme/common/themeService.js';
import { IEditorGroupView, IEditorGroupViewOptions, IEditorPartCreationOptions, IEditorPartsView } from '../../../workbench/browser/parts/editor/editor.js';
import { IEditorPartUIState } from '../../../workbench/browser/parts/editor/editorPart.js';
import { EditorGroupView } from '../../../workbench/browser/parts/editor/editorGroupView.js';
import { GroupIdentifier } from '../../../workbench/common/editor.js';
import { EditorGroupLayout, GroupDirection, GroupLayoutArgument, IEditorDropTargetDelegate } from '../../../workbench/services/editor/common/editorGroupsService.js';
import { Parts } from '../../../workbench/services/layout/browser/layoutService.js';
import { IHostService } from '../../../workbench/services/host/browser/host.js';
import { DockedEditorInput } from '../../common/dockedEditorInput.js';
import { SessionLayoutMode } from '../../common/sessionLayoutMode.js';
import { DockedAuxiliaryBarController } from '../dockedAuxiliaryBarController.js';
import { Menus } from '../menus.js';
import { getSessionsEditorGroupViewOptions } from './sessionsEditorGroupViewOptions.js';
import { IAgentWorkbenchLayoutService } from '../workbench.js';
import { AGENTS_SIDE_PANE_MULTIPLE_TABS_CLASS } from './agentsPartCard.js';
import { IStackedSidePaneColumn, moveKeepingFocus } from './stackedSidePaneColumnView.js';
import { MainEditorPart } from './editorPart.js';
import { DesktopAuxiliaryBarPart } from './desktopAuxiliaryBarPart.js';
import { EmptyEditorGroupAddTab } from './emptyEditorGroupAddTab.js';
import { registerSessionActivityBarExternalHost, SESSION_ACTIVITY_BAR_COLUMN_WIDTH, SessionActivityBarHostOccupancy } from './sessionActivityBar.js';

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
	private readonly _sessionActivityBarOccupancy = new SessionActivityBarHostOccupancy();
	private _sessionActivityBarHostActive: IObservable<boolean> = constObservable(false);
	private readonly _sessionActivityBarHostHeight = observableValue(this, 0);
	private _sessionActivityBarHost: HTMLElement | undefined;
	/** Whether the strip is to run in a column of its own in the workbench grid, beside the side pane (Stacked or Editor only). */
	private _sessionActivityBarStackedColumn: IObservable<boolean> = constObservable(false);
	/** The height of the column of the workbench grid the host shows in, beside the side pane; see {@link IStackedSidePaneColumn}. */
	private _sessionActivityBarColumnHeight = 0;
	private readonly _groupRelayoutListeners = this._register(new DisposableMap<EditorGroupView>());
	private readonly _emptyGroupAddTabControls = this._register(new DisposableMap<EditorGroupView>());
	private readonly _tabsOverride = this._register(new MutableDisposable());
	private readonly _tabsPresentationRelayout = this._register(new MutableDisposable());
	private _enforcedShowTabs: 'multiple' | 'single' | undefined;

	protected override getGroupViewOptions(): IEditorGroupViewOptions {
		return {
			...getSessionsEditorGroupViewOptions(),
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
		@IStorageService storageService: IStorageService,
		@IAgentWorkbenchLayoutService private readonly agentWorkbenchLayoutService: IAgentWorkbenchLayoutService,
		@IHostService hostService: IHostService,
		@IContextKeyService contextKeyService: IContextKeyService,
	) {
		super(editorPartsView, _instantiationService, themeService, configurationService, storageService, agentWorkbenchLayoutService, hostService, contextKeyService);

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
				getWidth: () => layoutService.getDockedAuxiliaryBarWidth(),
				setWidth: (width: number) => layoutService.setDockedAuxiliaryBarWidth(width),
				isEditorAreaVisible: () => layoutService.isVisible(Parts.EDITOR_PART, mainWindow) || layoutService.isVisible(Parts.AUXILIARYBAR_PART),
				isEditorVisible: () => layoutService.isVisible(Parts.EDITOR_PART, mainWindow),
				isAuxiliaryBarVisible: () => layoutService.isVisible(Parts.AUXILIARYBAR_PART),
				hideAuxiliaryBar: () => layoutService.setAuxiliaryBarHiddenForResize(true),
				setEditorContentRightInset: (px: number) => this.setContentRightInset(px),
				getTabsHeight: () => (this.activeGroup as EditorGroupView).titleHeight.offset,
				// In the column beside the stacked side pane, the strip is outside the part.
				getRightReservedWidth: () => this._sessionActivityBarOccupancy.occupied.get() && !this._isSessionActivityBarHostInColumn() ? SESSION_ACTIVITY_BAR_COLUMN_WIDTH : 0,
			},
		));
		this._registerSessionActivityBarHost();

		return container;
	}

	/**
	 * While the chat is below the editor or hidden, the Session Activity Bar shows outside it, in a column of its own in the
	 * workbench grid: Stacked, beside the editor and the chat, which both end before it; Editor only, beside the editor.
	 * Where the grid has no column for it, it shows at the right edge of the editor area, below its tabs, and the editor
	 * content and the docked panel make room for it.
	 */
	private _registerSessionActivityBarHost(): void {
		const layoutService = this.agentWorkbenchLayoutService;
		const element = this._sessionActivityBarHost = append(this.element, $('.session-activity-bar-host.session-activity-bar-editor-host'));
		element.style.setProperty('--session-activity-bar-column-width', `${SESSION_ACTIVITY_BAR_COLUMN_WIDTH}px`);
		// Also once moved out of the part, into the grid.
		this._register(toDisposable(() => element.remove()));
		const layoutChanged = observableSignalFromEvent(this, Event.any<unknown>(layoutService.onDidChangeSidePaneArrangement, layoutService.onDidChangeEditorMaximized, layoutService.onDidChangePartVisibility));
		const active = this._sessionActivityBarHostActive = derived(this, reader => {
			layoutChanged.read(reader);
			const sidePaneVisible = layoutService.isVisible(Parts.EDITOR_PART, mainWindow) || layoutService.isVisible(Parts.AUXILIARYBAR_PART);
			// Also while the chat is hidden (Editor only), with the editor area maximized or not.
			return sidePaneVisible && (layoutService.getSidePaneArrangement() === SessionLayoutMode.Stacked || layoutService.isEditorMaximized() || !layoutService.isVisible(Parts.SESSIONS_PART));
		});
		const stackedColumn = this._sessionActivityBarStackedColumn = derived(this, reader => active.read(reader) && this._sessionActivityBarOccupancy.occupied.read(reader));
		this._register(registerSessionActivityBarExternalHost(layoutService.mainContainer, {
			element,
			active,
			height: this._sessionActivityBarHostHeight,
			setOccupied: (occupant, occupied) => this._sessionActivityBarOccupancy.set(occupant, occupied),
		}));
		this._register(autorun(reader => {
			active.read(reader);
			this._layoutSessionActivityBarHost();
		}));
		this._register(autorun(reader => {
			const occupied = this._sessionActivityBarOccupancy.occupied.read(reader);
			element.classList.toggle('occupied', occupied);
			this._layoutSessionActivityBarHost();
			this._dockedAuxBar?.layout();
		}));
		// The host shows in a column of its own in the workbench grid, while the grid has one for it.
		const column: IStackedSidePaneColumn = {
			element,
			width: SESSION_ACTIVITY_BAR_COLUMN_WIDTH,
			layout: height => {
				this._sessionActivityBarColumnHeight = height;
				this._layoutSessionActivityBarHost();
			},
			release: () => moveKeepingFocus(element, this.element),
		};
		this._register(autorun(reader => {
			if (!stackedColumn.read(reader) || !layoutService.setStackedSidePaneColumn(column)) {
				moveKeepingFocus(element, this.element);
				layoutService.setStackedSidePaneColumn(undefined);
			}
			this._layoutSessionActivityBarHost();
			this._dockedAuxBar?.layout();
		}));
		this._register(toDisposable(() => layoutService.setStackedSidePaneColumn(undefined)));
	}

	/** Whether the host of the Session Activity Bar is in the column beside the stacked side pane, outside the part. */
	private _isSessionActivityBarHostInColumn(): boolean {
		return this._sessionActivityBarStackedColumn.get() && !!this._sessionActivityBarHost?.parentElement && this._sessionActivityBarHost.parentElement !== this.element;
	}

	/** Only while the host is active or a strip is in it; from the laid out sizes, so it forces no reflow. */
	private _layoutSessionActivityBarHost(): void {
		const element = this._sessionActivityBarHost;
		const contentHeight = this.contentDimension?.height;
		if (!element || contentHeight === undefined || (!this._sessionActivityBarHostActive.get() && !this._sessionActivityBarOccupancy.occupied.get())) {
			return;
		}
		if (this._isSessionActivityBarHostInColumn()) {
			// The full height of its column, from right under the title bar.
			element.style.top = '0';
			element.style.height = `${this._sessionActivityBarColumnHeight}px`;
			this._sessionActivityBarHostHeight.set(this._sessionActivityBarColumnHeight, undefined);
			return;
		}
		const tabsHeight = (this.activeGroup as EditorGroupView).titleHeight.offset;
		const height = Math.max(0, contentHeight - tabsHeight);
		element.style.top = `${tabsHeight}px`;
		element.style.height = `${height}px`;
		this._sessionActivityBarHostHeight.set(height, undefined);
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
		return super.createEditorDropTarget(container, { ...delegate, supportsSplitting: false });
	}

	override async applyState(state: IEditorPartUIState | 'empty', options?: IEditorGroupViewOptions): Promise<void> {
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
		this._groupRelayoutListeners.set(group, group.onDidRelayout(() => {
			this._dockedAuxBar?.layout();
			// Below the tabs, whose height is known once the group lays out.
			this._layoutSessionActivityBarHost();
		}));
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
		return this._instantiationService.createInstance(EmptyEditorGroupAddTab, group, Menus.SessionsEditorTabsBarAddTab, Menus.SessionsEmptyEditorGroupAddTab);
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
		this._layoutSessionActivityBarHost();
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
