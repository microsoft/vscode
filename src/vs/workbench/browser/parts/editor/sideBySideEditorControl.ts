/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./media/sidebyside';
import arrays = require('vs/base/common/arrays');
import Event, {Emitter} from 'vs/base/common/event';
import {StandardMouseEvent} from 'vs/base/browser/mouseEvent';
import types = require('vs/base/common/types');
import {Dimension, Builder, $} from 'vs/base/browser/builder';
import {Sash, ISashEvent, IVerticalSashLayoutProvider} from 'vs/base/browser/ui/sash/sash';
import {ProgressBar} from 'vs/base/browser/ui/progressbar/progressbar';
import {BaseEditor} from 'vs/workbench/browser/parts/editor/baseEditor';
import DOM = require('vs/base/browser/dom');
import errors = require('vs/base/common/errors');
import {isMacintosh} from 'vs/base/common/platform';
import {IWorkbenchEditorService, GroupArrangement} from 'vs/workbench/services/editor/common/editorService';
import {IContextMenuService} from 'vs/platform/contextview/browser/contextView';
import {Position, POSITIONS} from 'vs/platform/editor/common/editor';
import {IEditorGroupService} from 'vs/workbench/services/group/common/groupService';
import {IEventService} from 'vs/platform/event/common/event';
import {IMessageService} from 'vs/platform/message/common/message';
import {ITelemetryService} from 'vs/platform/telemetry/common/telemetry';
import {IConfigurationService} from 'vs/platform/configuration/common/configuration';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';
import {ServiceCollection} from 'vs/platform/instantiation/common/serviceCollection';
import {IKeybindingService} from 'vs/platform/keybinding/common/keybindingService';
import {IExtensionService} from 'vs/platform/extensions/common/extensions';
import {IDisposable, dispose} from 'vs/base/common/lifecycle';
import {TabsTitleControl} from 'vs/workbench/browser/parts/editor/tabsTitleControl';
import {TitleControl} from 'vs/workbench/browser/parts/editor/titleControl';
import {NoTabsTitleControl} from 'vs/workbench/browser/parts/editor/noTabsTitleControl';
import {IEditorStacksModel, IStacksModelChangeEvent, IWorkbenchEditorConfiguration} from 'vs/workbench/common/editor';
import {ITitleAreaControl} from 'vs/workbench/browser/parts/editor/titleControl';
import {extractResources} from 'vs/base/browser/dnd';

export enum Rochade {
	NONE,
	CENTER_TO_LEFT,
	RIGHT_TO_CENTER,
	CENTER_AND_RIGHT_TO_LEFT
}

export enum ProgressState {
	INFINITE,
	DONE,
	STOP
}

export interface ISideBySideEditorControl {

	onGroupFocusChanged: Event<void>;

	show(editor: BaseEditor, container: Builder, position: Position, preserveActive: boolean, widthRatios?: number[]): void;
	hide(editor: BaseEditor, container: Builder, position: Position, layoutAndRochade: boolean): Rochade;

	setActive(editor: BaseEditor): void;

	getActiveEditor(): BaseEditor;
	getActivePosition(): Position;

	move(from: Position, to: Position): void;

	isDragging(): boolean;

	getInstantiationService(position: Position): IInstantiationService;
	getProgressBar(position: Position): ProgressBar;
	updateProgress(position: Position, state: ProgressState): void;

	layout(dimension: Dimension): void;
	layout(position: Position): void;

	arrangeGroups(arrangement: GroupArrangement): void;

	getWidthRatios(): number[];
	dispose(): void;
}

/**
 * Helper class to manage multiple side by side editors for the editor part.
 */
export class SideBySideEditorControl implements ISideBySideEditorControl, IVerticalSashLayoutProvider {

	private static MIN_EDITOR_WIDTH = 170;
	private static EDITOR_TITLE_HEIGHT = 35;
	private static SNAP_TO_MINIMIZED_THRESHOLD = 50;

	private stacks: IEditorStacksModel;

	private parent: Builder;
	private dimension: Dimension;
	private dragging: boolean;

	private instantiationServices: IInstantiationService[];

	private containers: Builder[];
	private containerWidth: number[];
	private containerInitialRatios: number[];

	private titleContainer: Builder[];
	private titleAreaControl: ITitleAreaControl[];
	private progressBar: ProgressBar[];

	private leftSash: Sash;
	private startLeftContainerWidth: number;

	private rightSash: Sash;
	private startRightContainerWidth: number;

	private visibleEditors: BaseEditor[];
	private visibleEditorContainers: Builder[];

	private lastActiveEditor: BaseEditor;
	private lastActivePosition: Position;

	private visibleEditorFocusTrackers: DOM.IFocusTracker[];

	private _onGroupFocusChanged: Emitter<void>;

	private toDispose: IDisposable[];

	constructor(
		parent: Builder,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IEditorGroupService private editorGroupService: IEditorGroupService,
		@IMessageService private messageService: IMessageService,
		@ITelemetryService private telemetryService: ITelemetryService,
		@IContextMenuService private contextMenuService: IContextMenuService,
		@IEventService private eventService: IEventService,
		@IConfigurationService private configurationService: IConfigurationService,
		@IKeybindingService private keybindingService: IKeybindingService,
		@IExtensionService private extensionService: IExtensionService,
		@IInstantiationService private instantiationService: IInstantiationService
	) {
		this.stacks = editorGroupService.getStacksModel();

		this.parent = parent;
		this.dimension = new Dimension(0, 0);

		this.instantiationServices = [];

		this.containers = [];
		this.containerWidth = [];

		this.titleContainer = [];
		this.titleAreaControl = [];

		this.progressBar = [];

		this.visibleEditors = [];
		this.visibleEditorContainers = [];
		this.visibleEditorFocusTrackers = [];

		this._onGroupFocusChanged = new Emitter<void>();

		this.toDispose = [];

		this.create(this.parent);
		this.registerListeners();
	}

	private registerListeners(): void {
		this.toDispose.push(this.stacks.onModelChanged(e => this.onStacksChanged(e)));
		this.toDispose.push(this.configurationService.onDidUpdateConfiguration(e => this.onConfigurationUpdated(e.config)));
		this.extensionService.onReady().then(() => this.onExtensionsReady());
	}

	private onConfigurationUpdated(configuration: IWorkbenchEditorConfiguration): void {
		const useTabs = configuration.workbench.editor.showTabs;

		POSITIONS.forEach(position => {

			// TItle Container
			const titleContainer = this.titleContainer[position];
			if (useTabs) {
				titleContainer.addClass('tabs');
			} else {
				titleContainer.removeClass('tabs');
			}

			// Title Control
			const titleControl = this.titleAreaControl[position];
			if (titleControl) {
				const usingTabs = (titleControl instanceof TabsTitleControl);
				if (usingTabs !== useTabs) {

					// Dispose old
					titleControl.dispose();
					this.titleContainer[position].empty();

					// Create new
					this.createTitleControl(position);
				}
			}
		});
	}

	private onExtensionsReady(): void {

		// Up to date title areas
		POSITIONS.forEach(position => this.titleAreaControl[position].update());
	}

	private onStacksChanged(e: IStacksModelChangeEvent): void {

		// Up to date context
		POSITIONS.forEach(position => {
			this.titleAreaControl[position].setContext(this.stacks.groupAt(position));
		});

		// Refresh / update if group is visible and has a position
		const position = this.stacks.positionOfGroup(e.group);
		if (position >= 0) {
			if (e.structural) {
				this.titleAreaControl[position].refresh();
			} else {
				this.titleAreaControl[position].update();
			}
		}
	}

	public get onGroupFocusChanged(): Event<void> {
		return this._onGroupFocusChanged.event;
	}

