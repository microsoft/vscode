/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableMap } from '../../../base/common/lifecycle.js';
import { mainWindow } from '../../../base/browser/window.js';
import { IConfigurationService } from '../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../platform/instantiation/common/instantiation.js';
import { IStorageService } from '../../../platform/storage/common/storage.js';
import { IThemeService } from '../../../platform/theme/common/themeService.js';
import { IEditorGroupViewOptions, IEditorPartCreationOptions, IEditorPartsView } from '../../../workbench/browser/parts/editor/editor.js';
import { EditorGroupView } from '../../../workbench/browser/parts/editor/editorGroupView.js';
import { IWorkbenchLayoutService, Parts } from '../../../workbench/services/layout/browser/layoutService.js';
import { IHostService } from '../../../workbench/services/host/browser/host.js';
import { DockedAuxiliaryBarController } from '../dockedAuxiliaryBarController.js';
import { EDITOR_PART_MINIMUM_WIDTH, SIDE_PANE_WIDTH_RATIO } from './editorPartSizing.js';
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
 * menus ({@link Menus.SessionsEditorHeaderPrimary} / {@link Menus.SessionsEditorHeaderSecondary},
 * supplied via {@link getGroupViewOptions}) whenever the active editor opts in via
 * {@link IEditorPane.getHeaderActions}; the part only reacts to its height to
 * reposition the docked auxiliary bar.
 */
export class SinglePaneMainEditorPart extends MainEditorPart {

	private _auxiliaryBar: SinglePaneAuxiliaryBarPart | undefined;
	private _dockedAuxBar: DockedAuxiliaryBarController | undefined;
	private readonly _groupHeaderListeners = this._register(new DisposableMap<EditorGroupView>());

	protected override getGroupViewOptions(): IEditorGroupViewOptions {
		return {
			menuIds: {
				headerPrimary: Menus.SessionsEditorHeaderPrimary,
				headerSecondary: Menus.SessionsEditorHeaderSecondary,
				editorActions: Menus.SessionsEditorTitle,
				tabsBarContext: Menus.SessionsEditorTabsBarContext,
				tabsBarAddTab: Menus.SessionsEditorTabsBarAddTab
			}
		};
	}

	// Double-click resets the sash to this width. Use the detail panel's default
	// while editor content is hidden, not the 60% editor split.
	get preferredWidth(): number | undefined {
		if (!this.layoutService.isVisible(Parts.EDITOR_PART, mainWindow)) {
			return DockedAuxiliaryBarController.DEFAULT_WIDTH;
		}
		return Math.max(EDITOR_PART_MINIMUM_WIDTH, Math.floor(this.layoutService.mainContainerDimension.width * SIDE_PANE_WIDTH_RATIO));
	}

	// Matches the sessions list's minimum while only the detail panel is shown.
	override get minimumWidth(): number {
		if (!this.layoutService.isVisible(Parts.EDITOR_PART, mainWindow)) {
			return DockedAuxiliaryBarController.NO_EDITOR_MIN_WIDTH;
		}
		return super.minimumWidth;
	}

	// Snap-collapse via sash-drag, like the sessions list, only when detail-only.
	override get snap(): boolean {
		return !this.layoutService.isVisible(Parts.EDITOR_PART, mainWindow);
	}

	constructor(
		editorPartsView: IEditorPartsView,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IThemeService themeService: IThemeService,
		@IConfigurationService configurationService: IConfigurationService,
		@IStorageService storageService: IStorageService,
		@IWorkbenchLayoutService layoutService: IWorkbenchLayoutService,
		@IHostService hostService: IHostService,
		@IContextKeyService contextKeyService: IContextKeyService,
	) {
		super(editorPartsView, _instantiationService, themeService, configurationService, storageService, layoutService, hostService, contextKeyService);

		// The docked tab bar always shows multiple tabs, ignoring `workbench.editor.showTabs` (single/none).
		this._register(this.enforcePartOptions({ showTabs: 'multiple' }));
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

		this._registerGroupHeaders();

		const layoutService = this.layoutService as IAgentWorkbenchLayoutService;
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
				getHeaderHeight: () => (this.activeGroup as EditorGroupView).headerHeight,
			},
		));

		return container;
	}

	/**
	 * Repositions the docked auxiliary bar when a group's header height changes,
	 * so the aux bar and sash stay aligned with the editor content below the header.
	 */
	private _registerGroupHeaders(): void {
		for (const group of this.groups) {
			this._registerGroupHeader(group as EditorGroupView);
		}
		this._register(this.onDidAddGroup(group => this._registerGroupHeader(group as EditorGroupView)));
		this._register(this.onDidRemoveGroup(group => this._groupHeaderListeners.deleteAndDispose(group as EditorGroupView)));
	}

	private _registerGroupHeader(group: EditorGroupView): void {
		this._groupHeaderListeners.set(group, group.onDidChangeHeaderHeight(() => this._dockedAuxBar?.layout()));
	}

	override layout(width: number, height: number, top: number, left: number): void {
		super.layout(width, height, top, left);
		(this.layoutService as IAgentWorkbenchLayoutService).handleDockedEditorPartLayout(width);

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
