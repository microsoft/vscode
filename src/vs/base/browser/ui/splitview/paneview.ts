/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./paneview';
import { IDisposable, Disposable, DisposableStore, toDisposable } from 'vs/base/common/lifecycle';
import { Event, Emitter } from 'vs/base/common/event';
import { domEvent } from 'vs/base/browser/event';
import { StandardKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { KeyCode } from 'vs/base/common/keyCodes';
import { $, append, addClass, removeClass, toggleClass, trackFocus, EventHelper, addDisposableListener, EventType } from 'vs/base/browser/dom';
import { firstIndex } from 'vs/base/common/arrays';
import { Color, RGBA } from 'vs/base/common/color';
import { SplitView, IView } from './splitview';
import { isFirefox } from 'vs/base/browser/browser';
import { DataTransfers } from 'vs/base/browser/dnd';
import { Orientation } from 'vs/base/browser/ui/sash/sash';
import { localize } from 'vs/nls';
import { ViewPane } from 'vs/workbench/browser/parts/views/viewPaneContainer';
import { RunOnceScheduler } from 'vs/base/common/async';
import { DragAndDropObserver, CompositeDragAndDropObserver } from 'vs/workbench/browser/dnd';
import { GroupDirection } from 'vs/workbench/services/editor/common/editorGroupsService';

export interface IPaneOptions {
	minimumBodySize?: number;
	maximumBodySize?: number;
	expanded?: boolean;
	orientation?: Orientation;
	title: string;
}

export interface IPaneStyles {
	dropBackground?: Color;
	headerForeground?: Color;
	headerBackground?: Color;
	headerBorder?: Color;
}

class PaneDropOverlay extends Disposable {

	private static readonly OVERLAY_ID = 'monaco-workbench-pane-drop-overlay';

	private container!: HTMLElement;
	private overlay!: HTMLElement;

	// private currentDropOperation: IDropOperation | undefined;
	private _disposed: boolean | undefined;

	private cleanupOverlayScheduler: RunOnceScheduler;

	// private readonly editorTransfer = LocalSelectionTransfer.getInstance<DraggedEditorIdentifier>();
	// private readonly groupTransfer = LocalSelectionTransfer.getInstance<DraggedEditorGroupIdentifier>();

	constructor(private paneElement: HTMLElement) {

		super();
		this.cleanupOverlayScheduler = this._register(new RunOnceScheduler(() => this.dispose(), 300));

		this.create();
	}

	get disposed(): boolean {
		return !!this._disposed;
	}

	private create(): void {
		const overlayOffsetHeight = this.getOverlayOffsetHeight();

		// Container
		this.container = document.createElement('div');
		this.container.id = PaneDropOverlay.OVERLAY_ID;
		this.container.style.top = `${overlayOffsetHeight}px`;

		// Parent
		this.paneElement.appendChild(this.container);
		addClass(this.paneElement, 'dragged-over');
		this._register(toDisposable(() => {
			this.paneElement.removeChild(this.container);
			removeClass(this.paneElement, 'dragged-over');
		}));

		// Overlay
		this.overlay = document.createElement('div');
		addClass(this.overlay, 'pane-overlay-indicator');
		this.container.appendChild(this.overlay);

		// Overlay Event Handling
		this.registerListeners();

		// Styles
		this.updateStyles();
	}

	protected updateStyles(): void {

		// Overlay drop background
		this.overlay.style.backgroundColor = /* this.getColor(EDITOR_DRAG_AND_DROP_BACKGROUND) */ 'grey';

		// Overlay contrast border (if any)
		const activeContrastBorderColor = /* this.getColor(activeContrastBorder) */ 'grey';
		this.overlay.style.outlineColor = activeContrastBorderColor || '';
		this.overlay.style.outlineOffset = activeContrastBorderColor ? '-2px' : '';
		this.overlay.style.outlineStyle = activeContrastBorderColor ? 'dashed' : '';
		this.overlay.style.outlineWidth = activeContrastBorderColor ? '2px' : '';
	}

	private registerListeners(): void {
		this._register(new DragAndDropObserver(this.container, {
			onDragEnter: e => undefined,
			onDragOver: e => {

				// Position overlay
				this.positionOverlay(e.offsetX, e.offsetY);

				// Make sure to stop any running cleanup scheduler to remove the overlay
				if (this.cleanupOverlayScheduler.isScheduled()) {
					this.cleanupOverlayScheduler.cancel();
				}
			},

			onDragLeave: e => this.dispose(),
			onDragEnd: e => this.dispose(),

			onDrop: e => {
				EventHelper.stop(e, true);

				// Dispose overlay
				this.dispose();

				// // Handle drop if we have a valid operation
				// if (this.currentDropOperation) {
				// 	this.handleDrop(e, this.currentDropOperation.splitDirection);
				// }
			}
		}));

		this._register(addDisposableListener(this.container, EventType.MOUSE_OVER, () => {
			// Under some circumstances we have seen reports where the drop overlay is not being
			// cleaned up and as such the editor area remains under the overlay so that you cannot
			// type into the editor anymore. This seems related to using VMs and DND via host and
			// guest OS, though some users also saw it without VMs.
			// To protect against this issue we always destroy the overlay as soon as we detect a
			// mouse event over it. The delay is used to guarantee we are not interfering with the
			// actual DROP event that can also trigger a mouse over event.
			if (!this.cleanupOverlayScheduler.isScheduled()) {
				this.cleanupOverlayScheduler.schedule();
			}
		}));
	}

	private handleDrop(event: DragEvent, splitDirection?: GroupDirection): void {

		// // Determine target group
		// const ensureTargetGroup = () => {
		// 	let targetGroup: IEditorGroupView;
		// 	if (typeof splitDirection === 'number') {
		// 		targetGroup = this.accessor.addGroup(this.groupView, splitDirection);
		// 	} else {
		// 		targetGroup = this.groupView;
		// 	}

		// 	return targetGroup;
		// };

		// // Check for group transfer
		// if (this.groupTransfer.hasData(DraggedEditorGroupIdentifier.prototype)) {
		// 	const data = this.groupTransfer.getData(DraggedEditorGroupIdentifier.prototype);
		// 	if (Array.isArray(data)) {
		// 		const draggedEditorGroup = data[0].identifier;

		// 		// Return if the drop is a no-op
		// 		const sourceGroup = this.accessor.getGroup(draggedEditorGroup);
		// 		if (sourceGroup) {
		// 			if (typeof splitDirection !== 'number' && sourceGroup === this.groupView) {
		// 				return;
		// 			}

		// 			// Split to new group
		// 			let targetGroup: IEditorGroupView | undefined;
		// 			if (typeof splitDirection === 'number') {
		// 				if (this.isCopyOperation(event)) {
		// 					targetGroup = this.accessor.copyGroup(sourceGroup, this.groupView, splitDirection);
		// 				} else {
		// 					targetGroup = this.accessor.moveGroup(sourceGroup, this.groupView, splitDirection);
		// 				}
		// 			}

		// 			// Merge into existing group
		// 			else {
		// 				if (this.isCopyOperation(event)) {
		// 					targetGroup = this.accessor.mergeGroup(sourceGroup, this.groupView, { mode: MergeGroupMode.COPY_EDITORS });
		// 				} else {
		// 					targetGroup = this.accessor.mergeGroup(sourceGroup, this.groupView);
		// 				}
		// 			}

		// 			if (targetGroup) {
		// 				this.accessor.activateGroup(targetGroup);
		// 			}
		// 		}

		// 		this.groupTransfer.clearData(DraggedEditorGroupIdentifier.prototype);
		// 	}
		// }

		// // Check for editor transfer
		// else if (this.editorTransfer.hasData(DraggedEditorIdentifier.prototype)) {
		// 	const data = this.editorTransfer.getData(DraggedEditorIdentifier.prototype);
		// 	if (Array.isArray(data)) {
		// 		const draggedEditor = data[0].identifier;
		// 		const targetGroup = ensureTargetGroup();

		// 		// Return if the drop is a no-op
		// 		const sourceGroup = this.accessor.getGroup(draggedEditor.groupId);
		// 		if (sourceGroup) {
		// 			if (sourceGroup === targetGroup) {
		// 				return;
		// 			}

		// 			// Open in target group
		// 			const options = getActiveTextEditorOptions(sourceGroup, draggedEditor.editor, EditorOptions.create({ pinned: true }));
		// 			targetGroup.openEditor(draggedEditor.editor, options);

		// 			// Ensure target has focus
		// 			targetGroup.focus();

		// 			// Close in source group unless we copy
		// 			const copyEditor = this.isCopyOperation(event, draggedEditor);
		// 			if (!copyEditor) {
		// 				sourceGroup.closeEditor(draggedEditor.editor);
		// 			}
		// 		}

		// 		this.editorTransfer.clearData(DraggedEditorIdentifier.prototype);
		// 	}
		// }

		// // Web: check for file transfer
		// else if (isWeb && containsDragType(event, DataTransfers.FILES)) {
		// 	let targetGroup: IEditorGroupView | undefined = undefined;

		// 	const files = event.dataTransfer?.files;
		// 	if (files) {
		// 		for (let i = 0; i < files.length; i++) {
		// 			const file = files.item(i);
		// 			if (file) {
		// 				const reader = new FileReader();
		// 				reader.readAsArrayBuffer(file);
		// 				reader.onload = async event => {
		// 					const name = file.name;
		// 					if (typeof name === 'string' && event.target?.result instanceof ArrayBuffer) {

		// 						// Try to come up with a good file path for the untitled
		// 						// editor by asking the file dialog service for the default
		// 						let proposedFilePath: URI | undefined = undefined;
		// 						const defaultFilePath = this.fileDialogService.defaultFilePath();
		// 						if (defaultFilePath) {
		// 							proposedFilePath = joinPath(defaultFilePath, name);
		// 						}

		// 						// Open as untitled file with the provided contents
		// 						const untitledEditor = this.editorService.createEditorInput({
		// 							resource: proposedFilePath,
		// 							forceUntitled: true,
		// 							contents: VSBuffer.wrap(new Uint8Array(event.target.result)).toString()
		// 						});

		// 						if (!targetGroup) {
		// 							targetGroup = ensureTargetGroup();
		// 						}

		// 						await targetGroup.openEditor(untitledEditor);
		// 					}
		// 				};
		// 			}
		// 		}
		// 	}
		// }

		// // Check for URI transfer
		// else {
		// 	const dropHandler = this.instantiationService.createInstance(ResourcesDropHandler, { allowWorkspaceOpen: true /* open workspace instead of file if dropped */ });
		// 	dropHandler.handleDrop(event, () => ensureTargetGroup(), targetGroup => {
		// 		if (targetGroup) {
		// 			targetGroup.focus();
		// 		}
		// 	});
		// }
	}

	private positionOverlay(mousePosX: number, mousePosY: number): void {
		// const preferSplitVertically = this.accessor.partOptions.openSideBySideDirection === 'right';

		const paneWidth = this.paneElement.clientWidth;
		const paneHeight = this.paneElement.clientHeight - this.getOverlayOffsetHeight();

		// let paneWidthThresholdFactor = 0.3;
		// let edgeHeightThresholdFactor = 0.3;

		// const edgeWidthThreshold = paneWidth * paneWidthThresholdFactor;
		// const edgeHeightThreshold = paneHeight * edgeHeightThresholdFactor;

		// const splitWidthThreshold = paneWidth / 3;		// offer to split left/right at 33%
		const splitHeightThreshold = paneHeight / 2;	// offer to split up/down at 33%

		// Enable to debug the drop threshold square
		// let child = this.overlay.children.item(0) as HTMLElement || this.overlay.appendChild(document.createElement('div'));
		// child.style.backgroundColor = 'red';
		// child.style.position = 'absolute';
		// child.style.width = (groupViewWidth - (2 * edgeWidthThreshold)) + 'px';
		// child.style.height = (groupViewHeight - (2 * edgeHeightThreshold)) + 'px';
		// child.style.left = edgeWidthThreshold + 'px';
		// child.style.top = edgeHeightThreshold + 'px';

		// No split if mouse is above certain threshold in the center of the view
		let splitDirection: GroupDirection | undefined;

		if (mousePosY < splitHeightThreshold) {
			splitDirection = GroupDirection.UP;
		} else if (mousePosY > splitHeightThreshold) {
			splitDirection = GroupDirection.DOWN;
		}

		// Draw overlay based on split direction
		switch (splitDirection) {
			case GroupDirection.UP:
				this.doPositionOverlay({ top: '0', left: '0', width: '100%', height: '50%' });
				break;
			case GroupDirection.DOWN:
				this.doPositionOverlay({ top: '50%', left: '0', width: '100%', height: '50%' });
				break;
			case GroupDirection.LEFT:
				this.doPositionOverlay({ top: '0', left: '0', width: '50%', height: '100%' });
				break;
			case GroupDirection.RIGHT:
				this.doPositionOverlay({ top: '0', left: '50%', width: '50%', height: '100%' });
				break;
			default:
				this.doPositionOverlay({ top: '0', left: '0', width: '100%', height: '100%' });
		}

		// Make sure the overlay is visible now
		this.overlay.style.opacity = '1';

		// Enable transition after a timeout to prevent initial animation
		setTimeout(() => addClass(this.overlay, 'overlay-move-transition'), 0);

		// Remember as current split direction
		// this.currentDropOperation = { splitDirection };
	}

	private doPositionOverlay(options: { top: string, left: string, width: string, height: string }): void {

		// Container
		const offsetHeight = this.getOverlayOffsetHeight();
		if (offsetHeight) {
			this.container.style.height = `calc(100% - ${offsetHeight}px)`;
		} else {
			this.container.style.height = '100%';
		}

		// Overlay
		this.overlay.style.top = options.top;
		this.overlay.style.left = options.left;
		this.overlay.style.width = options.width;
		this.overlay.style.height = options.height;
	}

	private getOverlayOffsetHeight(): number {
		// if (!this.groupView.isEmpty && this.accessor.partOptions.showTabs) {
		// 	return EDITOR_TITLE_HEIGHT; // show overlay below title if group shows tabs
		// }

		return 0;
	}

	// private hideOverlay(): void {

	// 	// Reset overlay
	// 	this.doPositionOverlay({ top: '0', left: '0', width: '100%', height: '100%' });
	// 	this.overlay.style.opacity = '0';
	// 	removeClass(this.overlay, 'overlay-move-transition');

	// 	// Reset current operation
	// 	this.currentDropOperation = undefined;
	// }

	contains(element: HTMLElement): boolean {
		return element === this.container || element === this.overlay;
	}

	dispose(): void {
		super.dispose();

		this._disposed = true;
	}
}

/**
 * A Pane is a structured SplitView view.
 *
 * WARNING: You must call `render()` after you contruct it.
 * It can't be done automatically at the end of the ctor
 * because of the order of property initialization in TypeScript.
 * Subclasses wouldn't be able to set own properties
 * before the `render()` call, thus forbiding their use.
 */
export abstract class Pane extends Disposable implements IView {

	private static readonly HEADER_SIZE = 22;

	readonly element: HTMLElement;
	private header!: HTMLElement;
	private body!: HTMLElement;

	protected _expanded: boolean;
	protected _orientation: Orientation;
	protected _preventCollapse?: boolean;

	private expandedSize: number | undefined = undefined;
	private _headerVisible = true;
	private _minimumBodySize: number;
	private _maximumBodySize: number;
	private ariaHeaderLabel: string;
	private styles: IPaneStyles = {};
	private animationTimer: number | undefined = undefined;

	private readonly _onDidChange = this._register(new Emitter<number | undefined>());
	readonly onDidChange: Event<number | undefined> = this._onDidChange.event;

	private readonly _onDidChangeExpansionState = this._register(new Emitter<boolean>());
	readonly onDidChangeExpansionState: Event<boolean> = this._onDidChangeExpansionState.event;

	get draggableElement(): HTMLElement {
		return this.header;
	}

	get dropTargetElement(): HTMLElement {
		return this.element;
	}

	private _dropBackground: Color | undefined;
	get dropBackground(): Color | undefined {
		return this._dropBackground;
	}

	get minimumBodySize(): number {
		return this._minimumBodySize;
	}

	set minimumBodySize(size: number) {
		this._minimumBodySize = size;
		this._onDidChange.fire(undefined);
	}

	get maximumBodySize(): number {
		return this._maximumBodySize;
	}

	set maximumBodySize(size: number) {
		this._maximumBodySize = size;
		this._onDidChange.fire(undefined);
	}

	private get headerSize(): number {
		return this.headerVisible ? Pane.HEADER_SIZE : 0;
	}

	get minimumSize(): number {
		const headerSize = this.headerSize;
		const expanded = !this.headerVisible || this.isExpanded();
		const minimumBodySize = expanded ? this._minimumBodySize : 0;

		return headerSize + minimumBodySize;
	}

	get maximumSize(): number {
		const headerSize = this.headerSize;
		const expanded = !this.headerVisible || this.isExpanded();
		const maximumBodySize = expanded ? this._maximumBodySize : 0;

		return headerSize + maximumBodySize;
	}

	orthogonalSize: number = 0;

	constructor(options: IPaneOptions) {
		super();
		this._expanded = typeof options.expanded === 'undefined' ? true : !!options.expanded;
		this._orientation = typeof options.orientation === 'undefined' ? Orientation.VERTICAL : options.orientation;
		this.ariaHeaderLabel = localize('viewSection', "{0} Section", options.title);
		this._minimumBodySize = typeof options.minimumBodySize === 'number' ? options.minimumBodySize : 120;
		this._maximumBodySize = typeof options.maximumBodySize === 'number' ? options.maximumBodySize : Number.POSITIVE_INFINITY;

		this.element = $('.pane');
	}

	isExpanded(): boolean {
		return this._expanded;
	}

	setExpanded(expanded: boolean): boolean {
		if (this._expanded === !!expanded) {
			return false;
		}

		this._expanded = !!expanded;
		this.updateHeader();

		if (expanded) {
			if (typeof this.animationTimer === 'number') {
				clearTimeout(this.animationTimer);
			}
			append(this.element, this.body);
		} else {
			this.animationTimer = window.setTimeout(() => {
				this.body.remove();
			}, 200);
		}

		this._onDidChangeExpansionState.fire(expanded);
		this._onDidChange.fire(expanded ? this.expandedSize : undefined);
		return true;
	}

	get headerVisible(): boolean {
		return this._headerVisible;
	}

	set headerVisible(visible: boolean) {
		if (this._headerVisible === !!visible) {
			return;
		}

		this._headerVisible = !!visible;
		this.updateHeader();
		this._onDidChange.fire(undefined);
	}

	render(): void {
		this.header = $('.pane-header');
		append(this.element, this.header);
		this.header.setAttribute('tabindex', '0');
		this.header.setAttribute('role', 'toolbar');
		this.header.setAttribute('aria-label', this.ariaHeaderLabel);
		this.renderHeader(this.header);

		const focusTracker = trackFocus(this.header);
		this._register(focusTracker);
		this._register(focusTracker.onDidFocus(() => addClass(this.header, 'focused'), null));
		this._register(focusTracker.onDidBlur(() => removeClass(this.header, 'focused'), null));

		this.updateHeader();


		if (!this._preventCollapse) {
			const onHeaderKeyDown = Event.chain(domEvent(this.header, 'keydown'))
				.map(e => new StandardKeyboardEvent(e));

			this._register(onHeaderKeyDown.filter(e => e.keyCode === KeyCode.Enter || e.keyCode === KeyCode.Space)
				.event(() => this.setExpanded(!this.isExpanded()), null));

			this._register(onHeaderKeyDown.filter(e => e.keyCode === KeyCode.LeftArrow)
				.event(() => this.setExpanded(false), null));

			this._register(onHeaderKeyDown.filter(e => e.keyCode === KeyCode.RightArrow)
				.event(() => this.setExpanded(true), null));

			this._register(domEvent(this.header, 'click')
				(() => this.setExpanded(!this.isExpanded()), null));
		}

		this.body = append(this.element, $('.pane-body'));
		this.renderBody(this.body);

		if (!this.isExpanded()) {
			this.body.remove();
		}
	}

	layout(size: number): void {
		const headerSize = this.headerVisible ? Pane.HEADER_SIZE : 0;

		const width = this._orientation === Orientation.VERTICAL ? this.orthogonalSize : size;
		const height = this._orientation === Orientation.VERTICAL ? size - headerSize : this.orthogonalSize - headerSize;

		if (this.isExpanded()) {
			this.layoutBody(height, width);
			this.expandedSize = size;
		}
	}

	style(styles: IPaneStyles): void {
		this.styles = styles;

		if (!this.header) {
			return;
		}

		this.updateHeader();
	}

	protected updateHeader(): void {
		const expanded = !this.headerVisible || this.isExpanded();

		this.header.style.height = `${this.headerSize}px`;
		this.header.style.lineHeight = `${this.headerSize}px`;
		toggleClass(this.header, 'hidden', !this.headerVisible);
		toggleClass(this.header, 'expanded', expanded);
		this.header.setAttribute('aria-expanded', String(expanded));

		this.header.style.color = this.styles.headerForeground ? this.styles.headerForeground.toString() : '';
		this.header.style.backgroundColor = this.styles.headerBackground ? this.styles.headerBackground.toString() : '';
		this.header.style.borderTop = this.styles.headerBorder ? `1px solid ${this.styles.headerBorder}` : '';
		this._dropBackground = this.styles.dropBackground;
	}

	protected abstract renderHeader(container: HTMLElement): void;
	protected abstract renderBody(container: HTMLElement): void;
	protected abstract layoutBody(height: number, width: number): void;
}

interface IDndContext {
	draggable: PaneDraggable | null;
}

class PaneDraggable extends Disposable {

	private static readonly DefaultDragOverBackgroundColor = new Color(new RGBA(128, 128, 128, 0.5));

	private dragOverCounter = 0; // see https://github.com/Microsoft/vscode/issues/14470

	private _onDidDrop = this._register(new Emitter<{ from: Pane, to: Pane }>());
	readonly onDidDrop = this._onDidDrop.event;

	private overlay: PaneDropOverlay | undefined;

	constructor(private pane: Pane, private dnd: IPaneDndController, private context: IDndContext) {
		super();

		if (pane instanceof ViewPane) {
			this._register(CompositeDragAndDropObserver.INSTANCE.registerDraggable(pane.draggableElement, 'view', pane.id, {}));

			this._register(CompositeDragAndDropObserver.INSTANCE.registerTarget(pane.dropTargetElement, {
				onDragEnter: (e) => {
					if (!this.overlay) {
						this.overlay = new PaneDropOverlay(pane.dropTargetElement);
					}
				},
				onDragLeave: (e) => {
					this.overlay?.dispose();
					this.overlay = undefined;
				}
			}));
		}

		pane.draggableElement.draggable = true;
		// this._register(domEvent(pane.draggableElement, 'dragstart')(this.onDragStart, this));
		// this._register(domEvent(pane.dropTargetElement, 'dragenter')(this.onDragEnter, this));
		// this._register(domEvent(pane.dropTargetElement, 'dragleave')(this.onDragLeave, this));
		// this._register(domEvent(pane.dropTargetElement, 'dragend')(this.onDragEnd, this));
		// this._register(domEvent(pane.dropTargetElement, 'drop')(this.onDrop, this));
	}

	private onDragStart(e: DragEvent): void {
		if (!this.dnd.canDrag(this.pane) || !e.dataTransfer) {
			e.preventDefault();
			e.stopPropagation();
			return;
		}

		e.dataTransfer.effectAllowed = 'move';

		if (isFirefox) {
			// Firefox: requires to set a text data transfer to get going
			e.dataTransfer?.setData(DataTransfers.TEXT, this.pane.draggableElement.textContent || '');
		}

		const dragImage = append(document.body, $('.monaco-drag-image', {}, this.pane.draggableElement.textContent || ''));
		e.dataTransfer.setDragImage(dragImage, -10, -10);
		setTimeout(() => document.body.removeChild(dragImage), 0);

		this.context.draggable = this;
	}

	private onDragEnter(e: DragEvent): void {
		if (!this.context.draggable || this.context.draggable === this) {
			return;
		}

		if (!this.dnd.canDrop(this.context.draggable.pane, this.pane)) {
			return;
		}

		this.dragOverCounter++;
		this.render();
	}

	private onDragLeave(e: DragEvent): void {
		if (!this.context.draggable || this.context.draggable === this) {
			return;
		}

		if (!this.dnd.canDrop(this.context.draggable.pane, this.pane)) {
			return;
		}

		this.dragOverCounter--;

		if (this.dragOverCounter === 0) {
			this.render();
		}
	}

	private onDragEnd(e: DragEvent): void {
		if (!this.context.draggable) {
			return;
		}

		this.dragOverCounter = 0;
		this.render();
		this.context.draggable = null;
	}

	private onDrop(e: DragEvent): void {
		if (!this.context.draggable) {
			return;
		}

		EventHelper.stop(e);

		this.dragOverCounter = 0;
		this.render();

		if (this.dnd.canDrop(this.context.draggable.pane, this.pane) && this.context.draggable !== this) {
			this._onDidDrop.fire({ from: this.context.draggable.pane, to: this.pane });
		}

		this.context.draggable = null;
	}

	private render(): void {
		let backgroundColor: string | null = null;

		if (this.dragOverCounter > 0) {
			backgroundColor = (this.pane.dropBackground || PaneDraggable.DefaultDragOverBackgroundColor).toString();
		}

		this.pane.dropTargetElement.style.backgroundColor = backgroundColor || '';
	}
}

export interface IPaneDndController {
	canDrag(pane: Pane): boolean;
	canDrop(pane: Pane, overPane: Pane): boolean;
}

export class DefaultPaneDndController implements IPaneDndController {

	canDrag(pane: Pane): boolean {
		return true;
	}

	canDrop(pane: Pane, overPane: Pane): boolean {
		return true;
	}
}

export interface IPaneViewOptions {
	dnd?: IPaneDndController;
	orientation?: Orientation;
}

interface IPaneItem {
	pane: Pane;
	disposable: IDisposable;
}

export class PaneView extends Disposable {

	private dnd: IPaneDndController | undefined;
	private dndContext: IDndContext = { draggable: null };
	private el: HTMLElement;
	private paneItems: IPaneItem[] = [];
	private orthogonalSize: number = 0;
	private splitview: SplitView;
	private orientation: Orientation;
	private animationTimer: number | undefined = undefined;

	private _onDidDrop = this._register(new Emitter<{ from: Pane, to: Pane }>());
	readonly onDidDrop: Event<{ from: Pane, to: Pane }> = this._onDidDrop.event;

	readonly onDidSashChange: Event<number>;

	constructor(container: HTMLElement, options: IPaneViewOptions = {}) {
		super();

		this.dnd = options.dnd;
		this.orientation = options.orientation ?? Orientation.VERTICAL;
		this.el = append(container, $('.monaco-pane-view'));
		this.splitview = this._register(new SplitView(this.el, { orientation: this.orientation }));
		this.onDidSashChange = this.splitview.onDidSashChange;
	}

	addPane(pane: Pane, size: number, index = this.splitview.length): void {
		const disposables = new DisposableStore();
		pane.onDidChangeExpansionState(this.setupAnimation, this, disposables);

		const paneItem = { pane: pane, disposable: disposables };
		this.paneItems.splice(index, 0, paneItem);
		pane.orthogonalSize = this.orthogonalSize;
		this.splitview.addView(pane, size, index);

		if (this.dnd) {
			const draggable = new PaneDraggable(pane, this.dnd, this.dndContext);
			disposables.add(draggable);
			disposables.add(draggable.onDidDrop(this._onDidDrop.fire, this._onDidDrop));
		}
	}

	removePane(pane: Pane): void {
		const index = firstIndex(this.paneItems, item => item.pane === pane);

		if (index === -1) {
			return;
		}

		this.splitview.removeView(index);
		const paneItem = this.paneItems.splice(index, 1)[0];
		paneItem.disposable.dispose();
	}

	movePane(from: Pane, to: Pane): void {
		const fromIndex = firstIndex(this.paneItems, item => item.pane === from);
		const toIndex = firstIndex(this.paneItems, item => item.pane === to);

		if (fromIndex === -1 || toIndex === -1) {
			return;
		}

		const [paneItem] = this.paneItems.splice(fromIndex, 1);
		this.paneItems.splice(toIndex, 0, paneItem);

		this.splitview.moveView(fromIndex, toIndex);
	}

	resizePane(pane: Pane, size: number): void {
		const index = firstIndex(this.paneItems, item => item.pane === pane);

		if (index === -1) {
			return;
		}

		this.splitview.resizeView(index, size);
	}

	getPaneSize(pane: Pane): number {
		const index = firstIndex(this.paneItems, item => item.pane === pane);

		if (index === -1) {
			return -1;
		}

		return this.splitview.getViewSize(index);
	}

	layout(height: number, width: number): void {
		this.orthogonalSize = this.orientation === Orientation.VERTICAL ? width : height;

		for (const paneItem of this.paneItems) {
			paneItem.pane.orthogonalSize = this.orthogonalSize;
		}

		this.splitview.layout(this.orientation === Orientation.HORIZONTAL ? width : height);
	}

	private setupAnimation(): void {
		if (typeof this.animationTimer === 'number') {
			window.clearTimeout(this.animationTimer);
		}

		addClass(this.el, 'animated');

		this.animationTimer = window.setTimeout(() => {
			this.animationTimer = undefined;
			removeClass(this.el, 'animated');
		}, 200);
	}

	dispose(): void {
		super.dispose();

		this.paneItems.forEach(i => i.disposable.dispose());
	}
}