	public show(editor: BaseEditor, container: Builder, position: Position, preserveActive: boolean, widthRatios?: number[]): void {
		let visibleEditorCount = this.getVisibleEditorCount();

		// Store into editor bucket
		this.visibleEditors[position] = editor;
		this.visibleEditorContainers[position] = container;

		// Store as active unless preserveActive is set
		if (!preserveActive || !this.lastActiveEditor) {
			this.doSetActive(editor, position);
		}

		// Track focus
		this.trackFocus(editor, position);

		// Find target container and build into
		let target = this.containers[position];
		container.build(target);

		// Adjust layout according to provided ratios (used when restoring multiple editors at once)
		if (widthRatios && (widthRatios.length === 2 || widthRatios.length === 3)) {
			let hasLayoutInfo = this.dimension && this.dimension.width;

			// We received width ratios but were not layouted yet. So we keep these ratios for when we layout()
			if (!hasLayoutInfo) {
				this.containerInitialRatios = widthRatios;
			}

			// Adjust layout: -> [!][!]
			if (widthRatios.length === 2) {
				if (hasLayoutInfo) {
					this.containerWidth[position] = this.dimension.width * widthRatios[position];
				}
			}

			// Adjust layout: -> [!][!][!]
			else if (widthRatios.length === 3) {
				if (hasLayoutInfo) {
					this.containerWidth[position] = this.dimension.width * widthRatios[position];
				}

				if (this.rightSash.isHidden()) {
					this.rightSash.show();
					this.rightSash.layout();
				}
			}

			if (this.leftSash.isHidden()) {
				this.leftSash.show();
				this.leftSash.layout();
			}

			if (hasLayoutInfo) {
				this.layoutContainers();
			}
		}

		// Adjust layout: -> [!]
		else if (visibleEditorCount === 0 && this.dimension) {
			this.containerWidth[position] = this.dimension.width;

			this.layoutContainers();
		}

		// Adjust layout: [] -> []|[!]
		else if (position === Position.CENTER && this.leftSash.isHidden() && this.rightSash.isHidden() && this.dimension) {
			this.containerWidth[Position.LEFT] = this.dimension.width / 2;
			this.containerWidth[Position.CENTER] = this.dimension.width - this.containerWidth[Position.LEFT];

			this.leftSash.show();
			this.leftSash.layout();

			this.layoutContainers();
		}

		// Adjust layout: []|[] -> []|[]|[!]
		else if (position === Position.RIGHT && this.rightSash.isHidden() && this.dimension) {
			this.containerWidth[Position.LEFT] = this.dimension.width / 3;
			this.containerWidth[Position.CENTER] = this.dimension.width / 3;
			this.containerWidth[Position.RIGHT] = this.dimension.width - this.containerWidth[Position.LEFT] - this.containerWidth[Position.CENTER];

			this.leftSash.layout();
			this.rightSash.show();
			this.rightSash.layout();

			this.layoutContainers();
		}

		// Show editor container
		container.show();

		// Styles
		this.updateParentStyle();
	}

	private getVisibleEditorCount(): number {
		return this.visibleEditors.filter(v => !!v).length;
	}

	private trackFocus(editor: BaseEditor, position: Position): void {

		// In case there is a previous tracker on the position, dispose it first
		if (this.visibleEditorFocusTrackers[position]) {
			this.visibleEditorFocusTrackers[position].dispose();
		}

		// Track focus on editor container
		this.visibleEditorFocusTrackers[position] = DOM.trackFocus(editor.getContainer().getHTMLElement());
		this.visibleEditorFocusTrackers[position].addFocusListener(() => {
			this.onFocusGained(editor);
		});
	}

	private onFocusGained(editor: BaseEditor): void {
		this.setActive(editor);
	}

	public setActive(editor: BaseEditor): void {

		// Update active editor and position
		if (this.lastActiveEditor !== editor) {
			this.doSetActive(editor, this.visibleEditors.indexOf(editor));

			// Automatically maximize this position if it has min editor width
			if (this.containerWidth[this.lastActivePosition] === SideBySideEditorControl.MIN_EDITOR_WIDTH) {

				// Log this fact in telemetry
				if (this.telemetryService) {
					this.telemetryService.publicLog('workbenchEditorMaximized');
				}

				let remainingWidth = this.dimension.width;

				// Minimize all other positions to min width
				POSITIONS.forEach((p) => {
					if (this.lastActivePosition !== p && !!this.visibleEditors[p]) {
						this.containerWidth[p] = SideBySideEditorControl.MIN_EDITOR_WIDTH;
						remainingWidth -= this.containerWidth[p];
					}
				});

				// Grow focussed position if there is more width to spend
				if (remainingWidth > SideBySideEditorControl.MIN_EDITOR_WIDTH) {
					this.containerWidth[this.lastActivePosition] = remainingWidth;

					if (!this.leftSash.isHidden()) {
						this.leftSash.layout();
					}

					if (!this.rightSash.isHidden()) {
						this.rightSash.layout();
					}

					this.layoutContainers();
				}
			}

			// Re-emit to outside
			this._onGroupFocusChanged.fire();
		}
	}

	private focusNextNonMinimized(): void {

		// If the current focussed editor is minimized, try to focus the next largest editor
		if (!types.isUndefinedOrNull(this.lastActivePosition) && this.containerWidth[this.lastActivePosition] === SideBySideEditorControl.MIN_EDITOR_WIDTH) {
			let candidate: Position = null;
			let currentWidth = SideBySideEditorControl.MIN_EDITOR_WIDTH;
			POSITIONS.forEach(position => {

				// Skip current active position and check if the editor is larger than min width
				if (position !== this.lastActivePosition) {
					if (this.visibleEditors[position] && this.containerWidth[position] > currentWidth) {
						candidate = position;
						currentWidth = this.containerWidth[position];
					}
				}
			});

			// Focus editor if a candidate has been found
			if (!types.isUndefinedOrNull(candidate)) {
				this.editorGroupService.focusGroup(candidate);
			}
		}
	}

	public hide(editor: BaseEditor, container: Builder, position: Position, layoutAndRochade: boolean): Rochade {
		let result = Rochade.NONE;

		let visibleEditorCount = this.getVisibleEditorCount();

		let hasCenter = !!this.visibleEditors[Position.CENTER];
		let hasRight = !!this.visibleEditors[Position.RIGHT];

		// If editor is not showing for position, return
		if (editor !== this.visibleEditors[position]) {
			return result;
		}

		// Clear Position
		this.clearPosition(position);

		// Take editor container offdom and hide
		container.offDOM();
		container.hide();

		// Adjust layout and rochade if instructed to do so
		if (layoutAndRochade) {

			// Adjust layout: [x] ->
			if (visibleEditorCount === 1) {
				this.containerWidth[position] = 0;

				this.leftSash.hide();
				this.rightSash.hide();

				this.layoutContainers();
			}

			// Adjust layout: []|[x] -> [] or [x]|[] -> []
			else if (hasCenter && !hasRight) {
				this.containerWidth[Position.LEFT] = this.dimension.width;
				this.containerWidth[Position.CENTER] = 0;

				this.leftSash.hide();
				this.rightSash.hide();

				// Move CENTER to LEFT ([x]|[] -> [])
				if (position === Position.LEFT) {
					this.rochade(Position.CENTER, Position.LEFT);
					result = Rochade.CENTER_TO_LEFT;
				}

				this.layoutContainers();
			}

			// Adjust layout: []|[]|[x] -> [ ]|[ ] or []|[x]|[] -> [ ]|[ ] or [x]|[]|[] -> [ ]|[ ]
			else if (hasCenter && hasRight) {
				this.containerWidth[Position.LEFT] = this.dimension.width / 2;
				this.containerWidth[Position.CENTER] = this.dimension.width - this.containerWidth[Position.LEFT];
				this.containerWidth[Position.RIGHT] = 0;

				this.leftSash.layout();
				this.rightSash.hide();

				// Move RIGHT to CENTER ([]|[x]|[] -> [ ]|[ ])
				if (position === Position.CENTER) {
					this.rochade(Position.RIGHT, Position.CENTER);
					result = Rochade.RIGHT_TO_CENTER;
				}

				// Move RIGHT to CENTER and CENTER to LEFT ([x]|[]|[] -> [ ]|[ ])
				else if (position === Position.LEFT) {
					this.rochade(Position.CENTER, Position.LEFT);
					this.rochade(Position.RIGHT, Position.CENTER);
					result = Rochade.CENTER_AND_RIGHT_TO_LEFT;
				}

				this.layoutContainers();
			}
		}

		// Automatically pick the next editor as active if any
		if (this.lastActiveEditor === editor) {

			// Clear old
			this.doSetActive(null, null);

			// Find new active position by taking the next one close to the closed one to the left
			if (layoutAndRochade) {
				let newActivePosition: Position;
				switch (position) {
					case Position.LEFT:
						newActivePosition = hasCenter ? Position.LEFT : null;
						break;
					case Position.CENTER:
						newActivePosition = Position.LEFT;
						break;
					case Position.RIGHT:
						newActivePosition = Position.CENTER;
						break;
				}

				if (!types.isUndefinedOrNull(newActivePosition)) {
					this.doSetActive(this.visibleEditors[newActivePosition], newActivePosition);
				}
			}
		}

		// Styles
		this.updateParentStyle();

		return result;
	}

