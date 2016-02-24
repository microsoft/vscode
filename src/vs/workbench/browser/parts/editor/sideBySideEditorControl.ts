/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./media/sidebyside';
import nls = require('vs/nls');
import {Registry} from 'vs/platform/platform';
import {Scope, IActionBarRegistry, Extensions} from 'vs/workbench/browser/actionBarRegistry';
import {IAction, Action} from 'vs/base/common/actions';
import arrays = require('vs/base/common/arrays');
import {EventEmitter} from 'vs/base/common/eventEmitter';
import {StandardMouseEvent} from 'vs/base/browser/mouseEvent';
import errors = require('vs/base/common/errors');
import {isWindows} from 'vs/base/common/platform';
import types = require('vs/base/common/types');
import {Dimension, Builder, $} from 'vs/base/browser/builder';
import {Sash, ISashEvent, IVerticalSashLayoutProvider} from 'vs/base/browser/ui/sash/sash';
import {ProgressBar} from 'vs/base/browser/ui/progressbar/progressbar';
import {BaseEditor} from 'vs/workbench/browser/parts/editor/baseEditor';
import {EditorInput, IInputStatus, TextEditorOptions} from 'vs/workbench/common/editor';
import {DiffEditorInput} from 'vs/workbench/common/editor/diffEditorInput';
import {EventType as BaseEventType} from 'vs/base/common/events';
import {EditorInputEvent, EventType as WorkbenchEventType} from 'vs/workbench/common/events';
import DOM = require('vs/base/browser/dom');
import {IActionItem, ActionsOrientation} from 'vs/base/browser/ui/actionbar/actionbar';
import {ToolBar} from 'vs/base/browser/ui/toolbar/toolbar';
import {IWorkbenchEditorService, EditorArrangement} from 'vs/workbench/services/editor/common/editorService';
import {IQuickOpenService} from 'vs/workbench/services/quickopen/common/quickOpenService';
import {IWorkspaceContextService} from 'vs/workbench/services/workspace/common/contextService';
import {IContextViewService, IContextMenuService} from 'vs/platform/contextview/browser/contextView';
import {Position, POSITIONS} from 'vs/platform/editor/common/editor';
import {IEventService} from 'vs/platform/event/common/event';
import {IMessageService, Severity} from 'vs/platform/message/common/message';
import {ITelemetryService} from 'vs/platform/telemetry/common/telemetry';

export enum Rochade {
	NONE,
	CENTER_TO_LEFT,
	RIGHT_TO_CENTER,
	CENTER_AND_RIGHT_TO_LEFT
}

export const EventType = {
	EDITOR_FOCUS_CHANGED: 'editorFocusChanged'
};

/**
 * Helper class to manage multiple side by side editors for the editor part.
 */
export class SideBySideEditorControl extends EventEmitter implements IVerticalSashLayoutProvider {
	private static MIN_EDITOR_WIDTH = 170;
	private static EDITOR_TITLE_HEIGHT = 35;
	private static SNAP_TO_MINIMIZED_THRESHOLD = 50;

	private parent: Builder;
	private dimension: Dimension;
	private dragging: boolean;

	private containers: Builder[];
	private containerWidth: number[];
	private containerInitialRatios: number[];

	private titleContainer: Builder[];
	private titleLabel: Builder[];
	private titleDescription: Builder[];
	private editorInputStateDescription: Builder[];
	private progressBar: ProgressBar[];
	private editorActionsToolbar: ToolBar[];
	private closeEditorAction: Action[];

	private splitEditorAction: Action;

	private leftSash: Sash;
	private startLeftContainerWidth: number;

	private rightSash: Sash;
	private startRightContainerWidth: number;

	private visibleEditors: BaseEditor[];
	private visibleEditorContainers: Builder[];

	private lastActiveEditor: BaseEditor;
	private lastActivePosition: Position;

	private visibleEditorFocusTrackers: DOM.IFocusTracker[];
	private editorInputStateChangeListener: () => void;

