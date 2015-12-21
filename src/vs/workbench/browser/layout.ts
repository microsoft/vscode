/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {Dimension, Builder, Box} from 'vs/base/browser/builder';
import {Preferences} from 'vs/workbench/common/constants';
import {EditorEvent, EventType} from 'vs/workbench/browser/events';
import {Part} from 'vs/workbench/browser/part';
import {QuickOpenController} from 'vs/workbench/browser/parts/quickopen/quickOpenController';
import {Sash, ISashEvent, IVerticalSashLayoutProvider} from 'vs/base/browser/ui/sash/sash';
import {IWorkbenchEditorService} from 'vs/workbench/services/editor/common/editorService';
import {IPartService, Position} from 'vs/workbench/services/part/common/partService';
import {IWorkspaceContextService} from 'vs/workbench/services/workspace/common/contextService';
import {IStorageService, StorageScope, StorageEventType} from 'vs/platform/storage/common/storage';
import {IContextViewService} from 'vs/platform/contextview/browser/contextView';
import {IEventService} from 'vs/platform/event/common/event';

const DEFAULT_MIN_PART_WIDTH = 170;
const HIDE_SIDEBAR_WIDTH_THRESHOLD = 50;

const LAYOUT_RELATED_PREFERENCES = [
	Preferences.THEME
];

export class LayoutOptions {
	public margin: Box;

	constructor() {
		this.margin = new Box(0, 0, 0, 0);
	}

	public setMargin(margin: Box): LayoutOptions {
		this.margin = margin;

		return this;
	}
}

interface ComputedStyles {
	activitybar: { minWidth: number; };
	sidebar: { minWidth: number; };
	editor: { minWidth: number; };
	statusbar: { height: number; };
}

/**
 * The workbench layout is responsible to lay out all parts that make the Monaco Workbench.
 */
export class WorkbenchLayout implements IVerticalSashLayoutProvider {

	private static sashWidthSettingsKey = 'workbench.sidebar.width';

	private parent: Builder;
	private workbenchContainer: Builder;
	private activitybar: Part;
	private editor: Part;
	private sidebar: Part;
	private statusbar: Part;
	private quickopen: QuickOpenController;
	private options: LayoutOptions;
	private toUnbind: { (): void; }[];
	private computedStyles: ComputedStyles;
	private editorHeight: number;
	private workbenchSize: Dimension;
	private sash: Sash;
	private startSidebarWidth: number;
	private sidebarWidth: number;

	constructor(
		parent: Builder,
		workbenchContainer: Builder,
		activitybar: Part,
		editor: Part,
		sidebar: Part,
		statusbar: Part,
		quickopen: QuickOpenController,
		options: LayoutOptions,
		@IStorageService private storageService: IStorageService,
		@IEventService private eventService: IEventService,
		@IContextViewService private contextViewService: IContextViewService,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@IPartService private partService: IPartService
	) {
		this.parent = parent;
		this.workbenchContainer = workbenchContainer;
		this.activitybar = activitybar;
		this.editor = editor;
		this.sidebar = sidebar;
		this.statusbar = statusbar;
		this.quickopen = quickopen;
		this.options = options || new LayoutOptions();
		this.toUnbind = [];
		this.computedStyles = null;
		this.sash = new Sash(this.workbenchContainer.getHTMLElement(), this, {
			baseSize: 5
		});

		this.sidebarWidth = this.storageService.getInteger(WorkbenchLayout.sashWidthSettingsKey, StorageScope.GLOBAL, -1);

		this.registerListeners();
		this.registerSashListeners();
	}

	private registerListeners(): void {
		this.toUnbind.push(this.eventService.addListener(StorageEventType.STORAGE, (e: StorageEvent) => this.onPreferenceChange(e)));
		this.toUnbind.push(this.eventService.addListener(EventType.EDITOR_INPUT_CHANGING, (e: EditorEvent) => this.onEditorInputChanging(e)));
	}