	private updateParentStyle(): void {
		let editorCount = this.getVisibleEditorCount();
		if (editorCount > 1) {
			this.parent.addClass('multiple-editors');
		} else {
			this.parent.removeClass('multiple-editors');
		}
	}

	private doSetActive(editor: BaseEditor, newActive: Position): void {
		this.lastActivePosition = newActive;
		this.lastActiveEditor = editor;
	}

	private clearPosition(position: Position): void {

		// Unregister Listeners
		if (this.visibleEditorFocusTrackers[position]) {
			this.visibleEditorFocusTrackers[position].dispose();
			this.visibleEditorFocusTrackers[position] = null;
		}

		// Clear from active editors
		this.visibleEditors[position] = null;
		this.visibleEditorContainers[position] = null;
	}

	private rochade(from: Position, to: Position): void {

		// Move editor to new position
		let editorContainer = this.visibleEditorContainers[from];
		let editor = this.visibleEditors[from];
		editorContainer.offDOM();
		editorContainer.build(this.containers[to]);
		editor.changePosition(to);

		// Change data structures
		let listeners = this.visibleEditorFocusTrackers[from];
		this.visibleEditorFocusTrackers[to] = listeners;
		this.visibleEditorFocusTrackers[from] = null;

		this.visibleEditorContainers[to] = editorContainer;
		this.visibleEditorContainers[from] = null;

		this.visibleEditors[to] = editor;
		this.visibleEditors[from] = null;

		// Update last active position
		if (this.lastActivePosition === from) {
			this.doSetActive(this.lastActiveEditor, to);
		}
	}

	public move(from: Position, to: Position): void {
		let editorContainerPos1: Builder;
		let editorPos1: BaseEditor;
		let editorContainerPos2: Builder;
		let editorPos2: BaseEditor;

		// Distance 1: Swap Editors
		if (Math.abs(from - to) === 1) {

			// Move editors to new position
			editorContainerPos1 = this.visibleEditorContainers[from];
			editorPos1 = this.visibleEditors[from];
			editorContainerPos1.offDOM();
			editorContainerPos1.build(this.containers[to]);
			editorPos1.changePosition(to);

			editorContainerPos2 = this.visibleEditorContainers[to];
			editorPos2 = this.visibleEditors[to];
			editorContainerPos2.offDOM();
			editorContainerPos2.build(this.containers[from]);
			editorPos2.changePosition(from);

			// Update last active position accordingly
			if (this.lastActivePosition === from) {
				this.doSetActive(this.lastActiveEditor, to);
			} else if (this.lastActivePosition === to) {
				this.doSetActive(this.lastActiveEditor, from);
			}
		}

		// Otherwise Move Editors
		else {

			// Find new positions
			let newLeftPosition: Position;
			let newCenterPosition: Position;
			let newRightPosition: Position;

			if (from === Position.LEFT) {
				newLeftPosition = Position.RIGHT;
				newCenterPosition = Position.LEFT;
				newRightPosition = Position.CENTER;
			} else {
				newLeftPosition = Position.CENTER;
				newCenterPosition = Position.RIGHT;
				newRightPosition = Position.LEFT;
			}

			// Move editors to new position
			editorContainerPos1 = this.visibleEditorContainers[Position.LEFT];
			editorPos1 = this.visibleEditors[Position.LEFT];
			editorContainerPos1.offDOM();
			editorContainerPos1.build(this.containers[newLeftPosition]);
			editorPos1.changePosition(newLeftPosition);

			editorContainerPos2 = this.visibleEditorContainers[Position.CENTER];
			editorPos2 = this.visibleEditors[Position.CENTER];
			editorContainerPos2.offDOM();
			editorContainerPos2.build(this.containers[newCenterPosition]);
			editorPos2.changePosition(newCenterPosition);

			let editorContainerPos3 = this.visibleEditorContainers[Position.RIGHT];
			let editorPos3 = this.visibleEditors[Position.RIGHT];
			editorContainerPos3.offDOM();
			editorContainerPos3.build(this.containers[newRightPosition]);
			editorPos3.changePosition(newRightPosition);

			// Update last active position accordingly
			if (this.lastActivePosition === Position.LEFT) {
				this.doSetActive(this.lastActiveEditor, newLeftPosition);
			} else if (this.lastActivePosition === Position.CENTER) {
				this.doSetActive(this.lastActiveEditor, newCenterPosition);
			} else if (this.lastActivePosition === Position.RIGHT) {
				this.doSetActive(this.lastActiveEditor, newRightPosition);
			}
		}

		// Change data structures
		arrays.move(this.visibleEditorContainers, from, to);
		arrays.move(this.visibleEditors, from, to);
		arrays.move(this.visibleEditorFocusTrackers, from, to);
		arrays.move(this.containerWidth, from, to);

		// Layout
		if (!this.leftSash.isHidden()) {
			this.leftSash.layout();
		}

		if (!this.rightSash.isHidden()) {
			this.rightSash.layout();
		}

		this.layoutContainers();
	}

	public arrangeGroups(arrangement: GroupArrangement): void {
		if (!this.dimension) {
			return; // too early
		}

		let availableWidth = this.dimension.width;
		let visibleEditors = this.getVisibleEditorCount();

		if (visibleEditors <= 1) {
			return; // need more editors
		}

		// Minimize Others
		if (arrangement === GroupArrangement.MINIMIZE_OTHERS) {
			POSITIONS.forEach(position => {
				if (this.visibleEditors[position]) {
					if (position !== this.lastActivePosition) {
						this.containerWidth[position] = SideBySideEditorControl.MIN_EDITOR_WIDTH;
						availableWidth -= SideBySideEditorControl.MIN_EDITOR_WIDTH;
					}
				}
			});

			this.containerWidth[this.lastActivePosition] = availableWidth;
		}

		// Even Widths
		else if (arrangement === GroupArrangement.EVEN_WIDTH) {
			POSITIONS.forEach(position => {
				if (this.visibleEditors[position]) {
					this.containerWidth[position] = availableWidth / visibleEditors;
				}
			});
		}

		this.layoutControl(this.dimension);
	}

