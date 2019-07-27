/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Sash, ISashEvent, IVerticalSashLayoutProvider, IHorizontalSashLayoutProvider, Orientation } from 'vs/base/browser/ui/sash/sash';
import { IWorkbenchLayoutService, Position, ILayoutOptions, Parts } from 'vs/workbench/services/layout/browser/layoutService';
import { IViewletService } from 'vs/workbench/services/viewlet/browser/viewlet';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import { IContextViewService } from 'vs/platform/contextview/browser/contextView';
import { Disposable } from 'vs/base/common/lifecycle';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { isMacintosh, isWeb } from 'vs/base/common/platform';
import { memoize } from 'vs/base/common/decorators';
import { Dimension, getClientArea, size, position, hide, show } from 'vs/base/browser/dom';
import { IEditorGroupsService } from 'vs/workbench/services/editor/common/editorGroupsService';
import { getZoomFactor } from 'vs/base/browser/browser';
import { Part } from 'vs/workbench/browser/part';

const TITLE_BAR_HEIGHT = isMacintosh && !isWeb ? 22 : 30;
const STATUS_BAR_HEIGHT = 22;
const ACTIVITY_BAR_WIDTH = 48;

const MIN_SIDEBAR_PART_WIDTH = 170;
const DEFAULT_SIDEBAR_PART_WIDTH = 300;
const HIDE_SIDEBAR_WIDTH_THRESHOLD = 50;

const MIN_PANEL_PART_HEIGHT = 77;
const MIN_PANEL_PART_WIDTH = 300;
const DEFAULT_PANEL_PART_SIZE = 350;
const DEFAULT_PANEL_SIZE_COEFFICIENT = 0.4;
const PANEL_SIZE_BEFORE_MAXIMIZED_BOUNDARY = 0.7;
const HIDE_PANEL_HEIGHT_THRESHOLD = 50;
const HIDE_PANEL_WIDTH_THRESHOLD = 100;

/**
 * @deprecated to be replaced by new Grid layout
 */
export class WorkbenchLegacyLayout extends Disposable implements IVerticalSashLayoutProvider, IHorizontalSashLayoutProvider {

	private static readonly sashXOneWidthSettingsKey = 'workbench.sidebar.width';
	private static readonly sashXTwoWidthSettingsKey = 'workbench.panel.width';
	private static readonly sashYHeightSettingsKey = 'workbench.panel.height';
	private static readonly panelSizeBeforeMaximizedKey = 'workbench.panel.sizeBeforeMaximized';

	private workbenchSize: Dimension;

	private sashXOne: Sash;
	private sashXTwo: Sash;
	private sashY: Sash;

	private _sidebarWidth: number;
	private sidebarHeight: number;
	private titlebarHeight: number;
	private statusbarHeight: number;
	private panelSizeBeforeMaximized: number;
	private panelMaximized: boolean;
	private _panelHeight: number;
	private _panelWidth: number;

	constructor(
		private parent: HTMLElement,
		private workbenchContainer: HTMLElement,
		private parts: {
			titlebar: Part,
			activitybar: Part,
			editor: Part,
			sidebar: Part,
			panel: Part,
			statusbar: Part
		},
		@IStorageService private readonly storageService: IStorageService,
		@IContextViewService private readonly contextViewService: IContextViewService,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
		@IViewletService private readonly viewletService: IViewletService,
		@IThemeService private readonly themeService: IThemeService,
		@IEditorGroupsService private readonly editorGroupService: IEditorGroupsService
	) {
		super();

		// Restore state
		this.restorePreviousState();

		// Create layout sashes
		this.sashXOne = new Sash(this.workbenchContainer, this);
		this.sashXTwo = new Sash(this.workbenchContainer, this);
		this.sashY = new Sash(this.workbenchContainer, this, { orientation: Orientation.HORIZONTAL });

		this.registerListeners();
	}

