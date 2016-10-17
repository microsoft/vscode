/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./media/sidebyside';
import arrays = require('vs/base/common/arrays');
import Event, { Emitter } from 'vs/base/common/event';
import { StandardMouseEvent } from 'vs/base/browser/mouseEvent';
import types = require('vs/base/common/types');
import { Dimension, Builder, $ } from 'vs/base/browser/builder';
import { Sash, ISashEvent, IVerticalSashLayoutProvider, IHorizontalSashLayoutProvider, Orientation } from 'vs/base/browser/ui/sash/sash';
import { ProgressBar } from 'vs/base/browser/ui/progressbar/progressbar';
import { BaseEditor } from 'vs/workbench/browser/parts/editor/baseEditor';
import DOM = require('vs/base/browser/dom');
import URI from 'vs/base/common/uri';
import errors = require('vs/base/common/errors');
import { RunOnceScheduler } from 'vs/base/common/async';
import { isMacintosh } from 'vs/base/common/platform';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { Position, POSITIONS } from 'vs/platform/editor/common/editor';
import { IEditorGroupService, GroupArrangement } from 'vs/workbench/services/group/common/groupService';
import { BaseTextEditor } from 'vs/workbench/browser/parts/editor/textEditor';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IExtensionService } from 'vs/platform/extensions/common/extensions';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { TabsTitleControl } from 'vs/workbench/browser/parts/editor/tabsTitleControl';
import { TitleControl } from 'vs/workbench/browser/parts/editor/titleControl';
import { NoTabsTitleControl } from 'vs/workbench/browser/parts/editor/noTabsTitleControl';
import { IEditorStacksModel, IStacksModelChangeEvent, IWorkbenchEditorConfiguration, IEditorGroup, EditorOptions, TextEditorOptions, IEditorIdentifier } from 'vs/workbench/common/editor';
import { ITitleAreaControl } from 'vs/workbench/browser/parts/editor/titleControl';
import { extractResources } from 'vs/base/browser/dnd';

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

	show(editor: BaseEditor, position: Position, preserveActive: boolean, ratio?: number[]): void;
	hide(editor: BaseEditor, position: Position, layoutAndRochade: boolean): Rochade;

	setActive(editor: BaseEditor): void;

	getActiveEditor(): BaseEditor;
	getActivePosition(): Position;

	move(from: Position, to: Position): void;

	isDragging(): boolean;

	updateTitle(identifier: IEditorIdentifier): void;

	getInstantiationService(position: Position): IInstantiationService;
	getProgressBar(position: Position): ProgressBar;
	updateProgress(position: Position, state: ProgressState): void;

	layout(dimension: Dimension): void;
	layout(position: Position): void;

	arrangeGroups(arrangement: GroupArrangement): void;

	getRatio(): number[];
	dispose(): void;
}

/**
 * Helper class to manage multiple side by side editors for the editor part.
 */
export class SideBySideEditorControl implements ISideBySideEditorControl, IVerticalSashLayoutProvider, IHorizontalSashLayoutProvider {

	private static TITLE_AREA_CONTROL_KEY = '__titleAreaControl';
	private static PROGRESS_BAR_CONTROL_KEY = '__progressBar';
	private static INSTANTIATION_SERVICE_KEY = '__instantiationService';

	private static MIN_EDITOR_SIZE = 170;
	private static EDITOR_TITLE_HEIGHT = 35;
	private static SNAP_TO_MINIMIZED_THRESHOLD = 50;

	private stacks: IEditorStacksModel;

	private parent: Builder;
	private dimension: Dimension;
	private dragging: boolean;

	private layoutVertically: boolean;
	private showTabs: boolean;
	private showIcons: boolean;

