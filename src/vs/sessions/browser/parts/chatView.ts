/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, size } from '../../../base/browser/dom.js';
import { ISerializableView, IViewSize } from '../../../base/browser/ui/grid/grid.js';
import { ProgressBar } from '../../../base/browser/ui/progressbar/progressbar.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { IObservable } from '../../../base/common/observable.js';
import { URI } from '../../../base/common/uri.js';
import { defaultProgressBarStyles } from '../../../platform/theme/browser/defaultStyles.js';
import { IProgressScope, ScopedProgressIndicator } from '../../../workbench/services/progress/browser/progressIndicator.js';
import { IChat } from '../../services/sessions/common/session.js';

/**
 * Discriminates between concrete {@link AbstractChatView} subclasses without
 * requiring core code (`sessions/browser/`) to import them from contrib.
 */
export type ChatViewKind = 'newSession' | 'newChatInSession' | 'chat';

/**
 * Options passed to a chat view when it is created.
 */
export interface IChatViewOptions {

	/**
	 * Whether to render the session type ("harness") picker below the input
	 * (in the controls) instead of next to the workspace picker. The view
	 * reads the value once when it is created and does not react to later
	 * changes, so the placement stays stable for the view's lifetime.
	 */
	readonly renderSessionTypePickerInControls: IObservable<boolean>;
}

/**
 * Base class for a view that lives inside the {@link SessionsPart} internal grid.
 * Each instance occupies a single grid leaf. Subclasses populate {@link element}
 * with their content and forward sizing to whatever widget they host by
 * overriding {@link doLayout}.
 *
 * Concrete implementations (e.g. `NewChatView`, `ChatView`) live in the
 * `sessions/contrib/chat/` layer where the chat widgets they host are defined.
 * Core code obtains instances via {@link IChatViewFactory}.
 */
export abstract class AbstractChatView extends Disposable implements ISerializableView {

	readonly element: HTMLElement = $('.chat-view');

	readonly minimumWidth = 200;
	readonly maximumWidth = Number.POSITIVE_INFINITY;
	readonly minimumHeight = 200;
	readonly maximumHeight = Number.POSITIVE_INFINITY;

	private readonly _onDidChange = this._register(new Emitter<IViewSize | undefined>());
	readonly onDidChange: Event<IViewSize | undefined> = this._onDidChange.event;

	/**
	 * Lazily-created progress indicator scoped to this leaf. Mirrors how each
	 * editor group owns its own {@link ProgressBar} + `ScopedProgressIndicator`.
	 */
	private _progressIndicator: ScopedProgressIndicator | undefined;

	/**
	 * Discriminates the concrete subclass. Used by the session view host to
	 * decide whether the current concrete view can be reused or must be
	 * replaced when `openSession` is called.
	 */
	abstract readonly kind: ChatViewKind;

	/**
	 * Show the given chat in this view. The default implementation is a
	 * no-op; subclasses that host a chat widget (e.g. `ChatView`) override
	 * this to load the chat model and feed it into the widget.
	 */
	setChat(_chat: IChat, _historyKey?: string): void {
		// no-op by default
	}

	/**
	 * Select a workspace folder in this view's workspace picker. The default
	 * implementation is a no-op; subclasses that host a workspace picker
	 * (e.g. `NewChatView`) override this to forward the selection.
	 */
	selectWorkspace(_folderUri: URI, _providerId?: string): void {
		// no-op by default
	}

	/**
	 * Prefill the input with the given text. The default implementation is
	 * a no-op; subclasses that host an input widget (e.g. `NewChatView`)
	 * override this.
	 */
	prefillInput(_text: string): void {
		// no-op by default
	}

	/**
	 * Submit the given text as a chat query. The default implementation is
	 * a no-op; subclasses that host an input widget (e.g. `NewChatView`)
	 * override this.
	 */
	sendQuery(_text: string): void {
		// no-op by default
	}

	/**
	 * Attach the given resources as context to this view's chat input. The
	 * default implementation is a no-op; subclasses that host a chat widget
	 * (e.g. `ChatView`) override this to add the attachments to the widget.
	 */
	attach(_uris: URI[]): void {
		// no-op by default
	}

	/**
	 * Notifies the view whether it is the currently active session in the
	 * sessions grid. Subclasses may use this to adjust their visual styling
	 * (e.g. the chat list's background color). The default implementation
	 * is a no-op.
	 */
	setActive(_active: boolean): void {
		// no-op by default
	}

	/**
	 * Shows an indeterminate progress bar at the top of this leaf while the
	 * given promise is pending, mirroring how each editor group surfaces
	 * progress on its own {@link ProgressBar} (see `EditorGroupView` /
	 * `ScopedProgressIndicator`). The bar is scoped to this view, so concurrent
	 * loads in other grid leaves are unaffected. Overlapping loads on this leaf
	 * are joined by the indicator so the bar only hides once all have settled.
	 * The optional `delay` avoids flashing the bar for fast (e.g. cached) loads.
	 */
	protected showProgressWhile(promise: Promise<unknown>, delay?: number): void {
		if (!this._progressIndicator) {
			// Created lazily and pinned to the top of the leaf via CSS.
			const progressBar = this._register(new ProgressBar(this.element, defaultProgressBarStyles));
			progressBar.hide();
			// A chat leaf is always the active surface within its own grid leaf,
			// so its progress scope is permanently active.
			const scope: IProgressScope = { isActive: true, onDidChangeActive: Event.None };
			this._progressIndicator = this._register(new ScopedProgressIndicator(progressBar, scope));
		}
		this._progressIndicator.showWhile(promise, delay);
	}

	/**
	 * Called by the workbench grid to size this leaf. Sizes {@link element}
	 * to the allocated dimensions and then delegates to {@link doLayout} so
	 * subclasses can forward sizing to their hosted widget.
	 */
	layout(width: number, height: number, top: number, left: number): void {
		size(this.element, width, height);
		this.doLayout(width, height, top, left);
	}

	protected abstract doLayout(width: number, height: number, top: number, left: number): void;

	abstract toJSON(): object;

	abstract focus(): void;
}
