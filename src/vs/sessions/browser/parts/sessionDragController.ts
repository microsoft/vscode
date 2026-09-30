/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getZoomFactor } from '../../../base/browser/browser.js';
import { $, addDisposableListener, getWindow } from '../../../base/browser/dom.js';
import { onUnexpectedError } from '../../../base/common/errors.js';
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from '../../../base/common/lifecycle.js';
import { IActiveSession } from '../../services/sessions/common/sessionsManagement.js';
import { ISessionDragHandlers, ISessionDragTarget } from '../../services/sessions/browser/sessionsPartService.js';
import { SessionsPart } from './sessionsPart.js';
import { getSessionDropDirection } from './sessionDropTarget.js';

/** Pointer capture preserves an unambiguous release/cancel signal outside the source window. */
export class SessionDragController extends Disposable {
	private readonly gesture = this._register(new MutableDisposable<DisposableStore>());

	constructor(
		private readonly getParts: (sourceWindow: Window) => readonly SessionsPart[],
		private readonly handlers: ISessionDragHandlers,
	) {
		super();
	}

	start(event: PointerEvent, element: HTMLElement, session: IActiveSession): void {
		if (event.button !== 0 || !event.isPrimary || event.pointerType !== 'mouse' || !session.isCreated.get()) {
			return;
		}
		const store = new DisposableStore();
		this.gesture.value = store;
		const sourceWindow = getWindow(element);
		const pointerId = event.pointerId;
		let dragging = false;
		let overlay: HTMLElement | undefined;
		let overlayParent: HTMLElement | undefined;

		const hitTest = (e: PointerEvent): { inside: boolean; target?: ISessionDragTarget; element?: HTMLElement } => {
			for (const part of this.getParts(sourceWindow)) {
				const container = part.getContainer();
				if (!container) {
					continue;
				}
				const window = getWindow(container);
				if (window.closed || e.screenX < window.screenX || e.screenX > window.screenX + window.outerWidth
					|| e.screenY < window.screenY || e.screenY > window.screenY + window.outerHeight) {
					continue;
				}
				const zoom = getZoomFactor(window);
				const frame = Math.max(0, (window.outerWidth - window.innerWidth * zoom) / 2);
				const x = (e.screenX - window.screenX - frame) / zoom;
				const y = (e.screenY - window.screenY - (window.outerHeight - window.innerHeight * zoom - frame)) / zoom;
				const child = window.document.elementFromPoint(x, y);
				const target = child && part.findDropTarget(child);
				if (!target || target.sessionId === session.sessionId) {
					return { inside: true };
				}
				const bounds = target.element.getBoundingClientRect();
				return {
					inside: true,
					element: target.element,
					target: { partId: part.partId, referenceSessionId: target.sessionId, direction: getSessionDropDirection(x - bounds.x, y - bounds.y, bounds.width, bounds.height) },
				};
			}
			return { inside: false };
		};

		store.add(toDisposable(() => {
			overlay?.remove();
			element.classList.remove('session-header-dragging');
			if (element.hasPointerCapture(pointerId)) {
				element.releasePointerCapture(pointerId);
			}
		}));
		store.add(addDisposableListener(sourceWindow, 'pointermove', (e: PointerEvent) => {
			if (e.pointerId !== pointerId) {
				return;
			}
			if (!(e.buttons & 1) || !element.isConnected) {
				this.gesture.clear();
				return;
			}
			if (!dragging && Math.hypot(e.screenX - event.screenX, e.screenY - event.screenY) < 5) {
				return;
			}
			if (!dragging) {
				dragging = true;
				element.setPointerCapture(pointerId);
				element.classList.add('session-header-dragging');
			}
			e.preventDefault();
			const hit = hitTest(e);
			if (overlayParent !== hit.element) {
				overlay?.remove();
				overlayParent = hit.element;
				overlay = hit.element?.appendChild($('.session-pointer-drop-overlay'));
			}
			if (overlay && hit.target) {
				const { direction } = hit.target;
				const horizontal = direction === 'left' || direction === 'right';
				overlay.style.left = direction === 'right' ? '50%' : '0';
				overlay.style.top = direction === 'down' ? '50%' : '0';
				overlay.style.width = horizontal ? '50%' : '100%';
				overlay.style.height = horizontal ? '100%' : '50%';
			}
		}));
		store.add(addDisposableListener(sourceWindow, 'pointerup', (e: PointerEvent) => {
			if (e.pointerId !== pointerId || e.button !== 0) {
				return;
			}
			const hit = dragging && element.isConnected ? hitTest(e) : undefined;
			if (dragging) {
				e.preventDefault();
				e.stopPropagation();
			}
			this.gesture.clear();
			if (hit?.target) {
				void this.handlers.drop([session], hit.target).catch(onUnexpectedError);
			} else if (hit && !hit.inside) {
				void this.handlers.openWindow([session], { x: e.screenX - 100, y: e.screenY - 30 }).catch(onUnexpectedError);
			}
		}));
		store.add(addDisposableListener(sourceWindow, 'keydown', (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				e.preventDefault();
				e.stopPropagation();
				this.gesture.clear();
			}
		}, true));
		for (const type of ['pointercancel', 'lostpointercapture']) {
			store.add(addDisposableListener(element, type, () => this.gesture.clear()));
		}
		store.add(addDisposableListener(sourceWindow, 'blur', () => this.gesture.clear()));
		store.add(addDisposableListener(sourceWindow, 'unload', () => this.gesture.clear()));
	}
}
