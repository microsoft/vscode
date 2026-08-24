/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/chatGroupDropTarget.css';
import { $, addDisposableListener, DragAndDropObserver, EventHelper, EventType, getWindow } from '../../../base/browser/dom.js';
import { RunOnceScheduler } from '../../../base/common/async.js';
import { toDisposable } from '../../../base/common/lifecycle.js';
import { assertReturnsDefined } from '../../../base/common/types.js';
import { IInstantiationService } from '../../../platform/instantiation/common/instantiation.js';
import { activeContrastBorder } from '../../../platform/theme/common/colorRegistry.js';
import { IThemeService, Themable } from '../../../platform/theme/common/themeService.js';
import { EDITOR_DRAG_AND_DROP_BACKGROUND } from '../../../workbench/common/theme.js';
import { getSessionChatDragData, IDraggedSessionChat } from '../dnd.js';

/** Zone of a target group where a dragged chat can be dropped. */
export type ChatDropZone = 'left' | 'right' | 'top' | 'bottom' | 'center';

/**
 * Resolves an element under the groups container to the chat group it belongs
 * to, and receives drop notifications.
 */
export interface IChatGroupDropTargetDelegate {

	/** Whether the drag can be accepted by this session's grid. */
	isChatDrag(event: DragEvent): boolean;

	/** Resolve a child element to its owning chat group id + root element. */
	findTargetGroup(child: HTMLElement): { readonly id: number; readonly element: HTMLElement } | undefined;

	/** Handle a chat being dropped onto the given group in the given zone. */
	onChatDrop(targetGroupId: number, zone: ChatDropZone, data: IDraggedSessionChat | undefined): void;
}

/** Fraction of the target's width/height that the edge zones occupy. */
const EDGE_THRESHOLD = 0.25;

class ChatGroupDropOverlay extends Themable {

	private static readonly OVERLAY_ID = 'monaco-workbench-chat-group-drop-overlay';

	private _container: HTMLElement | undefined;
	private _overlay: HTMLElement | undefined;

	private _currentZone: ChatDropZone | undefined;

	private _disposed = false;
	get disposed(): boolean { return this._disposed; }

	private readonly _cleanupOverlayScheduler: RunOnceScheduler;

	constructor(
		readonly targetGroupId: number,
		private readonly _targetElement: HTMLElement,
		private readonly _onDrop: (groupId: number, zone: ChatDropZone, data: IDraggedSessionChat | undefined) => void,
		private readonly _isChatDrag: (event: DragEvent) => boolean,
		@IThemeService themeService: IThemeService,
	) {
		super(themeService);

		this._cleanupOverlayScheduler = this._register(new RunOnceScheduler(() => this.dispose(), 300));

		this._create();
	}

	private _create(): void {
		const container = this._container = $('div', { id: ChatGroupDropOverlay.OVERLAY_ID });

		this._targetElement.appendChild(container);
		this._targetElement.classList.add('chat-group-dragged-over');
		this._register(toDisposable(() => {
			container.remove();
			this._targetElement.classList.remove('chat-group-dragged-over');
		}));

		this._overlay = $('.chat-group-drop-overlay-indicator');
		container.appendChild(this._overlay);

		this._registerListeners(container);
		this.updateStyles();
	}

	override updateStyles(): void {
		const overlay = assertReturnsDefined(this._overlay);

		overlay.style.backgroundColor = this.getColor(EDITOR_DRAG_AND_DROP_BACKGROUND) || '';

		const activeContrastBorderColor = this.getColor(activeContrastBorder);
		overlay.style.outlineColor = activeContrastBorderColor || '';
		overlay.style.outlineOffset = activeContrastBorderColor ? '-2px' : '';
		overlay.style.outlineStyle = activeContrastBorderColor ? 'dashed' : '';
		overlay.style.outlineWidth = activeContrastBorderColor ? '2px' : '';
	}

	private _registerListeners(container: HTMLElement): void {
		this._register(new DragAndDropObserver(container, {
			onDragOver: e => {
				if (!this._isChatDrag(e)) {
					this._hideOverlay();
					return;
				}

				this._positionOverlay(e.offsetX, e.offsetY);

				if (this._cleanupOverlayScheduler.isScheduled()) {
					this._cleanupOverlayScheduler.cancel();
				}
			},

			onDragLeave: () => this.dispose(),
			onDragEnd: () => this.dispose(),

			onDrop: e => {
				EventHelper.stop(e, true);

				const zone = this._currentZone;
				const data = getSessionChatDragData(e);
				this.dispose();

				if (zone) {
					this._onDrop(this.targetGroupId, zone, data);
				}
			}
		}));

		this._register(addDisposableListener(container, EventType.MOUSE_OVER, () => {
			if (!this._cleanupOverlayScheduler.isScheduled()) {
				this._cleanupOverlayScheduler.schedule();
			}
		}));
	}

	private _positionOverlay(mousePosX: number, mousePosY: number): void {
		const width = this._targetElement.clientWidth;
		const height = this._targetElement.clientHeight;

		const zone = this._computeZone(mousePosX, mousePosY, width, height);

		switch (zone) {
			case 'left':
				this._doPositionOverlay({ left: '0', top: '0', width: '50%', height: '100%' });
				break;
			case 'right':
				this._doPositionOverlay({ left: '50%', top: '0', width: '50%', height: '100%' });
				break;
			case 'top':
				this._doPositionOverlay({ left: '0', top: '0', width: '100%', height: '50%' });
				break;
			case 'bottom':
				this._doPositionOverlay({ left: '0', top: '50%', width: '100%', height: '50%' });
				break;
			case 'center':
				this._doPositionOverlay({ left: '0', top: '0', width: '100%', height: '100%' });
				break;
		}

		const overlay = assertReturnsDefined(this._overlay);
		overlay.style.opacity = '1';

		this._currentZone = zone;
	}