	private restorePreviousState(): void {
		this._sidebarWidth = Math.max(this.partLayoutInfo.sidebar.minWidth, this.storageService.getNumber(WorkbenchLegacyLayout.sashXOneWidthSettingsKey, StorageScope.GLOBAL, DEFAULT_SIDEBAR_PART_WIDTH));

		this._panelWidth = Math.max(this.partLayoutInfo.panel.minWidth, this.storageService.getNumber(WorkbenchLegacyLayout.sashXTwoWidthSettingsKey, StorageScope.GLOBAL, DEFAULT_PANEL_PART_SIZE));
		this._panelHeight = Math.max(this.partLayoutInfo.panel.minHeight, this.storageService.getNumber(WorkbenchLegacyLayout.sashYHeightSettingsKey, StorageScope.GLOBAL, DEFAULT_PANEL_PART_SIZE));

		this.panelMaximized = false;
		this.panelSizeBeforeMaximized = this.storageService.getNumber(WorkbenchLegacyLayout.panelSizeBeforeMaximizedKey, StorageScope.GLOBAL, 0);
	}

	private registerListeners(): void {
		this._register(this.themeService.onThemeChange(_ => this.layout()));
		this._register((this.parts.editor as any).onDidSizeConstraintsChange(() => this.onDidEditorSizeConstraintsChange()));

		this.registerSashListeners();
	}

	private onDidEditorSizeConstraintsChange(): void {
		if (this.workbenchSize && (this.sidebarWidth || this.panelHeight)) {
			if (this.editorGroupService.count > 1) {
				const minimumEditorPartSize = new Dimension(this.parts.editor.minimumWidth, this.parts.editor.minimumHeight);

				const sidebarOverflow = this.workbenchSize.width - this.sidebarWidth < minimumEditorPartSize.width;

				let panelOverflow = false;
				if (this.layoutService.getPanelPosition() === Position.RIGHT) {
					panelOverflow = this.workbenchSize.width - this.panelWidth - this.sidebarWidth < minimumEditorPartSize.width;
				} else {
					panelOverflow = this.workbenchSize.height - this.panelHeight < minimumEditorPartSize.height;
				}

				// Trigger a layout if we detect that either sidebar or panel overflow
				// as a matter of a new editor group being added to the editor part
				if (sidebarOverflow || panelOverflow) {
					this.layout();
				}
			}
		}
	}

	private get activitybarWidth(): number {
		if (this.layoutService.isVisible(Parts.ACTIVITYBAR_PART)) {
			return this.partLayoutInfo.activitybar.width;
		}

		return 0;
	}

	private get panelHeight(): number {
		const panelPosition = this.layoutService.getPanelPosition();
		if (panelPosition === Position.RIGHT) {
			return this.sidebarHeight;
		}

		return this._panelHeight;
	}

	private set panelHeight(value: number) {
		this._panelHeight = Math.min(this.computeMaxPanelHeight(), Math.max(this.partLayoutInfo.panel.minHeight, value));
	}

	private get panelWidth(): number {
		const panelPosition = this.layoutService.getPanelPosition();
		if (panelPosition === Position.BOTTOM) {
			return this.workbenchSize.width - this.activitybarWidth - this.sidebarWidth;
		}

		return this._panelWidth;
	}

	private set panelWidth(value: number) {
		this._panelWidth = Math.min(this.computeMaxPanelWidth(), Math.max(this.partLayoutInfo.panel.minWidth, value));
	}

	private computeMaxPanelWidth(): number {
		let minSidebarWidth: number;
		if (this.layoutService.isVisible(Parts.SIDEBAR_PART)) {
			if (this.layoutService.getSideBarPosition() === Position.LEFT) {
				minSidebarWidth = this.partLayoutInfo.sidebar.minWidth;
			} else {
				minSidebarWidth = this.sidebarWidth;
			}
		} else {
			minSidebarWidth = 0;
		}

		return Math.max(this.partLayoutInfo.panel.minWidth, this.workbenchSize.width - this.parts.editor.minimumWidth - minSidebarWidth - this.activitybarWidth);
	}

	private computeMaxPanelHeight(): number {
		return Math.max(this.partLayoutInfo.panel.minHeight, this.sidebarHeight /* simplification for: window.height - status.height - title-height */ - this.parts.editor.minimumHeight);
	}

	private get sidebarWidth(): number {
		if (this.layoutService.isVisible(Parts.SIDEBAR_PART)) {
			return this._sidebarWidth;
		}

		return 0;
	}

