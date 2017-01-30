/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./media/editorGroupsControl';
import arrays = require('vs/base/common/arrays');
import Event, { Emitter } from 'vs/base/common/event';
import { StandardMouseEvent } from 'vs/base/browser/mouseEvent';
import types = require('vs/base/common/types');
import { Dimension, Builder, $ } from 'vs/base/browser/builder';
import { Sash, ISashEvent, IVerticalSashLayoutProvider, IHorizontalSashLayoutProvider, Orientation } from 'vs/base/browser/ui/sash/sash';
import { ProgressBar } from 'vs/base/browser/ui/progressbar/progressbar';
import { BaseEditor } from 'vs/workbench/browser/parts/editor/baseEditor';
import DOM = require('vs/base/browser/dom');
import errors = require('vs/base/common/errors');
import { RunOnceScheduler } from 'vs/base/common/async';
import { isMacintosh } from 'vs/base/common/platform';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { Position, POSITIONS } from 'vs/platform/editor/common/editor';
import { IEditorGroupService, ITabOptions, GroupArrangement, GroupOrientation } from 'vs/workbench/services/group/common/groupService';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IExtensionService } from 'vs/platform/extensions/common/extensions';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { TabsTitleControl } from 'vs/workbench/browser/parts/editor/tabsTitleControl';
import { TitleControl, ITitleAreaControl } from 'vs/workbench/browser/parts/editor/titleControl';
import { NoTabsTitleControl } from 'vs/workbench/browser/parts/editor/noTabsTitleControl';
import { IEditorStacksModel, IStacksModelChangeEvent, IEditorGroup, EditorOptions, TextEditorOptions, IEditorIdentifier } from 'vs/workbench/common/editor';
import { extractResources } from 'vs/base/browser/dnd';
import { IWindowService } from 'vs/platform/windows/common/windows';
import { getCodeEditor } from 'vs/editor/common/services/codeEditorService';

export enum Rochade {
	NONE,
	TWO_TO_ONE,
	THREE_TO_TWO,
	TWO_AND_THREE_TO_ONE
}

export enum ProgressState {
	INFINITE,
	DONE,
	STOP
}

export interface IEditorGroupsControl {

	onGroupFocusChanged: Event<void>;

	show(editor: BaseEditor, position: Position, preserveActive: boolean, ratio?: number[]): void;
	hide(editor: BaseEditor, position: Position, layoutAndRochade: boolean): Rochade;

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

	setGroupOrientation(orientation: GroupOrientation): void;
	getGroupOrientation(): GroupOrientation;

	getRatio(): number[];
	dispose(): void;
}

/**
 * Helper class to manage multiple side by side editors for the editor part.
 */
export class EditorGroupsControl implements IEditorGroupsControl, IVerticalSashLayoutProvider, IHorizontalSashLayoutProvider {

	private static TITLE_AREA_CONTROL_KEY = '__titleAreaControl';
	private static PROGRESS_BAR_CONTROL_KEY = '__progressBar';
	private static INSTANTIATION_SERVICE_KEY = '__instantiationService';

	private static MIN_EDITOR_WIDTH = 170;
	private static MIN_EDITOR_HEIGHT = 70;

	private static EDITOR_TITLE_HEIGHT = 35;

	private static SNAP_TO_MINIMIZED_THRESHOLD_WIDTH = 50;
	private static SNAP_TO_MINIMIZED_THRESHOLD_HEIGHT = 20;

	private stacks: IEditorStacksModel;

	private parent: Builder;
	private dimension: Dimension;
	private dragging: boolean;

	private layoutVertically: boolean;

	private tabOptions: ITabOptions;

	private silos: Builder[];
	private silosSize: number[];
	private silosInitialRatio: number[];
	private silosMinimized: boolean[];

	private sashOne: Sash;
	private startSiloOneSize: number;

	private sashTwo: Sash;
	private startSiloThreeSize: number;

	private visibleEditors: BaseEditor[];

	private lastActiveEditor: BaseEditor;
	private lastActivePosition: Position;

	private visibleEditorFocusTrackers: DOM.IFocusTracker[];

	private _onGroupFocusChanged: Emitter<void>;

	private onStacksChangeScheduler: RunOnceScheduler;
	private stacksChangedBuffer: IStacksModelChangeEvent[];

	private toDispose: IDisposable[];

	constructor(
		parent: Builder,
		groupOrientation: GroupOrientation,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IEditorGroupService private editorGroupService: IEditorGroupService,
		@ITelemetryService private telemetryService: ITelemetryService,
		@IContextKeyService private contextKeyService: IContextKeyService,
		@IExtensionService private extensionService: IExtensionService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IWindowService private windowService: IWindowService
	) {
		this.stacks = editorGroupService.getStacksModel();
		this.toDispose = [];

		this.parent = parent;
		this.dimension = new Dimension(0, 0);

		this.silos = [];
		this.silosSize = [];
		this.silosMinimized = [];

		this.visibleEditors = [];
		this.visibleEditorFocusTrackers = [];

		this._onGroupFocusChanged = new Emitter<void>();

		this.onStacksChangeScheduler = new RunOnceScheduler(() => this.handleStacksChanged(), 0);
		this.toDispose.push(this.onStacksChangeScheduler);
		this.stacksChangedBuffer = [];

		this.updateTabOptions(this.editorGroupService.getTabOptions());

		const editorGroupOrientation = groupOrientation || 'vertical';
		this.layoutVertically = (editorGroupOrientation !== 'horizontal');

		this.create();

		this.registerListeners();
	}

	private get totalSize(): number {
		if (!this.dimension || !this.dimension.width || !this.dimension.height) {
			return 0;
		}

		return this.layoutVertically ? this.dimension.width : this.dimension.height;
	}

	private get minSize(): number {
		return this.layoutVertically ? EditorGroupsControl.MIN_EDITOR_WIDTH : EditorGroupsControl.MIN_EDITOR_HEIGHT;
	}

	private isSiloMinimized(position: number): boolean {
		return this.silosSize[position] === this.minSize && this.silosMinimized[position];
	}

	private enableMinimizedState(): void {
		POSITIONS.forEach(p => this.silosMinimized[p] = this.silosSize[p] === this.minSize);
	}

	private updateMinimizedState(): void {
		POSITIONS.forEach(p => {
			if (this.silosSize[p] !== this.minSize) {
				this.silosMinimized[p] = false; // release silo from minimized state if it was sized large enough
			}
		});
	}

	private get snapToMinimizeThresholdSize(): number {
		return this.layoutVertically ? EditorGroupsControl.SNAP_TO_MINIMIZED_THRESHOLD_WIDTH : EditorGroupsControl.SNAP_TO_MINIMIZED_THRESHOLD_HEIGHT;
	}

	private registerListeners(): void {
		this.toDispose.push(this.stacks.onModelChanged(e => this.onStacksChanged(e)));
		this.toDispose.push(this.editorGroupService.onTabOptionsChanged(options => this.updateTabOptions(options, true)));
		this.extensionService.onReady().then(() => this.onExtensionsReady());
	}

	private updateTabOptions(tabOptions: ITabOptions, refresh?: boolean): void {
		const tabCloseButton = this.tabOptions ? this.tabOptions.tabCloseButton : 'right';
		this.tabOptions = tabOptions;

		if (!refresh) {
			return; // return early if no refresh is needed
		}

		// Editor Containers
		POSITIONS.forEach(position => {
			const titleControl = this.getTitleAreaControl(position);

			// TItle Container
			const titleContainer = $(titleControl.getContainer());
			if (this.tabOptions.showTabs) {
				titleContainer.addClass('tabs');
			} else {
				titleContainer.removeClass('tabs');
			}

			const showingIcons = titleContainer.hasClass('show-file-icons');
			if (this.tabOptions.showIcons) {
				titleContainer.addClass('show-file-icons');
			} else {
				titleContainer.removeClass('show-file-icons');
			}

			// Title Control
			if (titleControl) {
				const usingTabs = (titleControl instanceof TabsTitleControl);

				// Recreate title when tabs change
				if (usingTabs !== this.tabOptions.showTabs) {
					titleControl.dispose();
					titleContainer.empty();
					this.createTitleControl(this.stacks.groupAt(position), this.silos[position], titleContainer, this.getInstantiationService(position));
				}

				// Refresh title when icons change
				else if (showingIcons !== this.tabOptions.showIcons || tabCloseButton !== this.tabOptions.tabCloseButton) {
					titleControl.refresh();
				}
			}
		});
	}

