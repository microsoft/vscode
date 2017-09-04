/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { Dimension, Builder } from 'vs/base/browser/builder';
import { TPromise } from 'vs/base/common/winjs.base';
import * as errors from 'vs/base/common/errors';
import { Part } from 'vs/workbench/browser/part';
import { QuickOpenController } from 'vs/workbench/browser/parts/quickopen/quickOpenController';
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

const MIN_SIDEBAR_PART_WIDTH = 170;
const MIN_EDITOR_PART_HEIGHT = 70;
const MIN_EDITOR_PART_WIDTH = 220;
const MIN_PANEL_PART_HEIGHT = 77;
const DEFAULT_PANEL_HEIGHT_COEFFICIENT = 0.4;
const HIDE_SIDEBAR_WIDTH_THRESHOLD = 50;
const HIDE_PANEL_HEIGHT_THRESHOLD = 50;
const TITLE_BAR_HEIGHT = 22;
const STATUS_BAR_HEIGHT = 22;
const ACTIVITY_BAR_WIDTH = 50;

interface PartLayoutInfo {
	titlebar: { height: number; };
	activitybar: { width: number; };
	sidebar: { minWidth: number; };
	panel: { minHeight: number; };
	editor: { minWidth: number; minHeight: number; };
	statusbar: { height: number; };
}

/**
 * The workbench layout is responsible to lay out all parts that make the Workbench.
 */
export class WorkbenchLayout implements IVerticalSashLayoutProvider, IHorizontalSashLayoutProvider {

	private static sashXWidthSettingsKey = 'workbench.sidebar.width';
	private static sashYHeightSettingsKey = 'workbench.panel.height';

	private parent: Builder;
	private workbenchContainer: Builder;
	private titlebar: Part;
	private activitybar: Part;
	private editor: Part;
	private sidebar: Part;
	private panel: Part;
	private statusbar: Part;
	private quickopen: QuickOpenController;
	private toUnbind: IDisposable[];
	private partLayoutInfo: PartLayoutInfo;
	private workbenchSize: Dimension;
	private sashX: Sash;
	private sashY: Sash;
	private startSidebarWidth: number;
	private sidebarWidth: number;
	private sidebarHeight: number;
	private titlebarHeight: number;
	private activitybarWidth: number;
	private statusbarHeight: number;
	private startPanelHeight: number;
	private panelHeight: number;
	private panelHeightBeforeMaximized: number;
	private panelMaximized: boolean;
	private panelWidth: number;
	private layoutEditorGroupsVertically: boolean;

	// Take parts as an object bag since instatation service does not have typings for constructors with 9+ arguments
	constructor(
		parent: Builder,
		workbenchContainer: Builder,
		parts: {
			titlebar: Part,
			activitybar: Part,
			editor: Part,
			sidebar: Part,
			panel: Part,
			statusbar: Part
		},
		quickopen: QuickOpenController,
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
		this.toUnbind = [];
		this.partLayoutInfo = this.getPartLayoutInfo();
		this.panelHeightBeforeMaximized = 0;
		this.panelMaximized = false;

		this.sashX = new Sash(this.workbenchContainer.getHTMLElement(), this, {
			baseSize: 5
		});

		this.sashY = new Sash(this.workbenchContainer.getHTMLElement(), this, {
			baseSize: 4,
			orientation: Orientation.HORIZONTAL
		});

		this.sidebarWidth = this.storageService.getInteger(WorkbenchLayout.sashXWidthSettingsKey, StorageScope.GLOBAL, -1);
		this.panelHeight = this.storageService.getInteger(WorkbenchLayout.sashYHeightSettingsKey, StorageScope.GLOBAL, 0);

		this.layoutEditorGroupsVertically = (this.editorGroupService.getGroupOrientation() !== 'horizontal');

		this.toUnbind.push(themeService.onThemeChange(_ => this.layout()));
		this.toUnbind.push(editorGroupService.onEditorsChanged(() => this.onEditorsChanged()));
		this.toUnbind.push(editorGroupService.onGroupOrientationChanged(e => this.onGroupOrientationChanged()));

		this.registerSashListeners();
	}