	public getWidthRatios(): number[] {
		let ratio: number[] = [];

		if (this.dimension) {
			let fullWidth = this.dimension.width;

			POSITIONS.forEach(position => {
				if (this.visibleEditors[position]) {
					ratio.push(this.containerWidth[position] / fullWidth);
				}
			});
		}

		return ratio;
	}

	public getActiveEditor(): BaseEditor {
		return this.lastActiveEditor;
	}

	public getActivePosition(): Position {
		return this.lastActivePosition;
	}

	private create(parent: Builder): void {

		// Allow to drop into container to open
		this.enableDropTarget(parent.getHTMLElement());

		// Left Container
		this.containers[Position.LEFT] = $(parent).div({ class: 'one-editor-container editor-left monaco-editor-background' });

		// Left Sash
		this.leftSash = new Sash(parent.getHTMLElement(), this, { baseSize: 5 });
		this.toDispose.push(this.leftSash.addListener2('start', () => this.onLeftSashDragStart()));
		this.toDispose.push(this.leftSash.addListener2('change', (e: ISashEvent) => this.onLeftSashDrag(e)));
		this.toDispose.push(this.leftSash.addListener2('end', () => this.onLeftSashDragEnd()));
		this.toDispose.push(this.leftSash.addListener2('reset', () => this.onLeftSashReset()));
		this.leftSash.hide();

		// Center Container
		this.containers[Position.CENTER] = $(parent).div({ class: 'one-editor-container editor-center monaco-editor-background' });

		// Right Sash
		this.rightSash = new Sash(parent.getHTMLElement(), this, { baseSize: 5 });
		this.toDispose.push(this.rightSash.addListener2('start', () => this.onRightSashDragStart()));
		this.toDispose.push(this.rightSash.addListener2('change', (e: ISashEvent) => this.onRightSashDrag(e)));
		this.toDispose.push(this.rightSash.addListener2('end', () => this.onRightSashDragEnd()));
		this.toDispose.push(this.rightSash.addListener2('reset', () => this.onRightSashReset()));
		this.rightSash.hide();

		// Right Container
		this.containers[Position.RIGHT] = $(parent).div({ class: 'one-editor-container editor-right monaco-editor-background' });

		// InstantiationServices
		POSITIONS.forEach(position => {
			this.instantiationServices[position] = this.instantiationService.createChild(new ServiceCollection(
				[IKeybindingService, this.keybindingService.createScoped(this.containers[position].getHTMLElement())]
			));
		});

		// Title containers
		const useTabs = !!this.configurationService.getConfiguration<IWorkbenchEditorConfiguration>().workbench.editor.showTabs;
		POSITIONS.forEach(position => {
			this.titleContainer[position] = $(this.containers[position]).div({ 'class': 'title' });
			if (useTabs) {
				this.titleContainer[position].addClass('tabs');
			}
			this.hookTitleDragListener(position);

			// Title Control
			this.createTitleControl(position);
		});

		// Progress Bars per position
		POSITIONS.forEach(position => {
			this.progressBar[position] = new ProgressBar($(this.containers[position]));
			this.progressBar[position].getContainer().hide();
		});
	}

	private enableDropTarget(node: HTMLElement): void {
		const $this = this;
		const overlayId = 'monaco-workbench-editor-drop-overlay';
		const splitToPropertyKey = 'splitToPosition';
		const stacks = this.editorGroupService.getStacksModel();
		let overlay: Builder;

		function onDrop(e: DragEvent, position: Position, splitTo?: Position): void {
			DOM.removeClass(node, 'dropfeedback');
			destroyOverlay();

			const editorService = $this.editorService;
			const groupService = $this.editorGroupService;

			const splitEditor = (typeof splitTo === 'number'); // TODO@Ben ugly split code should benefit from empty group support once available!
			const freeGroup = (stacks.groups.length === 1) ? Position.CENTER : Position.RIGHT;

			// Check for transfer from title control
			const draggedEditor = TitleControl.getDraggedEditor();
			if (draggedEditor) {
				const isCopy = (e.ctrlKey && !isMacintosh) || (e.altKey && isMacintosh);

				// Copy editor to new location
				if (isCopy) {
					if (splitEditor) {
						editorService.openEditor(draggedEditor.editor, { pinned: true }, freeGroup).then(() => {
							if (splitTo !== freeGroup) {
								groupService.moveGroup(freeGroup, splitTo);
							}
						}).done(null, errors.onUnexpectedError);
					} else {
						editorService.openEditor(draggedEditor.editor, { pinned: true }, position).done(null, errors.onUnexpectedError);
					}
				}

				// Move editor to new location
				else {
					const sourcePosition = stacks.positionOfGroup(draggedEditor.group);
					if (splitEditor) {
						if (draggedEditor.group.count === 1) {
							groupService.moveGroup(sourcePosition, splitTo);
						} else {
							editorService.openEditor(draggedEditor.editor, { pinned: true }, freeGroup).then(() => {
								if (splitTo !== freeGroup) {
									groupService.moveGroup(freeGroup, splitTo);
								}
								groupService.moveEditor(draggedEditor.editor, stacks.positionOfGroup(draggedEditor.group), splitTo);
							}).done(null, errors.onUnexpectedError);
						}

					} else {
						groupService.moveEditor(draggedEditor.editor, sourcePosition, position);
					}
				}
			}

			// Check for URI transfer
			else {
				const droppedResources = extractResources(e).filter(r => r.scheme === 'file' || r.scheme === 'untitled');
				if (droppedResources.length) {
					window.focus(); // make sure this window has focus so that the open call reaches the right window!

					// Open all
					editorService.openEditors(droppedResources.map(resource => { return { input: { resource, options: { pinned: true } }, position: splitEditor ? freeGroup : position }; }))
						.then(() => {
							if (splitEditor && splitTo !== freeGroup) {
								groupService.moveGroup(freeGroup, splitTo);
							}

							groupService.focusGroup(splitEditor ? splitTo : position);
						})
						.done(null, errors.onUnexpectedError);
				}
			}
		}

		function destroyOverlay(): void {
			if (overlay) {
				overlay.destroy();
				overlay = void 0;
			}
		}

		function positionOverlay(e: DragEvent, groups: number, position: Position): void {
			const target = <HTMLElement>e.target;
			const posXOnOverlay = e.offsetX;
			const overlayIsSplit = typeof overlay.getProperty(splitToPropertyKey) === 'number';
			const overlayWidth = target.clientWidth;
			const splitThreshold = overlayIsSplit ? overlayWidth / 5 : overlayWidth / 10;
			const isCopy = (e.ctrlKey && !isMacintosh) || (e.altKey && isMacintosh);
			const draggedEditor = TitleControl.getDraggedEditor();

			const isOverSplitLeft = posXOnOverlay < splitThreshold;
			const isOverSplitRight = posXOnOverlay + splitThreshold > overlayWidth;

			let splitTarget: Position;

			// No splitting if we reached maximum group count
			if (groups === POSITIONS.length) {
				splitTarget = null;
			}

			// Special splitting if we drag an editor of a group with only one editor
			else if (!isCopy && draggedEditor && draggedEditor.group.count === 1) {
				const positionOfDraggedEditor = stacks.positionOfGroup(draggedEditor.group);
				switch (positionOfDraggedEditor) {
					case Position.LEFT:
						if (position === Position.CENTER && isOverSplitRight) {
							splitTarget = Position.CENTER; // allow to move single editor from LEFT to CENTER
						}
						break;
					case Position.CENTER:
						if (position === Position.LEFT && isOverSplitLeft) {
							splitTarget = Position.LEFT; // allow to move single editor from CENTER to LEFT
						}
						break;
					default:
						splitTarget = null; // splitting not allowed
				}
			}

			// Any other case, check for mouse position
			else {
				if (isOverSplitRight) {
					splitTarget = (position === Position.LEFT) ? Position.CENTER : Position.RIGHT;
				} else if (isOverSplitLeft) {
					splitTarget = (position === Position.LEFT) ? Position.LEFT : Position.CENTER;
				}
			}

			// Apply split target
			const canSplit = (typeof splitTarget === 'number');
			if (canSplit) {
				overlay.setProperty(splitToPropertyKey, splitTarget);
			} else {
				overlay.removeProperty(splitToPropertyKey);
			}

			// Update overlay styles
			if (canSplit && isOverSplitRight) {
				overlay.style({
					left: '50%',
					width: '50%',
				});
			} else if (canSplit && isOverSplitLeft) {
				overlay.style({
					width: '50%'
				});
			} else {
				overlay.style({
					left: '0',
					width: '100%'
				});
			}

			// Make sure the overlay is visible
			overlay.style({ opacity: 1 });
		}

		function createOverlay(target: HTMLElement): void {
			if (!overlay) {
				const containers = $this.visibleEditorContainers.filter(c => !!c);
				containers.forEach((container, index) => {
					if (container && DOM.isAncestor(target, container.getHTMLElement())) {
						const useTabs = !!$this.configurationService.getConfiguration<IWorkbenchEditorConfiguration>().workbench.editor.showTabs;

						overlay = $('div').style({
							top: useTabs ? SideBySideEditorControl.EDITOR_TITLE_HEIGHT + 'px' : 0,
							height: useTabs ? `calc(100% - ${SideBySideEditorControl.EDITOR_TITLE_HEIGHT}px` : '100%'
						}).id(overlayId);

						overlay.appendTo(container);

						overlay.on(DOM.EventType.DROP, (e: DragEvent) => {
							DOM.EventHelper.stop(e, true);
							onDrop(e, index, overlay.getProperty(splitToPropertyKey));
						});

						overlay.on(DOM.EventType.DRAG_OVER, (e: DragEvent) => {
							positionOverlay(e, containers.length, index);
						});

						overlay.on([DOM.EventType.DRAG_LEAVE, DOM.EventType.DRAG_END], () => {
							destroyOverlay();
						});
					}
				});
			}
		}

		// Let a dropped file open inside Code (only if dropped over editor area)
		this.toDispose.push(DOM.addDisposableListener(node, DOM.EventType.DROP, (e: DragEvent) => {
			if (e.target === node) {
				DOM.EventHelper.stop(e, true);
				onDrop(e, Position.LEFT);
			} else {
				DOM.removeClass(node, 'dropfeedback');
			}
		}));

		// Drag over
		this.toDispose.push(DOM.addDisposableListener(node, DOM.EventType.DRAG_OVER, (e: DragEvent) => {
			if (e.target === node) {
				DOM.addClass(node, 'dropfeedback');
			}

			const target = <HTMLElement>e.target;
			if (target) {
				if (overlay && target.id !== overlayId) {
					destroyOverlay(); // somehow we managed to move the mouse quickly out of the current overlay, so destroy it
				}
				createOverlay(target);

				if (overlay) {
					DOM.removeClass(node, 'dropfeedback'); // if we show an overlay, we can remove the drop feedback from the editor background
				}
			}
		}));

		// Drag leave
		this.toDispose.push(DOM.addDisposableListener(node, DOM.EventType.DRAG_LEAVE, (e: DragEvent) => {
			DOM.removeClass(node, 'dropfeedback');
		}));

		// Drag end (also install globally to be safe)
		[node, window].forEach(container => {
			this.toDispose.push(DOM.addDisposableListener(container, DOM.EventType.DRAG_END, (e: DragEvent) => {
				DOM.removeClass(node, 'dropfeedback');
				destroyOverlay();
			}));
		});
	}