	constructor(
		parent: Builder,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IMessageService private messageService: IMessageService,
		@IQuickOpenService private quickOpenService: IQuickOpenService,
		@ITelemetryService private telemetryService: ITelemetryService,
		@IContextViewService private contextViewService: IContextViewService,
		@IContextMenuService private contextMenuService: IContextMenuService,
		@IEventService private eventService: IEventService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService
	) {
		super();

		this.parent = parent;
		this.dimension = new Dimension(0, 0);

		this.containers = [];
		this.containerWidth = [];

		this.titleContainer = [];
		this.titleLabel = [];
		this.titleDescription = [];
		this.editorInputStateDescription = [];
		this.editorActionsToolbar = [];
		this.progressBar = [];

		this.visibleEditors = [];
		this.visibleEditorContainers = [];
		this.visibleEditorFocusTrackers = [];

		this.closeEditorAction = POSITIONS.map((position) => {
			return this.makeCloseEditorAction(position);
		});

		this.splitEditorAction = this.makeSplitEditorAction();
		this.initStyles();

		this.registerListeners();

		// Create
		this.create(this.parent);
	}

	private registerListeners(): void {

		// Update editor input state indicators on state changes
		this.editorInputStateChangeListener = this.eventService.addListener(WorkbenchEventType.EDITOR_INPUT_STATE_CHANGED, (event: EditorInputEvent) => {
			this.updateEditorInputStateIndicator(event);
		});
	}

	private initStyles(): void {
		let grabCursor = isWindows ? 'cursor: url("' + require.toUrl('vs/workbench/browser/parts/editor/media/grab.cur') + '"), move;' : 'cursor: -webkit-grab;';
		let grabbingCursor = isWindows ? 'cursor: url("' + require.toUrl('vs/workbench/browser/parts/editor/media/grabbing.cur') + '"), move;' : 'cursor: -webkit-grabbing;';

		DOM.createCSSRule(
			'.monaco-workbench > .part.editor > .content.multiple-editors .one-editor-container .title, ' +
			'.monaco-workbench > .part.editor > .content.multiple-editors .one-editor-container .title .title-label a, ' +
			'.monaco-workbench > .part.editor > .content.multiple-editors .one-editor-container .title .title-label span', grabCursor
		);

		DOM.createCSSRule(
			'#monaco-workbench-editor-move-overlay, ' +
			'.monaco-workbench > .part.editor > .content.multiple-editors .one-editor-container.dragged, ' +
			'.monaco-workbench > .part.editor > .content.multiple-editors .one-editor-container.dragged .title, ' +
			'.monaco-workbench > .part.editor > .content.multiple-editors .one-editor-container.dragged .title .title-label a, ' +
			'.monaco-workbench > .part.editor > .content.multiple-editors .one-editor-container.dragged .title .title-label span, ' +
			'.monaco-workbench > .part.editor > .content.multiple-editors .one-editor-container.dragged .monaco-editor .view-lines', grabbingCursor
		);
	}

	private makeCloseEditorAction(position: Position): Action {
		return new Action('close.editor.action', nls.localize('close', "Close"), 'close-editor-action', true, () => {
			return this.editorService.closeEditor(position);
		});
	}

	private makeSplitEditorAction(): Action {
		return new Action('split.editor.action', nls.localize('splitEditor', "Split Editor"), 'split-editor-action', true, () => {
			let activeEditor = this.editorService.getActiveEditor();
			let editorCount = this.getVisibleEditorCount();

			// Special case: If the user wants to split the left hand editor with 2 editors open, push the center one to the right
			if (editorCount > 1 && activeEditor.position === Position.LEFT) {
				let centerInput = this.visibleEditors[Position.CENTER].input;

				let options = new TextEditorOptions();
				options.preserveFocus = true;

				return this.editorService.openEditor(activeEditor.input, options, Position.CENTER).then(() => {
					return this.editorService.openEditor(centerInput, options, Position.RIGHT).then(() => {
						return this.editorService.focusEditor(Position.CENTER);
					});
				});
			}

			// Otherwise just continue to open to the side
			return this.editorService.openEditor(activeEditor.input, null, true);
		});
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
		let c = 0;
		this.visibleEditors.forEach((editor) => {
			if (editor) {
				c++;
			}
		});

		return c;
	}

