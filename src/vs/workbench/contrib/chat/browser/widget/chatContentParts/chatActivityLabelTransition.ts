/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { addDisposableListener, EventType } from '../../../../../../base/browser/dom.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../../../base/common/lifecycle.js';
import { hasKey } from '../../../../../../base/common/types.js';
import { IAccessibilityService } from '../../../../../../platform/accessibility/common/accessibility.js';
import './media/chatActivityLabelTransition.css';

const enum ActivityLabelWipe {
	Out = 'chat-activity-label-wipe-out',
	In = 'chat-activity-label-wipe-in',
}

/**
 * Supplies the label that a {@link ChatActivityLabelTransition} animates.
 */
export interface IChatActivityLabelTransitionDelegate {
	/** The element showing the label now. It may be replaced when the label changes. */
	getElement(): HTMLElement | undefined;
	/** Whether the requested label names a different activity than the one shown. */
	shouldAnimate(): boolean;
	/** Replaces the label shown with the latest requested one. */
	showTarget(): void;
}

/**
 * Wipes an activity label out and the next one in, with a shimmer as it arrives.
 * Requests made during a wipe are coalesced so the incoming label is always the
 * latest one. Labels swap at once when motion is reduced.
 */
export class ChatActivityLabelTransition extends Disposable {

	private phase: 'idle' | 'out' | 'in' = 'idle';
	private animatedElement: HTMLElement | undefined;
	private readonly animation = this._register(new MutableDisposable<DisposableStore>());

	constructor(
		private readonly delegate: IChatActivityLabelTransitionDelegate,
		@IAccessibilityService private readonly accessibilityService: IAccessibilityService,
	) {
		super();
		this._register(accessibilityService.onDidChangeReducedMotion(() => {
			if (this.phase !== 'idle' && accessibilityService.isMotionReduced()) {
				this.finish();
			}
		}));
	}

	/** Shows the requested label, wiping to it when the delegate asks for animation. */
	update(): void {
		if (this.phase !== 'idle') {
			return;
		}
		if (this.accessibilityService.isMotionReduced() || !this.delegate.shouldAnimate()) {
			this.delegate.showTarget();
			return;
		}
		this.phase = 'out';
		// Nothing animates when the label is not rendered or its styles do not apply.
		if (!this.animate(ActivityLabelWipe.Out)) {
			this.finish();
		}
	}

	/** Stops any wipe and shows the requested label at once. */
	finish(): void {
		this.stop();
		this.delegate.showTarget();
	}

	/** Stops any wipe and leaves the label that is shown. */
	stop(): void {
		this.animation.clear();
		this.phase = 'idle';
		this.clearAnimationClasses();
	}

	private advance(): void {
		this.animation.clear();
		if (this.phase === 'out') {
			this.phase = 'in';
			this.clearAnimationClasses();
			this.delegate.showTarget();
			if (!this.animate(ActivityLabelWipe.In)) {
				this.stop();
			}
			return;
		}
		if (this.phase === 'in') {
			this.clearAnimationClasses();
			this.phase = 'idle';
			// Catch up with a label requested while this one wiped in.
			this.update();
		}
	}

	private animate(wipe: ActivityLabelWipe): boolean {
		const element = this.delegate.getElement();
		if (!element) {
			return false;
		}
		this.clearAnimationClasses();
		const animation = new DisposableStore();
		this.animation.value = animation;
		this.animatedElement = element;
		void element.offsetWidth;
		element.classList.add(wipe);
		// Match by name instead of `instanceof CSSAnimation`: that constructor can be missing, and labels
		// in auxiliary windows run animations created by another window's constructor.
		const animations = element.getAnimations().filter((running: Animation | CSSAnimation) => hasKey(running, { animationName: true }) && running.animationName === wipe);
		if (animations.length === 0) {
			this.animation.clear();
			this.clearAnimationClasses();
			return false;
		}

		const settle = () => {
			if (!animation.isDisposed) {
				this.advance();
			}
		};
		const onAnimationEvent = (event: AnimationEvent) => {
			if (event.target === element && event.animationName === wipe) {
				settle();
			}
		};
		animation.add(addDisposableListener(element, EventType.ANIMATION_END, onAnimationEvent));
		animation.add(addDisposableListener(element, 'animationcancel', onAnimationEvent));
		// Animation events may not reach a label removed from the document, such as
		// in a row scrolled out of a virtualized list, but the animation still settles.
		void Promise.allSettled(animations.map(running => running.finished)).then(settle);
		return true;
	}

	private clearAnimationClasses(): void {
		this.animatedElement?.classList.remove(ActivityLabelWipe.Out, ActivityLabelWipe.In);
		this.animatedElement = undefined;
	}
}