	private createTitleControl(position: Position): void {
		const useTabs = !!this.configurationService.getConfiguration<IWorkbenchEditorConfiguration>().workbench.editor.showTabs;

		this.titleAreaControl[position] = this.instantiationServices[position].createInstance<ITitleAreaControl>(useTabs ? TabsTitleControl : NoTabsTitleControl);
		this.titleAreaControl[position].create(this.titleContainer[position].getHTMLElement());
		this.titleAreaControl[position].setContext(this.stacks.groupAt(position));
		this.titleAreaControl[position].refresh();
	}

	private hookTitleDragListener(position: Position): void {
		let wasDragged = false;

		// Allow to reorder positions by dragging the title
		this.titleContainer[position].on(DOM.EventType.MOUSE_DOWN, (e: MouseEvent) => {
			if (!this.titleAreaControl[position].allowDragging(<any>e.target || e.srcElement)) {
				return; // return early if we are not in the drag zone of the title widget
			}

			// Reset flag
			wasDragged = false;

			// Return early if there is only one editor active or the user clicked into the toolbar
			if (this.getVisibleEditorCount() <= 1) {
				return;
			}

			// Only allow for first mouse button click!
			if (e.button !== 0) {
				return;
			}

			DOM.EventHelper.stop(e);

			// Overlay the editor area with a div to be able to capture all mouse events
			let overlayDiv = $('div').style({
				top: SideBySideEditorControl.EDITOR_TITLE_HEIGHT + 'px',
				height: '100%'
			}).id('monaco-workbench-editor-move-overlay');
			overlayDiv.appendTo(this.parent);

			// Update flag
			this.dragging = true;

			let visibleEditorCount = this.getVisibleEditorCount();
			let mouseDownEvent = new StandardMouseEvent(e);
			let startX = mouseDownEvent.posx;
			let oldNewLeft: number = null;

			this.containers[position].addClass('drag');
			this.parent.addClass('drag');

			let $window = $(window);
			$window.on(DOM.EventType.MOUSE_MOVE, (e: MouseEvent) => {
				DOM.EventHelper.stop(e, false);

				let mouseMoveEvent = new StandardMouseEvent(e);
				let diffX = mouseMoveEvent.posx - startX;
				let newLeft: number = null;

				if (Math.abs(diffX) > 5) {
					wasDragged = true;
				}

				switch (position) {

					// [ ! ]|[ ]: Moves only to the right but not outside of dimension width to the right
					case Position.LEFT: {
						newLeft = Math.max(-1 /* 1px border accomodation */, Math.min(diffX, this.dimension.width - this.containerWidth[Position.LEFT]));
						break;
					}

					case Position.CENTER: {

						// [ ]|[ ! ]: Moves only to the left but not outside of dimension width to the left
						if (visibleEditorCount === 2) {
							newLeft = Math.min(this.containerWidth[Position.LEFT], Math.max(-1 /* 1px border accomodation */, this.containerWidth[Position.LEFT] + diffX));
						}

						// [ ]|[ ! ]|[ ]: Moves to left and right but not outside of dimensions width on both sides
						else {
							newLeft = Math.min(this.dimension.width - this.containerWidth[Position.CENTER], Math.max(-1 /* 1px border accomodation */, this.containerWidth[Position.LEFT] + diffX));
						}
						break;
					}

					// [ ]|[ ]|[ ! ]: Moves to the right but not outside of dimension width on the left side
					case Position.RIGHT: {
						newLeft = Math.min(this.containerWidth[Position.LEFT] + this.containerWidth[Position.CENTER], Math.max(-1 /* 1px border accomodation */, this.containerWidth[Position.LEFT] + this.containerWidth[Position.CENTER] + diffX));
						break;
					}
				}

				// Return early if position did not change
				if (oldNewLeft === newLeft) {
					return;
				}

				oldNewLeft = newLeft;

				// Live drag Feedback
				let moveTo: Position = this.findMoveTarget(position, diffX);
				switch (position) {
					case Position.LEFT: {
						if (moveTo === Position.LEFT || moveTo === null) {
							this.containers[Position.CENTER].style({ left: this.containerWidth[Position.LEFT] + 'px', right: 'auto', borderLeftWidth: '1px' });
							this.containers[Position.RIGHT].style({ left: 'auto', right: 0 });
						} else if (moveTo === Position.CENTER) {
							this.containers[Position.CENTER].style({ left: 0, right: 'auto', borderLeftWidth: 0 });
							this.containers[Position.CENTER].addClass('draggedunder');
							this.containers[Position.RIGHT].style({ left: 'auto', right: 0 });
						} else if (moveTo === Position.RIGHT) {
							this.containers[Position.CENTER].style({ left: 0, right: 'auto' });
							this.containers[Position.RIGHT].style({ left: 'auto', right: this.containerWidth[Position.LEFT] + 'px' });
							this.containers[Position.RIGHT].addClass('draggedunder');
						}
						break;
					}

					case Position.CENTER: {
						if (moveTo === Position.LEFT) {
							this.containers[Position.LEFT].style({ left: this.containerWidth[Position.CENTER] + 'px', right: 'auto' });
							this.containers[Position.LEFT].addClass('draggedunder');
						} else if (moveTo === Position.CENTER || moveTo === null) {
							this.containers[Position.LEFT].style({ left: 0, right: 'auto' });
							this.containers[Position.RIGHT].style({ left: 'auto', right: 0 });
						} else if (moveTo === Position.RIGHT) {
							this.containers[Position.RIGHT].style({ left: 'auto', right: this.containerWidth[Position.CENTER] + 'px' });
							this.containers[Position.RIGHT].addClass('draggedunder');
							this.containers[Position.LEFT].style({ left: 0, right: 'auto' });
						}
						break;
					}

					case Position.RIGHT: {
						if (moveTo === Position.LEFT) {
							this.containers[Position.LEFT].style({ left: this.containerWidth[Position.RIGHT] + 'px', right: 'auto' });
							this.containers[Position.LEFT].addClass('draggedunder');
						} else if (moveTo === Position.CENTER) {
							this.containers[Position.LEFT].style({ left: 0, right: 'auto' });
							this.containers[Position.CENTER].style({ left: (this.containerWidth[Position.LEFT] + this.containerWidth[Position.RIGHT]) + 'px', right: 'auto' });
							this.containers[Position.CENTER].addClass('draggedunder');
						} else if (moveTo === Position.RIGHT || moveTo === null) {
							this.containers[Position.LEFT].style({ left: 0, right: 'auto' });
							this.containers[Position.CENTER].style({ left: this.containerWidth[Position.LEFT] + 'px', right: 'auto' });
						}
						break;
					}
				}

				// Move the editor to provide feedback to the user and add class
				if (newLeft !== null) {
					this.containers[position].style({ left: newLeft + 'px' });
					this.containers[position].addClass('dragging');
					this.parent.addClass('dragging');
				}
			}).once(DOM.EventType.MOUSE_UP, (e: MouseEvent) => {
				DOM.EventHelper.stop(e, false);

				// Destroy overlay
				overlayDiv.destroy();

				// Update flag
				this.dragging = false;

				// Restore styles
				this.parent.removeClass('drag');
				this.containers[position].removeClass('drag');
				this.parent.removeClass('dragging');
				this.containers[position].removeClass('dragging');
				POSITIONS.forEach((p) => this.containers[p].removeClass('draggedunder'));
				this.containers[Position.LEFT].style({ left: 0, right: 'auto' });
				this.containers[Position.CENTER].style({ left: 'auto', right: 'auto', borderLeftWidth: '1px' });
				this.containers[Position.RIGHT].style({ left: 'auto', right: 0, borderLeftWidth: '1px' });

				// Find move target
				let mouseUpEvent = new StandardMouseEvent(e);
				let diffX = mouseUpEvent.posx - startX;
				let moveTo: Position = this.findMoveTarget(position, diffX);

				// Move to valid position if any
				if (moveTo !== null) {
					this.editorGroupService.moveGroup(position, moveTo);

					// To reduce flickering during this operation we trigger a refresh of all
					// title controls right after.
					POSITIONS.forEach(p => {
						this.titleAreaControl[p].refresh(true);
					});
				}

				// Otherwise layout to restore proper positioning
				else {
					this.layoutContainers();
				}

				// If not dragging, make editor group active unless already active
				if (!wasDragged && position !== this.getActivePosition()) {
					this.editorGroupService.focusGroup(position);
				}

				$window.off('mousemove');
			});
		});
	}