	private silos: Builder[];
	private silosSize: number[];
	private silosInitialRatio: number[];

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
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IEditorGroupService private editorGroupService: IEditorGroupService,
		@ITelemetryService private telemetryService: ITelemetryService,
		@IConfigurationService private configurationService: IConfigurationService,
		@IContextKeyService private contextKeyService: IContextKeyService,
		@IExtensionService private extensionService: IExtensionService,
		@IInstantiationService private instantiationService: IInstantiationService
	) {
		this.stacks = editorGroupService.getStacksModel();
		this.toDispose = [];

		this.parent = parent;
		this.dimension = new Dimension(0, 0);

		this.silos = [];
		this.silosSize = [];

		this.visibleEditors = [];
		this.visibleEditorFocusTrackers = [];

		this._onGroupFocusChanged = new Emitter<void>();

		this.onStacksChangeScheduler = new RunOnceScheduler(() => this.handleStacksChanged(), 0);
		this.toDispose.push(this.onStacksChangeScheduler);
		this.stacksChangedBuffer = [];

		this.onConfigurationUpdated(this.configurationService.getConfiguration<IWorkbenchEditorConfiguration>());

		this.create();

		this.registerListeners();
	}

	private get totalSize(): number {
		if (!this.dimension || !this.dimension.width || !this.dimension.height) {
			return 0;
		}

		return this.layoutVertically ? this.dimension.width : this.dimension.height;
	}

	private registerListeners(): void {
		this.toDispose.push(this.stacks.onModelChanged(e => this.onStacksChanged(e)));
		this.toDispose.push(this.configurationService.onDidUpdateConfiguration(e => this.onConfigurationUpdated(e.config, true)));
		this.extensionService.onReady().then(() => this.onExtensionsReady());
	}

	private onConfigurationUpdated(config: IWorkbenchEditorConfiguration, refresh?: boolean): void {
		if (config.workbench && config.workbench.editor) {
			this.showTabs = config.workbench.editor.showTabs;
			this.showIcons = config.workbench.editor.showIcons;
			this.layoutVertically = (config.workbench.editor.sideBySideLayout !== 'horizontal');
		} else {
			this.showTabs = true;
			this.showIcons = false;
			this.layoutVertically = true;
		}

		if (!refresh) {
			return; // return early if no refresh is needed
		}

		// Editor Layout
		const verticalLayouting = this.parent.hasClass('vertical-layout');
		if (verticalLayouting !== this.layoutVertically) {
			this.parent.removeClass('vertical-layout', 'horizontal-layout');
			this.parent.addClass(this.layoutVertically ? 'vertical-layout' : 'horizontal-layout');

			this.sashOne.setOrientation(this.layoutVertically ? Orientation.VERTICAL : Orientation.HORIZONTAL);
			this.sashTwo.setOrientation(this.layoutVertically ? Orientation.VERTICAL : Orientation.HORIZONTAL);

			// Trigger layout
			this.arrangeGroups(GroupArrangement.EVEN);
		}

		// Editor Containers
		POSITIONS.forEach(position => {
			const titleControl = this.getTitleAreaControl(position);

			// TItle Container
			const titleContainer = $(titleControl.getContainer());
			if (this.showTabs) {
				titleContainer.addClass('tabs');
			} else {
				titleContainer.removeClass('tabs');
			}

			const showingIcons = titleContainer.hasClass('show-file-icons');
			if (this.showIcons) {
				titleContainer.addClass('show-file-icons');
			} else {
				titleContainer.removeClass('show-file-icons');
			}

			// Title Control
			if (titleControl) {
				const usingTabs = (titleControl instanceof TabsTitleControl);

				// Recreate title when tabs change
				if (usingTabs !== this.showTabs) {
					titleControl.dispose();
					titleContainer.empty();
					this.createTitleControl(this.stacks.groupAt(position), this.silos[position], titleContainer, this.getInstantiationService(position));
				}

				// Refresh title when icons change
				else if (showingIcons !== this.showIcons) {
					titleControl.refresh(true);
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
		else if (position === Position.CENTER && this.sashOne.isHidden() && this.sashTwo.isHidden() && this.dimension) {
			this.silosSize[Position.LEFT] = this.totalSize / 2;
			this.silosSize[Position.CENTER] = this.totalSize - this.silosSize[Position.LEFT];

			this.sashOne.show();
			this.sashOne.layout();

			this.layoutContainers();
		}

		// Adjust layout: []|[] -> []|[]|[!]
		else if (position === Position.RIGHT && this.sashTwo.isHidden() && this.dimension) {
			this.silosSize[Position.LEFT] = this.totalSize / 3;
			this.silosSize[Position.CENTER] = this.totalSize / 3;
			this.silosSize[Position.RIGHT] = this.totalSize - this.silosSize[Position.LEFT] - this.silosSize[Position.CENTER];

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

			// Automatically maximize this position if it has min editor size
			if (this.silosSize[this.lastActivePosition] === SideBySideEditorControl.MIN_EDITOR_SIZE) {

				// Log this fact in telemetry
				if (this.telemetryService) {
					this.telemetryService.publicLog('workbenchEditorMaximized');
				}

				let remainingSize = this.totalSize;

				// Minimize all other positions to min size
				POSITIONS.forEach(p => {
					if (this.lastActivePosition !== p && !!this.visibleEditors[p]) {
						this.silosSize[p] = SideBySideEditorControl.MIN_EDITOR_SIZE;
						remainingSize -= this.silosSize[p];
					}
				});

				// Grow focussed position if there is more size to spend
				if (remainingSize > SideBySideEditorControl.MIN_EDITOR_SIZE) {
					this.silosSize[this.lastActivePosition] = remainingSize;

					if (!this.sashOne.isHidden()) {
						this.sashOne.layout();
					}

					if (!this.sashTwo.isHidden()) {
						this.sashTwo.layout();
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
		if (!types.isUndefinedOrNull(this.lastActivePosition) && this.silosSize[this.lastActivePosition] === SideBySideEditorControl.MIN_EDITOR_SIZE) {
			let candidate: Position = null;
			let currentSize = SideBySideEditorControl.MIN_EDITOR_SIZE;
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

		const hasCenter = !!this.visibleEditors[Position.CENTER];
		const hasRight = !!this.visibleEditors[Position.RIGHT];

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
			else if (hasCenter && !hasRight) {
				this.silosSize[Position.LEFT] = this.totalSize;
				this.silosSize[Position.CENTER] = 0;

				this.sashOne.hide();
				this.sashTwo.hide();

				// Move CENTER to LEFT ([x]|[] -> [])
				if (position === Position.LEFT) {
					this.rochade(Position.CENTER, Position.LEFT);
					result = Rochade.CENTER_TO_LEFT;
				}

				this.layoutContainers();
			}

			// Adjust layout: []|[]|[x] -> [ ]|[ ] or []|[x]|[] -> [ ]|[ ] or [x]|[]|[] -> [ ]|[ ]
			else if (hasCenter && hasRight) {
				this.silosSize[Position.LEFT] = this.totalSize / 2;
				this.silosSize[Position.CENTER] = this.totalSize - this.silosSize[Position.LEFT];
				this.silosSize[Position.RIGHT] = 0;

				this.sashOne.layout();
				this.sashTwo.hide();

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

			// Move containers to new position
			const containerPos1 = this.silos[Position.LEFT].child();
			containerPos1.appendTo(this.silos[newLeftPosition]);

			const containerPos2 = this.silos[Position.CENTER].child();
			containerPos2.appendTo(this.silos[newCenterPosition]);

			const containerPos3 = this.silos[Position.RIGHT].child();
			containerPos3.appendTo(this.silos[newRightPosition]);

			// Inform Editors
			this.visibleEditors[Position.LEFT].changePosition(newLeftPosition);
			this.visibleEditors[Position.CENTER].changePosition(newCenterPosition);
			this.visibleEditors[Position.RIGHT].changePosition(newRightPosition);

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
		arrays.move(this.visibleEditors, from, to);
		arrays.move(this.visibleEditorFocusTrackers, from, to);
		arrays.move(this.silosSize, from, to);

		// Layout
		if (!this.sashOne.isHidden()) {
			this.sashOne.layout();
		}

		if (!this.sashTwo.isHidden()) {
			this.sashTwo.layout();
		}

		this.layoutContainers();
	}

	public arrangeGroups(arrangement: GroupArrangement): void {
		if (!this.dimension) {
			return; // too early
		}

		let availableSize = this.totalSize;
		const visibleEditors = this.getVisibleEditorCount();

		if (visibleEditors <= 1) {
			return; // need more editors
		}

		// Minimize Others
		if (arrangement === GroupArrangement.MINIMIZE_OTHERS) {
			POSITIONS.forEach(position => {
				if (this.visibleEditors[position]) {
					if (position !== this.lastActivePosition) {
						this.silosSize[position] = SideBySideEditorControl.MIN_EDITOR_SIZE;
						availableSize -= SideBySideEditorControl.MIN_EDITOR_SIZE;
					}
				}
			});

			this.silosSize[this.lastActivePosition] = availableSize;
		}

		// Even Sizes
		else if (arrangement === GroupArrangement.EVEN) {
			POSITIONS.forEach(position => {
				if (this.visibleEditors[position]) {
					this.silosSize[position] = availableSize / visibleEditors;
				}
			});
		}

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
		this.silos[Position.LEFT] = $(this.parent).div({ class: 'one-editor-silo editor-left monaco-editor-background' });

		// Sash One
		this.sashOne = new Sash(this.parent.getHTMLElement(), this, { baseSize: 5, orientation: this.layoutVertically ? Orientation.VERTICAL : Orientation.HORIZONTAL });
		this.toDispose.push(this.sashOne.addListener2('start', () => this.onSashOneDragStart()));
		this.toDispose.push(this.sashOne.addListener2('change', (e: ISashEvent) => this.onSashOneDrag(e)));
		this.toDispose.push(this.sashOne.addListener2('end', () => this.onSashOneDragEnd()));
		this.toDispose.push(this.sashOne.addListener2('reset', () => this.onSashOneReset()));
		this.sashOne.hide();

		// Silo Two
		this.silos[Position.CENTER] = $(this.parent).div({ class: 'one-editor-silo editor-center monaco-editor-background' });

		// Sash Two
		this.sashTwo = new Sash(this.parent.getHTMLElement(), this, { baseSize: 5, orientation: this.layoutVertically ? Orientation.VERTICAL : Orientation.HORIZONTAL });
		this.toDispose.push(this.sashTwo.addListener2('start', () => this.onSashTwoDragStart()));
		this.toDispose.push(this.sashTwo.addListener2('change', (e: ISashEvent) => this.onSashTwoDrag(e)));
		this.toDispose.push(this.sashTwo.addListener2('end', () => this.onSashTwoDragEnd()));
		this.toDispose.push(this.sashTwo.addListener2('reset', () => this.onSashTwoReset()));
		this.sashTwo.hide();

		// Silo Three
		this.silos[Position.RIGHT] = $(this.parent).div({ class: 'one-editor-silo editor-right monaco-editor-background' });

		// For each position
		POSITIONS.forEach(position => {
			const silo = this.silos[position];

			// Containers (they contain everything and can move between silos)
			const container = $(silo).div({ 'class': 'container' });

			// InstantiationServices
			const instantiationService = this.instantiationService.createChild(new ServiceCollection(
				[IContextKeyService, this.contextKeyService.createScoped(container.getHTMLElement())]
			));
			container.setProperty(SideBySideEditorControl.INSTANTIATION_SERVICE_KEY, instantiationService); // associate with container

			// Title containers
			const titleContainer = $(container).div({ 'class': 'title' });
			if (this.showTabs) {
				titleContainer.addClass('tabs');
			}
			if (this.showIcons) {
				titleContainer.addClass('show-file-icons');
			}
			this.hookTitleDragListener(titleContainer);

			// Title Control
			this.createTitleControl(this.stacks.groupAt(position), silo, titleContainer, instantiationService);

			// Progress Bar
			const progressBar = new ProgressBar($(container));
			progressBar.getContainer().hide();
			container.setProperty(SideBySideEditorControl.PROGRESS_BAR_CONTROL_KEY, progressBar); // associate with container
		});
	}

	private enableDropTarget(node: HTMLElement): void {
		const $this = this;
		const overlayId = 'monaco-workbench-editor-drop-overlay';
		const splitToPropertyKey = 'splitToPosition';
		const stacks = this.editorGroupService.getStacksModel();

		let overlay: Builder;
		let draggedResources: URI[];

		function cleanUp(): void {
			draggedResources = void 0;

			if (overlay) {
				overlay.destroy();
				overlay = void 0;
			}

			DOM.removeClass(node, 'dragged-over');
		}

		function optionsFromDraggedEditor(identifier: IEditorIdentifier): EditorOptions {

			// When moving an editor, try to preserve as much view state as possible by checking
			// for th editor to be a text editor and creating the options accordingly if so
			let options = EditorOptions.create({ pinned: true });
			const activeEditor = $this.editorService.getActiveEditor();
			if (activeEditor instanceof BaseTextEditor && activeEditor.position === stacks.positionOfGroup(identifier.group) && identifier.editor.matches(activeEditor.input)) {
				options = TextEditorOptions.create({ pinned: true });
				(<TextEditorOptions>options).fromEditor(activeEditor.getControl());
			}

			return options;
		}

		function onDrop(e: DragEvent, position: Position, splitTo?: Position): void {
			const droppedResources = draggedResources;
			DOM.removeClass(node, 'dropfeedback');
			cleanUp();

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
					case Position.LEFT:
						if (position === Position.CENTER && isOverSplitRightOrBottom) {
							splitTarget = Position.CENTER; // allow to move single editor from LEFT to CENTER
						}
						break;
					case Position.CENTER:
						if (position === Position.LEFT && isOverSplitLeftOrUp) {
							splitTarget = Position.LEFT; // allow to move single editor from CENTER to LEFT
						}
						break;
					default:
						splitTarget = null; // splitting not allowed
				}
			}

			// Any other case, check for mouse position
			else {
				if (isOverSplitRightOrBottom) {
					splitTarget = (position === Position.LEFT) ? Position.CENTER : Position.RIGHT;
				} else if (isOverSplitLeftOrUp) {
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
			if (canSplit && isOverSplitRightOrBottom) {
				overlay.style($this.layoutVertically ? { left: '50%', width: '50%' } : { top: '50%', height: '50%' });
			} else if (canSplit && isOverSplitLeftOrUp) {
				overlay.style($this.layoutVertically ? { width: '50%' } : { height: '50%' });
			} else {
				overlay.style({ left: '0', width: '100%' });
			}

			// Make sure the overlay is visible
			overlay.style({ opacity: 1 });

			// Indicate a drag over is happening
			DOM.addClass(node, 'dragged-over');
		}

		function createOverlay(target: HTMLElement): void {
			if (!overlay) {
				const containers = $this.visibleEditors.filter(e => !!e).map(e => e.getContainer());
				containers.forEach((container, index) => {
					if (container && DOM.isAncestor(target, container.getHTMLElement())) {
						overlay = $('div').style({
							top: $this.showTabs ? SideBySideEditorControl.EDITOR_TITLE_HEIGHT + 'px' : 0,
							height: $this.showTabs ? `calc(100% - ${SideBySideEditorControl.EDITOR_TITLE_HEIGHT}px` : '100%'
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
			if (e.target === node) {
				DOM.EventHelper.stop(e, true);
				onDrop(e, Position.LEFT);
			} else {
				DOM.removeClass(node, 'dropfeedback');
			}
		}));

		// Drag over
		this.toDispose.push(DOM.addDisposableListener(node, DOM.EventType.DRAG_OVER, (e: DragEvent) => {

			// Upon first drag, detect the dragged resources and only take valid ones
			if (!draggedResources) {
				draggedResources = extractResources(e).filter(r => r.scheme === 'file' || r.scheme === 'untitled');
			}

			if (!draggedResources.length && !TitleControl.getDraggedEditor()) {
				return; // do not show drop feedback if we drag invalid resources or no tab around
			}

			if (e.target === node) {
				DOM.addClass(node, 'dropfeedback');
			}

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
			DOM.removeClass(node, 'dropfeedback');
		}));

		// Drag end (also install globally to be safe)
		[node, window].forEach(container => {
			this.toDispose.push(DOM.addDisposableListener(container, DOM.EventType.DRAG_END, (e: DragEvent) => {
				DOM.removeClass(node, 'dropfeedback');
				cleanUp();
			}));
		});
	}

	private createTitleControl(context: IEditorGroup, silo: Builder, container: Builder, instantiationService: IInstantiationService): void {
		const titleAreaControl = instantiationService.createInstance<ITitleAreaControl>(this.showTabs ? TabsTitleControl : NoTabsTitleControl);
		titleAreaControl.create(container.getHTMLElement());
		titleAreaControl.setContext(context);
		titleAreaControl.refresh(true /* instant */);

		silo.child().setProperty(SideBySideEditorControl.TITLE_AREA_CONTROL_KEY, titleAreaControl); // associate with container
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
			if (!titleAreaControl.allowDragging(<any>e.target || e.srcElement)) {
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
			const overlayDiv = $('div').style({
				top: SideBySideEditorControl.EDITOR_TITLE_HEIGHT + 'px',
				height: '100%'
			}).id('monaco-workbench-editor-move-overlay');
			overlayDiv.appendTo(this.parent);

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
					case Position.LEFT: {
						newPos = Math.max(-1 /* 1px border accomodation */, Math.min(diffPos, this.totalSize - this.silosSize[Position.LEFT]));
						break;
					}

					case Position.CENTER: {

						// [ ]|[ ! ]: Moves only to the left/top but not outside of dimension to the left/top
						if (visibleEditorCount === 2) {
							newPos = Math.min(this.silosSize[Position.LEFT], Math.max(-1 /* 1px border accomodation */, this.silosSize[Position.LEFT] + diffPos));
						}

						// [ ]|[ ! ]|[ ]: Moves to left/top and right/bottom but not outside of dimensions on both sides
						else {
							newPos = Math.min(this.totalSize - this.silosSize[Position.CENTER], Math.max(-1 /* 1px border accomodation */, this.silosSize[Position.LEFT] + diffPos));
						}
						break;
					}

					// [ ]|[ ]|[ ! ]: Moves to the right/bottom but not outside of dimension on the left/top side
					case Position.RIGHT: {
						newPos = Math.min(this.silosSize[Position.LEFT] + this.silosSize[Position.CENTER], Math.max(-1 /* 1px border accomodation */, this.silosSize[Position.LEFT] + this.silosSize[Position.CENTER] + diffPos));
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
					case Position.LEFT: {
						if (moveTo === Position.LEFT || moveTo === null) {
							this.posSilo(Position.CENTER, `${this.silosSize[Position.LEFT]}px`, 'auto');
							this.posSilo(Position.RIGHT, 'auto', 0);
						} else if (moveTo === Position.CENTER) {
							this.posSilo(Position.CENTER, 0, 'auto');
							this.silos[Position.CENTER].addClass('draggedunder');
							this.posSilo(Position.RIGHT, 'auto', 0);
						} else if (moveTo === Position.RIGHT) {
							this.posSilo(Position.CENTER, 0, 'auto');
							this.posSilo(Position.RIGHT, 'auto', `${this.silosSize[Position.LEFT]}px`);
							this.silos[Position.RIGHT].addClass('draggedunder');
						}
						break;
					}

					case Position.CENTER: {
						if (moveTo === Position.LEFT) {
							this.posSilo(Position.LEFT, `${this.silosSize[Position.CENTER]}px`, 'auto');
							this.silos[Position.LEFT].addClass('draggedunder');
						} else if (moveTo === Position.CENTER || moveTo === null) {
							this.posSilo(Position.LEFT, 0, 'auto');
							this.posSilo(Position.RIGHT, 'auto', 0);
						} else if (moveTo === Position.RIGHT) {
							this.posSilo(Position.RIGHT, 'auto', `${this.silosSize[Position.CENTER]}px`);
							this.silos[Position.RIGHT].addClass('draggedunder');
							this.posSilo(Position.LEFT, 0, 'auto');
						}
						break;
					}

					case Position.RIGHT: {
						if (moveTo === Position.LEFT) {
							this.posSilo(Position.LEFT, `${this.silosSize[Position.RIGHT]}px`, 'auto');
							this.silos[Position.LEFT].addClass('draggedunder');
						} else if (moveTo === Position.CENTER) {
							this.posSilo(Position.LEFT, 0, 'auto');
							this.posSilo(Position.CENTER, `${this.silosSize[Position.LEFT] + this.silosSize[Position.RIGHT]}px`, 'auto');
							this.silos[Position.CENTER].addClass('draggedunder');
						} else if (moveTo === Position.RIGHT || moveTo === null) {
							this.posSilo(Position.LEFT, 0, 'auto');
							this.posSilo(Position.CENTER, `${this.silosSize[Position.LEFT]}px`, 'auto');
						}
						break;
					}
				}

				// Move the editor to provide feedback to the user and add class
				if (newPos !== null) {
					this.silos[position].style(this.layoutVertically ? { left: `${newPos}px` } : { top: `${newPos}px` });
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

				this.posSilo(Position.LEFT, 0, 'auto');
				this.posSilo(Position.CENTER, 'auto', 'auto');
				this.posSilo(Position.RIGHT, 'auto', 0);

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

	private posSilo(pos: number, leftTop: string | number, rightBottom?: string | number): void {
		if (this.layoutVertically) {
			this.silos[pos].style({ left: leftTop, right: rightBottom });
		} else {
			this.silos[pos].style({ top: leftTop, bottom: rightBottom });
		}
	}

	private findMoveTarget(position: Position, diffPos: number): Position {
		const visibleEditorCount = this.getVisibleEditorCount();

		switch (position) {
			case Position.LEFT: {

				// [ ! ]|[] -> []|[ ! ]
				if (visibleEditorCount === 2 && (diffPos >= this.silosSize[Position.LEFT] / 2 || diffPos >= this.silosSize[Position.CENTER] / 2)) {
					return Position.CENTER;
				}

				// [ ! ]|[]|[] -> []|[]|[ ! ]
				if (visibleEditorCount === 3 && (diffPos >= this.silosSize[Position.LEFT] / 2 + this.silosSize[Position.CENTER] || diffPos >= this.silosSize[Position.RIGHT] / 2 + this.silosSize[Position.CENTER])) {
					return Position.RIGHT;
				}

				// [ ! ]|[]|[] -> []|[ ! ]|[]
				if (visibleEditorCount === 3 && (diffPos >= this.silosSize[Position.LEFT] / 2 || diffPos >= this.silosSize[Position.CENTER] / 2)) {
					return Position.CENTER;
				}
				break;
			}

			case Position.CENTER: {
				if (visibleEditorCount === 2 && diffPos > 0) {
					return null; // Return early since CENTER cannot be moved to the RIGHT unless there is a RIGHT position
				}

				// []|[ ! ] -> [ ! ]|[]
				if (visibleEditorCount === 2 && (Math.abs(diffPos) >= this.silosSize[Position.CENTER] / 2 || Math.abs(diffPos) >= this.silosSize[Position.LEFT] / 2)) {
					return Position.LEFT;
				}

				// []|[ ! ]|[] -> [ ! ]|[]|[]
				if (visibleEditorCount === 3 && ((diffPos < 0 && Math.abs(diffPos) >= this.silosSize[Position.CENTER] / 2) || (diffPos < 0 && Math.abs(diffPos) >= this.silosSize[Position.LEFT] / 2))) {
					return Position.LEFT;
				}

				// []|[ ! ]|[] -> []|[]|[ ! ]
				if (visibleEditorCount === 3 && ((diffPos > 0 && Math.abs(diffPos) >= this.silosSize[Position.CENTER] / 2) || (diffPos > 0 && Math.abs(diffPos) >= this.silosSize[Position.RIGHT] / 2))) {
					return Position.RIGHT;
				}
				break;
			}

			case Position.RIGHT: {
				if (diffPos > 0) {
					return null; // Return early since RIGHT cannot be moved more to the RIGHT
				}

				// []|[]|[ ! ] -> [ ! ]|[]|[]
				if (Math.abs(diffPos) >= this.silosSize[Position.RIGHT] / 2 + this.silosSize[Position.CENTER] || Math.abs(diffPos) >= this.silosSize[Position.LEFT] / 2 + this.silosSize[Position.CENTER]) {
					return Position.LEFT;
				}

				// []|[]|[ ! ] -> []|[ ! ]|[]
				if (Math.abs(diffPos) >= this.silosSize[Position.RIGHT] / 2 || Math.abs(diffPos) >= this.silosSize[Position.CENTER] / 2) {
					return Position.CENTER;
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
		this.startSiloOneSize = this.silosSize[Position.LEFT];
	}

	private onSashOneDrag(e: ISashEvent): void {
		let oldSiloOneSize = this.silosSize[Position.LEFT];
		let diffSize = this.layoutVertically ? (e.currentX - e.startX) : (e.currentY - e.startY);
		let newSiloOneSize = this.startSiloOneSize + diffSize;

		// Side-by-Side
		if (this.sashTwo.isHidden()) {

			// []|[      ] : left/top side can not get smaller than MIN_EDITOR_SIZE
			if (newSiloOneSize < SideBySideEditorControl.MIN_EDITOR_SIZE) {
				newSiloOneSize = SideBySideEditorControl.MIN_EDITOR_SIZE;
			}

			// [      ]|[] : right/bottom side can not get smaller than MIN_EDITOR_SIZE
			else if (this.totalSize - newSiloOneSize < SideBySideEditorControl.MIN_EDITOR_SIZE) {
				newSiloOneSize = this.totalSize - SideBySideEditorControl.MIN_EDITOR_SIZE;
			}

			// [ <-]|[      ] : left/top side can snap into minimized
			else if (newSiloOneSize - SideBySideEditorControl.SNAP_TO_MINIMIZED_THRESHOLD <= SideBySideEditorControl.MIN_EDITOR_SIZE) {
				newSiloOneSize = SideBySideEditorControl.MIN_EDITOR_SIZE;
			}

			// [      ]|[-> ] : right/bottom side can snap into minimized
			else if (this.totalSize - newSiloOneSize - SideBySideEditorControl.SNAP_TO_MINIMIZED_THRESHOLD <= SideBySideEditorControl.MIN_EDITOR_SIZE) {
				newSiloOneSize = this.totalSize - SideBySideEditorControl.MIN_EDITOR_SIZE;
			}

			this.silosSize[Position.LEFT] = newSiloOneSize;
			this.silosSize[Position.CENTER] = this.totalSize - newSiloOneSize;
		}

		// Side-by-Side-by-Side
		else {

			// [!]|[      ]|[  ] : left/top side can not get smaller than MIN_EDITOR_SIZE
			if (newSiloOneSize < SideBySideEditorControl.MIN_EDITOR_SIZE) {
				newSiloOneSize = SideBySideEditorControl.MIN_EDITOR_SIZE;
			}

			// [      ]|[!]|[  ] : center side can not get smaller than MIN_EDITOR_SIZE
			else if (this.totalSize - newSiloOneSize - this.silosSize[Position.RIGHT] < SideBySideEditorControl.MIN_EDITOR_SIZE) {

				// [      ]|[ ]|[!] : right/bottom side can not get smaller than MIN_EDITOR_SIZE
				if (this.totalSize - newSiloOneSize - this.silosSize[Position.CENTER] < SideBySideEditorControl.MIN_EDITOR_SIZE) {
					newSiloOneSize = this.totalSize - (2 * SideBySideEditorControl.MIN_EDITOR_SIZE);
					this.silosSize[Position.CENTER] = this.silosSize[Position.RIGHT] = SideBySideEditorControl.MIN_EDITOR_SIZE;
				}

				// [      ]|[ ]|[-> ] : right/bottom side can snap into minimized
				else if (this.totalSize - newSiloOneSize - this.silosSize[Position.CENTER] - SideBySideEditorControl.SNAP_TO_MINIMIZED_THRESHOLD <= SideBySideEditorControl.MIN_EDITOR_SIZE) {
					this.silosSize[Position.RIGHT] = SideBySideEditorControl.MIN_EDITOR_SIZE;
				}

				// [      ]|[ ]|[ ] : right/bottom side shrinks
				else {
					this.silosSize[Position.RIGHT] = this.silosSize[Position.RIGHT] - (newSiloOneSize - oldSiloOneSize);
				}

				this.sashTwo.layout();
			}

			// [ <-]|[      ]|[  ] : left/top side can snap into minimized
			else if (newSiloOneSize - SideBySideEditorControl.SNAP_TO_MINIMIZED_THRESHOLD <= SideBySideEditorControl.MIN_EDITOR_SIZE) {
				newSiloOneSize = SideBySideEditorControl.MIN_EDITOR_SIZE;
			}

			// [      ]|[-> ]|[  ] : center side can snap into minimized
			else if (this.totalSize - this.silosSize[Position.RIGHT] - newSiloOneSize - SideBySideEditorControl.SNAP_TO_MINIMIZED_THRESHOLD <= SideBySideEditorControl.MIN_EDITOR_SIZE) {
				newSiloOneSize = this.totalSize - this.silosSize[Position.RIGHT] - SideBySideEditorControl.MIN_EDITOR_SIZE;
			}

			this.silosSize[Position.LEFT] = newSiloOneSize;
			this.silosSize[Position.CENTER] = this.totalSize - this.silosSize[Position.LEFT] - this.silosSize[Position.RIGHT];
		}

		// Pass on to containers
		this.layoutContainers();
	}

	private onSashOneDragEnd(): void {
		this.sashOne.layout();
		this.sashTwo.layout(); // Moving left sash might have also moved right sash, so layout() both
		this.focusNextNonMinimized();
	}

	private onSashOneReset(): void {
		this.centerSash(Position.LEFT, Position.CENTER);
		this.sashOne.layout();
	}

	private onSashTwoDragStart(): void {
		this.startSiloThreeSize = this.silosSize[Position.RIGHT];
	}

	private onSashTwoDrag(e: ISashEvent): void {
		let oldSiloThreeSize = this.silosSize[Position.RIGHT];
		let diffSize = this.layoutVertically ? (-e.currentX + e.startX) : (-e.currentY + e.startY);
		let newSiloThreeSize = this.startSiloThreeSize + diffSize;

		// [  ]|[      ]|[!] : right/bottom side can not get smaller than MIN_EDITOR_SIZE
		if (newSiloThreeSize < SideBySideEditorControl.MIN_EDITOR_SIZE) {
			newSiloThreeSize = SideBySideEditorControl.MIN_EDITOR_SIZE;
		}

		// [      ]|[!]|[  ] : center side can not get smaller than MIN_EDITOR_SIZE
		else if (this.totalSize - newSiloThreeSize - this.silosSize[Position.LEFT] < SideBySideEditorControl.MIN_EDITOR_SIZE) {

			// [!]|[ ]|[    ] : left/top side can not get smaller than MIN_EDITOR_SIZE
			if (this.totalSize - newSiloThreeSize - this.silosSize[Position.CENTER] < SideBySideEditorControl.MIN_EDITOR_SIZE) {
				newSiloThreeSize = this.totalSize - (2 * SideBySideEditorControl.MIN_EDITOR_SIZE);
				this.silosSize[Position.LEFT] = this.silosSize[Position.CENTER] = SideBySideEditorControl.MIN_EDITOR_SIZE;
			}

			// [ <-]|[ ]|[    ] : left/top side can snap into minimized
			else if (this.totalSize - newSiloThreeSize - this.silosSize[Position.CENTER] - SideBySideEditorControl.SNAP_TO_MINIMIZED_THRESHOLD <= SideBySideEditorControl.MIN_EDITOR_SIZE) {
				this.silosSize[Position.LEFT] = SideBySideEditorControl.MIN_EDITOR_SIZE;
			}

			// [  ]|[ ]|[   ] : left/top side shrinks
			else {
				this.silosSize[Position.LEFT] = this.silosSize[Position.LEFT] - (newSiloThreeSize - oldSiloThreeSize);
			}

			this.sashOne.layout();
		}

		// [ ]|[      ]|[-> ] : right/bottom side can snap into minimized
		else if (newSiloThreeSize - SideBySideEditorControl.SNAP_TO_MINIMIZED_THRESHOLD <= SideBySideEditorControl.MIN_EDITOR_SIZE) {
			newSiloThreeSize = SideBySideEditorControl.MIN_EDITOR_SIZE;
		}

		// [ ]|[ <-]|[      ] : center side can snap into minimized
		else if (this.totalSize - this.silosSize[Position.LEFT] - newSiloThreeSize - SideBySideEditorControl.SNAP_TO_MINIMIZED_THRESHOLD <= SideBySideEditorControl.MIN_EDITOR_SIZE) {
			newSiloThreeSize = this.totalSize - this.silosSize[Position.LEFT] - SideBySideEditorControl.MIN_EDITOR_SIZE;
		}

		this.silosSize[Position.RIGHT] = newSiloThreeSize;
		this.silosSize[Position.CENTER] = this.totalSize - this.silosSize[Position.LEFT] - this.silosSize[Position.RIGHT];

		this.layoutContainers();
	}

	private onSashTwoDragEnd(): void {
		this.sashOne.layout(); // Moving right sash might have also moved left sash, so layout() both
		this.sashTwo.layout();

		this.focusNextNonMinimized();
	}

	private onSashTwoReset(): void {
		this.centerSash(Position.CENTER, Position.RIGHT);

		this.sashTwo.layout();
	}

	public getVerticalSashTop(sash: Sash): number {
		return 0;
	}

	public getVerticalSashLeft(sash: Sash): number {
		return sash === this.sashOne ? this.silosSize[Position.LEFT] : this.silosSize[Position.CENTER] + this.silosSize[Position.LEFT];
	}

	public getVerticalSashHeight(sash: Sash): number {
		return this.dimension.height;
	}

	public getHorizontalSashTop(sash: Sash): number {
		return sash === this.sashOne ? this.silosSize[Position.LEFT] : this.silosSize[Position.CENTER] + this.silosSize[Position.LEFT];
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
		const oldTotalSize = this.layoutVertically ? oldDimension.width : oldDimension.height;
		POSITIONS.forEach(position => {
			if (this.visibleEditors[position]) {

				// Keep minimized editors in tact by not letting them grow if we have size to give
				if (this.silosSize[position] !== SideBySideEditorControl.MIN_EDITOR_SIZE) {
					let siloSizeRatio: number;

					// We have some stored initial ratios when the editor was restored on startup
					// Use those ratios over anything else but only once.
					if (this.silosInitialRatio && types.isNumber(this.silosInitialRatio[position])) {
						siloSizeRatio = this.silosInitialRatio[position];
						delete this.silosInitialRatio[position]; // dont use again
					} else {
						siloSizeRatio = this.silosSize[position] / oldTotalSize;
					}

					this.silosSize[position] = Math.max(Math.round(this.totalSize * siloSizeRatio), SideBySideEditorControl.MIN_EDITOR_SIZE);
				}

				totalSize += this.silosSize[position];
			}
		});

		// Compensate for overflow either through rounding error or min editor size
		if (totalSize > 0) {
			let overflow = totalSize - this.totalSize;

			// We have size to give
			if (overflow < 0) {

				// Find the first position from left to right that is not minimized
				// to give size. This ensures that minimized editors are left like
				// that if the user chose this layout.
				let positionToGive: Position = null;
				POSITIONS.forEach(position => {
					if (this.visibleEditors[position] && positionToGive === null && this.silosSize[position] !== SideBySideEditorControl.MIN_EDITOR_SIZE) {
						positionToGive = position;
					}
				});

				if (positionToGive === null) {
					positionToGive = Position.LEFT; // maybe all are minimized, so give LEFT the extra size
				}

				this.silosSize[positionToGive] -= overflow;
			}

			// We have size to take
			else if (overflow > 0) {
				POSITIONS.forEach(position => {
					const maxCompensation = this.silosSize[position] - SideBySideEditorControl.MIN_EDITOR_SIZE;
					if (maxCompensation >= overflow) {
						this.silosSize[position] -= overflow;
						overflow = 0;
					} else if (maxCompensation > 0) {
						const compensation = overflow - maxCompensation;
						this.silosSize[position] -= compensation;
						overflow -= compensation;
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
			this.silos[Position.CENTER].position(0, null, null, this.silosSize[Position.LEFT]);
		} else {
			this.silos[Position.CENTER].position(this.silosSize[Position.LEFT], null, null, 0);
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
	}

	private layoutEditor(position: Position): void {
		const editorSize = this.silosSize[position];
		if (editorSize && this.visibleEditors[position]) {
			const editorWidth = this.layoutVertically ? editorSize : this.dimension.width;
			const editorHeight = (this.layoutVertically ? this.dimension.height : this.silosSize[position]) - SideBySideEditorControl.EDITOR_TITLE_HEIGHT;

			this.visibleEditors[position].layout(new Dimension(editorWidth, editorHeight));
		}
	}

	public getInstantiationService(position: Position): IInstantiationService {
		return this.getFromContainer(position, SideBySideEditorControl.INSTANTIATION_SERVICE_KEY);
	}

	public getProgressBar(position: Position): ProgressBar {
		return this.getFromContainer(position, SideBySideEditorControl.PROGRESS_BAR_CONTROL_KEY);
	}

	private getTitleAreaControl(position: Position): ITitleAreaControl {
		return this.getFromContainer(position, SideBySideEditorControl.TITLE_AREA_CONTROL_KEY);
	}

	private getFromContainer(position: Position, key: string): any {
		const silo = this.silos[position];

		return silo ? silo.child().getProperty(key) : void 0;
	}

	public updateTitle(identifier: IEditorIdentifier): void {
		this.onStacksChanged({ editor: identifier.editor, group: identifier.group });
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