	private set sidebarWidth(value: number) {
		const panelMinWidth = this.layoutService.getPanelPosition() === Position.RIGHT && this.layoutService.isVisible(Parts.PANEL_PART) ? this.partLayoutInfo.panel.minWidth : 0;
		const maxSidebarWidth = this.workbenchSize.width - this.activitybarWidth - this.parts.editor.minimumWidth - panelMinWidth;

		this._sidebarWidth = Math.max(this.partLayoutInfo.sidebar.minWidth, Math.min(maxSidebarWidth, value));
	}

	@memoize
	public get partLayoutInfo() {
		return {
			titlebar: {
				height: TITLE_BAR_HEIGHT
			},
			activitybar: {
				width: ACTIVITY_BAR_WIDTH
			},
			sidebar: {
				minWidth: MIN_SIDEBAR_PART_WIDTH
			},
			panel: {
				minHeight: MIN_PANEL_PART_HEIGHT,
				minWidth: MIN_PANEL_PART_WIDTH
			},
			statusbar: {
				height: STATUS_BAR_HEIGHT
			}
		};
	}

	private registerSashListeners(): void {
		let startX: number = 0;
		let startY: number = 0;
		let startXTwo: number = 0;
		let startSidebarWidth: number;
		let startPanelHeight: number;
		let startPanelWidth: number;

		this._register(this.sashXOne.onDidStart((e: ISashEvent) => {
			startSidebarWidth = this.sidebarWidth;
			startX = e.startX;
		}));

		this._register(this.sashY.onDidStart((e: ISashEvent) => {
			startPanelHeight = this.panelHeight;
			startY = e.startY;
		}));

		this._register(this.sashXTwo.onDidStart((e: ISashEvent) => {
			startPanelWidth = this.panelWidth;
			startXTwo = e.startX;
		}));

		this._register(this.sashXOne.onDidChange((e: ISashEvent) => {
			let doLayout = false;
			let sidebarPosition = this.layoutService.getSideBarPosition();
			let isSidebarVisible = this.layoutService.isVisible(Parts.SIDEBAR_PART);
			let newSashWidth = (sidebarPosition === Position.LEFT) ? startSidebarWidth + e.currentX - startX : startSidebarWidth - e.currentX + startX;

			// Sidebar visible
			if (isSidebarVisible) {

				// Automatically hide side bar when a certain threshold is met
				if (newSashWidth + HIDE_SIDEBAR_WIDTH_THRESHOLD < this.partLayoutInfo.sidebar.minWidth) {
					let dragCompensation = this.partLayoutInfo.sidebar.minWidth - HIDE_SIDEBAR_WIDTH_THRESHOLD;
					this.layoutService.setSideBarHidden(true);
					startX = (sidebarPosition === Position.LEFT) ? Math.max(this.activitybarWidth, e.currentX - dragCompensation) : Math.min(e.currentX + dragCompensation, this.workbenchSize.width - this.activitybarWidth);
					this.sidebarWidth = startSidebarWidth; // when restoring sidebar, restore to the sidebar width we started from
				}

				// Otherwise size the sidebar accordingly
				else {
					this.sidebarWidth = Math.max(this.partLayoutInfo.sidebar.minWidth, newSashWidth); // Sidebar can not become smaller than MIN_PART_WIDTH
					doLayout = newSashWidth >= this.partLayoutInfo.sidebar.minWidth;
				}
			}

			// Sidebar hidden
			else {
				if ((sidebarPosition === Position.LEFT && e.currentX - startX >= this.partLayoutInfo.sidebar.minWidth) ||
					(sidebarPosition === Position.RIGHT && startX - e.currentX >= this.partLayoutInfo.sidebar.minWidth)) {
					startSidebarWidth = this.partLayoutInfo.sidebar.minWidth - (sidebarPosition === Position.LEFT ? e.currentX - startX : startX - e.currentX);
					this.sidebarWidth = this.partLayoutInfo.sidebar.minWidth;
					this.layoutService.setSideBarHidden(false);
				}
			}

			if (doLayout) {
				this.layout({ source: Parts.SIDEBAR_PART });
			}
		}));

		this._register(this.sashY.onDidChange((e: ISashEvent) => {
			let doLayout = false;
			let isPanelVisible = this.layoutService.isVisible(Parts.PANEL_PART);
			let newSashHeight = startPanelHeight - (e.currentY - startY);

			// Panel visible
			if (isPanelVisible) {

				// Automatically hide panel when a certain threshold is met
				if (newSashHeight + HIDE_PANEL_HEIGHT_THRESHOLD < this.partLayoutInfo.panel.minHeight) {
					let dragCompensation = this.partLayoutInfo.panel.minHeight - HIDE_PANEL_HEIGHT_THRESHOLD;
					this.layoutService.setPanelHidden(true);
					startY = Math.min(this.sidebarHeight - this.statusbarHeight - this.titlebarHeight, e.currentY + dragCompensation);
					this.panelHeight = startPanelHeight; // when restoring panel, restore to the panel height we started from
				}

				// Otherwise size the panel accordingly
				else {
					this.panelHeight = Math.max(this.partLayoutInfo.panel.minHeight, newSashHeight); // Panel can not become smaller than MIN_PART_HEIGHT
					doLayout = newSashHeight >= this.partLayoutInfo.panel.minHeight;
				}
			}

			// Panel hidden
			else {
				if (startY - e.currentY >= this.partLayoutInfo.panel.minHeight) {
					startPanelHeight = 0;
					this.panelHeight = this.partLayoutInfo.panel.minHeight;
					this.layoutService.setPanelHidden(false);
				}
			}

			if (doLayout) {
				this.layout({ source: Parts.PANEL_PART });
			}
		}));

		this._register(this.sashXTwo.onDidChange((e: ISashEvent) => {
			let doLayout = false;
			let isPanelVisible = this.layoutService.isVisible(Parts.PANEL_PART);
			let newSashWidth = startPanelWidth - (e.currentX - startXTwo);

			// Panel visible
			if (isPanelVisible) {

				// Automatically hide panel when a certain threshold is met
				if (newSashWidth + HIDE_PANEL_WIDTH_THRESHOLD < this.partLayoutInfo.panel.minWidth) {
					let dragCompensation = this.partLayoutInfo.panel.minWidth - HIDE_PANEL_WIDTH_THRESHOLD;
					this.layoutService.setPanelHidden(true);
					startXTwo = Math.min(this.workbenchSize.width - this.activitybarWidth, e.currentX + dragCompensation);
					this.panelWidth = startPanelWidth; // when restoring panel, restore to the panel height we started from
				}

				// Otherwise size the panel accordingly
				else {
					this.panelWidth = newSashWidth;
					doLayout = newSashWidth >= this.partLayoutInfo.panel.minWidth;
				}
			}

			// Panel hidden
			else {
				if (startXTwo - e.currentX >= this.partLayoutInfo.panel.minWidth) {
					startPanelWidth = 0;
					this.panelWidth = this.partLayoutInfo.panel.minWidth;
					this.layoutService.setPanelHidden(false);
				}
			}

			if (doLayout) {
				this.layout({ source: Parts.PANEL_PART });
			}
		}));

		this._register(this.sashXOne.onDidEnd(() => {
			this.storageService.store(WorkbenchLegacyLayout.sashXOneWidthSettingsKey, this.sidebarWidth, StorageScope.GLOBAL);
		}));

		this._register(this.sashY.onDidEnd(() => {
			this.storageService.store(WorkbenchLegacyLayout.sashYHeightSettingsKey, this.panelHeight, StorageScope.GLOBAL);
		}));

		this._register(this.sashXTwo.onDidEnd(() => {
			this.storageService.store(WorkbenchLegacyLayout.sashXTwoWidthSettingsKey, this.panelWidth, StorageScope.GLOBAL);
		}));

		this._register(this.sashY.onDidReset(() => {
			this.panelHeight = this.sidebarHeight * DEFAULT_PANEL_SIZE_COEFFICIENT;
			this.storageService.store(WorkbenchLegacyLayout.sashYHeightSettingsKey, this.panelHeight, StorageScope.GLOBAL);

			this.layout();
		}));

		this._register(this.sashXOne.onDidReset(() => {
			const activeViewlet = this.viewletService.getActiveViewlet();
			const optimalWidth = activeViewlet ? activeViewlet.getOptimalWidth() : null;
			this.sidebarWidth = typeof optimalWidth === 'number' ? Math.max(optimalWidth, DEFAULT_SIDEBAR_PART_WIDTH) : DEFAULT_SIDEBAR_PART_WIDTH;
			this.storageService.store(WorkbenchLegacyLayout.sashXOneWidthSettingsKey, this.sidebarWidth, StorageScope.GLOBAL);

			this.layoutService.setSideBarHidden(false);
			this.layout();
		}));

		this._register(this.sashXTwo.onDidReset(() => {
			this.panelWidth = (this.workbenchSize.width - this.sidebarWidth - this.activitybarWidth) * DEFAULT_PANEL_SIZE_COEFFICIENT;
			this.storageService.store(WorkbenchLegacyLayout.sashXTwoWidthSettingsKey, this.panelWidth, StorageScope.GLOBAL);

			this.layout();
		}));
	}