	private findMoveTarget(position: Position, diffX: number): Position {
		let visibleEditorCount = this.getVisibleEditorCount();

		switch (position) {
			case Position.LEFT: {

				// [ ! ]|[] -> []|[ ! ]
				if (visibleEditorCount === 2 && (diffX >= this.containerWidth[Position.LEFT] / 2 || diffX >= this.containerWidth[Position.CENTER] / 2)) {
					return Position.CENTER;
				}

				// [ ! ]|[]|[] -> []|[]|[ ! ]
				if (visibleEditorCount === 3 && (diffX >= this.containerWidth[Position.LEFT] / 2 + this.containerWidth[Position.CENTER] || diffX >= this.containerWidth[Position.RIGHT] / 2 + this.containerWidth[Position.CENTER])) {
					return Position.RIGHT;
				}

				// [ ! ]|[]|[] -> []|[ ! ]|[]
				if (visibleEditorCount === 3 && (diffX >= this.containerWidth[Position.LEFT] / 2 || diffX >= this.containerWidth[Position.CENTER] / 2)) {
					return Position.CENTER;
				}
				break;
			}

			case Position.CENTER: {
				if (visibleEditorCount === 2 && diffX > 0) {
					return null; // Return early since CENTER cannot be moved to the RIGHT unless there is a RIGHT position
				}

				// []|[ ! ] -> [ ! ]|[]
				if (visibleEditorCount === 2 && (Math.abs(diffX) >= this.containerWidth[Position.CENTER] / 2 || Math.abs(diffX) >= this.containerWidth[Position.LEFT] / 2)) {
					return Position.LEFT;
				}

				// []|[ ! ]|[] -> [ ! ]|[]|[]
				if (visibleEditorCount === 3 && ((diffX < 0 && Math.abs(diffX) >= this.containerWidth[Position.CENTER] / 2) || (diffX < 0 && Math.abs(diffX) >= this.containerWidth[Position.LEFT] / 2))) {
					return Position.LEFT;
				}

				// []|[ ! ]|[] -> []|[]|[ ! ]
				if (visibleEditorCount === 3 && ((diffX > 0 && Math.abs(diffX) >= this.containerWidth[Position.CENTER] / 2) || (diffX > 0 && Math.abs(diffX) >= this.containerWidth[Position.RIGHT] / 2))) {
					return Position.RIGHT;
				}
				break;
			}

			case Position.RIGHT: {
				if (diffX > 0) {
					return null; // Return early since RIGHT cannot be moved more to the RIGHT
				}

				// []|[]|[ ! ] -> [ ! ]|[]|[]
				if (Math.abs(diffX) >= this.containerWidth[Position.RIGHT] / 2 + this.containerWidth[Position.CENTER] || Math.abs(diffX) >= this.containerWidth[Position.LEFT] / 2 + this.containerWidth[Position.CENTER]) {
					return Position.LEFT;
				}

				// []|[]|[ ! ] -> []|[ ! ]|[]
				if (Math.abs(diffX) >= this.containerWidth[Position.RIGHT] / 2 || Math.abs(diffX) >= this.containerWidth[Position.CENTER] / 2) {
					return Position.CENTER;
				}
				break;
			}
		}

		return null;
	}