	private registerSashListeners(): void {
		let startX: number = 0;

		this.sash.addListener('start', (e: ISashEvent) => {
			this.startSidebarWidth = this.sidebarWidth;
			startX = e.startX;
		});

		this.sash.addListener('change', (e: ISashEvent) => {
			let doLayout = false;
			let sidebarPosition = this.partService.getSideBarPosition();
			let isSidebarHidden = this.partService.isSideBarHidden();
			let newSashWidth = (sidebarPosition === Position.LEFT) ? this.startSidebarWidth + e.currentX - startX : this.startSidebarWidth - e.currentX + startX;

			// Sidebar visible
			if (!isSidebarHidden) {

				// Automatically hide side bar when a certain threshold is met
				if (newSashWidth + HIDE_SIDEBAR_WIDTH_THRESHOLD < this.computedStyles.sidebar.minWidth) {
					let dragCompensation = DEFAULT_MIN_PART_WIDTH - HIDE_SIDEBAR_WIDTH_THRESHOLD;
					this.partService.setSideBarHidden(true);
					startX = (sidebarPosition === Position.LEFT) ? Math.max(this.computedStyles.activitybar.minWidth, e.currentX - dragCompensation) : Math.min(e.currentX + dragCompensation, this.workbenchSize.width - this.computedStyles.activitybar.minWidth);
					this.sidebarWidth = this.startSidebarWidth; // when restoring sidebar, restore to the sidebar width we started from
				}

				// Otherwise size the sidebar accordingly
				else {
					this.sidebarWidth = Math.max(this.computedStyles.sidebar.minWidth, newSashWidth); // Sidebar can not become smaller than MIN_PART_WIDTH
					doLayout = newSashWidth >= this.computedStyles.sidebar.minWidth;
				}
			}

			// Sidebar hidden
			else {
				if ((sidebarPosition === Position.LEFT && e.currentX - startX >= this.computedStyles.sidebar.minWidth) ||
					(sidebarPosition === Position.RIGHT && startX - e.currentX >= this.computedStyles.sidebar.minWidth)) {
					this.startSidebarWidth = this.computedStyles.sidebar.minWidth - (sidebarPosition === Position.LEFT ? e.currentX - startX : startX - e.currentX);
					this.sidebarWidth = this.computedStyles.sidebar.minWidth;
					this.partService.setSideBarHidden(false);
				}
			}

			if (doLayout) {
				this.layout();
			}
		});

		this.sash.addListener('end', () => {
			this.storageService.store(WorkbenchLayout.sashWidthSettingsKey, this.sidebarWidth, StorageScope.GLOBAL);
		});
	}

	private onEditorInputChanging(e: EditorEvent): void {

		// Make sure that we layout properly in case we detect that the sidebar is large enought to cause
		// multiple opened editors to go below minimal size. The fix is to trigger a layout for any editor
		// input change that falls into this category.
		if (this.workbenchSize && this.sidebarWidth) {
			let visibleEditors = this.editorService.getVisibleEditors().length;
			if (visibleEditors > 1 && this.workbenchSize.width - this.sidebarWidth < visibleEditors * DEFAULT_MIN_PART_WIDTH) {
				this.layout();
			}
		}
	}

	private onPreferenceChange(e: StorageEvent): void {
		if (e.key && LAYOUT_RELATED_PREFERENCES.indexOf(e.key) >= 0) {

			// Recompute Styles
			this.computeStyle();
			this.editor.getLayout().computeStyle();
			this.sidebar.getLayout().computeStyle();

			// Trigger Layout
			this.layout();
		}
	}

	private computeStyle(): void {
		let sidebarStyle = this.sidebar.getContainer().getComputedStyle();
		let editorStyle = this.editor.getContainer().getComputedStyle();
		let activitybarStyle = this.activitybar.getContainer().getComputedStyle();

		this.computedStyles = {
			activitybar: {
				minWidth: parseInt(activitybarStyle.getPropertyValue('min-width'), 10) || 0
			},

			sidebar: {
				minWidth: parseInt(sidebarStyle.getPropertyValue('min-width'), 10) || DEFAULT_MIN_PART_WIDTH
			},

			editor: {
				minWidth: parseInt(editorStyle.getPropertyValue('min-width'), 10) || DEFAULT_MIN_PART_WIDTH
			},

			statusbar: {
				height: 0
			}
		};

		if (this.statusbar) {
			let statusbarStyle = this.statusbar.getContainer().getComputedStyle();
			this.computedStyles.statusbar.height = parseInt(statusbarStyle.getPropertyValue('height'), 10) || 18;
		}
	}