	layout(options?: ILayoutOptions): void {
		this.workbenchSize = getClientArea(this.parent);

		const isActivityBarHidden = !this.layoutService.isVisible(Parts.ACTIVITYBAR_PART);
		const isTitlebarHidden = !this.layoutService.isVisible(Parts.TITLEBAR_PART);
		const isPanelHidden = !this.layoutService.isVisible(Parts.PANEL_PART);
		const isStatusbarHidden = !this.layoutService.isVisible(Parts.STATUSBAR_PART);
		const isSidebarHidden = !this.layoutService.isVisible(Parts.SIDEBAR_PART);
		const sidebarPosition = this.layoutService.getSideBarPosition();
		const panelPosition = this.layoutService.getPanelPosition();
		const menubarVisibility = this.layoutService.getMenubarVisibility();

		// Sidebar
		if (this.sidebarWidth === -1) {
			this.sidebarWidth = this.workbenchSize.width / 5;
		}

		this.statusbarHeight = isStatusbarHidden ? 0 : this.partLayoutInfo.statusbar.height;
		this.titlebarHeight = isTitlebarHidden ? 0 : this.partLayoutInfo.titlebar.height / (isMacintosh || !menubarVisibility || menubarVisibility === 'hidden' ? getZoomFactor() : 1); // adjust for zoom prevention

		this.sidebarHeight = this.workbenchSize.height - this.statusbarHeight - this.titlebarHeight;
		let sidebarSize = new Dimension(this.sidebarWidth, this.sidebarHeight);

		// Activity Bar
		let activityBarSize = new Dimension(this.activitybarWidth, sidebarSize.height);

		// Panel part
		let panelHeight: number;
		let panelWidth: number;
		const maxPanelHeight = this.computeMaxPanelHeight();
		const maxPanelWidth = this.computeMaxPanelWidth();

		if (isPanelHidden) {
			panelHeight = 0;
			panelWidth = 0;
		} else if (panelPosition === Position.BOTTOM) {
			if (this.panelHeight > 0) {
				panelHeight = Math.min(maxPanelHeight, Math.max(this.partLayoutInfo.panel.minHeight, this.panelHeight));
			} else {
				panelHeight = sidebarSize.height * DEFAULT_PANEL_SIZE_COEFFICIENT;
			}
			panelWidth = this.workbenchSize.width - sidebarSize.width - activityBarSize.width;

			if (options && options.toggleMaximizedPanel) {
				panelHeight = this.panelMaximized ? Math.max(this.partLayoutInfo.panel.minHeight, Math.min(this.panelSizeBeforeMaximized, maxPanelHeight)) : maxPanelHeight;
			}

			this.panelMaximized = panelHeight === maxPanelHeight;
			if (panelHeight / maxPanelHeight < PANEL_SIZE_BEFORE_MAXIMIZED_BOUNDARY) {
				this.panelSizeBeforeMaximized = panelHeight;
			}
		} else {
			panelHeight = sidebarSize.height;
			if (this.panelWidth > 0) {
				panelWidth = Math.min(maxPanelWidth, Math.max(this.partLayoutInfo.panel.minWidth, this.panelWidth));
			} else {
				panelWidth = (this.workbenchSize.width - activityBarSize.width - sidebarSize.width) * DEFAULT_PANEL_SIZE_COEFFICIENT;
			}

			if (options && options.toggleMaximizedPanel) {
				panelWidth = this.panelMaximized ? Math.max(this.partLayoutInfo.panel.minWidth, Math.min(this.panelSizeBeforeMaximized, maxPanelWidth)) : maxPanelWidth;
			}

			this.panelMaximized = panelWidth === maxPanelWidth;
			if (panelWidth / maxPanelWidth < PANEL_SIZE_BEFORE_MAXIMIZED_BOUNDARY) {
				this.panelSizeBeforeMaximized = panelWidth;
			}
		}

		this.storageService.store(WorkbenchLegacyLayout.panelSizeBeforeMaximizedKey, this.panelSizeBeforeMaximized, StorageScope.GLOBAL);

		const panelDimension = new Dimension(panelWidth, panelHeight);

		// Editor
		let editorSize = {
			width: 0,
			height: 0
		};

		editorSize.width = this.workbenchSize.width - sidebarSize.width - activityBarSize.width - (panelPosition === Position.RIGHT ? panelDimension.width : 0);
		editorSize.height = sidebarSize.height - (panelPosition === Position.BOTTOM ? panelDimension.height : 0);

		// Adjust for Editor Part minimum width
		const minimumEditorPartSize = new Dimension(this.parts.editor.minimumWidth, this.parts.editor.minimumHeight);
		if (editorSize.width < minimumEditorPartSize.width) {
			const missingPreferredEditorWidth = minimumEditorPartSize.width - editorSize.width;
			let outstandingMissingPreferredEditorWidth = missingPreferredEditorWidth;

			// Take from Panel if Panel Position on the Right and Visible
			if (!isPanelHidden && panelPosition === Position.RIGHT && (!options || options.source !== Parts.PANEL_PART)) {
				const oldPanelWidth = panelDimension.width;
				panelDimension.width = Math.max(this.partLayoutInfo.panel.minWidth, panelDimension.width - outstandingMissingPreferredEditorWidth);
				outstandingMissingPreferredEditorWidth -= oldPanelWidth - panelDimension.width;
			}

			// Take from Sidebar if Visible
			if (!isSidebarHidden && outstandingMissingPreferredEditorWidth > 0) {
				const oldSidebarWidth = sidebarSize.width;
				sidebarSize.width = Math.max(this.partLayoutInfo.sidebar.minWidth, sidebarSize.width - outstandingMissingPreferredEditorWidth);
				outstandingMissingPreferredEditorWidth -= oldSidebarWidth - sidebarSize.width;
			}

			editorSize.width += missingPreferredEditorWidth - outstandingMissingPreferredEditorWidth;
			if (!isPanelHidden && panelPosition === Position.BOTTOM) {
				panelDimension.width = editorSize.width; // ensure panel width is always following editor width
			}
		}

		// Adjust for Editor Part minimum height
		if (editorSize.height < minimumEditorPartSize.height) {
			const missingPreferredEditorHeight = minimumEditorPartSize.height - editorSize.height;
			let outstandingMissingPreferredEditorHeight = missingPreferredEditorHeight;

			// Take from Panel if Panel Position on the Bottom and Visible
			if (!isPanelHidden && panelPosition === Position.BOTTOM) {
				const oldPanelHeight = panelDimension.height;
				panelDimension.height = Math.max(this.partLayoutInfo.panel.minHeight, panelDimension.height - outstandingMissingPreferredEditorHeight);
				outstandingMissingPreferredEditorHeight -= oldPanelHeight - panelDimension.height;
			}

			editorSize.height += missingPreferredEditorHeight - outstandingMissingPreferredEditorHeight;
		}

		if (!isSidebarHidden) {
			this.sidebarWidth = sidebarSize.width;
			this.storageService.store(WorkbenchLegacyLayout.sashXOneWidthSettingsKey, this.sidebarWidth, StorageScope.GLOBAL);
		}

		if (!isPanelHidden) {
			if (panelPosition === Position.BOTTOM) {
				this.panelHeight = panelDimension.height;
				this.storageService.store(WorkbenchLegacyLayout.sashYHeightSettingsKey, this.panelHeight, StorageScope.GLOBAL);
			} else {
				this.panelWidth = panelDimension.width;
				this.storageService.store(WorkbenchLegacyLayout.sashXTwoWidthSettingsKey, this.panelWidth, StorageScope.GLOBAL);
			}
		}

		// Workbench
		position(this.workbenchContainer, 0, 0, 0, 0, 'relative');
		size(this.workbenchContainer, this.workbenchSize.width, this.workbenchSize.height);

		// Bug on Chrome: Sometimes Chrome wants to scroll the workbench container on layout changes. The fix is to reset scrolling in this case.
		// uses set time to ensure this happens in th next frame (RAF will be at the end of this JS time slice and we don't want that)
		setTimeout(() => {
			const workbenchContainer = this.workbenchContainer;
			if (workbenchContainer.scrollTop > 0) {
				workbenchContainer.scrollTop = 0;
			}
			if (workbenchContainer.scrollLeft > 0) {
				workbenchContainer.scrollLeft = 0;
			}
		});

		// Title Part
		const titleContainer = this.parts.titlebar.getContainer();
		if (isTitlebarHidden) {
			hide(titleContainer);
		} else {
			show(titleContainer);
		}

		// Editor Part and Panel part
		const editorContainer = this.parts.editor.getContainer();
		const panelContainer = this.parts.panel.getContainer();
		size(editorContainer, editorSize.width, editorSize.height);
		size(panelContainer, panelDimension.width, panelDimension.height);

		if (panelPosition === Position.BOTTOM) {
			if (sidebarPosition === Position.LEFT) {
				position(editorContainer, this.titlebarHeight, 0, this.statusbarHeight + panelDimension.height, sidebarSize.width + activityBarSize.width);
				position(panelContainer, editorSize.height + this.titlebarHeight, 0, this.statusbarHeight, sidebarSize.width + activityBarSize.width);
			} else {
				position(editorContainer, this.titlebarHeight, sidebarSize.width, this.statusbarHeight + panelDimension.height, 0);
				position(panelContainer, editorSize.height + this.titlebarHeight, sidebarSize.width, this.statusbarHeight, 0);
			}
		} else {
			if (sidebarPosition === Position.LEFT) {
				position(editorContainer, this.titlebarHeight, panelDimension.width, this.statusbarHeight, sidebarSize.width + activityBarSize.width);
				position(panelContainer, this.titlebarHeight, 0, this.statusbarHeight, sidebarSize.width + activityBarSize.width + editorSize.width);
			} else {
				position(editorContainer, this.titlebarHeight, sidebarSize.width + activityBarSize.width + panelWidth, this.statusbarHeight, 0);
				position(panelContainer, this.titlebarHeight, sidebarSize.width + activityBarSize.width, this.statusbarHeight, editorSize.width);
			}
		}

		// Activity Bar Part
		const activitybarContainer = this.parts.activitybar.getContainer();
		size(activitybarContainer, null, activityBarSize.height);
		if (sidebarPosition === Position.LEFT) {
			this.parts.activitybar.getContainer().style.right = '';
			position(activitybarContainer, this.titlebarHeight, undefined, 0, 0);
		} else {
			this.parts.activitybar.getContainer().style.left = '';
			position(activitybarContainer, this.titlebarHeight, 0, 0, undefined);
		}
		if (isActivityBarHidden) {
			hide(activitybarContainer);
		} else {
			show(activitybarContainer);
		}

		// Sidebar Part
		const sidebarContainer = this.parts.sidebar.getContainer();
		size(sidebarContainer, sidebarSize.width, sidebarSize.height);
		const editorAndPanelWidth = editorSize.width + (panelPosition === Position.RIGHT ? panelWidth : 0);
		if (sidebarPosition === Position.LEFT) {
			position(sidebarContainer, this.titlebarHeight, editorAndPanelWidth, this.statusbarHeight, activityBarSize.width);
		} else {
			position(sidebarContainer, this.titlebarHeight, activityBarSize.width, this.statusbarHeight, editorAndPanelWidth);
		}

		// Statusbar Part
		const statusbarContainer = this.parts.statusbar.getContainer();
		position(statusbarContainer, this.workbenchSize.height - this.statusbarHeight);
		if (isStatusbarHidden) {
			hide(statusbarContainer);
		} else {
			show(statusbarContainer);
		}

		// Sashes
		this.sashXOne.layout();
		if (panelPosition === Position.BOTTOM) {
			this.sashXTwo.hide();
			this.sashY.layout();
			this.sashY.show();
		} else {
			this.sashY.hide();
			this.sashXTwo.layout();
			this.sashXTwo.show();
		}

		// Propagate to Part Layouts
		this.parts.titlebar.layout(this.workbenchSize.width, this.titlebarHeight);
		this.parts.editor.layout(editorSize.width, editorSize.height);
		this.parts.sidebar.layout(sidebarSize.width, sidebarSize.height);
		this.parts.panel.layout(panelDimension.width, panelDimension.height);
		this.parts.activitybar.layout(activityBarSize.width, activityBarSize.height);

		// Propagate to Context View
		this.contextViewService.layout();
	}

