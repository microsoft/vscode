/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, size } from '../../../base/browser/dom.js';
import { ISerializableView, IViewSize } from '../../../base/browser/ui/grid/grid.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { URI } from '../../../base/common/uri.js';
import { IChat } from '../../services/sessions/common/session.js';

/**
 * Discriminates between concrete {@link AbstractChatView} subclasses without
 * requiring core code (`sessions/browser/`) to import them from contrib.
 */
export type ChatViewKind = 'newSession' | 'newChatInSession' | 'chat';

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
	setChat(_chat: IChat): void {
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
	 * Notifies the view whether it is the currently active session in the
	 * sessions grid. Subclasses may use this to adjust their visual styling
	 * (e.g. the chat list's background color). The default implementation
	 * is a no-op.
	 */
	setActive(_active: boolean): void {
		// no-op by default
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
