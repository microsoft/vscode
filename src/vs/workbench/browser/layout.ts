/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import * as errors from 'vs/base/common/errors';
import { Part } from 'vs/workbench/browser/part';
import { QuickOpenController } from 'vs/workbench/browser/parts/quickopen/quickOpenController';
import { QuickInputService } from 'vs/workbench/browser/parts/quickinput/quickInput';
import { Sash, ISashEvent, IVerticalSashLayoutProvider, IHorizontalSashLayoutProvider, Orientation } from 'vs/base/browser/ui/sash/sash';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IPartService, Position, ILayoutOptions, Parts } from 'vs/workbench/services/part/common/partService';
import { IViewletService } from 'vs/workbench/services/viewlet/browser/viewlet';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import { IContextViewService } from 'vs/platform/contextview/browser/contextView';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { IEditorGroupService } from 'vs/workbench/services/group/common/groupService';
import { getZoomFactor } from 'vs/base/browser/browser';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { memoize } from 'vs/base/common/decorators';
import { NotificationsCenter } from 'vs/workbench/browser/parts/notifications/notificationsCenter';
import { NotificationsToasts } from 'vs/workbench/browser/parts/notifications/notificationsToasts';
import { Dimension, getClientArea, size, position, hide, show } from 'vs/base/browser/dom';

const MIN_SIDEBAR_PART_WIDTH = 170;
const DEFAULT_SIDEBAR_PART_WIDTH = 300;
const MIN_EDITOR_PART_HEIGHT = 70;
const MIN_EDITOR_PART_WIDTH = 220;
const MIN_PANEL_PART_HEIGHT = 77;
const DEFAULT_PANEL_PART_SIZE = 350;
const MIN_PANEL_PART_WIDTH = 300;
const DEFAULT_PANEL_SIZE_COEFFICIENT = 0.4;
const PANEL_SIZE_BEFORE_MAXIMIZED_BOUNDARY = 0.7;
const HIDE_SIDEBAR_WIDTH_THRESHOLD = 50;
const HIDE_PANEL_HEIGHT_THRESHOLD = 50;
const HIDE_PANEL_WIDTH_THRESHOLD = 100;
const TITLE_BAR_HEIGHT = 22;
const STATUS_BAR_HEIGHT = 22;
const ACTIVITY_BAR_WIDTH = 50;

interface PartLayoutInfo {
	titlebar: { height: number; };
	activitybar: { width: number; };
	sidebar: { minWidth: number; };
	panel: { minHeight: number; minWidth: number; };
	editor: { minWidth: number; minHeight: number; };
	statusbar: { height: number; };
}

/**
 * The workbench layout is responsible to lay out all parts that make the Workbench.
 */
export class WorkbenchLayout implements IVerticalSashLayoutProvider, IHorizontalSashLayoutProvider {

	private static readonly sashXOneWidthSettingsKey = 'workbench.sidebar.width';
	private static readonly sashXTwoWidthSettingsKey = 'workbench.panel.width';
	private static readonly sashYHeightSettingsKey = 'workbench.panel.height';
	private static readonly panelSizeBeforeMaximizedKey = 'workbench.panel.sizeBeforeMaximized';

	private parent: HTMLElement;
	private workbenchContainer: HTMLElement;
	private titlebar: Part;
	private activitybar: Part;
	private editor: Part;
	private sidebar: Part;
	private panel: Part;
	private statusbar: Part;
	private quickopen: QuickOpenController;
	private quickInput: QuickInputService;
	private notificationsCenter: NotificationsCenter;
	private notificationsToasts: NotificationsToasts;
	private toUnbind: IDisposable[];
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
	private layoutEditorGroupsVertically: boolean;