	getVerticalSashTop(sash: Sash): number {
		return this.titlebarHeight;
	}

	getVerticalSashLeft(sash: Sash): number {
		let sidebarPosition = this.layoutService.getSideBarPosition();
		if (sash === this.sashXOne) {

			if (sidebarPosition === Position.LEFT) {
				return this.sidebarWidth + this.activitybarWidth;
			}

			return this.workbenchSize.width - this.sidebarWidth - this.activitybarWidth;
		}

		return this.workbenchSize.width - this.panelWidth - (sidebarPosition === Position.RIGHT ? this.sidebarWidth + this.activitybarWidth : 0);
	}

	getVerticalSashHeight(sash: Sash): number {
		if (sash === this.sashXTwo && !this.layoutService.isVisible(Parts.PANEL_PART)) {
			return 0;
		}

		return this.sidebarHeight;
	}

	getHorizontalSashTop(sash: Sash): number {
		const offset = 2; // Horizontal sash should be a bit lower than the editor area, thus add 2px #5524
		return offset + (this.layoutService.isVisible(Parts.PANEL_PART) ? this.sidebarHeight - this.panelHeight + this.titlebarHeight : this.sidebarHeight + this.titlebarHeight);
	}

	getHorizontalSashLeft(sash: Sash): number {
		if (this.layoutService.getSideBarPosition() === Position.RIGHT) {
			return 0;
		}

		return this.sidebarWidth + this.activitybarWidth;
	}

