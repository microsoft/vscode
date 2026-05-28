/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, IDisposable, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { derived, IObservable, observableValue } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { IRange } from '../../../../../../editor/common/core/range.js';
import { InstantiationType, registerSingleton } from '../../../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../../../platform/instantiation/common/instantiation.js';

/**
 * Payload describing the inline anchor that should be surfaced in the
 * phone-only peek sheet. Mirrors the parts of `ContentRefData` that
 * make sense to a mobile user: a resource URI plus an optional editor
 * range or symbol name. The presenter implementation reads the file
 * (when possible) and renders a path / language / snippet preview
 * inside the shared bottom sheet.
 */
export interface IChatInlineAnchorPeekTarget {
	readonly uri: URI;
	readonly range?: IRange;
	readonly symbolName?: string;
}

/**
 * Implementation of the phone-only inline-anchor peek presenter,
 * registered by the agents-window (sessions) layer. Stays in
 * `vs/workbench` as an interface so the workbench chat content parts
 * can compile and run with no sessions dependency; the default
 * singleton is a no-op (sees `enabled === false`).
 */
export interface IChatInlineAnchorPhonePresenterImpl {
	/**
	 * Whether the phone presenter is currently active. Workbench code
	 * consults this in the inline-anchor click handler to decide
	 * between the desktop "open in editor" path and a tap-to-open peek
	 * sheet (phone).
	 */
	readonly enabled: IObservable<boolean>;

	/**
	 * Open a phone-friendly peek bottom sheet for the given anchor.
	 * The returned promise resolves once the sheet has closed (Done,
	 * backdrop, Escape, or a body action invoking `close()`).
	 */
	showAnchorPeek(anchor: IChatInlineAnchorPeekTarget): Promise<void>;
}

export const IChatInlineAnchorPhonePresenter = createDecorator<IChatInlineAnchorPhonePresenter>('chatInlineAnchorPhonePresenter');

/**
 * Workbench-layer hook for phone-only inline-anchor peek presentation.
 *
 * The default singleton is a no-op (`enabled === false`,
 * {@link showAnchorPeek} resolves immediately). The agents-window
 * layer (`vs/sessions`) registers a real implementation via
 * {@link setImpl} that renders the anchor metadata into the shared
 * mobile bottom sheet (see `showMobileContentSheet` in
 * `vs/sessions/browser/parts/mobile/mobilePickerSheet`) with quick
 * actions to open the file in the editor or copy a link to it.
 *
 * Workbench callers should:
 *   1. Read `enabled.get()` inside the inline-anchor click handler.
 *      When `true`, call {@link showAnchorPeek} and return early so
 *      the desktop hover/open path does not also fire.
 *   2. Never assume the returned promise resolves quickly — the user
 *      controls the sheet's lifetime.
 */
export interface IChatInlineAnchorPhonePresenter {
	readonly _serviceBrand: undefined;

	/** `true` when an impl is registered AND it reports phone layout. */
	readonly enabled: IObservable<boolean>;

	/**
	 * Open the phone peek sheet for the given anchor. No-ops (resolves
	 * immediately) when {@link enabled} is `false`.
	 */
	showAnchorPeek(anchor: IChatInlineAnchorPeekTarget): Promise<void>;

	/**
	 * Register the phone implementation. Returns a disposable that
	 * removes the registration. Only one impl is active at a time; the
	 * most recent registration wins.
	 */
	setImpl(impl: IChatInlineAnchorPhonePresenterImpl): IDisposable;
}

class ChatInlineAnchorPhonePresenterService extends Disposable implements IChatInlineAnchorPhonePresenter {

	declare readonly _serviceBrand: undefined;

	private readonly _impl = observableValue<IChatInlineAnchorPhonePresenterImpl | undefined>(this, undefined);

	readonly enabled: IObservable<boolean> = derived(this, reader => {
		const impl = this._impl.read(reader);
		return impl ? impl.enabled.read(reader) : false;
	});

	showAnchorPeek(anchor: IChatInlineAnchorPeekTarget): Promise<void> {
		const impl = this._impl.get();
		return impl ? impl.showAnchorPeek(anchor) : Promise.resolve();
	}

	setImpl(impl: IChatInlineAnchorPhonePresenterImpl): IDisposable {
		this._impl.set(impl, undefined);
		return toDisposable(() => {
			if (this._impl.get() === impl) {
				this._impl.set(undefined, undefined);
			}
		});
	}
}

registerSingleton(IChatInlineAnchorPhonePresenter, ChatInlineAnchorPhonePresenterService, InstantiationType.Delayed);