	private _computeZone(x: number, y: number, width: number, height: number): ChatDropZone {
		const edgeX = width * EDGE_THRESHOLD;
		const edgeY = height * EDGE_THRESHOLD;

		// Edge zones take precedence; the closest edge (relative to its threshold) wins.
		const distLeft = x;
		const distRight = width - x;
		const distTop = y;
		const distBottom = height - y;

		const inLeft = distLeft <= edgeX;
		const inRight = distRight <= edgeX;
		const inTop = distTop <= edgeY;
		const inBottom = distBottom <= edgeY;

		if (!inLeft && !inRight && !inTop && !inBottom) {
			return 'center';
		}

		const candidates: { zone: ChatDropZone; ratio: number }[] = [];
		if (inLeft) { candidates.push({ zone: 'left', ratio: distLeft / edgeX }); }
		if (inRight) { candidates.push({ zone: 'right', ratio: distRight / edgeX }); }
		if (inTop) { candidates.push({ zone: 'top', ratio: distTop / edgeY }); }
		if (inBottom) { candidates.push({ zone: 'bottom', ratio: distBottom / edgeY }); }

		candidates.sort((a, b) => a.ratio - b.ratio);
		return candidates[0].zone;
	}

	private _doPositionOverlay(options: { left: string; top: string; width: string; height: string }): void {
		const container = assertReturnsDefined(this._container);
		const overlay = assertReturnsDefined(this._overlay);
		container.style.height = '100%';
		overlay.style.left = options.left;
		overlay.style.top = options.top;
		overlay.style.width = options.width;
		overlay.style.height = options.height;
	}

	private _hideOverlay(): void {
		const overlay = assertReturnsDefined(this._overlay);

		this._doPositionOverlay({ left: '0', top: '0', width: '100%', height: '100%' });
		overlay.style.opacity = '0';

		this._currentZone = undefined;
	}

	contains(element: HTMLElement): boolean {
		return element === this._container || element === this._overlay;
	}

	override dispose(): void {
		super.dispose();

		this._disposed = true;
	}
}

/**
 * Drop target for the chats grid within a session. Listens for chat-tab drags
 * over the groups container, displays a 5-zone overlay on whichever group is
 * being hovered, and calls back into the owning {@link ChatGroupsView} to move
 * the chat into an existing group (center) or split it into a new group (edge).
 */
export class ChatGroupDropTarget extends Themable {

	private _overlay?: ChatGroupDropOverlay;

	private _counter = 0;

	constructor(
		private readonly _container: HTMLElement,
		private readonly _delegate: IChatGroupDropTargetDelegate,
		@IThemeService themeService: IThemeService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) {
		super(themeService);

		this._registerListeners();
	}

	private get overlay(): ChatGroupDropOverlay | undefined {
		if (this._overlay && !this._overlay.disposed) {
			return this._overlay;
		}
		return undefined;
	}

	private _registerListeners(): void {
		this._register(addDisposableListener(this._container, EventType.DRAG_ENTER, e => this._onDragEnter(e)));
		this._register(addDisposableListener(this._container, EventType.DRAG_LEAVE, () => this._onDragLeave()));
		for (const target of [this._container, getWindow(this._container)]) {
			this._register(addDisposableListener(target, EventType.DRAG_END, () => this._onDragEnd()));
		}
	}

	private _onDragEnter(event: DragEvent): void {
		this._counter++;

		if (!this._delegate.isChatDrag(event)) {
			if (event.dataTransfer) {
				event.dataTransfer.dropEffect = 'none';
			}
			return;
		}

		this._updateContainer(true);

		const target = event.target as HTMLElement;
		if (!target) {
			return;
		}

		if (this.overlay && !this.overlay.contains(target)) {
			this._disposeOverlay();
		}

		if (this.overlay) {
			return;
		}

		const targetGroup = this._delegate.findTargetGroup(target);
		if (!targetGroup) {
			return;
		}

		this._overlay = this._instantiationService.createInstance(
			ChatGroupDropOverlay,
			targetGroup.id,
			targetGroup.element,
			(groupId: number, zone: ChatDropZone, data: IDraggedSessionChat | undefined) => this._delegate.onChatDrop(groupId, zone, data),
			event => this._delegate.isChatDrag(event),
		);
	}

	private _onDragLeave(): void {
		this._counter--;

		if (this._counter === 0) {
			this._updateContainer(false);
		}
	}

	private _onDragEnd(): void {
		this._counter = 0;

		this._updateContainer(false);
		this._disposeOverlay();
	}

	private _updateContainer(isDraggedOver: boolean): void {
		this._container.classList.toggle('chat-groups-dragged-over', isDraggedOver);
	}

	override dispose(): void {
		super.dispose();
		this._disposeOverlay();
	}

	private _disposeOverlay(): void {
		if (this._overlay) {
			this._overlay.dispose();
			this._overlay = undefined;
		}
	}
}