	private onExtensionsReady(): void {

		// Up to date title areas
		POSITIONS.forEach(position => this.getTitleAreaControl(position).update());
	}

	private onStacksChanged(e: IStacksModelChangeEvent): void {
		this.stacksChangedBuffer.push(e);
		this.onStacksChangeScheduler.schedule();
	}

	private handleStacksChanged(): void {

		// Read and reset buffer of events
		const buffer = this.stacksChangedBuffer;
		this.stacksChangedBuffer = [];

		// Up to date context for all title controls
		POSITIONS.forEach(position => {
			const titleAreaControl = this.getTitleAreaControl(position);
			const context = this.stacks.groupAt(position);
			const hasContext = titleAreaControl.hasContext();
			titleAreaControl.setContext(context);
			if (!context && hasContext) {
				titleAreaControl.refresh(); // clear out the control if the context is no longer present and there was a context
			}
		});

		// Refresh / update if group is visible and has a position
		buffer.forEach(e => {
			const position = this.stacks.positionOfGroup(e.group);
			if (position >= 0) { // group could be gone by now because we run from a scheduler with timeout
				if (e.structural) {
					this.getTitleAreaControl(position).refresh();
				} else {
					this.getTitleAreaControl(position).update();
				}
			}
		});
	}

	public get onGroupFocusChanged(): Event<void> {
		return this._onGroupFocusChanged.event;
	}