	getHorizontalSashWidth(sash: Sash): number {
		return this.panelWidth;
	}

	isPanelMaximized(): boolean {
		return this.panelMaximized;
	}

	resizePart(part: Parts, sizeChange: number): void {
		const panelPosition = this.layoutService.getPanelPosition();
		const sizeChangePxWidth = this.workbenchSize.width * (sizeChange / 100);
		const sizeChangePxHeight = this.workbenchSize.height * (sizeChange / 100);

		let doLayout = false;
		switch (part) {
			case Parts.SIDEBAR_PART:
				this.sidebarWidth = this.sidebarWidth + sizeChangePxWidth; // Sidebar can not become smaller than MIN_PART_WIDTH

				if (this.workbenchSize.width - this.sidebarWidth < this.parts.editor.minimumWidth) {
					this.sidebarWidth = this.workbenchSize.width - this.parts.editor.minimumWidth;
				}

				doLayout = true;
				break;
			case Parts.PANEL_PART:
				if (panelPosition === Position.BOTTOM) {
					this.panelHeight = this.panelHeight + sizeChangePxHeight;
				} else if (panelPosition === Position.RIGHT) {
					this.panelWidth = this.panelWidth + sizeChangePxWidth;
				}

				doLayout = true;
				break;
			case Parts.EDITOR_PART:
				// If we have one editor we can cheat and resize sidebar with the negative delta
				// If the sidebar is not visible and panel is, resize panel main axis with negative Delta
				if (this.editorGroupService.count === 1) {
					if (this.layoutService.isVisible(Parts.SIDEBAR_PART)) {
						this.sidebarWidth = this.sidebarWidth - sizeChangePxWidth;
						doLayout = true;
					} else if (this.layoutService.isVisible(Parts.PANEL_PART)) {
						if (panelPosition === Position.BOTTOM) {
							this.panelHeight = this.panelHeight - sizeChangePxHeight;
						} else if (panelPosition === Position.RIGHT) {
							this.panelWidth = this.panelWidth - sizeChangePxWidth;
						}
						doLayout = true;
					}
				} else {
					const activeGroup = this.editorGroupService.activeGroup;

					const { width, height } = this.editorGroupService.getSize(activeGroup);
					this.editorGroupService.setSize(activeGroup, { width: width + sizeChangePxWidth, height: height + sizeChangePxHeight });
				}
		}

		if (doLayout) {
			this.layout();
		}
	}
}