	public layout(forceStyleReCompute?: boolean): void {
		if (forceStyleReCompute) {
			this.computeStyle();
			this.editor.getLayout().computeStyle();
			this.sidebar.getLayout().computeStyle();
		}

		if (!this.computedStyles) {
			this.computeStyle();
		}

		this.workbenchSize = this.getWorkbenchArea();

		let isSidebarHidden = this.partService.isSideBarHidden();
		let sidebarPosition = this.partService.getSideBarPosition();

		// Sidebar
		let sidebarWidth: number;
		if (isSidebarHidden) {
			sidebarWidth = 0;
		} else if (this.sidebarWidth !== -1) {
			sidebarWidth = Math.max(this.computedStyles.sidebar.minWidth, this.sidebarWidth);
		} else {
			sidebarWidth = this.workbenchSize.width / 5;
			this.sidebarWidth = sidebarWidth;
		}

		let sidebarSize = new Dimension(sidebarWidth, this.workbenchSize.height - this.computedStyles.statusbar.height);

		// Activity Bar
		let activityBarMinWidth = this.computedStyles.activitybar.minWidth;
		let activityBarSize = new Dimension(activityBarMinWidth, sidebarSize.height);

		// Editor
		let editorSize = {
			width: 0,
			height: 0,
			remainderLeft: 0,
			remainderRight: 0
		};

		let editorDimension = new Dimension(this.workbenchSize.width - sidebarSize.width - activityBarSize.width, sidebarSize.height);
		editorSize.width = editorDimension.width;
		editorSize.height = this.editorHeight = editorDimension.height;

		// Sidebar hidden
		if (isSidebarHidden) {
			editorSize.width = Math.min(this.workbenchSize.width - activityBarSize.width, this.workbenchSize.width - activityBarMinWidth);

			if (sidebarPosition === Position.LEFT) {
				editorSize.remainderLeft = Math.round((this.workbenchSize.width - editorSize.width + activityBarSize.width) / 2);
				editorSize.remainderRight = this.workbenchSize.width - editorSize.width - editorSize.remainderLeft;
			} else {
				editorSize.remainderRight = Math.round((this.workbenchSize.width - editorSize.width + activityBarSize.width) / 2);
				editorSize.remainderLeft = this.workbenchSize.width - editorSize.width - editorSize.remainderRight;
			}
		}

		// Assert Sidebar and Editor Size to not overflow
		let editorMinWidth = this.computedStyles.editor.minWidth;
		let visibleEditorCount = this.editorService.getVisibleEditors().length;
		if (visibleEditorCount > 1) {
			editorMinWidth *= visibleEditorCount;
		}
		if (editorSize.width < editorMinWidth) {
			let diff = editorMinWidth - editorSize.width;
			editorSize.width = editorMinWidth;
			sidebarSize.width -= diff;
			sidebarSize.width = Math.max(DEFAULT_MIN_PART_WIDTH, sidebarSize.width);
		}

		if (!isSidebarHidden) {
			this.sidebarWidth = sidebarSize.width;
			this.storageService.store(WorkbenchLayout.sashWidthSettingsKey, this.sidebarWidth, StorageScope.GLOBAL);
		}

		// Workbench
		this.workbenchContainer
			.position(this.options.margin.top, this.options.margin.right, this.options.margin.bottom, this.options.margin.left, 'relative')
			.size(this.workbenchSize.width, this.workbenchSize.height);

		// Bug on Chrome: Sometimes Chrome wants to scroll the workbench container on layout changes. The fix is to reset scrollTop in this case.
		if (this.workbenchContainer.getHTMLElement().scrollTop > 0) {
			this.workbenchContainer.getHTMLElement().scrollTop = 0;
		}

		// Editor Part
		this.editor.getContainer().size(editorSize.width, editorSize.height);

		if (isSidebarHidden) {
			this.editor.getContainer().position(0, editorSize.remainderRight, 0, editorSize.remainderLeft);
		} else if (sidebarPosition === Position.LEFT) {
			this.editor.getContainer().position(0, 0, 0, sidebarSize.width + activityBarSize.width);
		} else {
			this.editor.getContainer().position(0, sidebarSize.width, 0, 0);
		}

		// Activity Bar Part
		this.activitybar.getContainer().size(null, activityBarSize.height);
		if (sidebarPosition === Position.LEFT) {
			this.activitybar.getContainer().getHTMLElement().style.right = '';
			this.activitybar.getContainer().position(0, null, 0, 0);
		} else {
			this.activitybar.getContainer().getHTMLElement().style.left = '';
			this.activitybar.getContainer().position(0, 0, 0, null);
		}

		// Sidebar Part
		this.sidebar.getContainer().size(sidebarSize.width, sidebarSize.height);

		if (sidebarPosition === Position.LEFT) {
			this.sidebar.getContainer().position(0, editorSize.width, 0, activityBarSize.width);
		} else {
			this.sidebar.getContainer().position(0, null, 0, editorSize.width);
		}

		// Statusbar Part
		if (this.statusbar) {
			this.statusbar.getContainer().position(this.workbenchSize.height - this.computedStyles.statusbar.height);
		}

		// Quick open
		this.quickopen.layout(this.workbenchSize);

		// Sash
		this.sash.layout();

		// Propagate to Part Layouts
		this.editor.layout(new Dimension(editorSize.width, editorSize.height));
		this.sidebar.layout(sidebarSize);

		// Propagate to Context View
		if (this.contextViewService) {
			this.contextViewService.layout();
		}
	}

	private getWorkbenchArea(): Dimension {

		// Client Area: Parent
		let clientArea = this.parent.getClientArea();

		// Workbench: Client Area - Margins
		return clientArea.substract(this.options.margin);
	}

	public getVerticalSashTop(sash: Sash): number {
		return 0;
	}

	public getVerticalSashLeft(sash: Sash): number {
		let isSidebarHidden = this.partService.isSideBarHidden();
		let sidebarPosition = this.partService.getSideBarPosition();
		let activitybarWidth = this.computedStyles.activitybar.minWidth;

		if (sidebarPosition === Position.LEFT) {
			return !isSidebarHidden ? this.sidebarWidth + activitybarWidth : activitybarWidth;
		}

		return !isSidebarHidden ? this.workbenchSize.width - this.sidebarWidth - activitybarWidth : this.workbenchSize.width - activitybarWidth;
	}

	public getVerticalSashHeight(sash: Sash): number {
		return this.editorHeight;
	}

	public dispose(): void {
		while (this.toUnbind.length) {
			this.toUnbind.pop()();
		}
	}
}