	public show(editor: BaseEditor, position: Position, preserveActive: boolean, ratio?: number[]): void {
		const visibleEditorCount = this.getVisibleEditorCount();

		// Store into editor bucket
		this.visibleEditors[position] = editor;

		// Store as active unless preserveActive is set
		if (!preserveActive || !this.lastActiveEditor) {
			this.doSetActive(editor, position);
		}

		// Track focus
		this.trackFocus(editor, position);

		// Find target container and build into
		const target = this.silos[position].child();
		editor.getContainer().build(target);

		// Adjust layout according to provided ratios (used when restoring multiple editors at once)
		if (ratio && (ratio.length === 2 || ratio.length === 3)) {
			const hasLayoutInfo = !!this.totalSize;

			// We received ratios but were not layouted yet. So we keep these ratios for when we layout()
			if (!hasLayoutInfo) {
				this.silosInitialRatio = ratio;
			}

			// Adjust layout: -> [!][!]
			if (ratio.length === 2) {
				if (hasLayoutInfo) {
					this.silosSize[position] = this.totalSize * ratio[position];
				}
			}

			// Adjust layout: -> [!][!][!]
			else if (ratio.length === 3) {
				if (hasLayoutInfo) {
					this.silosSize[position] = this.totalSize * ratio[position];
				}

				if (this.sashTwo.isHidden()) {
					this.sashTwo.show();
					this.sashTwo.layout();
				}
			}

			if (this.sashOne.isHidden()) {
				this.sashOne.show();
				this.sashOne.layout();
			}

			if (hasLayoutInfo) {
				this.layoutContainers();
			}
		}

		// Adjust layout: -> [!]
		else if (visibleEditorCount === 0 && this.dimension) {
			this.silosSize[position] = this.totalSize;

			this.layoutContainers();
		}

		// Adjust layout: [] -> []|[!]
		else if (position === Position.TWO && this.sashOne.isHidden() && this.sashTwo.isHidden() && this.dimension) {
			this.silosSize[Position.ONE] = this.totalSize / 2;
			this.silosSize[Position.TWO] = this.totalSize - this.silosSize[Position.ONE];

			this.sashOne.show();
			this.sashOne.layout();

			this.layoutContainers();
		}

		// Adjust layout: []|[] -> []|[]|[!]
		else if (position === Position.THREE && this.sashTwo.isHidden() && this.dimension) {
			this.silosSize[Position.ONE] = this.totalSize / 3;
			this.silosSize[Position.TWO] = this.totalSize / 3;
			this.silosSize[Position.THREE] = this.totalSize - this.silosSize[Position.ONE] - this.silosSize[Position.TWO];

			this.sashOne.layout();
			this.sashTwo.show();
			this.sashTwo.layout();

			this.layoutContainers();
		}

		// Show editor container
		editor.getContainer().show();

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

			// Automatically maximize this position if it is minimized
			if (this.isSiloMinimized(this.lastActivePosition)) {

				// Log this fact in telemetry
				if (this.telemetryService) {
					this.telemetryService.publicLog('workbenchEditorMaximized');
				}

				let remainingSize = this.totalSize;
				let layout = false;

				// Minimize all other positions to min size
				POSITIONS.forEach(p => {
					if (this.lastActivePosition !== p && !!this.visibleEditors[p]) {
						this.silosSize[p] = this.minSize;
						remainingSize -= this.silosSize[p];
					}
				});

				// Grow focussed position if there is more size to spend
				if (remainingSize > this.minSize) {
					this.silosSize[this.lastActivePosition] = remainingSize;

					if (!this.sashOne.isHidden()) {
						this.sashOne.layout();
					}

					if (!this.sashTwo.isHidden()) {
						this.sashTwo.layout();
					}

					layout = true;
				}

				// Since we triggered a change in minimized/maximized editors, we need
				// to update our stored state of minimized silos accordingly
				this.enableMinimizedState();

				if (layout) {
					this.layoutContainers();
				}
			}

			// Re-emit to outside
			this._onGroupFocusChanged.fire();
		}
	}

	private focusNextNonMinimized(): void {

		// If the current focussed editor is minimized, try to focus the next largest editor
		if (!types.isUndefinedOrNull(this.lastActivePosition) && this.silosMinimized[this.lastActivePosition]) {
			let candidate: Position = null;
			let currentSize = this.minSize;
			POSITIONS.forEach(position => {

				// Skip current active position and check if the editor is larger than min size
				if (position !== this.lastActivePosition) {
					if (this.visibleEditors[position] && this.silosSize[position] > currentSize) {
						candidate = position;
						currentSize = this.silosSize[position];
					}
				}
			});

			// Focus editor if a candidate has been found
			if (!types.isUndefinedOrNull(candidate)) {
				this.editorGroupService.focusGroup(candidate);
			}
		}
	}

	public hide(editor: BaseEditor, position: Position, layoutAndRochade: boolean): Rochade {
		let result = Rochade.NONE;

		const visibleEditorCount = this.getVisibleEditorCount();

		const hasEditorInPositionTwo = !!this.visibleEditors[Position.TWO];
		const hasEditorInPositionThree = !!this.visibleEditors[Position.THREE];

		// If editor is not showing for position, return
		if (editor !== this.visibleEditors[position]) {
			return result;
		}

		// Clear Position
		this.clearPosition(position);

		// Take editor container offdom and hide
		editor.getContainer().offDOM().hide();

		// Adjust layout and rochade if instructed to do so
		if (layoutAndRochade) {

			// Adjust layout: [x] ->
			if (visibleEditorCount === 1) {
				this.silosSize[position] = 0;

				this.sashOne.hide();
				this.sashTwo.hide();

				this.layoutContainers();
			}

			// Adjust layout: []|[x] -> [] or [x]|[] -> []
			else if (hasEditorInPositionTwo && !hasEditorInPositionThree) {
				this.silosSize[Position.ONE] = this.totalSize;
				this.silosSize[Position.TWO] = 0;

				this.sashOne.hide();
				this.sashTwo.hide();

				// Move TWO to ONE ([x]|[] -> [])
				if (position === Position.ONE) {
					this.rochade(Position.TWO, Position.ONE);
					result = Rochade.TWO_TO_ONE;
				}

				this.layoutContainers();
			}

			// Adjust layout: []|[]|[x] -> [ ]|[ ] or []|[x]|[] -> [ ]|[ ] or [x]|[]|[] -> [ ]|[ ]
			else if (hasEditorInPositionTwo && hasEditorInPositionThree) {
				this.silosSize[Position.ONE] = this.totalSize / 2;
				this.silosSize[Position.TWO] = this.totalSize - this.silosSize[Position.ONE];
				this.silosSize[Position.THREE] = 0;

				this.sashOne.layout();
				this.sashTwo.hide();

				// Move THREE to TWO ([]|[x]|[] -> [ ]|[ ])
				if (position === Position.TWO) {
					this.rochade(Position.THREE, Position.TWO);
					result = Rochade.THREE_TO_TWO;
				}

				// Move THREE to TWO and TWO to ONE ([x]|[]|[] -> [ ]|[ ])
				else if (position === Position.ONE) {
					this.rochade(Position.TWO, Position.ONE);
					this.rochade(Position.THREE, Position.TWO);
					result = Rochade.TWO_AND_THREE_TO_ONE;
				}

				this.layoutContainers();
			}
		}

		// Automatically pick the next editor as active if any
		if (this.lastActiveEditor === editor) {

			// Clear old
			this.doSetActive(null, null);

			// Find new active position by taking the next one close to the closed one to the left/top
			if (layoutAndRochade) {
				let newActivePosition: Position;
				switch (position) {
					case Position.ONE:
						newActivePosition = hasEditorInPositionTwo ? Position.ONE : null;
						break;
					case Position.TWO:
						newActivePosition = Position.ONE;
						break;
					case Position.THREE:
						newActivePosition = Position.TWO;
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
		const editorCount = this.getVisibleEditorCount();
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
	}

	private rochade(from: Position, to: Position): void {

		// Move container to new position
		const containerFrom = this.silos[from].child();
		containerFrom.appendTo(this.silos[to]);

		const containerTo = this.silos[to].child();
		containerTo.appendTo(this.silos[from]);

		// Inform editor
		const editor = this.visibleEditors[from];
		editor.changePosition(to);

		// Change data structures
		const listeners = this.visibleEditorFocusTrackers[from];
		this.visibleEditorFocusTrackers[to] = listeners;
		this.visibleEditorFocusTrackers[from] = null;

		const minimizedState = this.silosMinimized[from];
		this.silosMinimized[to] = minimizedState;
		this.silosMinimized[from] = null;

		this.visibleEditors[to] = editor;
		this.visibleEditors[from] = null;

		// Update last active position
		if (this.lastActivePosition === from) {
			this.doSetActive(this.lastActiveEditor, to);
		}
	}

	public move(from: Position, to: Position): void {

		// Distance 1: Swap Editors
		if (Math.abs(from - to) === 1) {

			// Move containers to new position
			const containerFrom = this.silos[from].child();
			containerFrom.appendTo(this.silos[to]);

			const containerTo = this.silos[to].child();
			containerTo.appendTo(this.silos[from]);

			// Inform Editors
			this.visibleEditors[from].changePosition(to);
			this.visibleEditors[to].changePosition(from);

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
			let newPositionOne: Position;
			let newPositionTwo: Position;
			let newPositionThree: Position;

			if (from === Position.ONE) {
				newPositionOne = Position.THREE;
				newPositionTwo = Position.ONE;
				newPositionThree = Position.TWO;
			} else {
				newPositionOne = Position.TWO;
				newPositionTwo = Position.THREE;
				newPositionThree = Position.ONE;
			}

			// Move containers to new position
			const containerPos1 = this.silos[Position.ONE].child();
			containerPos1.appendTo(this.silos[newPositionOne]);

			const containerPos2 = this.silos[Position.TWO].child();
			containerPos2.appendTo(this.silos[newPositionTwo]);

			const containerPos3 = this.silos[Position.THREE].child();
			containerPos3.appendTo(this.silos[newPositionThree]);

			// Inform Editors
			this.visibleEditors[Position.ONE].changePosition(newPositionOne);
			this.visibleEditors[Position.TWO].changePosition(newPositionTwo);
			this.visibleEditors[Position.THREE].changePosition(newPositionThree);

			// Update last active position accordingly
			if (this.lastActivePosition === Position.ONE) {
				this.doSetActive(this.lastActiveEditor, newPositionOne);
			} else if (this.lastActivePosition === Position.TWO) {
				this.doSetActive(this.lastActiveEditor, newPositionTwo);
			} else if (this.lastActivePosition === Position.THREE) {
				this.doSetActive(this.lastActiveEditor, newPositionThree);
			}
		}

		// Change data structures
		arrays.move(this.visibleEditors, from, to);
		arrays.move(this.visibleEditorFocusTrackers, from, to);
		arrays.move(this.silosSize, from, to);
		arrays.move(this.silosMinimized, from, to);

		// Layout
		if (!this.sashOne.isHidden()) {
			this.sashOne.layout();
		}

		if (!this.sashTwo.isHidden()) {
			this.sashTwo.layout();
		}

		this.layoutContainers();
	}

	public setGroupOrientation(orientation: GroupOrientation): void {
		this.layoutVertically = (orientation !== 'horizontal');

		// Editor Layout
		const verticalLayouting = this.parent.hasClass('vertical-layout');
		if (verticalLayouting !== this.layoutVertically) {
			this.parent.removeClass('vertical-layout', 'horizontal-layout');
			this.parent.addClass(this.layoutVertically ? 'vertical-layout' : 'horizontal-layout');

			this.sashOne.setOrientation(this.layoutVertically ? Orientation.VERTICAL : Orientation.HORIZONTAL);
			this.sashTwo.setOrientation(this.layoutVertically ? Orientation.VERTICAL : Orientation.HORIZONTAL);

			// Trigger layout
			this.arrangeGroups();
		}
	}

	public getGroupOrientation(): GroupOrientation {
		return this.layoutVertically ? 'vertical' : 'horizontal';
	}

	public arrangeGroups(arrangement?: GroupArrangement): void {
		if (!this.dimension) {
			return; // too early
		}

		let availableSize = this.totalSize;
		const visibleEditors = this.getVisibleEditorCount();

		if (visibleEditors <= 1) {
			return; // need more editors
		}

		switch (arrangement) {
			case GroupArrangement.MINIMIZE_OTHERS:
				// Minimize Others
				POSITIONS.forEach(position => {
					if (this.visibleEditors[position]) {
						if (position !== this.lastActivePosition) {
							this.silosSize[position] = this.minSize;
							availableSize -= this.minSize;
						}
					}
				});

				this.silosSize[this.lastActivePosition] = availableSize;
				break;
			case GroupArrangement.EVEN:
				// Even Sizes
				POSITIONS.forEach(position => {
					if (this.visibleEditors[position]) {
						this.silosSize[position] = availableSize / visibleEditors;
					}
				});
				break;
			default:
				// Minimized editors should remain minimized, others should keep their relative Sizes
				let oldNonMinimizedTotal = 0;
				POSITIONS.forEach(position => {
					if (this.visibleEditors[position]) {
						if (this.silosMinimized[position]) {
							this.silosSize[position] = this.minSize;
							availableSize -= this.minSize;
						} else {
							oldNonMinimizedTotal += this.silosSize[position];
						}
					}
				});

				// Set size for non-minimized editors
				const scaleFactor = availableSize / oldNonMinimizedTotal;
				POSITIONS.forEach(position => {
					if (this.visibleEditors[position] && !this.silosMinimized[position]) {
						this.silosSize[position] *= scaleFactor;
					}
				});
		}

		// Since we triggered a change in minimized/maximized editors, we need
		// to update our stored state of minimized silos accordingly
		this.enableMinimizedState();

		// Layout silos
		this.layoutControl(this.dimension);
	}

	public getRatio(): number[] {
		const ratio: number[] = [];

		if (this.dimension) {
			const fullSize = this.totalSize;

			POSITIONS.forEach(position => {
				if (this.visibleEditors[position]) {
					ratio.push(this.silosSize[position] / fullSize);
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

	private create(): void {

		// Store layout as class property
		this.parent.addClass(this.layoutVertically ? 'vertical-layout' : 'horizontal-layout');

		// Allow to drop into container to open
		this.enableDropTarget(this.parent.getHTMLElement());

		// Silo One
		this.silos[Position.ONE] = $(this.parent).div({ class: 'one-editor-silo editor-one monaco-editor-background' });

		// Sash One
		this.sashOne = new Sash(this.parent.getHTMLElement(), this, { baseSize: 5, orientation: this.layoutVertically ? Orientation.VERTICAL : Orientation.HORIZONTAL });
		this.toDispose.push(this.sashOne.addListener2('start', () => this.onSashOneDragStart()));
		this.toDispose.push(this.sashOne.addListener2('change', (e: ISashEvent) => this.onSashOneDrag(e)));
		this.toDispose.push(this.sashOne.addListener2('end', () => this.onSashOneDragEnd()));
		this.toDispose.push(this.sashOne.addListener2('reset', () => this.onSashOneReset()));
		this.sashOne.hide();

		// Silo Two
		this.silos[Position.TWO] = $(this.parent).div({ class: 'one-editor-silo editor-two monaco-editor-background' });

		// Sash Two
		this.sashTwo = new Sash(this.parent.getHTMLElement(), this, { baseSize: 5, orientation: this.layoutVertically ? Orientation.VERTICAL : Orientation.HORIZONTAL });
		this.toDispose.push(this.sashTwo.addListener2('start', () => this.onSashTwoDragStart()));
		this.toDispose.push(this.sashTwo.addListener2('change', (e: ISashEvent) => this.onSashTwoDrag(e)));
		this.toDispose.push(this.sashTwo.addListener2('end', () => this.onSashTwoDragEnd()));
		this.toDispose.push(this.sashTwo.addListener2('reset', () => this.onSashTwoReset()));
		this.sashTwo.hide();

		// Silo Three
		this.silos[Position.THREE] = $(this.parent).div({ class: 'one-editor-silo editor-three monaco-editor-background' });

		// For each position
		POSITIONS.forEach(position => {
			const silo = this.silos[position];

			// Containers (they contain everything and can move between silos)
			const container = $(silo).div({ 'class': 'container' });

			// InstantiationServices
			const instantiationService = this.instantiationService.createChild(new ServiceCollection(
				[IContextKeyService, this.contextKeyService.createScoped(container.getHTMLElement())]
			));
			container.setProperty(EditorGroupsControl.INSTANTIATION_SERVICE_KEY, instantiationService); // associate with container

			// Title containers
			const titleContainer = $(container).div({ 'class': 'title' });
			if (this.tabOptions.showTabs) {
				titleContainer.addClass('tabs');
			}
			if (this.tabOptions.showIcons) {
				titleContainer.addClass('show-file-icons');
			}
			this.hookTitleDragListener(titleContainer);

			// Title Control
			this.createTitleControl(this.stacks.groupAt(position), silo, titleContainer, instantiationService);

			// Progress Bar
			const progressBar = new ProgressBar($(container));
			progressBar.getContainer().hide();
			container.setProperty(EditorGroupsControl.PROGRESS_BAR_CONTROL_KEY, progressBar); // associate with container
		});
	}

	private enableDropTarget(node: HTMLElement): void {
		const $this = this;
		const overlayId = 'monaco-workbench-editor-drop-overlay';
		const splitToPropertyKey = 'splitToPosition';
		const stacks = this.editorGroupService.getStacksModel();

		let overlay: Builder;

		function cleanUp(): void {
			if (overlay) {
				overlay.destroy();
				overlay = void 0;
			}

			POSITIONS.forEach(p => {
				$this.silos[p].removeClass('dragged-over');
			});
		}

		function optionsFromDraggedEditor(identifier: IEditorIdentifier): EditorOptions {

			// When moving an editor, try to preserve as much view state as possible by checking
			// for th editor to be a text editor and creating the options accordingly if so
			let options = EditorOptions.create({ pinned: true });
			const activeEditor = $this.editorService.getActiveEditor();
			const editor = getCodeEditor(activeEditor);
			if (editor && activeEditor.position === stacks.positionOfGroup(identifier.group) && identifier.editor.matches(activeEditor.input)) {
				options = TextEditorOptions.create({ pinned: true });
				(<TextEditorOptions>options).fromEditor(editor);
			}

			return options;
		}

		function onDrop(e: DragEvent, position: Position, splitTo?: Position): void {
			DOM.removeClass(node, 'dropfeedback');
			cleanUp();

			const editorService = $this.editorService;
			const groupService = $this.editorGroupService;

			const splitEditor = (typeof splitTo === 'number'); // TODO@Ben ugly split code should benefit from empty group support once available!
			const freeGroup = (stacks.groups.length === 1) ? Position.TWO : Position.THREE;

			// Check for transfer from title control
			const draggedEditor = TitleControl.getDraggedEditor();
			if (draggedEditor) {
				const isCopy = (e.ctrlKey && !isMacintosh) || (e.altKey && isMacintosh);

				// Copy editor to new location
				if (isCopy) {
					if (splitEditor) {
						editorService.openEditor(draggedEditor.editor, optionsFromDraggedEditor(draggedEditor), freeGroup).then(() => {
							if (splitTo !== freeGroup) {
								groupService.moveGroup(freeGroup, splitTo);
							}
						}).done(null, errors.onUnexpectedError);
					} else {
						editorService.openEditor(draggedEditor.editor, optionsFromDraggedEditor(draggedEditor), position).done(null, errors.onUnexpectedError);
					}
				}

				// Move editor to new location
				else {
					const sourcePosition = stacks.positionOfGroup(draggedEditor.group);
					if (splitEditor) {
						if (draggedEditor.group.count === 1) {
							groupService.moveGroup(sourcePosition, splitTo);
						} else {
							editorService.openEditor(draggedEditor.editor, optionsFromDraggedEditor(draggedEditor), freeGroup).then(() => {
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
				const droppedResources = extractResources(e).filter(r => r.resource.scheme === 'file' || r.resource.scheme === 'untitled');
				if (droppedResources.length) {

					// Add external ones to recently open list
					const externalResources = droppedResources.filter(d => d.isExternal).map(d => d.resource);
					if (externalResources.length) {
						$this.windowService.addToRecentlyOpen(externalResources.map(resource => {
							return {
								path: resource.fsPath,
								isFile: true
							};
						}));
					}

					// Open in Editor
					$this.windowService.focusWindow()
						.then(() => editorService.openEditors(droppedResources.map(d => { return { input: { resource: d.resource, options: { pinned: true } }, position: splitEditor ? freeGroup : position }; })))
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

		function positionOverlay(e: DragEvent, groups: number, position: Position): void {
			const target = <HTMLElement>e.target;
			const overlayIsSplit = typeof overlay.getProperty(splitToPropertyKey) === 'number';
			const isCopy = (e.ctrlKey && !isMacintosh) || (e.altKey && isMacintosh);
			const draggedEditor = TitleControl.getDraggedEditor();

			const overlaySize = $this.layoutVertically ? target.clientWidth : target.clientHeight;
			const splitThreshold = overlayIsSplit ? overlaySize / 5 : overlaySize / 10;

			const posOnOverlay = $this.layoutVertically ? e.offsetX : e.offsetY;
			const isOverSplitLeftOrUp = posOnOverlay < splitThreshold;
			const isOverSplitRightOrBottom = posOnOverlay + splitThreshold > overlaySize;

			let splitTarget: Position;

			// No splitting if we reached maximum group count
			if (groups === POSITIONS.length) {
				splitTarget = null;
			}

			// Special splitting if we drag an editor of a group with only one editor
			else if (!isCopy && draggedEditor && draggedEditor.group.count === 1) {
				const positionOfDraggedEditor = stacks.positionOfGroup(draggedEditor.group);
				switch (positionOfDraggedEditor) {
					case Position.ONE:
						if (position === Position.TWO && isOverSplitRightOrBottom) {
							splitTarget = Position.TWO; // allow to move single editor from ONE to TWO
						}
						break;
					case Position.TWO:
						if (position === Position.ONE && isOverSplitLeftOrUp) {
							splitTarget = Position.ONE; // allow to move single editor from TWO to ONE
						}
						break;
					default:
						splitTarget = null; // splitting not allowed
				}
			}

			// Any other case, check for mouse position
			else {
				if (isOverSplitRightOrBottom) {
					splitTarget = (position === Position.ONE) ? Position.TWO : Position.THREE;
				} else if (isOverSplitLeftOrUp) {
					splitTarget = (position === Position.ONE) ? Position.ONE : Position.TWO;
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
			if (canSplit && isOverSplitRightOrBottom) {
				overlay.style($this.layoutVertically ? { left: '50%', width: '50%' } : { top: '50%', height: '50%' });
			} else if (canSplit && isOverSplitLeftOrUp) {
				overlay.style($this.layoutVertically ? { width: '50%' } : { height: '50%' });
			} else {
				if ($this.layoutVertically) {
					overlay.style({ left: '0', width: '100%' });
				} else {
					overlay.style({ top: $this.tabOptions.showTabs ? `${EditorGroupsControl.EDITOR_TITLE_HEIGHT}px` : 0, height: $this.tabOptions.showTabs ? `calc(100% - ${EditorGroupsControl.EDITOR_TITLE_HEIGHT}px` : '100%' });
				}
			}

			// Make sure the overlay is visible
			overlay.style({ opacity: 1 });

			// Indicate a drag over is happening
			POSITIONS.forEach(p => {
				if (p === position) {
					$this.silos[p].addClass('dragged-over');
				} else {
					$this.silos[p].removeClass('dragged-over');
				}
			});
		}

		function createOverlay(target: HTMLElement): void {
			if (!overlay) {
				const containers = $this.visibleEditors.filter(e => !!e).map(e => e.getContainer());
				containers.forEach((container, index) => {
					if (container && DOM.isAncestor(target, container.getHTMLElement())) {
						overlay = $('div').style({
							top: $this.tabOptions.showTabs ? `${EditorGroupsControl.EDITOR_TITLE_HEIGHT}px` : 0,
							height: $this.tabOptions.showTabs ? `calc(100% - ${EditorGroupsControl.EDITOR_TITLE_HEIGHT}px` : '100%'
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
							cleanUp();
						});

						// Under some circumstances we have seen reports where the drop overlay is not being
						// cleaned up and as such the editor area remains under the overlay so that you cannot
						// type into the editor anymore. This seems related to using VMs and DND via host and
						// guest OS, though some users also saw it without VMs.
						// To protect against this issue we always destroy the overlay as soon as we detect a
						// mouse event over it. The delay is used to guarantee we are not interfering with the
						// actual DROP event that can also trigger a mouse over event.
						overlay.once(DOM.EventType.MOUSE_OVER, () => {
							setTimeout(() => {
								cleanUp();
							}, 300);
						});
					}
				});
			}
		}

		// let a dropped file open inside Code (only if dropped over editor area)
		this.toDispose.push(DOM.addDisposableListener(node, DOM.EventType.DROP, (e: DragEvent) => {
			if (e.target === node || DOM.isAncestor(e.target as HTMLElement, node)) {
				DOM.EventHelper.stop(e, true);
				onDrop(e, Position.ONE);
			} else {
				DOM.removeClass(node, 'dropfeedback');
			}
		}));

		// Drag enter
		let counter = 0; // see https://github.com/Microsoft/vscode/issues/14470
		this.toDispose.push(DOM.addDisposableListener(node, DOM.EventType.DRAG_ENTER, (e: DragEvent) => {
			if (!TitleControl.getDraggedEditor() && !extractResources(e).length) {
				return; // invalid DND
			}

			counter++;
			DOM.addClass(node, 'dropfeedback');

			const target = <HTMLElement>e.target;
			if (target) {
				if (overlay && target.id !== overlayId) {
					cleanUp(); // somehow we managed to move the mouse quickly out of the current overlay, so destroy it
				}
				createOverlay(target);

				if (overlay) {
					DOM.removeClass(node, 'dropfeedback'); // if we show an overlay, we can remove the drop feedback from the editor background
				}
			}
		}));

		// Drag leave
		this.toDispose.push(DOM.addDisposableListener(node, DOM.EventType.DRAG_LEAVE, (e: DragEvent) => {
			counter--;
			if (counter === 0) {
				DOM.removeClass(node, 'dropfeedback');
			}
		}));

		// Drag end (also install globally to be safe)
		[node, window].forEach(container => {
			this.toDispose.push(DOM.addDisposableListener(container, DOM.EventType.DRAG_END, (e: DragEvent) => {
				counter = 0;
				DOM.removeClass(node, 'dropfeedback');
				cleanUp();
			}));
		});
	}

	private createTitleControl(context: IEditorGroup, silo: Builder, container: Builder, instantiationService: IInstantiationService): void {
		const titleAreaControl = instantiationService.createInstance<ITitleAreaControl>(this.tabOptions.showTabs ? TabsTitleControl : NoTabsTitleControl);
		titleAreaControl.create(container.getHTMLElement());
		titleAreaControl.setContext(context);
		titleAreaControl.refresh(true /* instant */);

		silo.child().setProperty(EditorGroupsControl.TITLE_AREA_CONTROL_KEY, titleAreaControl); // associate with container
	}

	private findPosition(element: HTMLElement): Position {
		let parent = element.parentElement;
		while (parent) {
			for (let i = 0; i < POSITIONS.length; i++) {
				const position = POSITIONS[i];
				if (this.silos[position].getHTMLElement() === parent) {
					return position;
				}
			}

			parent = parent.parentElement;
		}

		return null;
	}

	private hookTitleDragListener(titleContainer: Builder): void {
		let wasDragged = false;

		// Allow to reorder positions by dragging the title
		titleContainer.on(DOM.EventType.MOUSE_DOWN, (e: MouseEvent) => {
			const position = this.findPosition(titleContainer.getHTMLElement());
			const titleAreaControl = this.getTitleAreaControl(position);
			if (!titleAreaControl.allowDragging((e.target || e.srcElement) as HTMLElement)) {
				return; // return early if we are not in the drag zone of the title widget
			}

			// Reset flag
			wasDragged = false;
			titleAreaControl.setDragged(false);

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
			// Do NOT cover the title area to prevent missing double click events!
			const overlayDiv = $('div').style({
				top: `${EditorGroupsControl.EDITOR_TITLE_HEIGHT}px`,
				height: `calc(100% - ${EditorGroupsControl.EDITOR_TITLE_HEIGHT}px)`
			}).id('monaco-workbench-editor-move-overlay');
			overlayDiv.appendTo(this.silos[position]);

			// Update flag
			this.dragging = true;

			const visibleEditorCount = this.getVisibleEditorCount();
			const mouseDownEvent = new StandardMouseEvent(e);
			const startPos = this.layoutVertically ? mouseDownEvent.posx : mouseDownEvent.posy;
			let oldNewPos: number = null;

			this.silos[position].addClass('drag');
			this.parent.addClass('drag');

			const $window = $(window);
			$window.on(DOM.EventType.MOUSE_MOVE, (e: MouseEvent) => {
				DOM.EventHelper.stop(e, false);

				const mouseMoveEvent = new StandardMouseEvent(e);
				const diffPos = (this.layoutVertically ? mouseMoveEvent.posx : mouseMoveEvent.posy) - startPos;
				let newPos: number = null;

				if (Math.abs(diffPos) > 5) {
					wasDragged = true;
				}

				switch (position) {

					// [ ! ]|[ ]: Moves only to the right/bottom but not outside of dimension to the right/bottom
					case Position.ONE: {
						newPos = Math.max(-1 /* 1px border accomodation */, Math.min(diffPos, this.totalSize - this.silosSize[Position.ONE]));
						break;
					}

					case Position.TWO: {

						// [ ]|[ ! ]: Moves only to the left/top but not outside of dimension to the left/top
						if (visibleEditorCount === 2) {
							newPos = Math.min(this.silosSize[Position.ONE], Math.max(-1 /* 1px border accomodation */, this.silosSize[Position.ONE] + diffPos));
						}

						// [ ]|[ ! ]|[ ]: Moves to left/top and right/bottom but not outside of dimensions on both sides
						else {
							newPos = Math.min(this.totalSize - this.silosSize[Position.TWO], Math.max(-1 /* 1px border accomodation */, this.silosSize[Position.ONE] + diffPos));
						}
						break;
					}

					// [ ]|[ ]|[ ! ]: Moves to the right/bottom but not outside of dimension on the left/top side
					case Position.THREE: {
						newPos = Math.min(this.silosSize[Position.ONE] + this.silosSize[Position.TWO], Math.max(-1 /* 1px border accomodation */, this.silosSize[Position.ONE] + this.silosSize[Position.TWO] + diffPos));
						break;
					}
				}

				// Return early if position did not change
				if (oldNewPos === newPos) {
					return;
				}

				oldNewPos = newPos;

				// Live drag Feedback
				const moveTo: Position = this.findMoveTarget(position, diffPos);
				switch (position) {
					case Position.ONE: {
						if (moveTo === Position.ONE || moveTo === null) {
							this.posSilo(Position.TWO, `${this.silosSize[Position.ONE]}px`, 'auto', '1px');
							this.posSilo(Position.THREE, 'auto', 0);
						} else if (moveTo === Position.TWO) {
							this.posSilo(Position.TWO, 0, 'auto', 0);
							this.silos[Position.TWO].addClass('draggedunder');
							this.posSilo(Position.THREE, 'auto', 0);
						} else if (moveTo === Position.THREE) {
							this.posSilo(Position.TWO, 0, 'auto');
							this.posSilo(Position.THREE, 'auto', `${this.silosSize[Position.ONE]}px`);
							this.silos[Position.THREE].addClass('draggedunder');
						}
						break;
					}

					case Position.TWO: {
						if (moveTo === Position.ONE) {
							this.posSilo(Position.ONE, `${this.silosSize[Position.TWO]}px`, 'auto');
							this.silos[Position.ONE].addClass('draggedunder');
						} else if (moveTo === Position.TWO || moveTo === null) {
							this.posSilo(Position.ONE, 0, 'auto');
							this.posSilo(Position.THREE, 'auto', 0);
						} else if (moveTo === Position.THREE) {
							this.posSilo(Position.THREE, 'auto', `${this.silosSize[Position.TWO]}px`);
							this.silos[Position.THREE].addClass('draggedunder');
							this.posSilo(Position.ONE, 0, 'auto');
						}
						break;
					}

					case Position.THREE: {
						if (moveTo === Position.ONE) {
							this.posSilo(Position.ONE, `${this.silosSize[Position.THREE]}px`, 'auto');
							this.silos[Position.ONE].addClass('draggedunder');
						} else if (moveTo === Position.TWO) {
							this.posSilo(Position.ONE, 0, 'auto');
							this.posSilo(Position.TWO, `${this.silosSize[Position.ONE] + this.silosSize[Position.THREE]}px`, 'auto');
							this.silos[Position.TWO].addClass('draggedunder');
						} else if (moveTo === Position.THREE || moveTo === null) {
							this.posSilo(Position.ONE, 0, 'auto');
							this.posSilo(Position.TWO, `${this.silosSize[Position.ONE]}px`, 'auto');
						}
						break;
					}
				}

				// Move the editor to provide feedback to the user and add class
				if (newPos !== null) {
					this.posSilo(position, `${newPos}px`);
					this.silos[position].addClass('dragging');
					this.parent.addClass('dragging');
				}
			}).once(DOM.EventType.MOUSE_UP, (e: MouseEvent) => {
				DOM.EventHelper.stop(e, false);

				// Destroy overlay
				overlayDiv.destroy();

				// Update flag
				this.dragging = false;
				if (wasDragged) {
					titleAreaControl.setDragged(true);
				}

				// Restore styles
				this.parent.removeClass('drag');
				this.silos[position].removeClass('drag');
				this.parent.removeClass('dragging');
				this.silos[position].removeClass('dragging');
				POSITIONS.forEach(p => this.silos[p].removeClass('draggedunder'));

				this.posSilo(Position.ONE, 0, 'auto');
				this.posSilo(Position.TWO, 'auto', 'auto', '1px');
				this.posSilo(Position.THREE, 'auto', 0);

				// Find move target
				const mouseUpEvent = new StandardMouseEvent(e);
				const diffPos = (this.layoutVertically ? mouseUpEvent.posx : mouseUpEvent.posy) - startPos;
				const moveTo: Position = this.findMoveTarget(position, diffPos);

				// Move to valid position if any
				if (moveTo !== null) {
					this.editorGroupService.moveGroup(position, moveTo);
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

	private posSilo(pos: number, leftTop: string | number, rightBottom?: string | number, borderLeftTopWidth?: string | number): void {
		let style: any;
		if (this.layoutVertically) {
			style = { left: leftTop };

			if (typeof rightBottom === 'number' || typeof rightBottom === 'string') {
				style['right'] = rightBottom;
			}

			if (typeof borderLeftTopWidth === 'number' || typeof borderLeftTopWidth === 'string') {
				style['borderLeftWidth'] = borderLeftTopWidth;
			}
		} else {
			style = { top: leftTop };

			if (typeof rightBottom === 'number' || typeof rightBottom === 'string') {
				style['bottom'] = rightBottom;
			}

			if (typeof borderLeftTopWidth === 'number' || typeof borderLeftTopWidth === 'string') {
				style['borderTopWidth'] = borderLeftTopWidth;
			}
		}

		this.silos[pos].style(style);
	}

	private findMoveTarget(position: Position, diffPos: number): Position {
		const visibleEditorCount = this.getVisibleEditorCount();

		switch (position) {
			case Position.ONE: {

				// [ ! ]|[] -> []|[ ! ]
				if (visibleEditorCount === 2 && (diffPos >= this.silosSize[Position.ONE] / 2 || diffPos >= this.silosSize[Position.TWO] / 2)) {
					return Position.TWO;
				}

				// [ ! ]|[]|[] -> []|[]|[ ! ]
				if (visibleEditorCount === 3 && (diffPos >= this.silosSize[Position.ONE] / 2 + this.silosSize[Position.TWO] || diffPos >= this.silosSize[Position.THREE] / 2 + this.silosSize[Position.TWO])) {
					return Position.THREE;
				}

				// [ ! ]|[]|[] -> []|[ ! ]|[]
				if (visibleEditorCount === 3 && (diffPos >= this.silosSize[Position.ONE] / 2 || diffPos >= this.silosSize[Position.TWO] / 2)) {
					return Position.TWO;
				}
				break;
			}

			case Position.TWO: {
				if (visibleEditorCount === 2 && diffPos > 0) {
					return null; // Return early since TWO cannot be moved to the THREE unless there is a THREE position
				}

				// []|[ ! ] -> [ ! ]|[]
				if (visibleEditorCount === 2 && (Math.abs(diffPos) >= this.silosSize[Position.TWO] / 2 || Math.abs(diffPos) >= this.silosSize[Position.ONE] / 2)) {
					return Position.ONE;
				}

				// []|[ ! ]|[] -> [ ! ]|[]|[]
				if (visibleEditorCount === 3 && ((diffPos < 0 && Math.abs(diffPos) >= this.silosSize[Position.TWO] / 2) || (diffPos < 0 && Math.abs(diffPos) >= this.silosSize[Position.ONE] / 2))) {
					return Position.ONE;
				}

				// []|[ ! ]|[] -> []|[]|[ ! ]
				if (visibleEditorCount === 3 && ((diffPos > 0 && Math.abs(diffPos) >= this.silosSize[Position.TWO] / 2) || (diffPos > 0 && Math.abs(diffPos) >= this.silosSize[Position.THREE] / 2))) {
					return Position.THREE;
				}
				break;
			}

			case Position.THREE: {
				if (diffPos > 0) {
					return null; // Return early since THREE cannot be moved more to the THREE
				}

				// []|[]|[ ! ] -> [ ! ]|[]|[]
				if (Math.abs(diffPos) >= this.silosSize[Position.THREE] / 2 + this.silosSize[Position.TWO] || Math.abs(diffPos) >= this.silosSize[Position.ONE] / 2 + this.silosSize[Position.TWO]) {
					return Position.ONE;
				}

				// []|[]|[ ! ] -> []|[ ! ]|[]
				if (Math.abs(diffPos) >= this.silosSize[Position.THREE] / 2 || Math.abs(diffPos) >= this.silosSize[Position.TWO] / 2) {
					return Position.TWO;
				}
				break;
			}
		}

		return null;
	}

	private centerSash(a: Position, b: Position): void {
		const sumSize = this.silosSize[a] + this.silosSize[b];
		const meanSize = sumSize / 2;
		this.silosSize[a] = meanSize;
		this.silosSize[b] = sumSize - meanSize;

		this.layoutContainers();
	}

	private onSashOneDragStart(): void {
		this.startSiloOneSize = this.silosSize[Position.ONE];
	}

	private onSashOneDrag(e: ISashEvent): void {
		let oldSiloOneSize = this.silosSize[Position.ONE];
		let diffSize = this.layoutVertically ? (e.currentX - e.startX) : (e.currentY - e.startY);
		let newSiloOneSize = this.startSiloOneSize + diffSize;

		// Side-by-Side
		if (this.sashTwo.isHidden()) {

			// []|[      ] : left/top side can not get smaller than the minimal editor size
			if (newSiloOneSize < this.minSize) {
				newSiloOneSize = this.minSize;
			}

			// [      ]|[] : right/bottom side can not get smaller than the minimal editor size
			else if (this.totalSize - newSiloOneSize < this.minSize) {
				newSiloOneSize = this.totalSize - this.minSize;
			}

			// [ <-]|[      ] : left/top side can snap into minimized
			else if (newSiloOneSize - this.snapToMinimizeThresholdSize <= this.minSize) {
				newSiloOneSize = this.minSize;
			}

			// [      ]|[-> ] : right/bottom side can snap into minimized
			else if (this.totalSize - newSiloOneSize - this.snapToMinimizeThresholdSize <= this.minSize) {
				newSiloOneSize = this.totalSize - this.minSize;
			}

			this.silosSize[Position.ONE] = newSiloOneSize;
			this.silosSize[Position.TWO] = this.totalSize - newSiloOneSize;
		}

		// Side-by-Side-by-Side
		else {

			// [!]|[      ]|[  ] : left/top side can not get smaller than the minimal editor size
			if (newSiloOneSize < this.minSize) {
				newSiloOneSize = this.minSize;
			}

			// [      ]|[!]|[  ] : center side can not get smaller than the minimal editor size
			else if (this.totalSize - newSiloOneSize - this.silosSize[Position.THREE] < this.minSize) {

				// [      ]|[ ]|[!] : right/bottom side can not get smaller than the minimal editor size
				if (this.totalSize - newSiloOneSize - this.silosSize[Position.TWO] < this.minSize) {
					newSiloOneSize = this.totalSize - (2 * this.minSize);
					this.silosSize[Position.TWO] = this.silosSize[Position.THREE] = this.minSize;
				}

				// [      ]|[ ]|[-> ] : right/bottom side can snap into minimized
				else if (this.totalSize - newSiloOneSize - this.silosSize[Position.TWO] - this.snapToMinimizeThresholdSize <= this.minSize) {
					this.silosSize[Position.THREE] = this.minSize;
				}

				// [      ]|[ ]|[ ] : right/bottom side shrinks
				else {
					this.silosSize[Position.THREE] = this.silosSize[Position.THREE] - (newSiloOneSize - oldSiloOneSize);
				}

				this.sashTwo.layout();
			}

			// [ <-]|[      ]|[  ] : left/top side can snap into minimized
			else if (newSiloOneSize - this.snapToMinimizeThresholdSize <= this.minSize) {
				newSiloOneSize = this.minSize;
			}

			// [      ]|[-> ]|[  ] : center side can snap into minimized
			else if (this.totalSize - this.silosSize[Position.THREE] - newSiloOneSize - this.snapToMinimizeThresholdSize <= this.minSize) {
				newSiloOneSize = this.totalSize - this.silosSize[Position.THREE] - this.minSize;
			}

			this.silosSize[Position.ONE] = newSiloOneSize;
			this.silosSize[Position.TWO] = this.totalSize - this.silosSize[Position.ONE] - this.silosSize[Position.THREE];
		}

		// We allow silos to turn into minimized state from user dragging the sash,
		// so we need to update our stored state of minimized silos accordingly
		this.enableMinimizedState();

		// Pass on to containers
		this.layoutContainers();
	}

	private onSashOneDragEnd(): void {
		this.sashOne.layout();
		this.sashTwo.layout(); // Moving sash one might have also moved sash two, so layout() both
		this.focusNextNonMinimized();
	}

	private onSashOneReset(): void {
		this.centerSash(Position.ONE, Position.TWO);
		this.sashOne.layout();
	}

	private onSashTwoDragStart(): void {
		this.startSiloThreeSize = this.silosSize[Position.THREE];
	}

	private onSashTwoDrag(e: ISashEvent): void {
		let oldSiloThreeSize = this.silosSize[Position.THREE];
		let diffSize = this.layoutVertically ? (-e.currentX + e.startX) : (-e.currentY + e.startY);
		let newSiloThreeSize = this.startSiloThreeSize + diffSize;

		// [  ]|[      ]|[!] : right/bottom side can not get smaller than the minimal editor size
		if (newSiloThreeSize < this.minSize) {
			newSiloThreeSize = this.minSize;
		}

		// [      ]|[!]|[  ] : center side can not get smaller than the minimal editor size
		else if (this.totalSize - newSiloThreeSize - this.silosSize[Position.ONE] < this.minSize) {

			// [!]|[ ]|[    ] : left/top side can not get smaller than the minimal editor size
			if (this.totalSize - newSiloThreeSize - this.silosSize[Position.TWO] < this.minSize) {
				newSiloThreeSize = this.totalSize - (2 * this.minSize);
				this.silosSize[Position.ONE] = this.silosSize[Position.TWO] = this.minSize;
			}

			// [ <-]|[ ]|[    ] : left/top side can snap into minimized
			else if (this.totalSize - newSiloThreeSize - this.silosSize[Position.TWO] - this.snapToMinimizeThresholdSize <= this.minSize) {
				this.silosSize[Position.ONE] = this.minSize;
			}

			// [  ]|[ ]|[   ] : left/top side shrinks
			else {
				this.silosSize[Position.ONE] = this.silosSize[Position.ONE] - (newSiloThreeSize - oldSiloThreeSize);
			}

			this.sashOne.layout();
		}

		// [ ]|[      ]|[-> ] : right/bottom side can snap into minimized
		else if (newSiloThreeSize - this.snapToMinimizeThresholdSize <= this.minSize) {
			newSiloThreeSize = this.minSize;
		}

		// [ ]|[ <-]|[      ] : center side can snap into minimized
		else if (this.totalSize - this.silosSize[Position.ONE] - newSiloThreeSize - this.snapToMinimizeThresholdSize <= this.minSize) {
			newSiloThreeSize = this.totalSize - this.silosSize[Position.ONE] - this.minSize;
		}

		this.silosSize[Position.THREE] = newSiloThreeSize;
		this.silosSize[Position.TWO] = this.totalSize - this.silosSize[Position.ONE] - this.silosSize[Position.THREE];

		// We allow silos to turn into minimized state from user dragging the sash,
		// so we need to update our stored state of minimized silos accordingly
		this.enableMinimizedState();

		// Pass on to containers
		this.layoutContainers();
	}

	private onSashTwoDragEnd(): void {
		this.sashOne.layout(); // Moving sash one might have also moved sash two, so layout() both
		this.sashTwo.layout();

		this.focusNextNonMinimized();
	}

	private onSashTwoReset(): void {
		this.centerSash(Position.TWO, Position.THREE);

		this.sashTwo.layout();
	}

	public getVerticalSashTop(sash: Sash): number {
		return 0;
	}

	public getVerticalSashLeft(sash: Sash): number {
		return sash === this.sashOne ? this.silosSize[Position.ONE] : this.silosSize[Position.TWO] + this.silosSize[Position.ONE];
	}

	public getVerticalSashHeight(sash: Sash): number {
		return this.dimension.height;
	}

	public getHorizontalSashTop(sash: Sash): number {
		return sash === this.sashOne ? this.silosSize[Position.ONE] : this.silosSize[Position.TWO] + this.silosSize[Position.ONE];
	}

	public getHorizontalSashLeft(sash: Sash): number {
		return 0;
	}

	public getHorizontalSashWidth(sash: Sash): number {
		return this.dimension.width;
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
		let totalSize = 0;

		// Set preferred dimensions based on ratio to previous dimenions
		let wasInitialRatioRestored = false;
		const oldTotalSize = this.layoutVertically ? oldDimension.width : oldDimension.height;
		POSITIONS.forEach(position => {
			if (this.visibleEditors[position]) {

				// Keep minimized editors in tact by not letting them grow if we have size to give
				if (!this.isSiloMinimized(position)) {
					let siloSizeRatio: number;

					// We have some stored initial ratios when the editor was restored on startup
					// Use those ratios over anything else but only once.
					if (this.silosInitialRatio && types.isNumber(this.silosInitialRatio[position])) {
						siloSizeRatio = this.silosInitialRatio[position];
						delete this.silosInitialRatio[position]; // dont use again
						wasInitialRatioRestored = true;
					} else {
						siloSizeRatio = this.silosSize[position] / oldTotalSize;
					}

					this.silosSize[position] = Math.max(Math.round(this.totalSize * siloSizeRatio), this.minSize);
				}

				totalSize += this.silosSize[position];
			}
		});

		// When restoring from an initial ratio state, we treat editors of min-size as
		// minimized, so we need to update our stored state of minimized silos accordingly
		if (wasInitialRatioRestored) {
			this.enableMinimizedState();
		}

		// Compensate for overflow either through rounding error or min editor size
		if (totalSize > 0) {
			let overflow = totalSize - this.totalSize;

			// We have size to give
			if (overflow < 0) {

				// Find the first position from left/top to right/bottom that is not minimized
				// to give size. This ensures that minimized editors are left like
				// that if the user chose this layout.
				let positionToGive: Position = null;
				POSITIONS.forEach(position => {
					if (this.visibleEditors[position] && positionToGive === null && !this.isSiloMinimized(position)) {
						positionToGive = position;
					}
				});

				if (positionToGive === null) {
					positionToGive = Position.ONE; // maybe all are minimized, so give ONE the extra size
				}

				this.silosSize[positionToGive] -= overflow;
			}

			// We have size to take
			else if (overflow > 0) {
				POSITIONS.forEach(position => {
					const maxCompensation = this.silosSize[position] - this.minSize;
					if (maxCompensation >= overflow) {
						this.silosSize[position] -= overflow;
						overflow = 0;
					} else if (maxCompensation > 0) {
						this.silosSize[position] -= maxCompensation;
						overflow -= maxCompensation;
					}
				});
			}
		}

		// Sash positioning
		this.sashOne.layout();
		this.sashTwo.layout();

		// Pass on to Editor Containers
		this.layoutContainers();
	}

	private layoutContainers(): void {

		// Layout containers
		POSITIONS.forEach(position => {
			const siloWidth = this.layoutVertically ? this.silosSize[position] : this.dimension.width;
			const siloHeight = this.layoutVertically ? this.dimension.height : this.silosSize[position];

			this.silos[position].size(siloWidth, siloHeight);
		});

		if (this.layoutVertically) {
			this.silos[Position.TWO].position(0, null, null, this.silosSize[Position.ONE]);
		} else {
			this.silos[Position.TWO].position(this.silosSize[Position.ONE], null, null, 0);
		}

		// Visibility
		POSITIONS.forEach(position => {
			if (this.visibleEditors[position] && this.silos[position].isHidden()) {
				this.silos[position].show();
			} else if (!this.visibleEditors[position] && !this.silos[position].isHidden()) {
				this.silos[position].hide();
			}
		});

		// Layout visible editors
		POSITIONS.forEach(position => {
			this.layoutEditor(position);
		});

		// Layout title controls
		POSITIONS.forEach(position => {
			this.getTitleAreaControl(position).layout();
		});

		// Update minimized state
		this.updateMinimizedState();
	}

	private layoutEditor(position: Position): void {
		const editorSize = this.silosSize[position];
		if (editorSize && this.visibleEditors[position]) {
			let editorWidth = this.layoutVertically ? editorSize : this.dimension.width;
			let editorHeight = (this.layoutVertically ? this.dimension.height : this.silosSize[position]) - EditorGroupsControl.EDITOR_TITLE_HEIGHT;

			if (position !== Position.ONE) {
				if (this.layoutVertically) {
					editorWidth--; // accomodate for 1px left-border in containers TWO, THREE when laying out vertically
				} else {
					editorHeight--; // accomodate for 1px top-border in containers TWO, THREE when laying out horizontally
				}
			}

			this.visibleEditors[position].layout(new Dimension(editorWidth, editorHeight));
		}
	}

	public getInstantiationService(position: Position): IInstantiationService {
		return this.getFromContainer(position, EditorGroupsControl.INSTANTIATION_SERVICE_KEY);
	}

	public getProgressBar(position: Position): ProgressBar {
		return this.getFromContainer(position, EditorGroupsControl.PROGRESS_BAR_CONTROL_KEY);
	}

	private getTitleAreaControl(position: Position): ITitleAreaControl {
		return this.getFromContainer(position, EditorGroupsControl.TITLE_AREA_CONTROL_KEY);
	}

	private getFromContainer(position: Position, key: string): any {
		const silo = this.silos[position];

		return silo ? silo.child().getProperty(key) : void 0;
	}

	public updateProgress(position: Position, state: ProgressState): void {
		const progressbar = this.getProgressBar(position);
		if (!progressbar) {
			return;
		}

		switch (state) {
			case ProgressState.INFINITE:
				progressbar.infinite().getContainer().show();
				break;
			case ProgressState.DONE:
				progressbar.done().getContainer().hide();
				break;
			case ProgressState.STOP:
				progressbar.stop().getContainer().hide();
				break;
		}
	}

	public dispose(): void {
		dispose(this.toDispose);

		// Positions
		POSITIONS.forEach(position => {
			this.clearPosition(position);
		});

		// Controls
		POSITIONS.forEach(position => {
			this.getTitleAreaControl(position).dispose();
			this.getProgressBar(position).dispose();
		});

		// Sash
		this.sashOne.dispose();
		this.sashTwo.dispose();

		// Destroy Container
		this.silos.forEach(silo => {
			silo.destroy();
		});

		this.lastActiveEditor = null;
		this.lastActivePosition = null;
		this.visibleEditors = null;

		this._onGroupFocusChanged.dispose();
	}
}