	private getPartLayoutInfo(): PartLayoutInfo {
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
				minHeight: MIN_PANEL_PART_HEIGHT
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

		this.sashX.addListener('start', (e: ISashEvent) => {
			this.startSidebarWidth = this.sidebarWidth;
			startX = e.startX;
		});

		this.sashY.addListener('start', (e: ISashEvent) => {
			this.startPanelHeight = this.panelHeight;
			startY = e.startY;
		});

		this.sashX.addListener('change', (e: ISashEvent) => {
			let doLayout = false;
			let sidebarPosition = this.partService.getSideBarPosition();
			let isSidebarVisible = this.partService.isVisible(Parts.SIDEBAR_PART);
			let newSashWidth = (sidebarPosition === Position.LEFT) ? this.startSidebarWidth + e.currentX - startX : this.startSidebarWidth - e.currentX + startX;
			let promise = TPromise.as<void>(null);

			// Sidebar visible
			if (isSidebarVisible) {

				// Automatically hide side bar when a certain threshold is met
				if (newSashWidth + HIDE_SIDEBAR_WIDTH_THRESHOLD < this.partLayoutInfo.sidebar.minWidth) {
					let dragCompensation = MIN_SIDEBAR_PART_WIDTH - HIDE_SIDEBAR_WIDTH_THRESHOLD;
					promise = this.partService.setSideBarHidden(true);
					startX = (sidebarPosition === Position.LEFT) ? Math.max(this.activitybarWidth, e.currentX - dragCompensation) : Math.min(e.currentX + dragCompensation, this.workbenchSize.width - this.activitybarWidth);
					this.sidebarWidth = this.startSidebarWidth; // when restoring sidebar, restore to the sidebar width we started from
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
					this.startSidebarWidth = this.partLayoutInfo.sidebar.minWidth - (sidebarPosition === Position.LEFT ? e.currentX - startX : startX - e.currentX);
					this.sidebarWidth = this.partLayoutInfo.sidebar.minWidth;
					promise = this.partService.setSideBarHidden(false);
				}
			}

			if (doLayout) {
				promise.done(() => this.layout(), errors.onUnexpectedError);
			}
		});

		this.sashY.addListener('change', (e: ISashEvent) => {
			let doLayout = false;
			let isPanelVisible = this.partService.isVisible(Parts.PANEL_PART);
			let newSashHeight = this.startPanelHeight - (e.currentY - startY);
			let promise = TPromise.as<void>(null);

			// Panel visible
			if (isPanelVisible) {

				// Automatically hide panel when a certain threshold is met
				if (newSashHeight + HIDE_PANEL_HEIGHT_THRESHOLD < this.partLayoutInfo.panel.minHeight) {
					let dragCompensation = MIN_PANEL_PART_HEIGHT - HIDE_PANEL_HEIGHT_THRESHOLD;
					promise = this.partService.setPanelHidden(true);
					startY = Math.min(this.sidebarHeight - this.statusbarHeight - this.titlebarHeight, e.currentY + dragCompensation);
					this.panelHeight = this.startPanelHeight; // when restoring panel, restore to the panel height we started from
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
					this.startPanelHeight = 0;
					this.panelHeight = this.partLayoutInfo.panel.minHeight;
					promise = this.partService.setPanelHidden(false);
				}
			}

			if (doLayout) {
				promise.done(() => this.layout(), errors.onUnexpectedError);
			}
		});

		this.sashX.addListener('end', () => {
			this.storageService.store(WorkbenchLayout.sashXWidthSettingsKey, this.sidebarWidth, StorageScope.GLOBAL);
		});

		this.sashY.addListener('end', () => {
			this.storageService.store(WorkbenchLayout.sashYHeightSettingsKey, this.panelHeight, StorageScope.GLOBAL);
		});

		this.sashY.addListener('reset', () => {
			this.panelHeight = this.sidebarHeight * DEFAULT_PANEL_HEIGHT_COEFFICIENT;
			this.storageService.store(WorkbenchLayout.sashYHeightSettingsKey, this.panelHeight, StorageScope.GLOBAL);
			this.partService.setPanelHidden(false).done(() => this.layout(), errors.onUnexpectedError);
		});

		this.sashX.addListener('reset', () => {
			let activeViewlet = this.viewletService.getActiveViewlet();
			let optimalWidth = activeViewlet && activeViewlet.getOptimalWidth();
			this.sidebarWidth = Math.max(MIN_SIDEBAR_PART_WIDTH, optimalWidth || 0);
			this.storageService.store(WorkbenchLayout.sashXWidthSettingsKey, this.sidebarWidth, StorageScope.GLOBAL);
			this.partService.setSideBarHidden(false).done(() => this.layout(), errors.onUnexpectedError);
		});
	}