	// Take parts as an object bag since instatation service does not have typings for constructors with 9+ arguments
	constructor(
		parent: HTMLElement,
		workbenchContainer: HTMLElement,
		parts: {
			titlebar: Part,
			activitybar: Part,
			editor: Part,
			sidebar: Part,
			panel: Part,
			statusbar: Part
		},
		quickopen: QuickOpenController,
		quickInput: QuickInputService,
		notificationsCenter: NotificationsCenter,
		notificationsToasts: NotificationsToasts,
		@IStorageService private storageService: IStorageService,
		@IContextViewService private contextViewService: IContextViewService,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IEditorGroupService private editorGroupService: IEditorGroupService,
		@IPartService private partService: IPartService,
		@IViewletService private viewletService: IViewletService,
		@IThemeService themeService: IThemeService
	) {
		this.parent = parent;
		this.workbenchContainer = workbenchContainer;
		this.titlebar = parts.titlebar;
		this.activitybar = parts.activitybar;
		this.editor = parts.editor;
		this.sidebar = parts.sidebar;
		this.panel = parts.panel;
		this.statusbar = parts.statusbar;
		this.quickopen = quickopen;
		this.quickInput = quickInput;
		this.notificationsCenter = notificationsCenter;
		this.notificationsToasts = notificationsToasts;
		this.toUnbind = [];
		this.panelSizeBeforeMaximized = this.storageService.getInteger(WorkbenchLayout.panelSizeBeforeMaximizedKey, StorageScope.GLOBAL, 0);
		this.panelMaximized = false;

		this.sashXOne = new Sash(this.workbenchContainer, this, {
			baseSize: 5
		});

		this.sashXTwo = new Sash(this.workbenchContainer, this, {
			baseSize: 5
		});

		this.sashY = new Sash(this.workbenchContainer, this, {
			baseSize: 4,
			orientation: Orientation.HORIZONTAL
		});

		this._sidebarWidth = Math.max(this.partLayoutInfo.sidebar.minWidth, this.storageService.getInteger(WorkbenchLayout.sashXOneWidthSettingsKey, StorageScope.GLOBAL, DEFAULT_SIDEBAR_PART_WIDTH));
		this._panelHeight = Math.max(this.partLayoutInfo.panel.minHeight, this.storageService.getInteger(WorkbenchLayout.sashYHeightSettingsKey, StorageScope.GLOBAL, DEFAULT_PANEL_PART_SIZE));
		this._panelWidth = Math.max(this.partLayoutInfo.panel.minWidth, this.storageService.getInteger(WorkbenchLayout.sashXTwoWidthSettingsKey, StorageScope.GLOBAL, DEFAULT_PANEL_PART_SIZE));

		this.layoutEditorGroupsVertically = (this.editorGroupService.getGroupOrientation() !== 'horizontal');

		this.toUnbind.push(themeService.onThemeChange(_ => this.layout()));
		this.toUnbind.push(editorGroupService.onEditorsChanged(() => this.onEditorsChanged()));
		this.toUnbind.push(editorGroupService.onGroupOrientationChanged(e => this.onGroupOrientationChanged()));

		this.registerSashListeners();
	}

	private get editorCountForHeight(): number {
		return Math.max(1, this.editorGroupService.getGroupOrientation() === 'horizontal' ? this.editorGroupService.getStacksModel().groups.length : 1);
	}

	private get editorCountForWidth(): number {
		return Math.max(1, this.editorGroupService.getGroupOrientation() === 'vertical' ? this.editorGroupService.getStacksModel().groups.length : 1);
	}

	private get activitybarWidth(): number {
		if (this.partService.isVisible(Parts.ACTIVITYBAR_PART)) {
			return this.partLayoutInfo.activitybar.width;
		}

		return 0;
	}

	private get panelHeight(): number {
		const panelPosition = this.partService.getPanelPosition();
		if (panelPosition === Position.RIGHT) {
			return this.sidebarHeight;
		}

		return this._panelHeight;
	}

	private set panelHeight(value: number) {
		this._panelHeight = Math.min(this.computeMaxPanelHeight(), Math.max(this.partLayoutInfo.panel.minHeight, value));
	}

	private get panelWidth(): number {
		const panelPosition = this.partService.getPanelPosition();
		if (panelPosition === Position.BOTTOM) {
			return this.workbenchSize.width - this.activitybarWidth - this.sidebarWidth;
		}

		return this._panelWidth;
	}