	private centerSash(a: Position, b: Position): void {
		let sumWidth = this.containerWidth[a] + this.containerWidth[b];
		let meanWidth = sumWidth / 2;
		this.containerWidth[a] = meanWidth;
		this.containerWidth[b] = sumWidth - meanWidth;
		this.layoutContainers();
	}

	private onLeftSashDragStart(): void {
		this.startLeftContainerWidth = this.containerWidth[Position.LEFT];
	}

	private onLeftSashDrag(e: ISashEvent): void {
		let oldLeftContainerWidth = this.containerWidth[Position.LEFT];
		let newLeftContainerWidth = this.startLeftContainerWidth + e.currentX - e.startX;

		// Side-by-Side
		if (this.rightSash.isHidden()) {

			// []|[      ] : left side can not get smaller than MIN_EDITOR_WIDTH
			if (newLeftContainerWidth < SideBySideEditorControl.MIN_EDITOR_WIDTH) {
				newLeftContainerWidth = SideBySideEditorControl.MIN_EDITOR_WIDTH;
			}

			// [      ]|[] : right side can not get smaller than MIN_EDITOR_WIDTH
			else if (this.dimension.width - newLeftContainerWidth < SideBySideEditorControl.MIN_EDITOR_WIDTH) {
				newLeftContainerWidth = this.dimension.width - SideBySideEditorControl.MIN_EDITOR_WIDTH;
			}

			// [ <-]|[      ] : left side can snap into minimized
			else if (newLeftContainerWidth - SideBySideEditorControl.SNAP_TO_MINIMIZED_THRESHOLD <= SideBySideEditorControl.MIN_EDITOR_WIDTH) {
				newLeftContainerWidth = SideBySideEditorControl.MIN_EDITOR_WIDTH;
			}

			// [      ]|[-> ] : right side can snap into minimized
			else if (this.dimension.width - newLeftContainerWidth - SideBySideEditorControl.SNAP_TO_MINIMIZED_THRESHOLD <= SideBySideEditorControl.MIN_EDITOR_WIDTH) {
				newLeftContainerWidth = this.dimension.width - SideBySideEditorControl.MIN_EDITOR_WIDTH;
			}

			this.containerWidth[Position.LEFT] = newLeftContainerWidth;
			this.containerWidth[Position.CENTER] = this.dimension.width - newLeftContainerWidth;
		}

		// Side-by-Side-by-Side
		else {

			// [!]|[      ]|[  ] : left side can not get smaller than MIN_EDITOR_WIDTH
			if (newLeftContainerWidth < SideBySideEditorControl.MIN_EDITOR_WIDTH) {
				newLeftContainerWidth = SideBySideEditorControl.MIN_EDITOR_WIDTH;
			}

			// [      ]|[!]|[  ] : center side can not get smaller than MIN_EDITOR_WIDTH
			else if (this.dimension.width - newLeftContainerWidth - this.containerWidth[Position.RIGHT] < SideBySideEditorControl.MIN_EDITOR_WIDTH) {

				// [      ]|[ ]|[!] : right side can not get smaller than MIN_EDITOR_WIDTH
				if (this.dimension.width - newLeftContainerWidth - this.containerWidth[Position.CENTER] < SideBySideEditorControl.MIN_EDITOR_WIDTH) {
					newLeftContainerWidth = this.dimension.width - (2 * SideBySideEditorControl.MIN_EDITOR_WIDTH);
					this.containerWidth[Position.CENTER] = this.containerWidth[Position.RIGHT] = SideBySideEditorControl.MIN_EDITOR_WIDTH;
				}

				// [      ]|[ ]|[-> ] : right side can snap into minimized
				else if (this.dimension.width - newLeftContainerWidth - this.containerWidth[Position.CENTER] - SideBySideEditorControl.SNAP_TO_MINIMIZED_THRESHOLD <= SideBySideEditorControl.MIN_EDITOR_WIDTH) {
					this.containerWidth[Position.RIGHT] = SideBySideEditorControl.MIN_EDITOR_WIDTH;
				}

				// [      ]|[ ]|[ ] : right side shrinks
				else {
					this.containerWidth[Position.RIGHT] = this.containerWidth[Position.RIGHT] - (newLeftContainerWidth - oldLeftContainerWidth);
				}

				this.rightSash.layout();
			}

			// [ <-]|[      ]|[  ] : left side can snap into minimized
			else if (newLeftContainerWidth - SideBySideEditorControl.SNAP_TO_MINIMIZED_THRESHOLD <= SideBySideEditorControl.MIN_EDITOR_WIDTH) {
				newLeftContainerWidth = SideBySideEditorControl.MIN_EDITOR_WIDTH;
			}

			// [      ]|[-> ]|[  ] : center side can snap into minimized
			else if (this.dimension.width - this.containerWidth[Position.RIGHT] - newLeftContainerWidth - SideBySideEditorControl.SNAP_TO_MINIMIZED_THRESHOLD <= SideBySideEditorControl.MIN_EDITOR_WIDTH) {
				newLeftContainerWidth = this.dimension.width - this.containerWidth[Position.RIGHT] - SideBySideEditorControl.MIN_EDITOR_WIDTH;
			}

			this.containerWidth[Position.LEFT] = newLeftContainerWidth;
			this.containerWidth[Position.CENTER] = this.dimension.width - this.containerWidth[Position.LEFT] - this.containerWidth[Position.RIGHT];
		}

		// Pass on to containers
		this.layoutContainers();
	}

	private onLeftSashDragEnd(): void {
		this.leftSash.layout();
		this.rightSash.layout(); // Moving left sash might have also moved right sash, so layout() both
		this.focusNextNonMinimized();
	}

	private onLeftSashReset(): void {
		this.centerSash(Position.LEFT, Position.CENTER);
		this.leftSash.layout();
	}

	private onRightSashDragStart(): void {
		this.startRightContainerWidth = this.containerWidth[Position.RIGHT];
	}

	private onRightSashDrag(e: ISashEvent): void {
		let oldRightContainerWidth = this.containerWidth[Position.RIGHT];
		let newRightContainerWidth = this.startRightContainerWidth - e.currentX + e.startX;

		// [  ]|[      ]|[!] : right side can not get smaller than MIN_EDITOR_WIDTH
		if (newRightContainerWidth < SideBySideEditorControl.MIN_EDITOR_WIDTH) {
			newRightContainerWidth = SideBySideEditorControl.MIN_EDITOR_WIDTH;
		}

		// [      ]|[!]|[  ] : center side can not get smaller than MIN_EDITOR_WIDTH
		else if (this.dimension.width - newRightContainerWidth - this.containerWidth[Position.LEFT] < SideBySideEditorControl.MIN_EDITOR_WIDTH) {

			// [!]|[ ]|[    ] : left side can not get smaller than MIN_EDITOR_WIDTH
			if (this.dimension.width - newRightContainerWidth - this.containerWidth[Position.CENTER] < SideBySideEditorControl.MIN_EDITOR_WIDTH) {
				newRightContainerWidth = this.dimension.width - (2 * SideBySideEditorControl.MIN_EDITOR_WIDTH);
				this.containerWidth[Position.LEFT] = this.containerWidth[Position.CENTER] = SideBySideEditorControl.MIN_EDITOR_WIDTH;
			}

			// [ <-]|[ ]|[    ] : left side can snap into minimized
			else if (this.dimension.width - newRightContainerWidth - this.containerWidth[Position.CENTER] - SideBySideEditorControl.SNAP_TO_MINIMIZED_THRESHOLD <= SideBySideEditorControl.MIN_EDITOR_WIDTH) {
				this.containerWidth[Position.LEFT] = SideBySideEditorControl.MIN_EDITOR_WIDTH;
			}

			// [  ]|[ ]|[   ] : left side shrinks
			else {
				this.containerWidth[Position.LEFT] = this.containerWidth[Position.LEFT] - (newRightContainerWidth - oldRightContainerWidth);
			}

			this.leftSash.layout();
		}

		// [ ]|[      ]|[-> ] : right side can snap into minimized
		else if (newRightContainerWidth - SideBySideEditorControl.SNAP_TO_MINIMIZED_THRESHOLD <= SideBySideEditorControl.MIN_EDITOR_WIDTH) {
			newRightContainerWidth = SideBySideEditorControl.MIN_EDITOR_WIDTH;
		}

		// [ ]|[ <-]|[      ] : center side can snap into minimized
		else if (this.dimension.width - this.containerWidth[Position.LEFT] - newRightContainerWidth - SideBySideEditorControl.SNAP_TO_MINIMIZED_THRESHOLD <= SideBySideEditorControl.MIN_EDITOR_WIDTH) {
			newRightContainerWidth = this.dimension.width - this.containerWidth[Position.LEFT] - SideBySideEditorControl.MIN_EDITOR_WIDTH;
		}

		this.containerWidth[Position.RIGHT] = newRightContainerWidth;
		this.containerWidth[Position.CENTER] = this.dimension.width - this.containerWidth[Position.LEFT] - this.containerWidth[Position.RIGHT];

		this.layoutContainers();
	}