	private onEditorsChanged(): void {

		// Make sure that we layout properly in case we detect that the sidebar or panel is large enought to cause
		// multiple opened editors to go below minimal size. The fix is to trigger a layout for any editor
		// input change that falls into this category.
		if (this.workbenchSize && (this.sidebarWidth || this.panelHeight)) {
			let visibleEditors = this.editorService.getVisibleEditors().length;
			if (visibleEditors > 1) {
				const sidebarOverflow = this.layoutEditorGroupsVertically && (this.workbenchSize.width - this.sidebarWidth < visibleEditors * MIN_EDITOR_PART_WIDTH);
				const panelOverflow = !this.layoutEditorGroupsVertically && (this.workbenchSize.height - this.panelHeight < visibleEditors * MIN_EDITOR_PART_HEIGHT);

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
		this.workbenchSize = this.parent.getClientArea();

		const isActivityBarHidden = !this.partService.isVisible(Parts.ACTIVITYBAR_PART);
		const isTitlebarHidden = !this.partService.isVisible(Parts.TITLEBAR_PART);
		const isPanelHidden = !this.partService.isVisible(Parts.PANEL_PART);
		const isStatusbarHidden = !this.partService.isVisible(Parts.STATUSBAR_PART);
		const isSidebarHidden = !this.partService.isVisible(Parts.SIDEBAR_PART);
		const sidebarPosition = this.partService.getSideBarPosition();

		// Sidebar
		let sidebarWidth: number;
		if (isSidebarHidden) {
			sidebarWidth = 0;
		} else if (this.sidebarWidth !== -1) {
			sidebarWidth = Math.max(this.partLayoutInfo.sidebar.minWidth, this.sidebarWidth);
		} else {
			sidebarWidth = this.workbenchSize.width / 5;
			this.sidebarWidth = sidebarWidth;
		}

		this.statusbarHeight = isStatusbarHidden ? 0 : this.partLayoutInfo.statusbar.height;
		this.titlebarHeight = isTitlebarHidden ? 0 : this.partLayoutInfo.titlebar.height / getZoomFactor(); // adjust for zoom prevention

		const previousMaxPanelHeight = this.sidebarHeight - MIN_EDITOR_PART_HEIGHT;
		this.sidebarHeight = this.workbenchSize.height - this.statusbarHeight - this.titlebarHeight;
		let sidebarSize = new Dimension(sidebarWidth, this.sidebarHeight);

		// Activity Bar
		this.activitybarWidth = isActivityBarHidden ? 0 : this.partLayoutInfo.activitybar.width;
		let activityBarSize = new Dimension(this.activitybarWidth, sidebarSize.height);

		// Panel part
		let panelHeight: number;
		const editorCountForHeight = this.editorGroupService.getGroupOrientation() === 'horizontal' ? this.editorGroupService.getStacksModel().groups.length : 1;
		const maxPanelHeight = sidebarSize.height - editorCountForHeight * MIN_EDITOR_PART_HEIGHT;
		if (isPanelHidden) {
			panelHeight = 0;
		} else if (this.panelHeight === previousMaxPanelHeight) {
			panelHeight = maxPanelHeight;
		} else if (this.panelHeight > 0) {
			panelHeight = Math.min(maxPanelHeight, Math.max(this.partLayoutInfo.panel.minHeight, this.panelHeight));
		} else {
			panelHeight = sidebarSize.height * DEFAULT_PANEL_HEIGHT_COEFFICIENT;
		}
		if (options && options.toggleMaximizedPanel) {
			panelHeight = this.panelMaximized ? Math.max(this.partLayoutInfo.panel.minHeight, Math.min(this.panelHeightBeforeMaximized, maxPanelHeight)) : maxPanelHeight;
		}
		this.panelMaximized = panelHeight === maxPanelHeight;
		if (panelHeight / maxPanelHeight < 0.7) {
			// Remember the previous height only if the panel size is not too large.
			// To get a nice minimize effect even if a user dragged the panel sash to maximum.
			this.panelHeightBeforeMaximized = panelHeight;
		}
		const panelDimension = new Dimension(this.workbenchSize.width - sidebarSize.width - activityBarSize.width, panelHeight);
		this.panelWidth = panelDimension.width;

		// Editor
		let editorSize = {
			width: 0,
			height: 0,
			remainderLeft: 0,
			remainderRight: 0
		};

		editorSize.width = panelDimension.width;
		editorSize.height = sidebarSize.height - panelDimension.height;

		// Sidebar hidden
		if (isSidebarHidden) {
			editorSize.width = this.workbenchSize.width - activityBarSize.width;

			if (sidebarPosition === Position.LEFT) {
				editorSize.remainderLeft = Math.round((this.workbenchSize.width - editorSize.width + activityBarSize.width) / 2);
				editorSize.remainderRight = this.workbenchSize.width - editorSize.width - editorSize.remainderLeft;
			} else {
				editorSize.remainderRight = Math.round((this.workbenchSize.width - editorSize.width + activityBarSize.width) / 2);
				editorSize.remainderLeft = this.workbenchSize.width - editorSize.width - editorSize.remainderRight;
			}
		}

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
			panelDimension.width = editorMinWidth;
			sidebarSize.width -= diff;
			sidebarSize.width = Math.max(MIN_SIDEBAR_PART_WIDTH, sidebarSize.width);
		}

		if (editorSize.height < editorMinHeight) {
			let diff = editorMinHeight - editorSize.height;
			editorSize.height = editorMinHeight;
			panelDimension.height -= diff;
			panelDimension.height = Math.max(MIN_PANEL_PART_HEIGHT, panelDimension.height);
		}

		if (!isSidebarHidden) {
			this.sidebarWidth = sidebarSize.width;
			this.storageService.store(WorkbenchLayout.sashXWidthSettingsKey, this.sidebarWidth, StorageScope.GLOBAL);
		}

		if (!isPanelHidden) {
			this.panelHeight = panelDimension.height;
			this.storageService.store(WorkbenchLayout.sashYHeightSettingsKey, this.panelHeight, StorageScope.GLOBAL);
		}

		// Workbench
		this.workbenchContainer
			.position(0, 0, 0, 0, 'relative')
			.size(this.workbenchSize.width, this.workbenchSize.height);

		// Bug on Chrome: Sometimes Chrome wants to scroll the workbench container on layout changes. The fix is to reset scrolling in this case.
		const workbenchContainer = this.workbenchContainer.getHTMLElement();
		if (workbenchContainer.scrollTop > 0) {
			workbenchContainer.scrollTop = 0;
		}
		if (workbenchContainer.scrollLeft > 0) {
			workbenchContainer.scrollLeft = 0;
		}

		// Title Part
		if (isTitlebarHidden) {
			this.titlebar.getContainer().hide();
		} else {
			this.titlebar.getContainer().show();
		}

		// Editor Part and Panel part
		this.editor.getContainer().size(editorSize.width, editorSize.height);
		this.panel.getContainer().size(panelDimension.width, panelDimension.height);

		const editorBottom = this.statusbarHeight + panelDimension.height;
		if (isSidebarHidden) {
			this.editor.getContainer().position(this.titlebarHeight, editorSize.remainderRight, editorBottom, editorSize.remainderLeft);
			this.panel.getContainer().position(editorSize.height + this.titlebarHeight, editorSize.remainderRight, this.statusbarHeight, editorSize.remainderLeft);
		} else if (sidebarPosition === Position.LEFT) {
			this.editor.getContainer().position(this.titlebarHeight, 0, editorBottom, sidebarSize.width + activityBarSize.width);
			this.panel.getContainer().position(editorSize.height + this.titlebarHeight, 0, this.statusbarHeight, sidebarSize.width + activityBarSize.width);
		} else {
			this.editor.getContainer().position(this.titlebarHeight, sidebarSize.width, editorBottom, 0);
			this.panel.getContainer().position(editorSize.height + this.titlebarHeight, sidebarSize.width, this.statusbarHeight, 0);
		}

		// Activity Bar Part
		this.activitybar.getContainer().size(null, activityBarSize.height);
		if (sidebarPosition === Position.LEFT) {
			this.activitybar.getContainer().getHTMLElement().style.right = '';
			this.activitybar.getContainer().position(this.titlebarHeight, null, 0, 0);
		} else {
			this.activitybar.getContainer().getHTMLElement().style.left = '';
			this.activitybar.getContainer().position(this.titlebarHeight, 0, 0, null);
		}
		if (isActivityBarHidden) {
			this.activitybar.getContainer().hide();
		} else {
			this.activitybar.getContainer().show();
		}

		// Sidebar Part
		this.sidebar.getContainer().size(sidebarSize.width, sidebarSize.height);

		if (sidebarPosition === Position.LEFT) {
			this.sidebar.getContainer().position(this.titlebarHeight, editorSize.width, 0, activityBarSize.width);
		} else {
			this.sidebar.getContainer().position(this.titlebarHeight, null, 0, editorSize.width);
		}

		// Statusbar Part
		this.statusbar.getContainer().position(this.workbenchSize.height - this.statusbarHeight);
		if (isStatusbarHidden) {
			this.statusbar.getContainer().hide();
		} else {
			this.statusbar.getContainer().show();
		}

		// Quick open
		this.quickopen.layout(this.workbenchSize);

		// Sashes
		this.sashX.layout();
		this.sashY.layout();

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
		let isSidebarVisible = this.partService.isVisible(Parts.SIDEBAR_PART);
		let sidebarPosition = this.partService.getSideBarPosition();

		if (sidebarPosition === Position.LEFT) {
			return isSidebarVisible ? this.sidebarWidth + this.activitybarWidth : this.activitybarWidth;
		}

		return isSidebarVisible ? this.workbenchSize.width - this.sidebarWidth - this.activitybarWidth : this.workbenchSize.width - this.activitybarWidth;
	}

	public getVerticalSashHeight(sash: Sash): number {
		return this.sidebarHeight;
	}

	public getHorizontalSashTop(sash: Sash): number {
		// Horizontal sash should be a bit lower than the editor area, thus add 2px #5524
		return 2 + (this.partService.isVisible(Parts.PANEL_PART) ? this.sidebarHeight - this.panelHeight + this.titlebarHeight : this.sidebarHeight + this.titlebarHeight);
	}

	public getHorizontalSashLeft(sash: Sash): number {
		return this.partService.getSideBarPosition() === Position.LEFT ? this.getVerticalSashLeft(sash) : 0;
	}

	public getHorizontalSashWidth(sash: Sash): number {
		return this.panelWidth;
	}

	public isPanelMaximized(): boolean {
		return this.panelMaximized;
	}

	// change part size along the main axis
	public resizePart(part: Parts, sizeChange: number): void {
		const visibleEditors = this.editorService.getVisibleEditors().length;
		const sizeChangePxWidth = this.workbenchSize.width * (sizeChange / 100);
		const sizeChangePxHeight = this.workbenchSize.height * (sizeChange / 100);

		let doLayout = false;
		let newSashSize: number = 0;

		switch (part) {
			case Parts.SIDEBAR_PART:
				newSashSize = this.sidebarWidth + sizeChangePxWidth;
				this.sidebarWidth = Math.max(this.partLayoutInfo.sidebar.minWidth, newSashSize); // Sidebar can not become smaller than MIN_PART_WIDTH

				if (this.layoutEditorGroupsVertically && (this.workbenchSize.width - this.sidebarWidth < visibleEditors * MIN_EDITOR_PART_WIDTH)) {
					this.sidebarWidth = (this.workbenchSize.width - visibleEditors * MIN_EDITOR_PART_WIDTH);
				}

				doLayout = true;
				break;
			case Parts.PANEL_PART:
				newSashSize = this.panelHeight + sizeChangePxHeight;
				this.panelHeight = Math.max(this.partLayoutInfo.panel.minHeight, newSashSize);
				doLayout = true;
				break;
			case Parts.EDITOR_PART:
				// If we have one editor we can cheat and resize sidebar with the negative delta
				const visibleEditorCount = this.editorService.getVisibleEditors().length;

				if (visibleEditorCount === 1) {
					this.sidebarWidth = this.sidebarWidth - sizeChangePxWidth;
					doLayout = true;
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