	private set panelWidth(value: number) {
		this._panelWidth = Math.min(this.computeMaxPanelWidth(), Math.max(this.partLayoutInfo.panel.minWidth, value));
	}

	private computeMaxPanelWidth(): number {
		const minSidebarSize = this.partService.isVisible(Parts.SIDEBAR_PART) ? (this.partService.getSideBarPosition() === Position.LEFT ? this.partLayoutInfo.sidebar.minWidth : this.sidebarWidth) : 0;
		return Math.max(this.partLayoutInfo.panel.minWidth, this.workbenchSize.width - this.editorCountForWidth * this.partLayoutInfo.editor.minWidth - minSidebarSize - this.activitybarWidth);
	}

	private computeMaxPanelHeight(): number {
		return Math.max(this.partLayoutInfo.panel.minHeight, this.sidebarHeight - this.editorCountForHeight * this.partLayoutInfo.editor.minHeight);
	}

	private get sidebarWidth(): number {
		if (this.partService.isVisible(Parts.SIDEBAR_PART)) {
			return this._sidebarWidth;
		}

		return 0;
	}

	private set sidebarWidth(value: number) {
		const panelMinWidth = this.partService.getPanelPosition() === Position.RIGHT && this.partService.isVisible(Parts.PANEL_PART) ? this.partLayoutInfo.panel.minWidth : 0;
		const maxSidebarWidth = this.workbenchSize.width - this.activitybarWidth - this.editorCountForWidth * this.partLayoutInfo.editor.minWidth - panelMinWidth;
		this._sidebarWidth = Math.max(this.partLayoutInfo.sidebar.minWidth, Math.min(maxSidebarWidth, value));
	}

