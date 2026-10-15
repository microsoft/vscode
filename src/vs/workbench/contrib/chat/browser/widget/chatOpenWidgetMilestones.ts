/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { addDisposableListener, getWindow, scheduleAtNextAnimationFrame } from '../../../../../base/browser/dom.js';
import { Event } from '../../../../../base/common/event.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { IChatOpenTracker } from '../../common/chatOpenTelemetry.js';

/**
 * The part of a chat widget that tells when the transcript of an attached model was first rendered.
 */
export interface IChatOpenRenderSource {
	readonly domNode: HTMLElement;
	/** Whether the widget is shown. A hidden widget does not render its transcript. */
	readonly visible: boolean;
	readonly onDidHide: Event<void>;
	readonly onDidRenderFirstTranscript: Event<URI>;
	isFirstTranscriptRenderPending(sessionResource: URI): boolean;
}

/**
 * The document a chat widget is shown in, which is hidden e.g. while its window is minimized.
 */
export interface IChatOpenDocumentVisibility extends EventTarget {
	readonly visibilityState: DocumentVisibilityState;
}

/**
 * Records the widget milestones of a chat open: `modelAttached` when a surface
 * attached the chat model to its widget, and `firstRender` once the widget's
 * first transcript render for that model was committed to the screen.
 *
 * A hidden widget neither renders nor paints, so an open whose widget is not
 * shown when the model is attached, or is hidden before the open completed, ends
 * as `hidden` instead of measuring the time until it is shown again.
 */
export class ChatOpenWidgetMilestones extends Disposable {

	private readonly _pending = this._register(new MutableDisposable<DisposableStore>());

	constructor(
		private readonly _widget: IChatOpenRenderSource,
		private readonly _document: IChatOpenDocumentVisibility = getWindow(_widget.domNode).document,
	) {
		super();
	}

	/** Called by a surface right after it attached the model of the open's chat to the widget. */
	modelAttached(tracker: IChatOpenTracker): void {
		const chatResource = tracker.chatResource;
		if (tracker.isFinished || !chatResource) {
			return;
		}
		tracker.mark('modelAttached');
		if (!this._isShown()) {
			this._pending.clear();
			tracker.finish('hidden');
			return;
		}

		const store = this._pending.value = new DisposableStore();
		const finishIfHidden = () => {
			if (!this._isShown()) {
				this._pending.clear();
				tracker.finish('hidden');
			}
		};
		store.add(this._widget.onDidHide(finishIfHidden));
		store.add(addDisposableListener(this._document, 'visibilitychange', finishIfHidden));
		const markFirstRenderOnNextFrame = () => {
			// The list rendered synchronously; the next frame has committed it to the screen without forcing a layout.
			store.add(scheduleAtNextAnimationFrame(getWindow(this._widget.domNode), () => {
				tracker.mark('firstRender');
				if (tracker.isFinished && this._pending.value === store) {
					this._pending.clear();
				}
			}));
		};
		// The widget does not render again when this model was attached already.
		if (this._widget.isFirstTranscriptRenderPending(chatResource)) {
			store.add(this._widget.onDidRenderFirstTranscript(resource => {
				if (isEqual(resource, chatResource)) {
					markFirstRenderOnNextFrame();
				}
			}));
		} else {
			markFirstRenderOnNextFrame();
		}
	}

	private _isShown(): boolean {
		return this._widget.visible && this._document.visibilityState !== 'hidden';
	}
}