	private indexOf(editor: BaseEditor): number {
		return this.visibleEditors.indexOf(editor);
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
			this.doSetActive(editor, this.indexOf(editor));

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
			this.emit(EventType.EDITOR_FOCUS_CHANGED);
		}
	}

	private focusNextNonMinimized(): void {

		// If the current focussed editor is minimized, try to focus the next largest editor
		if (!types.isUndefinedOrNull(this.lastActivePosition) && this.containerWidth[this.lastActivePosition] === SideBySideEditorControl.MIN_EDITOR_WIDTH) {
			let candidate: Position = null;
			let currentWidth = SideBySideEditorControl.MIN_EDITOR_WIDTH;
			POSITIONS.forEach((position) => {

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
				this.editorService.focusEditor(this.visibleEditors[candidate]).done(null, errors.onUnexpectedError);
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
					this.clearTitle(Position.CENTER); // center closes so clear title
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
					this.clearTitle(Position.RIGHT); // right closes so clear title
				}

				// Move RIGHT to CENTER and CENTER to LEFT ([x]|[]|[] -> [ ]|[ ])
				else if (position === Position.LEFT) {
					this.rochade(Position.CENTER, Position.LEFT);
					this.rochade(Position.RIGHT, Position.CENTER);
					result = Rochade.CENTER_AND_RIGHT_TO_LEFT;
					this.clearTitle(Position.RIGHT); // right closes so clear title
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
		let oldActive = this.lastActivePosition;
		this.lastActivePosition = newActive;
		this.lastActiveEditor = editor;

		if (!types.isUndefinedOrNull(oldActive)) {
			this.containers[oldActive].addClass('inactive');
			this.containers[oldActive].removeClass('active');
		}

		if (!types.isUndefinedOrNull(newActive)) {
			this.containers[newActive].removeClass('inactive');
			this.containers[newActive].addClass('active');
		}
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
		this.visibleEditorContainers[to] = editorContainer;
		this.visibleEditors[to] = editor;
		this.visibleEditorFocusTrackers[to] = listeners;

		this.visibleEditorContainers[from] = null;
		this.visibleEditors[from] = null;
		this.visibleEditorFocusTrackers[from] = null;

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

	public arrangeEditors(arrangement: EditorArrangement): void {
		if (!this.dimension) {
			return; // too early
		}

		let availableWidth = this.dimension.width;
		let visibleEditors = this.getVisibleEditorCount();

		if (visibleEditors <= 1) {
			return; // need more editors
		}

		// Minimize Others
		if (arrangement === EditorArrangement.MINIMIZE_OTHERS) {
			POSITIONS.forEach((position) => {
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
		else if (arrangement === EditorArrangement.EVEN_WIDTH) {
			POSITIONS.forEach((position) => {
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

			POSITIONS.forEach((position) => {
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

		// Left Container
		this.containers[Position.LEFT] = $(parent).div({ class: 'one-editor-container editor-left' });

		// Left Sash
		this.leftSash = new Sash(parent.getHTMLElement(), this, { baseSize: 5 });
		this.leftSash.addListener('start', () => this.onLeftSashDragStart());
		this.leftSash.addListener('change', (e: ISashEvent) => this.onLeftSashDrag(e));
		this.leftSash.addListener('end', () => this.onLeftSashDragEnd());
		this.leftSash.hide();

		// Center Container
		this.containers[Position.CENTER] = $(parent).div({ class: 'one-editor-container editor-center' });

		// Right Sash
		this.rightSash = new Sash(parent.getHTMLElement(), this, { baseSize: 5 });
		this.rightSash.addListener('start', () => this.onRightSashDragStart());
		this.rightSash.addListener('change', (e: ISashEvent) => this.onRightSashDrag(e));
		this.rightSash.addListener('end', () => this.onRightSashDragEnd());
		this.rightSash.hide();

		// Right Container
		this.containers[Position.RIGHT] = $(parent).div({ class: 'one-editor-container editor-right' });

		// Title containers
		POSITIONS.forEach((position) => {
			this.titleContainer[position] = $(this.containers[position]).div({ 'class': 'title monaco-editor-background' });
			this.fillTitleArea($(this.titleContainer[position]), position);
		});

		// Progress Bars per position
		POSITIONS.forEach((position) => {
			this.progressBar[position] = new ProgressBar($(this.containers[position]));
			this.progressBar[position].getContainer().hide();
		});
	}

	private updateEditorInputStateIndicator(inputEvent: EditorInputEvent): void {
		POSITIONS.forEach((position) => {
			if (this.visibleEditors[position]) {
				if (this.isInputRelated(this.visibleEditors[position].input, inputEvent.editorInput)) {
					this.setEditorInputStateIndicator(inputEvent.editorInput, inputEvent.editorInput.getStatus(), position);
				}
			}
		});
	}

	private setEditorInputStateIndicator(input: EditorInput, status: IInputStatus, position: number): void {

		// Decoration
		let titleLabel = (input && input.getName()) || '';
		if (status && status.decoration) {
			titleLabel = nls.localize('inputDecoration', "{0} {1}", status.decoration, titleLabel);
		}

		this.titleLabel[position].safeInnerHtml(titleLabel);
	}

	private isInputRelated(sourceInput: EditorInput, targetInput: EditorInput): boolean {
		if (!sourceInput || !targetInput) {
			return false;
		}

		if (sourceInput === targetInput) {
			return true;
		}

		if (sourceInput instanceof DiffEditorInput) {
			let modifiedInput = (<DiffEditorInput>sourceInput).getModifiedInput();
			if (modifiedInput === targetInput) {
				return true;
			}
		}

		return false;
	}

	private fillTitleArea(parent: Builder, position: Position): void {
		let ignoreClick = false;
		let wasDragged = false;

		// Allow to reorder positions by dragging the title
		parent.on(DOM.EventType.MOUSE_DOWN, (e: MouseEvent) => {

			// Reset flag
			ignoreClick = false;
			wasDragged = false;

			// Return early if there is only one editor active or the user clicked into the toolbar
			if (this.getVisibleEditorCount() <= 1 || DOM.isAncestor(<any>e.target || e.srcElement, this.editorActionsToolbar[position].getContainer().getHTMLElement())) {
				return;
			}

			// Only allow for first mouse button click!
			if (e.button !== 0) {
				return;
			}

			DOM.EventHelper.stop(e);

			// Overlay the editor area with a div to be able to capture all mouse events (helps when iframes are used in any editor)
			let overlayDiv = $('div').style({
				position: 'absolute',
				top: SideBySideEditorControl.EDITOR_TITLE_HEIGHT + 'px',
				left: 0,
				width: '100%',
				height: '100%',
				zIndex: 3000000
			}).id('monaco-workbench-editor-move-overlay');
			overlayDiv.appendTo(this.parent);

			// Update flag
			this.dragging = true;

			let visibleEditorCount = this.getVisibleEditorCount();
			let mouseDownEvent = new StandardMouseEvent(e);
			let startX = mouseDownEvent.posx;
			let oldNewLeft: number = null;

			this.containers[position].style({
				zIndex: 2000000
			});

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
					this.containers[position].addClass('dragged');
					this.parent.addClass('dragged');
				}
			}).once(DOM.EventType.MOUSE_UP, (e: MouseEvent) => {
				DOM.EventHelper.stop(e, false);

				// Destroy overlay
				overlayDiv.destroy();

				// Update flag
				this.dragging = false;

				// Restore styles
				this.parent.removeClass('dragged');
				this.containers[position].removeClass('dragged');
				this.containers[position].style({ zIndex: 'auto' });
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
					this.editorService.moveEditor(position, moveTo);
				}

				// Otherwise layout to restore proper positioning
				else {
					this.layoutContainers();
				}

				// Ignore next click if the user dragged the title some distance
				if (wasDragged) {
					ignoreClick = true;
				}

				// Otherwise if not dragging, make editor active unless already active
				else if (position !== this.getActivePosition()) {
					this.editorService.focusEditor(this.visibleEditors[position]).done(null, errors.onUnexpectedError);
				}

				$window.off('mousemove');
			});
		});

		// Close editor on middle mouse click
		parent.on(DOM.EventType.MOUSE_UP, (e: MouseEvent) => {
			DOM.EventHelper.stop(e, false);

			// Close editor on middle mouse click
			if (e.button === 1 /* Middle Button */) {
				this.editorService.closeEditor(position).done(null, errors.onUnexpectedError);
			}

			// Focus editor unless click on toolbar
			else if (this.getVisibleEditorCount() === 1 && !DOM.isAncestor(<any>e.target || e.srcElement, this.editorActionsToolbar[position].getContainer().getHTMLElement())) {
				this.editorService.focusEditor(this.visibleEditors[position]).done(null, errors.onUnexpectedError);
			}
		});

		// Right Actions Container
		parent.div({
			'class': 'title-actions'
		}, (div) => {

			// Toolbar
			this.editorActionsToolbar[position] = new ToolBar(div.getHTMLElement(), this.contextMenuService, {
				actionItemProvider: (action: Action) => this.actionItemProvider(action, position),
				orientation: ActionsOrientation.HORIZONTAL,
				ariaLabel: nls.localize('araLabelEditorActions', "Editor actions")
			});

			// Action Run Handling
			this.editorActionsToolbar[position].actionRunner.addListener(BaseEventType.RUN, (e: any) => {

				// Check for Error
				if (e.error && !errors.isPromiseCanceledError(e.error)) {
					this.messageService.show(Severity.Error, e.error);
				}

				// Log in telemetry
				if (this.telemetryService) {
					this.telemetryService.publicLog('workbenchActionExecuted', { id: e.action.id, from: 'editorPart' });
				}
			});
		});

		// Left Title Label (click opens quick open unless we are configured to ignore click or we are not the active title)
		parent.div({
			'class': 'title-label'
		}, (div) => {
			let clickHandler = (e: MouseEvent) => {
				if (ignoreClick) {
					return;
				}

				DOM.EventHelper.stop(e, true);

				this.quickOpenService.show();
			};

			// Clickable label (focus editor and bring up quick open)
			this.titleLabel[position] = $(div).a().on(DOM.EventType.CLICK, clickHandler);

			// Subtle Description
			this.titleDescription[position] = $(div).span().on(DOM.EventType.CLICK, clickHandler);
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

	private actionItemProvider(action: Action, position: Position): IActionItem {
		let actionItem: IActionItem;

		// Check Active Editor
		let editor = this.visibleEditors[position];
		if (editor) {
			actionItem = editor.getActionItem(action);
		}

		// Check Registry
		if (!actionItem) {
			let actionBarRegistry = <IActionBarRegistry>Registry.as(Extensions.Actionbar);
			actionItem = actionBarRegistry.getActionItemForContext(Scope.EDITOR, { input: editor && editor.input, editor: editor, position: position }, action);
		}

		return actionItem;
	}

	public setTitle(position: Position, input: EditorInput, primaryActions: IAction[], secondaryActions: IAction[], isActive: boolean): void {

		// Activity class
		if (isActive) {
			this.containers[position].removeClass('inactive');
			this.containers[position].addClass('active');
		} else {
			this.containers[position].addClass('inactive');
			this.containers[position].removeClass('active');
		}

		// Editor Title (Label + Description)
		let name = input.getName() || '';
		let description = isActive ? (input.getDescription() || '') : '';
		let verboseDescription = isActive ? (input.getDescription(true) || '') : '';
		if (description === verboseDescription) {
			verboseDescription = ''; // dont repeat what is already shown
		}

		this.titleLabel[position].safeInnerHtml(name);
		this.titleLabel[position].title(verboseDescription);

		this.titleDescription[position].safeInnerHtml(description);
		this.titleDescription[position].title(verboseDescription);

		// Editor Input State Description
		if (input) {
			this.setEditorInputStateIndicator(input, input.getStatus(), position);
		} else {
			this.setEditorInputStateIndicator(null, null, null);
		}

		// Support split editor action if visible editor count is < 3 and editor supports it
		if (isActive && this.getVisibleEditorCount() < 3 && this.lastActiveEditor.supportsSplitEditor()) {
			primaryActions.unshift(this.splitEditorAction);
		}

		// Set Primary/Secondary Actions
		this.editorActionsToolbar[position].setActions(primaryActions, secondaryActions)();

		// Add a close action
		if (input) {
			this.editorActionsToolbar[position].addPrimaryAction(this.closeEditorAction[position])();
		}
	}

	public setLoading(position: Position, input: EditorInput): void {

		// Editor Title and Description
		this.titleLabel[position].safeInnerHtml(input.getName() || '');
		this.titleDescription[position].safeInnerHtml(nls.localize('loadingLabel', "Loading..."));

		// Clear Primary/Secondary Actions
		this.editorActionsToolbar[position].setActions([], [])();

		// Add a close action
		if (input) {
			this.editorActionsToolbar[position].addPrimaryAction(this.closeEditorAction[position])();
		}
	}

	public clearTitle(position: Position): void {

		// Editor Title
		this.titleLabel[position].safeInnerHtml('');
		this.titleDescription[position].safeInnerHtml('');

		// Toolbar
		this.editorActionsToolbar[position].setActions([], [])();
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
		POSITIONS.forEach((position) => {
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
				POSITIONS.forEach((position) => {
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
		POSITIONS.forEach((position) => {
			this.containers[position].size(this.containerWidth[position], this.dimension.height);
		});

		// Position center depending on visibility of right hand editor
		if (this.visibleEditors[Position.RIGHT]) {
			this.containers[Position.CENTER].position(null, this.containerWidth[Position.RIGHT]);
		} else {
			this.containers[Position.CENTER].position(null, this.dimension.width - this.containerWidth[Position.LEFT] - this.containerWidth[Position.CENTER]);
		}

		// Visibility
		POSITIONS.forEach((position) => {
			if (this.visibleEditors[position] && this.containers[position].isHidden()) {
				this.containers[position].show();
			} else if (!this.visibleEditors[position] && !this.containers[position].isHidden()) {
				this.containers[position].hide();
			}
		});

		// Layout active editors
		POSITIONS.forEach((position) => {
			this.layoutEditor(position);
		});
	}

	private layoutEditor(position: Position): void {
		let editorWidth = this.containerWidth[position];
		if (editorWidth && this.visibleEditors[position]) {
			this.visibleEditors[position].layout(new Dimension(editorWidth, this.dimension.height - SideBySideEditorControl.EDITOR_TITLE_HEIGHT));
		}
	}

	public getProgressBar(position: Position): ProgressBar {
		return this.progressBar[position];
	}

	public dispose(): void {

		// Positions
		POSITIONS.forEach((position) => {
			this.clearPosition(position);
		});

		// Toolbars
		this.editorActionsToolbar.forEach((toolbar) => {
			toolbar.dispose();
		});

		// Progress bars
		this.progressBar.forEach((bar) => {
			bar.dispose();
		});

		// Actions
		this.closeEditorAction.forEach((action) => {
			action.dispose();
		});

		// Sash
		this.leftSash.dispose();
		this.rightSash.dispose();

		// Destroy Container
		this.containers.forEach((container) => {
			container.destroy();
		});

		if (this.editorInputStateChangeListener) {
			this.editorInputStateChangeListener();
		}

		this.lastActiveEditor = null;
		this.lastActivePosition = null;
		this.visibleEditors = null;
		this.visibleEditorContainers = null;

		super.dispose();
	}
}