	@memoize
	private get partLayoutInfo(): PartLayoutInfo {
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
			editor: {
				minWidth: MIN_EDITOR_PART_WIDTH,
				minHeight: MIN_EDITOR_PART_HEIGHT
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

		this.toUnbind.push(this.sashXOne.onDidStart((e: ISashEvent) => {
			startSidebarWidth = this.sidebarWidth;
			startX = e.startX;
		}));

		this.toUnbind.push(this.sashY.onDidStart((e: ISashEvent) => {
			startPanelHeight = this.panelHeight;
			startY = e.startY;
		}));

		this.toUnbind.push(this.sashXTwo.onDidStart((e: ISashEvent) => {
			startPanelWidth = this.panelWidth;
			startXTwo = e.startX;
		}));

		this.toUnbind.push(this.sashXOne.onDidChange((e: ISashEvent) => {
			let doLayout = false;
			let sidebarPosition = this.partService.getSideBarPosition();
			let isSidebarVisible = this.partService.isVisible(Parts.SIDEBAR_PART);
			let newSashWidth = (sidebarPosition === Position.LEFT) ? startSidebarWidth + e.currentX - startX : startSidebarWidth - e.currentX + startX;
			let promise = TPromise.wrap<void>(null);

			// Sidebar visible
			if (isSidebarVisible) {

				// Automatically hide side bar when a certain threshold is met
				if (newSashWidth + HIDE_SIDEBAR_WIDTH_THRESHOLD < this.partLayoutInfo.sidebar.minWidth) {
					let dragCompensation = this.partLayoutInfo.sidebar.minWidth - HIDE_SIDEBAR_WIDTH_THRESHOLD;
					promise = this.partService.setSideBarHidden(true);
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
					promise = this.partService.setSideBarHidden(false);
				}
			}

			if (doLayout) {
				promise.done(() => this.layout({ source: Parts.SIDEBAR_PART }), errors.onUnexpectedError);
			}
		}));

		this.toUnbind.push(this.sashY.onDidChange((e: ISashEvent) => {
			let doLayout = false;
			let isPanelVisible = this.partService.isVisible(Parts.PANEL_PART);
			let newSashHeight = startPanelHeight - (e.currentY - startY);
			let promise = TPromise.wrap<void>(null);

			// Panel visible
			if (isPanelVisible) {

				// Automatically hide panel when a certain threshold is met
				if (newSashHeight + HIDE_PANEL_HEIGHT_THRESHOLD < this.partLayoutInfo.panel.minHeight) {
					let dragCompensation = this.partLayoutInfo.panel.minHeight - HIDE_PANEL_HEIGHT_THRESHOLD;
					promise = this.partService.setPanelHidden(true);
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
					promise = this.partService.setPanelHidden(false);
				}
			}

			if (doLayout) {
				promise.done(() => this.layout({ source: Parts.PANEL_PART }), errors.onUnexpectedError);
			}
		}));

		this.toUnbind.push(this.sashXTwo.onDidChange((e: ISashEvent) => {
			let doLayout = false;
			let isPanelVisible = this.partService.isVisible(Parts.PANEL_PART);
			let newSashWidth = startPanelWidth - (e.currentX - startXTwo);
			let promise = TPromise.wrap<void>(null);

			// Panel visible
			if (isPanelVisible) {

				// Automatically hide panel when a certain threshold is met
				if (newSashWidth + HIDE_PANEL_WIDTH_THRESHOLD < this.partLayoutInfo.panel.minWidth) {
					let dragCompensation = this.partLayoutInfo.panel.minWidth - HIDE_PANEL_WIDTH_THRESHOLD;
					promise = this.partService.setPanelHidden(true);
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
					promise = this.partService.setPanelHidden(false);
				}
			}

			if (doLayout) {
				promise.done(() => this.layout({ source: Parts.PANEL_PART }), errors.onUnexpectedError);
			}
		}));

		this.toUnbind.push(this.sashXOne.onDidEnd(() => {
			this.storageService.store(WorkbenchLayout.sashXOneWidthSettingsKey, this.sidebarWidth, StorageScope.GLOBAL);
		}));

		this.toUnbind.push(this.sashY.onDidEnd(() => {
			this.storageService.store(WorkbenchLayout.sashYHeightSettingsKey, this.panelHeight, StorageScope.GLOBAL);
		}));

		this.toUnbind.push(this.sashXTwo.onDidEnd(() => {
			this.storageService.store(WorkbenchLayout.sashXTwoWidthSettingsKey, this.panelWidth, StorageScope.GLOBAL);
		}));

		this.toUnbind.push(this.sashY.onDidReset(() => {
			this.panelHeight = this.sidebarHeight * DEFAULT_PANEL_SIZE_COEFFICIENT;
			this.storageService.store(WorkbenchLayout.sashYHeightSettingsKey, this.panelHeight, StorageScope.GLOBAL);
			this.layout();
		}));

		this.toUnbind.push(this.sashXOne.onDidReset(() => {
			let activeViewlet = this.viewletService.getActiveViewlet();
			let optimalWidth = activeViewlet && activeViewlet.getOptimalWidth();
			this.sidebarWidth = Math.max(optimalWidth, DEFAULT_SIDEBAR_PART_WIDTH);
			this.storageService.store(WorkbenchLayout.sashXOneWidthSettingsKey, this.sidebarWidth, StorageScope.GLOBAL);
			this.partService.setSideBarHidden(false).done(() => this.layout(), errors.onUnexpectedError);
		}));

		this.toUnbind.push(this.sashXTwo.onDidReset(() => {
			this.panelWidth = (this.workbenchSize.width - this.sidebarWidth - this.activitybarWidth) * DEFAULT_PANEL_SIZE_COEFFICIENT;
			this.storageService.store(WorkbenchLayout.sashXTwoWidthSettingsKey, this.panelWidth, StorageScope.GLOBAL);
			this.layout();
		}));
	}

	private onEditorsChanged(): void {

		// Make sure that we layout properly in case we detect that the sidebar or panel is large enought to cause
		// multiple opened editors to go below minimal size. The fix is to trigger a layout for any editor
		// input change that falls into this category.
		if (this.workbenchSize && (this.sidebarWidth || this.panelHeight)) {
			let visibleEditors = this.editorService.getVisibleEditors().length;
			const panelVertical = this.partService.getPanelPosition() === Position.RIGHT;
			if (visibleEditors > 1) {
				const sidebarOverflow = this.layoutEditorGroupsVertically && (this.workbenchSize.width - this.sidebarWidth < visibleEditors * this.partLayoutInfo.editor.minWidth);
				const panelOverflow = !this.layoutEditorGroupsVertically && !panelVertical && (this.workbenchSize.height - this.panelHeight < visibleEditors * this.partLayoutInfo.editor.minHeight) ||
					panelVertical && this.layoutEditorGroupsVertically && (this.workbenchSize.width - this.panelWidth - this.sidebarWidth < visibleEditors * this.partLayoutInfo.editor.minWidth);

				if (sidebarOverflow || panelOverflow) {
					this.layout();
				}
			}
		}
	}

	private onGroupOrientationChanged(): void {
		const newLayoutEditorGroupsVertically = (this.editorGroupService.getGroupOrientation() !== 'horizontal');

		const doLayout = this.layoutEditorGroupsVertically !== newLayoutEditorGroupsVertically;
		this.layoutEditorGroupsVertically = newLayoutEditorGroupsVertically;

		if (doLayout) {
			this.layout();
		}
	}

	public layout(options?: ILayoutOptions): void {
		this.workbenchSize = getClientArea(this.parent);

		const isActivityBarHidden = !this.partService.isVisible(Parts.ACTIVITYBAR_PART);
		const isTitlebarHidden = !this.partService.isVisible(Parts.TITLEBAR_PART);
		const isPanelHidden = !this.partService.isVisible(Parts.PANEL_PART);
		const isStatusbarHidden = !this.partService.isVisible(Parts.STATUSBAR_PART);
		const isSidebarHidden = !this.partService.isVisible(Parts.SIDEBAR_PART);
		const sidebarPosition = this.partService.getSideBarPosition();
		const panelPosition = this.partService.getPanelPosition();

		// Sidebar
		if (this.sidebarWidth === -1) {
			this.sidebarWidth = this.workbenchSize.width / 5;
		}

		this.statusbarHeight = isStatusbarHidden ? 0 : this.partLayoutInfo.statusbar.height;
		this.titlebarHeight = isTitlebarHidden ? 0 : this.partLayoutInfo.titlebar.height / getZoomFactor(); // adjust for zoom prevention

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
		this.storageService.store(WorkbenchLayout.panelSizeBeforeMaximizedKey, this.panelSizeBeforeMaximized, StorageScope.GLOBAL);
		const panelDimension = new Dimension(panelWidth, panelHeight);

		// Editor
		let editorSize = {
			width: 0,
			height: 0
		};

		editorSize.width = this.workbenchSize.width - sidebarSize.width - activityBarSize.width - (panelPosition === Position.RIGHT ? panelDimension.width : 0);
		editorSize.height = sidebarSize.height - (panelPosition === Position.BOTTOM ? panelDimension.height : 0);

		// Assert Sidebar and Editor Size to not overflow
		let editorMinWidth = this.partLayoutInfo.editor.minWidth;
		let editorMinHeight = this.partLayoutInfo.editor.minHeight;
		let visibleEditorCount = this.editorService.getVisibleEditors().length;
		if (visibleEditorCount > 1) {
			if (this.layoutEditorGroupsVertically) {
				editorMinWidth *= visibleEditorCount; // when editors layout vertically, multiply the min editor width by number of visible editors
			} else {
				editorMinHeight *= visibleEditorCount; // when editors layout horizontally, multiply the min editor height by number of visible editors
			}
		}

		if (editorSize.width < editorMinWidth) {
			let diff = editorMinWidth - editorSize.width;
			editorSize.width = editorMinWidth;
			if (panelPosition === Position.BOTTOM) {
				panelDimension.width = editorMinWidth;
			} else if (panelDimension.width >= diff && (!options || options.source !== Parts.PANEL_PART)) {
				const oldWidth = panelDimension.width;
				panelDimension.width = Math.max(this.partLayoutInfo.panel.minWidth, panelDimension.width - diff);
				diff = diff - (oldWidth - panelDimension.width);
			}

			if (sidebarSize.width >= diff) {
				sidebarSize.width -= diff;
				sidebarSize.width = Math.max(this.partLayoutInfo.sidebar.minWidth, sidebarSize.width);
			}
		}

		if (editorSize.height < editorMinHeight && panelPosition === Position.BOTTOM) {
			let diff = editorMinHeight - editorSize.height;
			editorSize.height = editorMinHeight;

			panelDimension.height -= diff;
			panelDimension.height = Math.max(this.partLayoutInfo.panel.minHeight, panelDimension.height);
		}

		if (!isSidebarHidden) {
			this.sidebarWidth = sidebarSize.width;
			this.storageService.store(WorkbenchLayout.sashXOneWidthSettingsKey, this.sidebarWidth, StorageScope.GLOBAL);
		}

		if (!isPanelHidden) {
			if (panelPosition === Position.BOTTOM) {
				this.panelHeight = panelDimension.height;
				this.storageService.store(WorkbenchLayout.sashYHeightSettingsKey, this.panelHeight, StorageScope.GLOBAL);
			} else {
				this.panelWidth = panelDimension.width;
				this.storageService.store(WorkbenchLayout.sashXTwoWidthSettingsKey, this.panelWidth, StorageScope.GLOBAL);
			}
		}

		// Workbench
		position(this.workbenchContainer, 0, 0, 0, 0, 'relative');
		size(this.workbenchContainer, this.workbenchSize.width, this.workbenchSize.height);

		// Bug on Chrome: Sometimes Chrome wants to scroll the workbench container on layout changes. The fix is to reset scrolling in this case.
		const workbenchContainer = this.workbenchContainer;
		if (workbenchContainer.scrollTop > 0) {
			workbenchContainer.scrollTop = 0;
		}
		if (workbenchContainer.scrollLeft > 0) {
			workbenchContainer.scrollLeft = 0;
		}

		// Title Part
		const titleContainer = this.titlebar.getContainer();
		if (isTitlebarHidden) {
			hide(titleContainer);
		} else {
			show(titleContainer);
		}

		// Editor Part and Panel part
		const editorContainer = this.editor.getContainer();
		const panelContainer = this.panel.getContainer();
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
		const activitybarContainer = this.activitybar.getContainer();
		size(activitybarContainer, null, activityBarSize.height);
		if (sidebarPosition === Position.LEFT) {
			this.activitybar.getContainer().style.right = '';
			position(activitybarContainer, this.titlebarHeight, null, 0, 0);
		} else {
			this.activitybar.getContainer().style.left = '';
			position(activitybarContainer, this.titlebarHeight, 0, 0, null);
		}
		if (isActivityBarHidden) {
			hide(activitybarContainer);
		} else {
			show(activitybarContainer);
		}

		// Sidebar Part
		const sidebarContainer = this.sidebar.getContainer();
		size(sidebarContainer, sidebarSize.width, sidebarSize.height);
		const editorAndPanelWidth = editorSize.width + (panelPosition === Position.RIGHT ? panelWidth : 0);
		if (sidebarPosition === Position.LEFT) {
			position(sidebarContainer, this.titlebarHeight, editorAndPanelWidth, this.statusbarHeight, activityBarSize.width);
		} else {
			position(sidebarContainer, this.titlebarHeight, activityBarSize.width, this.statusbarHeight, editorAndPanelWidth);
		}

		// Statusbar Part
		const statusbarContainer = this.statusbar.getContainer();
		position(statusbarContainer, this.workbenchSize.height - this.statusbarHeight);
		if (isStatusbarHidden) {
			hide(statusbarContainer);
		} else {
			show(statusbarContainer);
		}

		// Quick open
		this.quickopen.layout(this.workbenchSize);

		// Quick input
		this.quickInput.layout(this.workbenchSize);

		// Notifications
		this.notificationsCenter.layout(this.workbenchSize);
		this.notificationsToasts.layout(this.workbenchSize);

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
		this.titlebar.layout(new Dimension(this.workbenchSize.width, this.titlebarHeight));
		this.editor.layout(new Dimension(editorSize.width, editorSize.height));
		this.sidebar.layout(sidebarSize);
		this.panel.layout(panelDimension);
		this.activitybar.layout(activityBarSize);

		// Propagate to Context View
		this.contextViewService.layout();
	}

	public getVerticalSashTop(sash: Sash): number {
		return this.titlebarHeight;
	}

	public getVerticalSashLeft(sash: Sash): number {
		let sidebarPosition = this.partService.getSideBarPosition();
		if (sash === this.sashXOne) {

			if (sidebarPosition === Position.LEFT) {
				return this.sidebarWidth + this.activitybarWidth;
			}

			return this.workbenchSize.width - this.sidebarWidth - this.activitybarWidth;
		}

		return this.workbenchSize.width - this.panelWidth - (sidebarPosition === Position.RIGHT ? this.sidebarWidth + this.activitybarWidth : 0);
	}

	public getVerticalSashHeight(sash: Sash): number {
		if (sash === this.sashXTwo && !this.partService.isVisible(Parts.PANEL_PART)) {
			return 0;
		}

		return this.sidebarHeight;
	}

	public getHorizontalSashTop(sash: Sash): number {
		// Horizontal sash should be a bit lower than the editor area, thus add 2px #5524
		return 2 + (this.partService.isVisible(Parts.PANEL_PART) ? this.sidebarHeight - this.panelHeight + this.titlebarHeight : this.sidebarHeight + this.titlebarHeight);
	}

	public getHorizontalSashLeft(sash: Sash): number {
		if (this.partService.getSideBarPosition() === Position.RIGHT) {
			return 0;
		}

		return this.sidebarWidth + this.activitybarWidth;
	}

	public getHorizontalSashWidth(sash: Sash): number {
		return this.panelWidth;
	}

	public isPanelMaximized(): boolean {
		return this.panelMaximized;
	}

	// change part size along the main axis
	public resizePart(part: Parts, sizeChange: number): void {
		const panelPosition = this.partService.getPanelPosition();
		const sizeChangePxWidth = this.workbenchSize.width * (sizeChange / 100);
		const sizeChangePxHeight = this.workbenchSize.height * (sizeChange / 100);

		let doLayout = false;

		switch (part) {
			case Parts.SIDEBAR_PART:
				this.sidebarWidth = this.sidebarWidth + sizeChangePxWidth; // Sidebar can not become smaller than MIN_PART_WIDTH

				if (this.layoutEditorGroupsVertically && (this.workbenchSize.width - this.sidebarWidth < this.editorCountForWidth * MIN_EDITOR_PART_WIDTH)) {
					this.sidebarWidth = (this.workbenchSize.width - this.editorCountForWidth * MIN_EDITOR_PART_WIDTH);
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
				if (this.editorCountForWidth === 1) {
					if (this.partService.isVisible(Parts.SIDEBAR_PART)) {
						this.sidebarWidth = this.sidebarWidth - sizeChangePxWidth;
						doLayout = true;
					} else if (this.partService.isVisible(Parts.PANEL_PART)) {
						if (panelPosition === Position.BOTTOM) {
							this.panelHeight = this.panelHeight - sizeChangePxHeight;
						} else if (panelPosition === Position.RIGHT) {
							this.panelWidth = this.panelWidth - sizeChangePxWidth;
						}
						doLayout = true;
					}

				} else {
					const stacks = this.editorGroupService.getStacksModel();
					const activeGroup = stacks.positionOfGroup(stacks.activeGroup);

					this.editorGroupService.resizeGroup(activeGroup, sizeChangePxWidth);
					doLayout = false;
				}
		}

		if (doLayout) {
			this.layout();
		}
	}

	public dispose(): void {
		if (this.toUnbind) {
			dispose(this.toUnbind);
			this.toUnbind = null;
		}
	}
}
