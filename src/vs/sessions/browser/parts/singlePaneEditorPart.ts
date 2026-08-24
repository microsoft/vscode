/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mainWindow } from '../../../base/browser/window.js';
import { DisposableMap, IDisposable, MutableDisposable } from '../../../base/common/lifecycle.js';
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
import { DockedAuxiliaryBarController } from '../dockedAuxiliaryBarController.js';
import { Menus } from '../menus.js';
import { IAgentWorkbenchLayoutService } from '../workbench.js';
import { MainEditorPart } from './editorPart.js';
import { SinglePaneAuxiliaryBarPart } from './singlePaneAuxiliaryBarPart.js';

/**
 * Single-pane editor part: owns the docked auxiliary bar so "tab bar + editor
 * header + editor + auxiliary bar" is a single unit. It creates the
 * {@link SinglePaneAuxiliaryBarPart} (lazily, so the pane composite service and
 * the editor part share one instance) and the {@link DockedAuxiliaryBarController}
 * that docks and sizes the auxiliary bar inside the editor part. The full-width
 * header itself is rendered by the editor group from the group's configured header
 * menus, supplied via {@link getGroupViewOptions}, and also hosts breadcrumbs in
 * that row for text file editors. The part only reacts to the header's height to
 * reposition the docked auxiliary bar.
 */
export class SinglePaneMainEditorPart extends MainEditorPart {

	private _auxiliaryBar: SinglePaneAuxiliaryBarPart | undefined;
	private _dockedAuxBar: DockedAuxiliaryBarController | undefined;
	private readonly _groupRelayoutListeners = this._register(new DisposableMap<EditorGroupView>());

	protected override getGroupViewOptions(): IEditorGroupViewOptions {
		return {
			menuIds: {
				headerPrimary: Menus.SessionsEditorHeaderPrimary,
				headerLayout: Menus.SessionsEditorHeaderLayout,
				editorActions: Menus.SessionsEditorTitle,
				tabsBarContext: Menus.SessionsEditorTabsBarContext,
				tabsBarAddTab: Menus.SessionsEditorTabsBarAddTab
			},
			showHeader: true
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

		const tabsOverride = this._register(new MutableDisposable());
		let enforcedShowTabs: 'multiple' | 'single' | undefined;
		const updateTabsOverride = () => {
			const nextShowTabs = this._getShowTabsOverride(
				configurationService.getValue('workbench.editor.showTabs'),
				agentWorkbenchLayoutService.isVisible(Parts.EDITOR_PART, mainWindow),
				agentWorkbenchLayoutService.isVisible(Parts.AUXILIARYBAR_PART, mainWindow)
			);
			if (nextShowTabs === enforcedShowTabs) {
				return;
			}
			enforcedShowTabs = nextShowTabs;
			tabsOverride.value = nextShowTabs ? this.enforcePartOptions({ showTabs: nextShowTabs }) : undefined;
		};
		this._register(configurationService.onDidChangeConfiguration(event => {
			if (event.affectsConfiguration('workbench.editor.showTabs')) {
				updateTabsOverride();
			}
		}));
		this._register(agentWorkbenchLayoutService.onDidChangePartVisibility(event => {
			if (event.partId === Parts.EDITOR_PART || event.partId === Parts.AUXILIARYBAR_PART) {
				updateTabsOverride();
			}
		}));
		updateTabsOverride();
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
	get auxiliaryBar(): SinglePaneAuxiliaryBarPart {
		if (!this._auxiliaryBar) {
			this._auxiliaryBar = this._register(this._instantiationService.createInstance(SinglePaneAuxiliaryBarPart));
		}
		return this._auxiliaryBar;
	}

	/**
	 * Creates the editor part's DOM. Besides the base content (the editor grid), the
	 * single-pane part docks the auxiliary bar here — in the same place the base part
	 * creates its content — and enables the header separator border on every group.
	 */
	protected override createContentArea(parent: HTMLElement, options?: IEditorPartCreationOptions): HTMLElement {
		const container = super.createContentArea(parent, options);

		this._registerGroupRelayoutListeners();

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
				getTitleHeight: () => (this.activeGroup as EditorGroupView).titleHeight.total,
			},
		));

		return container;
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
		this._groupRelayoutListeners.set(group, group.onDidRelayout(() => this._dockedAuxBar?.layout()));
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