	private onRightSashDragEnd(): void {
		this.leftSash.layout(); // Moving right sash might have also moved left sash, so layout() both
		this.rightSash.layout();
		this.focusNextNonMinimized();
	}

	private onRightSashReset(): void {
		this.centerSash(Position.CENTER, Position.RIGHT);
		this.rightSash.layout();
	}

	public getVerticalSashTop(sash: Sash): number {
		return 0;
	}

	public getVerticalSashLeft(sash: Sash): number {
		return sash === this.leftSash ? this.containerWidth[Position.LEFT] : this.containerWidth[Position.CENTER] + this.containerWidth[Position.LEFT];
	}

	public getVerticalSashHeight(sash: Sash): number {
		return this.dimension.height;
	}

	public isDragging(): boolean {
		return this.dragging;
	}

	public layout(dimension: Dimension): void;
	public layout(position: Position): void;
	public layout(arg: any): void {
		if (arg instanceof Dimension) {
			this.layoutControl(<Dimension>arg);
		} else {
			this.layoutEditor(<Position>arg);
		}
	}

	private layoutControl(dimension: Dimension): void {
		let oldDimension = this.dimension;
		this.dimension = dimension;

		// Use the current dimension in case an editor was opened before we had any dimension
		if (!oldDimension || !oldDimension.width || !oldDimension.height) {
			oldDimension = dimension;
		}

		// Apply to visible editors
		let totalWidth = 0;

		// Set preferred dimensions based on ratio to previous dimenions
		POSITIONS.forEach(position => {
			if (this.visibleEditors[position]) {

				// Keep minimized editors in tact by not letting them grow if we have width to give
				if (this.containerWidth[position] !== SideBySideEditorControl.MIN_EDITOR_WIDTH) {
					let sashWidthRatio: number;

					// We have some stored initial ratios when the editor was restored on startup
					// Use those ratios over anything else but only once.
					if (this.containerInitialRatios && types.isNumber(this.containerInitialRatios[position])) {
						sashWidthRatio = this.containerInitialRatios[position];
						delete this.containerInitialRatios[position]; // dont use again
					} else {
						sashWidthRatio = this.containerWidth[position] / oldDimension.width;
					}

					this.containerWidth[position] = Math.max(Math.round(this.dimension.width * sashWidthRatio), SideBySideEditorControl.MIN_EDITOR_WIDTH);
				}

				totalWidth += this.containerWidth[position];
			}
		});

		// Compensate for overflow either through rounding error or min editor width
		if (totalWidth > 0) {
			let overflow = totalWidth - this.dimension.width;

			// We have width to give
			if (overflow < 0) {

				// Find the first position from left to right that is not minimized
				// to give width. This ensures that minimized editors are left like
				// that if the user chose this layout.
				let positionToGive: Position = null;
				POSITIONS.forEach(position => {
					if (this.visibleEditors[position] && positionToGive === null && this.containerWidth[position] !== SideBySideEditorControl.MIN_EDITOR_WIDTH) {
						positionToGive = position;
					}
				});

				if (positionToGive === null) {
					positionToGive = Position.LEFT; // maybe all are minimized, so give LEFT the extra width
				}

				this.containerWidth[positionToGive] -= overflow;
			}

			// We have width to take
			else if (overflow > 0) {
				POSITIONS.forEach(position => {
					let maxCompensation = this.containerWidth[position] - SideBySideEditorControl.MIN_EDITOR_WIDTH;
					if (maxCompensation >= overflow) {
						this.containerWidth[position] -= overflow;
						overflow = 0;
					} else if (maxCompensation > 0) {
						let compensation = overflow - maxCompensation;
						this.containerWidth[position] -= compensation;
						overflow -= compensation;
					}
				});
			}
		}

		// Sash positioning
		this.leftSash.layout();
		this.rightSash.layout();

		// Pass on to Editor Containers
		this.layoutContainers();
	}

	private layoutContainers(): void {

		// Layout containers
		POSITIONS.forEach(position => {
			this.containers[position].size(this.containerWidth[position], this.dimension.height);
		});

		// Position center depending on visibility of right hand editor
		if (this.visibleEditors[Position.RIGHT]) {
			this.containers[Position.CENTER].position(null, this.containerWidth[Position.RIGHT]);
		} else {
			this.containers[Position.CENTER].position(null, this.dimension.width - this.containerWidth[Position.LEFT] - this.containerWidth[Position.CENTER]);
		}

		// Visibility
		POSITIONS.forEach(position => {
			if (this.visibleEditors[position] && this.containers[position].isHidden()) {
				this.containers[position].show();
			} else if (!this.visibleEditors[position] && !this.containers[position].isHidden()) {
				this.containers[position].hide();
			}
		});

		// Layout visible editors
		POSITIONS.forEach(position => {
			this.layoutEditor(position);
		});

		// Layout title controls
		POSITIONS.forEach(position => {
			this.titleAreaControl[position].layout();
		});
	}

	private layoutEditor(position: Position): void {
		let editorWidth = this.containerWidth[position];
		if (editorWidth && this.visibleEditors[position]) {
			this.visibleEditors[position].layout(new Dimension(editorWidth, this.dimension.height - SideBySideEditorControl.EDITOR_TITLE_HEIGHT));
		}
	}

	public getInstantiationService(position: Position): IInstantiationService {
		return this.instantiationServices[position];
	}

	public getProgressBar(position: Position): ProgressBar {
		return this.progressBar[position];
	}

	public updateProgress(position: Position, state: ProgressState): void {
		switch (state) {
			case ProgressState.INFINITE:
				this.progressBar[position].infinite().getContainer().show();
				break;
			case ProgressState.DONE:
				this.progressBar[position].done().getContainer().hide();
				break;
			case ProgressState.STOP:
				this.progressBar[position].stop().getContainer().hide();
				break;
		}
	}

	public dispose(): void {
		dispose(this.toDispose);

		// Positions
		POSITIONS.forEach(position => {
			this.clearPosition(position);
		});

		// Title Area Control
		this.titleAreaControl.forEach(c => c.dispose());

		// Progress bars
		this.progressBar.forEach((bar) => {
			bar.dispose();
		});

		// Sash
		this.leftSash.dispose();
		this.rightSash.dispose();

		// Destroy Container
		this.containers.forEach((container) => {
			container.destroy();
		});

		this.lastActiveEditor = null;
		this.lastActivePosition = null;
		this.visibleEditors = null;
		this.visibleEditorContainers = null;

		this._onGroupFocusChanged.dispose();
	}
}
