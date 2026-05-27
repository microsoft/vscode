/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IAction } from '../../../../../base/common/actions.js';
import { Disposable, IDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { derived, IObservable, observableValue } from '../../../../../base/common/observable.js';
import { InstantiationType, registerSingleton } from '../../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';

/**
 * Implementation of the phone-only chat-row actions presenter, registered
 * by the agents-window (sessions) layer. Stays in `vs/workbench` as an
 * interface so the chat list renderer can compile and run with no
 * sessions dependency; the default singleton is a no-op.
 *
 * On desktop/tablet viewports every chat row exposes its toolbar through
 * a hover affordance (see `chatListRenderer.ts`). On phone viewports
 * there is no hover, and the existing row-level toolbar is too small a
 * tap target to be usable. The sessions-layer implementation replaces
 * that hover toolbar with a long-press handler that opens a bottom-sheet
 * action list, while leaving the rest of the chat list renderer
 * untouched.
 */
export interface IChatRowActionsPhonePresenterImpl {
	/**
	 * Whether the phone presenter is currently active. Workbench code
	 * consults this to decide between the standard hover toolbar and the
	 * long-press → bottom-sheet presentation. Flips reactively with the
	 * viewport (rotation, window resize, etc.).
	 */
	readonly enabled: IObservable<boolean>;

	/**
	 * Wire a long-press handler on `rowElement` that opens a bottom-sheet
	 * action list for the chat row. `getActions` is invoked lazily each
	 * time the sheet is opened so the items reflect the row's current
	 * state (e.g. enablement, toggled state, dynamic menu items) at the
	 * moment of the gesture rather than at attach time.
	 *
	 * The returned disposable removes the long-press wiring and any
	 * presenter-owned listeners on the row.
	 */
	attachToRow(rowElement: HTMLElement, getActions: () => readonly IAction[]): IDisposable;
}

export const IChatRowActionsPhonePresenter = createDecorator<IChatRowActionsPhonePresenter>('chatRowActionsPhonePresenter');

/**
 * Workbench-layer hook for phone-only chat-row action presentation.
 *
 * The default singleton is a no-op (`enabled === false`, {@link attachToRow}
 * returns an empty disposable). The agents-window layer (`vs/sessions`)
 * registers a real implementation via {@link setImpl} that intercepts
 * long-press on each chat row and presents the row's actions through a
 * bottom sheet, replacing the hover-only toolbar used on desktop.
 *
 * This indirection keeps `vs/workbench` free of any dependency on
 * `vs/sessions`: the chat list renderer can call into the presenter
 * unconditionally, and when no impl is registered the calls collapse to
 * no-ops so non-phone surfaces behave exactly as before.
 *
 * Workbench callers should:
 *   1. Read `enabled.get()` (or subscribe via `autorun`) to decide
 *      whether to suppress the row's hover toolbar in favour of the
 *      long-press presentation.
 *   2. Call {@link attachToRow} once per rendered row, registering the
 *      returned disposable so the wiring is torn down when the row is
 *      recycled or disposed.
 */
export interface IChatRowActionsPhonePresenter {
	readonly _serviceBrand: undefined;

	/** `true` when an impl is registered AND it reports phone layout. */
	readonly enabled: IObservable<boolean>;

	/**
	 * Attach the phone long-press handler to a chat row. Returns a
	 * no-op disposable when {@link enabled} is `false`; otherwise
	 * delegates to the registered impl. `getActions` is called lazily
	 * each time the sheet is opened.
	 */
	attachToRow(rowElement: HTMLElement, getActions: () => readonly IAction[]): IDisposable;

	/**
	 * Register the phone implementation. Returns a disposable that removes
	 * the registration. Only one impl is active at a time; the most recent
	 * registration wins.
	 */
	setImpl(impl: IChatRowActionsPhonePresenterImpl): IDisposable;
}

class ChatRowActionsPhonePresenterService extends Disposable implements IChatRowActionsPhonePresenter {

	declare readonly _serviceBrand: undefined;

	private readonly _impl = observableValue<IChatRowActionsPhonePresenterImpl | undefined>(this, undefined);

	readonly enabled: IObservable<boolean> = derived(this, reader => {
		const impl = this._impl.read(reader);
		return impl ? impl.enabled.read(reader) : false;
	});

	attachToRow(rowElement: HTMLElement, getActions: () => readonly IAction[]): IDisposable {
		const impl = this._impl.get();
		if (!impl || !impl.enabled.get()) {
			return Disposable.None;
		}
		return impl.attachToRow(rowElement, getActions);
	}

	setImpl(impl: IChatRowActionsPhonePresenterImpl): IDisposable {
		this._impl.set(impl, undefined);
		return toDisposable(() => {
			if (this._impl.get() === impl) {
				this._impl.set(undefined, undefined);
			}
		});
	}
}

registerSingleton(IChatRowActionsPhonePresenter, ChatRowActionsPhonePresenterService, InstantiationType.Delayed);
