/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, IDisposable, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { derived, IObservable, observableValue } from '../../../../../../base/common/observable.js';
import { InstantiationType, registerSingleton } from '../../../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../../../platform/instantiation/common/instantiation.js';

/**
 * Implementation of the phone-only chat plan-review presenter, registered
 * by the agents-window (sessions) layer. Stays in `vs/workbench` as an
 * interface so the workbench chat content parts can compile and run with
 * no sessions dependency; the default singleton is a no-op (sees
 * `enabled === false`).
 */
export interface IChatPlanReviewPhonePresenterImpl {
	/**
	 * Whether the phone presenter is currently active. Workbench code
	 * consults this to decide between rendering the multi-step plan
	 * review widget inline in the chat message column (desktop) and
	 * surfacing a tap-to-open placeholder backed by a bottom sheet
	 * (phone). Drives a re-render of the plan-review mount on every flip.
	 */
	readonly enabled: IObservable<boolean>;

	/**
	 * Move {@link planReviewElement} into a bottom-sheet body and
	 * display it. The returned {@link IDisposable} closes the sheet
	 * (idempotent), and the implementation MUST detach
	 * `planReviewElement` from the sheet body before the shell tears
	 * down so the workbench-owned plan-review DOM survives sheet
	 * dismissal and can be re-mounted on the next tap or on a
	 * phone→desktop transition.
	 *
	 * @param planReviewElement Workbench-owned plan-review root. The
	 *   presenter only re-parents it; the element's lifetime is owned
	 *   by the calling chat content part.
	 * @param title Sheet header title (already localized).
	 */
	showPlanReview(planReviewElement: HTMLElement, title: string): IDisposable;
}

export const IChatPlanReviewPhonePresenter = createDecorator<IChatPlanReviewPhonePresenter>('chatPlanReviewPhonePresenter');

/**
 * Workbench-layer hook for phone-only chat plan-review presentation.
 *
 * The default singleton is a no-op (`enabled === false`,
 * {@link showPlanReview} is a no-op disposable). The agents-window layer
 * (`vs/sessions`) registers a real implementation via {@link setImpl}
 * that mounts the plan-review root into the shared mobile bottom sheet
 * (see `showMobileContentSheet` in
 * `vs/sessions/browser/parts/mobile/mobilePickerSheet`).
 *
 * Workbench callers should:
 *   1. Read `enabled.get()` to decide whether to mount the plan-review
 *      root inline (desktop) or render the tap-to-open placeholder
 *      (phone).
 *   2. Subscribe to `enabled` (e.g. via `autorun`) so the mount swaps
 *      automatically when the viewport crosses the phone breakpoint
 *      (e.g. rotation).
 *   3. Treat the disposable returned by {@link showPlanReview} as the
 *      "is the sheet open" handle: dispose it to close, and on tap
 *      always overwrite the stored handle so re-tap after sheet
 *      dismissal opens a fresh sheet (the underlying `close()` call is
 *      idempotent for the auto-closed case).
 */
export interface IChatPlanReviewPhonePresenter {
	readonly _serviceBrand: undefined;

	/** `true` when an impl is registered AND it reports phone layout. */
	readonly enabled: IObservable<boolean>;

	/**
	 * Mount the plan-review root into the phone bottom sheet. No-ops
	 * (returns `Disposable.None`) when {@link enabled} is `false`.
	 */
	showPlanReview(planReviewElement: HTMLElement, title: string): IDisposable;

	/**
	 * Register the phone implementation. Returns a disposable that
	 * removes the registration. Only one impl is active at a time; the
	 * most recent registration wins.
	 */
	setImpl(impl: IChatPlanReviewPhonePresenterImpl): IDisposable;
}

class ChatPlanReviewPhonePresenterService extends Disposable implements IChatPlanReviewPhonePresenter {

	declare readonly _serviceBrand: undefined;

	private readonly _impl = observableValue<IChatPlanReviewPhonePresenterImpl | undefined>(this, undefined);

	readonly enabled: IObservable<boolean> = derived(this, reader => {
		const impl = this._impl.read(reader);
		return impl ? impl.enabled.read(reader) : false;
	});

	showPlanReview(planReviewElement: HTMLElement, title: string): IDisposable {
		const impl = this._impl.get();
		return impl ? impl.showPlanReview(planReviewElement, title) : Disposable.None;
	}

	setImpl(impl: IChatPlanReviewPhonePresenterImpl): IDisposable {
		this._impl.set(impl, undefined);
		return toDisposable(() => {
			if (this._impl.get() === impl) {
				this._impl.set(undefined, undefined);
			}
		});
	}
}

registerSingleton(IChatPlanReviewPhonePresenter, ChatPlanReviewPhonePresenterService, InstantiationType.Delayed);
