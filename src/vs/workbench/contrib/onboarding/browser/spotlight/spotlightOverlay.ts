/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, addDisposableGenericMouseDownListener, addDisposableListener, animate, append, EventType, getActiveElement, getWindow, isHTMLElement, scheduleAtNextAnimationFrame, setParentFlowTo } from '../../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../../base/browser/keyboardEvent.js';
import { EventType as TouchEventType } from '../../../../../base/browser/touch.js';
import { status } from '../../../../../base/browser/ui/aria/aria.js';
import { Button } from '../../../../../base/browser/ui/button/button.js';
import { IHoverDelegate } from '../../../../../base/browser/ui/hover/hoverDelegate.js';
import { getDefaultHoverDelegate } from '../../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { KeyCode, KeyMod } from '../../../../../base/common/keyCodes.js';
import { Disposable, DisposableStore, IDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { IMarkdownString, isMarkdownString } from '../../../../../base/common/htmlContent.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { AnchorAlignment, AnchorAxisAlignment, AnchorPosition, IRect, layout2d } from '../../../../../base/common/layout.js';
import { renderMarkdown } from '../../../../../base/browser/markdownRenderer.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { defaultButtonStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { localize } from '../../../../../nls.js';
import { IOnboardingFocusTarget } from './onboardingTarget.js';
import { SpotlightPlacement, SpotlightTargetClickBehavior } from './spotlightTypes.js';
import { OnboardingDismissReason } from '../../common/onboardingScenario.js';
import '../media/spotlight.css';

/** How the user advanced to the next step. */
export type SpotlightAdvanceSource = 'button' | 'target';

/** Why a step ended in a skip: the Skip button or the Escape key. */
export type SpotlightSkipReason = OnboardingDismissReason.SkipButton | OnboardingDismissReason.EscapeKey;

/** Default padding (px) added around the target when cutting the highlight hole. */
const DEFAULT_HOLE_PADDING = 6;
const POINTER_SIZE = 10;
const POINTER_GAP = POINTER_SIZE;
const POINTER_EDGE_MARGIN = 16;
type PointerSide = 'top' | 'right' | 'bottom' | 'left';

/** Content rendered inside the spotlight callout for a single step. */
export interface ISpotlightContent {
	readonly title: string;
	readonly description: string | IMarkdownString;
	/** Handles links in the callout description. */
	readonly onDidClickLink?: (link: string) => void;
	/** Localized primary button label, replacing the default Next or Done. */
	readonly nextButtonLabel?: string;
	/**
	 * Localized label of the footer button that ends the tour, replacing End Tour. With the
	 * title close button, the footer button only shows for such a label, for steps where
	 * ending the tour is a choice such as "Continue in Folder", and the close button hides,
	 * since closing would take that choice.
	 */
	readonly endTourLabel?: string;
	/** Zero-based index of the current step. */
	readonly stepIndex: number;
	/** Total number of steps in the tour. Progress is displayed only for multi-step tours. */
	readonly stepCount: number;
	/** Whether a "Back" action should be offered. */
	readonly canGoBack: boolean;
	/** Whether this is the final step (the primary button becomes "Done"). */
	readonly isLastStep: boolean;
	/** Keeps cancellation available when the final primary button performs an action. */
	readonly showEndTour?: boolean;
	/** Focuses the end tour button, or the title close button when no end tour button shows, instead of the primary button. */
	readonly focusEndTour?: boolean;
}

/** Options controlling how a step is shown. */
export interface ISpotlightShowOptions {
	readonly placement?: SpotlightPlacement;
	readonly allowTargetInteraction?: boolean;
	readonly padding?: number;
	readonly hideNext?: boolean;
	readonly targetOverlayVisible?: boolean;
	/** Other elements to highlight with the target. See `IOnboardingTarget.additionalElements`. */
	readonly additionalElements?: () => readonly HTMLElement[];
	/** Advances on target activation; `advanceOnly` consumes the activation without running its action. */
	readonly advanceOnTargetClick?: SpotlightTargetClickBehavior;
	/** Uses the control's activation event instead of DOM clicks when advancing after its action. */
	readonly onDidActivateTarget?: Event<void>;
	readonly focusTarget?: IOnboardingFocusTarget;
	/** Restores the focused callout control after replacing a lost target. */
	readonly preserveFocus?: boolean;
}

/**
 * A pure-DOM spotlight overlay: dims and blocks the window, cuts a highlight hole
 * around a target element and shows an anchored callout. Without the backdrop
 * it is non-modal and the rest of the window stays interactive. It owns no VS Code
 * services so it can be unit-tested and reused. Scheduling and content come from
 * the spotlight presentation.
 */
export class SpotlightOverlay extends Disposable {

	private readonly _root: HTMLElement;
	private readonly _blockers: readonly HTMLElement[];
	private readonly _hole: HTMLElement;
	private readonly _pointer: HTMLElement;
	private readonly _callout: HTMLElement;

	private readonly _header: HTMLElement;
	private readonly _title: HTMLElement;
	private readonly _description: HTMLElement;
	private readonly _counter: HTMLElement;
	private readonly _descriptionRenderStore = this._register(new DisposableStore());

	/** Created on first use, so the default footer layout renders as before. */
	private _closeButton: Button | undefined;
	private _titleCloseButton = false;
	private readonly _backButton: Button;
	private readonly _nextButton: Button;
	private readonly _skipButton: Button;

	/** Listeners scoped to the currently shown step (re-layout sources). */
	private readonly _stepListeners = this._register(new DisposableStore());

	private readonly _onDidClickNext = this._register(new Emitter<SpotlightAdvanceSource>());
	readonly onDidClickNext: Event<SpotlightAdvanceSource> = this._onDidClickNext.event;

	private readonly _onDidClickPrevious = this._register(new Emitter<void>());
	readonly onDidClickPrevious: Event<void> = this._onDidClickPrevious.event;

	private readonly _onDidSkip = this._register(new Emitter<SpotlightSkipReason>());
	readonly onDidSkip: Event<SpotlightSkipReason> = this._onDidSkip.event;

	private readonly _onDidLoseTarget = this._register(new Emitter<void>());
	readonly onDidLoseTarget: Event<void> = this._onDidLoseTarget.event;

	private _target: HTMLElement | undefined;
	private _options: ISpotlightShowOptions = {};
	/** The last shown step's target and focus target. Kept through `hide()`, so teardown can tell spotlight focus from focus elsewhere. */
	private _lastTargets: readonly HTMLElement[] = [];
	private _hasShown = false;
	private _backdropVisible = true;
	private _previousFocus: HTMLElement | undefined;
	private _scheduledLayout: IDisposable | undefined;
	private _calloutFocusIndex = -1;

	constructor(
		private readonly _container: HTMLElement,
		private readonly _resizeObserverCtor: typeof ResizeObserver = getWindow(_container).ResizeObserver,
	) {
		super();

		this._root = append(this._container, $('.spotlight-overlay'));
		this._root.style.display = 'none';

		this._blockers = [
			append(this._root, $('.spotlight-blocker')),
			append(this._root, $('.spotlight-blocker')),
			append(this._root, $('.spotlight-blocker')),
			append(this._root, $('.spotlight-blocker')),
		];
		this._hole = append(this._root, $('.spotlight-hole'));
		this._hole.setAttribute('aria-hidden', 'true');
		this._pointer = append(this._root, $('.spotlight-callout-pointer'));
		this._pointer.setAttribute('aria-hidden', 'true');

		this._callout = append(this._root, $('.spotlight-callout'));
		this._callout.setAttribute('role', 'dialog');
		this._callout.setAttribute('aria-modal', 'true');
		this._callout.tabIndex = -1;

		this._header = append(this._callout, $('.spotlight-callout-header'));
		this._title = append(this._header, $('h2.spotlight-callout-title'));
		this._title.id = 'spotlight-callout-title';
		this._callout.setAttribute('aria-labelledby', this._title.id);

		this._description = append(this._callout, $('.spotlight-callout-description'));
		this._description.id = 'spotlight-callout-description';
		this._callout.setAttribute('aria-describedby', this._description.id);

		const footer = append(this._callout, $('.spotlight-callout-footer'));
		this._counter = append(footer, $('.spotlight-callout-counter'));
		const actions = append(footer, $('.spotlight-callout-actions'));

		this._skipButton = this._register(new Button(actions, { ...defaultButtonStyles, secondary: true }));
		this._register(this._skipButton.onDidClick(() => this._onDidSkip.fire(OnboardingDismissReason.SkipButton)));

		this._backButton = this._register(new Button(actions, { ...defaultButtonStyles, secondary: true }));
		this._backButton.label = localize('spotlight.back', "Back");
		this._register(this._backButton.onDidClick(() => this._onDidClickPrevious.fire()));

		this._nextButton = this._register(new Button(actions, { ...defaultButtonStyles }));
		this._nextButton.label = localize('spotlight.next', "Next");
		this._register(this._nextButton.onDidClick(() => this._onDidClickNext.fire('button')));

		// Buttons swallow Escape internally, so route their escape events to end the tour too.
		for (const button of [this._skipButton, this._backButton, this._nextButton]) {
			this._register(button.onDidEscape(() => this._onDidSkip.fire(OnboardingDismissReason.EscapeKey)));
		}

		// Keyboard handling on the callout: Esc ends the tour, Tab moves between the callout and the target.
		this._register(addDisposableListener(this._callout, EventType.KEY_DOWN, e => this._onKeyDown(e)));

		this._register({ dispose: () => this._restoreFocus() });
	}

	/** Show `content` spotlighting `target`. */
	show(target: HTMLElement, content: ISpotlightContent, options: ISpotlightShowOptions = {}): void {
		const calloutFocusIndex = options.preserveFocus ? this._calloutFocusIndex : -1;
		this._calloutFocusIndex = -1;
		if (!this._hasShown) {
			this._hasShown = true;
			this._previousFocus = isHTMLElement(getActiveElement()) ? getActiveElement() as HTMLElement : undefined;
		}

		this._target = target;
		this._options = options;
		this._lastTargets = options.focusTarget ? [target, options.focusTarget.element] : [target];
		// Re-showing for a replaced target must not take focus from where the user works in a non-modal spotlight.
		const keepFocus = !!options.preserveFocus && this._isFocusElsewhere();
		this.setPrimaryActionEnabled(true);
		this._renderContent(content);
		const externalUiParticipates = !!options.targetOverlayVisible || !!options.allowTargetInteraction || !!options.advanceOnTargetClick || !!options.hideNext;
		this._root.classList.toggle('target-overlay-visible', externalUiParticipates);
		this._callout.setAttribute('aria-modal', externalUiParticipates || !this._backdropVisible ? 'false' : 'true');

		this._root.style.display = '';

		// Rebuild the per-step re-layout listeners.
		this._stepListeners.clear();
		// Keep focus in the target's logical subtree when the callout is rendered outside its popup.
		target.id ||= `spotlight-target-${generateUuid()}`;
		setParentFlowTo(this._root, target);
		const targetWindow = getWindow(this._container);
		const focusElement = options.focusTarget?.element ?? target;

		const observer = new this._resizeObserverCtor(() => this.scheduleLayout());
		observer.observe(target);
		observer.observe(this._container);
		this._stepListeners.add({ dispose: () => observer.disconnect() });

		this._stepListeners.add(addDisposableListener(targetWindow, EventType.RESIZE, () => this.scheduleLayout()));
		this._stepListeners.add(addDisposableListener(targetWindow, EventType.SCROLL, () => this.scheduleLayout(), true));
		// Without the backdrop, Escape elsewhere in the window belongs to the UI the user works in.
		if (externalUiParticipates && this._backdropVisible) {
			this._stepListeners.add(addDisposableListener(targetWindow, EventType.KEY_DOWN, event => {
				const eventTarget = event.target;
				if (!isHTMLElement(eventTarget) || this._root.contains(eventTarget) || target.contains(eventTarget) || focusElement.contains(eventTarget)) {
					return;
				}
				const keyboardEvent = new StandardKeyboardEvent(event);
				// Escape inside an additional element, such as a menu, closes that element rather than the tour.
				if (keyboardEvent.equals(KeyCode.Escape) && !options.additionalElements?.().some(element => element.contains(eventTarget))) {
					this._onDidSkip.fire(OnboardingDismissReason.EscapeKey);
				}
			}, true));
		}

		// ResizeObserver does not report position-only shifts caused by surrounding content.
		let previousRect = this._getHighlightRect(target);
		this._stepListeners.add(animate(targetWindow, () => {
			const rect = this._getHighlightRect(target);
			if (rect.left !== previousRect.left || rect.top !== previousRect.top || rect.width !== previousRect.width || rect.height !== previousRect.height) {
				previousRect = rect;
				this.layout();
			}
		}));

		// Cancel any pending scheduled frame when the step changes. Registered
		// once here (not per schedule) so high-frequency scroll/resize events
		// don't accumulate no-op disposables in `_stepListeners`.
		this._stepListeners.add(toDisposable(() => {
			this._scheduledLayout?.dispose();
			this._scheduledLayout = undefined;
		}));

		const additionalElements = options.additionalElements;
		if (additionalElements) {
			// Focus can move into the additional elements, so screen readers might not read the callout.
			status(localize('spotlight.stepAnnouncement', "{0}: {1}", content.title, this._description.textContent ?? ''));
			this._stepListeners.add(addDisposableGenericMouseDownListener(this._callout, event => {
				const activeElement = getActiveElement();
				if (activeElement && additionalElements().some(element => element.contains(activeElement))) {
					event.preventDefault();
				}
			}));
		}

		const advanceOnTargetClick = !!options.advanceOnTargetClick;
		const advanceOnly = options.advanceOnTargetClick === 'advanceOnly';
		const hideNext = options.hideNext ?? advanceOnTargetClick;
		this._nextButton.element.style.display = hideNext ? 'none' : '';
		if (advanceOnTargetClick) {
			const advanceAfterActivation = () => {
				const handle = targetWindow.setTimeout(() => {
					this._previousFocus = undefined;
					this._onDidClickNext.fire('target');
				});
				this._stepListeners.add(toDisposable(() => targetWindow.clearTimeout(handle)));
			};
			if (advanceOnly) {
				for (const eventType of [EventType.CLICK, TouchEventType.Tap]) {
					this._stepListeners.add(addDisposableListener(target, eventType, event => {
						event.preventDefault();
						event.stopImmediatePropagation();
						this._onDidClickNext.fire('target');
					}, true));
				}
			} else if (options.onDidActivateTarget) {
				this._stepListeners.add(options.onDidActivateTarget(advanceAfterActivation));
			} else {
				this._stepListeners.add(addDisposableListener(target, EventType.CLICK, advanceAfterActivation, true));
			}
		}
		if (advanceOnly) {
			const onTargetKey = (event: KeyboardEvent) => {
				const key = new StandardKeyboardEvent(event);
				if (key.equals(KeyCode.Enter) || key.equals(KeyCode.Space)) {
					event.preventDefault();
					event.stopImmediatePropagation();
					if (event.type === EventType.KEY_UP) {
						this._onDidClickNext.fire('target');
					}
				} else if (event.type === EventType.KEY_DOWN) {
					this._onKeyDown(event);
				}
			};
			this._stepListeners.add(addDisposableListener(focusElement, EventType.KEY_DOWN, onTargetKey, true));
			this._stepListeners.add(addDisposableListener(focusElement, EventType.KEY_UP, onTargetKey, true));
		} else if (options.allowTargetInteraction || advanceOnTargetClick || options.hideNext) {
			this._stepListeners.add(addDisposableListener(focusElement, EventType.KEY_DOWN, e => this._onKeyDown(e), true));
		}

		this.layout();

		// Move focus to the spotlighted control (so keyboard users can activate it
		// to advance) or, otherwise, into the callout's primary action. An explicit
		// focusEndTour wins, as the target may not be focusable.
		const closeButton = this._titleCloseButton && content.endTourLabel === undefined ? this._closeButton : undefined;
		if (!keepFocus) {
			this._focus(this._collectCalloutFocusable()[calloutFocusIndex] ?? (content.focusEndTour ? (closeButton ?? this._skipButton).element : hideNext ? focusElement : this._nextButton.element));
		}
	}

	/** Prevents duplicate activation while waiting for an action to be accepted. */
	setPrimaryActionEnabled(enabled: boolean): void {
		this._nextButton.enabled = enabled;
	}

	/**
	 * Shows or hides the dim backdrop around the highlight. The highlight ring and callout are unaffected.
	 * Without the backdrop the spotlight is non-modal: it blocks no clicks, leaves Escape outside the
	 * spotlight to the rest of the window, lets Tab leave the spotlight, and does not pull focus back
	 * when its target is replaced or the tour ends while the user works elsewhere. Takes effect the next
	 * time a step is shown.
	 */
	setBackdropVisible(visible: boolean): void {
		this._backdropVisible = visible;
		this._root.classList.toggle('no-backdrop', !visible);
	}

	/**
	 * Ends the tour with a compact close button at the end of the title's first line instead of
	 * the End Tour footer button, which then only shows for a custom {@link ISpotlightContent.endTourLabel}.
	 * Steps with such a label show no close button. Takes effect the next time a step is shown.
	 */
	setTitleCloseButton(enabled: boolean): void {
		this._titleCloseButton = enabled;
		this._root.classList.toggle('title-close-button', enabled);
		if (enabled && !this._closeButton) {
			// Hosted in the callout, the hover renders above the spotlight rather than under it.
			const elementHoverDelegate = getDefaultHoverDelegate('element');
			const hoverDelegate: IHoverDelegate = {
				get delay() { return elementHoverDelegate.delay; },
				placement: elementHoverDelegate.placement,
				showHover: (options, focus) => elementHoverDelegate.showHover({ ...options, container: this._callout }, focus),
				onDidHideHover: () => elementHoverDelegate.onDidHideHover?.(),
			};
			const closeButton = this._closeButton = this._register(new Button(this._header, {
				ariaLabel: localize('spotlight.endTour', "End Tour"),
				title: localize('spotlight.endTour.tooltip', "End Tour (Esc)"),
				hoverDelegate,
			}));
			closeButton.element.classList.add('spotlight-callout-close');
			closeButton.icon = Codicon.closeCompact;
			this._register(closeButton.onDidClick(() => this._onDidSkip.fire(OnboardingDismissReason.SkipButton)));
			this._register(closeButton.onDidEscape(() => this._onDidSkip.fire(OnboardingDismissReason.EscapeKey)));
		}
	}

	/** Hide the current step while another target is being resolved. */
	hide(): void {
		this._stepListeners.clear();
		this._root.style.display = 'none';
		this._root.classList.remove('target-overlay-visible');
		this._target = undefined;
		this._options = {};
	}

	/** Recompute the hole and callout positions for the current target. */
	layout(): void {
		const target = this._target;
		if (!target || this._root.style.display === 'none') {
			return;
		}

		const targetWindow = getWindow(this._container);
		const viewportWidth = targetWindow.document.documentElement.clientWidth;
		const viewportHeight = targetWindow.document.documentElement.clientHeight;

		const rect = target.getBoundingClientRect();
		if (!target.isConnected || rect.width === 0 || rect.height === 0) {
			this._calloutFocusIndex = this._collectCalloutFocusable().findIndex(element => element === getActiveElement());
			this._root.style.display = 'none';
			this._onDidLoseTarget.fire();
			return;
		}
		const highlight = this._getHighlightRect(target);
		const padding = this._options.padding ?? DEFAULT_HOLE_PADDING;
		const holeLeft = Math.max(0, highlight.left - padding);
		const holeTop = Math.max(0, highlight.top - padding);
		const holeWidth = Math.min(viewportWidth - holeLeft, highlight.width + padding * 2);
		const holeHeight = Math.min(viewportHeight - holeTop, highlight.height + padding * 2);

		this._hole.style.left = `${holeLeft}px`;
		this._hole.style.top = `${holeTop}px`;
		this._hole.style.width = `${holeWidth}px`;
		this._hole.style.height = `${holeHeight}px`;

		// When the target is interactive (explicitly, or because the step advances
		// on a target click), arrange the click blockers around the hole so events
		// inside it reach the underlying element. Without the backdrop nothing is blocked.
		if (!this._backdropVisible) {
			for (const blocker of this._blockers) {
				blocker.style.display = 'none';
			}
		} else if (this._options.allowTargetInteraction || this._options.advanceOnTargetClick) {
			const right = holeLeft + holeWidth;
			const bottom = holeTop + holeHeight;
			this._layoutBlocker(this._blockers[0], 0, 0, viewportWidth, holeTop);
			this._layoutBlocker(this._blockers[1], right, holeTop, viewportWidth - right, holeHeight);
			this._layoutBlocker(this._blockers[2], 0, bottom, viewportWidth, viewportHeight - bottom);
			this._layoutBlocker(this._blockers[3], 0, holeTop, holeLeft, holeHeight);
		} else {
			this._layoutBlocker(this._blockers[0], 0, 0, viewportWidth, viewportHeight);
			for (let i = 1; i < this._blockers.length; i++) {
				this._blockers[i].style.display = 'none';
			}
		}

		this._layoutCallout({ top: holeTop, left: holeLeft, width: holeWidth, height: holeHeight }, viewportWidth, viewportHeight);
	}

	/** The bounds that contain the target and every visible additional element. */
	private _getHighlightRect(target: HTMLElement): IRect {
		const rect = target.getBoundingClientRect();
		let { left, top, right, bottom } = rect;
		for (const element of this._options.additionalElements?.() ?? []) {
			const elementRect = element.isConnected ? element.getBoundingClientRect() : undefined;
			if (elementRect && elementRect.width > 0 && elementRect.height > 0) {
				left = Math.min(left, elementRect.left);
				top = Math.min(top, elementRect.top);
				right = Math.max(right, elementRect.right);
				bottom = Math.max(bottom, elementRect.bottom);
			}
		}
		return { left, top, width: right - left, height: bottom - top };
	}

	private _layoutBlocker(blocker: HTMLElement, left: number, top: number, width: number, height: number): void {
		blocker.style.display = '';
		blocker.style.left = `${left}px`;
		blocker.style.top = `${top}px`;
		blocker.style.right = 'auto';
		blocker.style.bottom = 'auto';
		blocker.style.width = `${Math.max(0, width)}px`;
		blocker.style.height = `${Math.max(0, height)}px`;
	}

	private _layoutCallout(anchor: IRect, viewportWidth: number, viewportHeight: number): void {
		const viewport: IRect = { top: 0, left: 0, width: viewportWidth, height: viewportHeight };
		const view = { width: this._callout.offsetWidth, height: this._callout.offsetHeight };

		const { anchorAxisAlignment, anchorPosition, anchorAlignment } = this._resolvePlacement(this._options.placement ?? 'auto');
		const result = layout2d(viewport, view, anchor, { anchorAxisAlignment, anchorPosition, anchorAlignment });

		const left = anchorAxisAlignment === AnchorAxisAlignment.VERTICAL ? this._centerCallout(anchor, view.width, viewportWidth) : result.left;
		const callout = { top: result.top, left, width: view.width, height: view.height };
		const pointerSide = this._getPointerSide(anchor, callout, anchorAxisAlignment);
		const offsetCallout = this._offsetCalloutForPointer(callout, pointerSide, viewportWidth, viewportHeight);

		this._callout.style.top = `${offsetCallout.top}px`;
		this._callout.style.left = `${offsetCallout.left}px`;
		this._layoutPointer(anchor, offsetCallout, pointerSide);
	}

	private _centerCallout(anchor: IRect, calloutWidth: number, viewportWidth: number): number {
		const centered = anchor.left + (anchor.width / 2) - (calloutWidth / 2);
		return Math.max(0, Math.min(centered, viewportWidth - calloutWidth));
	}

	private _getPointerSide(anchor: IRect, callout: IRect, anchorAxisAlignment: AnchorAxisAlignment): PointerSide {
		const targetCenterX = anchor.left + (anchor.width / 2);
		const targetCenterY = anchor.top + (anchor.height / 2);
		const calloutCenterX = callout.left + (callout.width / 2);
		const calloutCenterY = callout.top + (callout.height / 2);
		return anchorAxisAlignment === AnchorAxisAlignment.VERTICAL
			? calloutCenterY < targetCenterY ? 'bottom' : 'top'
			: calloutCenterX < targetCenterX ? 'right' : 'left';
	}

	private _offsetCalloutForPointer(callout: IRect, side: PointerSide, viewportWidth: number, viewportHeight: number): IRect {
		switch (side) {
			case 'bottom':
				return { ...callout, top: Math.max(0, callout.top - POINTER_GAP) };
			case 'top':
				return { ...callout, top: Math.min(viewportHeight - callout.height, callout.top + POINTER_GAP) };
			case 'right':
				return { ...callout, left: Math.max(0, callout.left - POINTER_GAP) };
			case 'left':
				return { ...callout, left: Math.min(viewportWidth - callout.width, callout.left + POINTER_GAP) };
		}
	}

	private _layoutPointer(anchor: IRect, callout: IRect, side: PointerSide): void {
		const targetCenterX = anchor.left + (anchor.width / 2);
		const targetCenterY = anchor.top + (anchor.height / 2);
		const pointerOffset = POINTER_SIZE / 2;

		this._pointer.classList.remove('top', 'right', 'bottom', 'left');
		this._pointer.classList.add(side);

		if (side === 'top' || side === 'bottom') {
			const pointerCenterX = this._clamp(targetCenterX, callout.left + POINTER_EDGE_MARGIN, callout.left + callout.width - POINTER_EDGE_MARGIN);
			this._callout.style.setProperty('--spotlight-pointer-offset', `${pointerCenterX - callout.left}px`);
			this._pointer.style.left = `${pointerCenterX - pointerOffset}px`;
			this._pointer.style.top = `${side === 'bottom' ? callout.top + callout.height - pointerOffset : callout.top - pointerOffset}px`;
			return;
		}

		const pointerCenterY = this._clamp(targetCenterY, callout.top + POINTER_EDGE_MARGIN, callout.top + callout.height - POINTER_EDGE_MARGIN);
		this._callout.style.setProperty('--spotlight-pointer-offset', `${pointerCenterY - callout.top}px`);
		this._pointer.style.left = `${side === 'right' ? callout.left + callout.width - pointerOffset : callout.left - pointerOffset}px`;
		this._pointer.style.top = `${pointerCenterY - pointerOffset}px`;
	}

	private _clamp(value: number, min: number, max: number): number {
		return Math.max(min, Math.min(value, max));
	}

	private _resolvePlacement(placement: SpotlightPlacement): { anchorAxisAlignment: AnchorAxisAlignment; anchorPosition: AnchorPosition; anchorAlignment: AnchorAlignment } {
		switch (placement) {
			case 'above':
				return { anchorAxisAlignment: AnchorAxisAlignment.VERTICAL, anchorPosition: AnchorPosition.ABOVE, anchorAlignment: AnchorAlignment.LEFT };
			case 'left':
				return { anchorAxisAlignment: AnchorAxisAlignment.HORIZONTAL, anchorPosition: AnchorPosition.BELOW, anchorAlignment: AnchorAlignment.RIGHT };
			case 'right':
				return { anchorAxisAlignment: AnchorAxisAlignment.HORIZONTAL, anchorPosition: AnchorPosition.BELOW, anchorAlignment: AnchorAlignment.LEFT };
			case 'below':
			case 'auto':
			default:
				return { anchorAxisAlignment: AnchorAxisAlignment.VERTICAL, anchorPosition: AnchorPosition.BELOW, anchorAlignment: AnchorAlignment.LEFT };
		}
	}

	private _renderContent(content: ISpotlightContent): void {
		this._title.textContent = content.title;

		this._descriptionRenderStore.clear();
		this._description.replaceChildren();
		if (isMarkdownString(content.description)) {
			const rendered = this._descriptionRenderStore.add(renderMarkdown(content.description, { actionHandler: content.onDidClickLink }));
			this._description.appendChild(rendered.element);
		} else {
			this._description.textContent = content.description;
		}

		this._counter.textContent = content.stepCount > 1
			? localize('spotlight.counter', "{0} of {1}", content.stepIndex + 1, content.stepCount)
			: '';

		const endTourLabel = content.endTourLabel ?? (this._titleCloseButton ? undefined : localize('spotlight.endTour', "End Tour"));
		this._skipButton.element.style.display = endTourLabel === undefined || (content.isLastStep && !content.showEndTour) ? 'none' : '';
		// A custom label makes ending the tour a choice, which the close button must not take.
		if (this._closeButton) {
			this._closeButton.element.style.display = content.endTourLabel === undefined ? '' : 'none';
		}
		if (endTourLabel !== undefined) {
			this._skipButton.label = endTourLabel;
			this._skipButton.setTitle(content.endTourLabel
				? localize('spotlight.endTour.customTooltip', "{0} (Esc)", content.endTourLabel)
				: localize('spotlight.endTour.tooltip', "End Tour (Esc)"));
		}
		this._backButton.element.style.display = content.canGoBack ? '' : 'none';
		this._nextButton.label = content.nextButtonLabel ?? (content.isLastStep
			? localize('spotlight.done', "Done")
			: localize('spotlight.next', "Next"));
	}

	private _onKeyDown(e: KeyboardEvent): void {
		const event = new StandardKeyboardEvent(e);
		if (event.equals(KeyCode.Escape)) {
			event.stopPropagation();
			event.preventDefault();
			this._onDidSkip.fire(OnboardingDismissReason.EscapeKey);
			return;
		}

		if (event.equals(KeyCode.Tab) || event.equals(KeyMod.Shift | KeyCode.Tab)) {
			this._moveFocus(event);
		}
	}

	/**
	 * Moves focus between the spotlighted target and the callout, which are far apart in DOM order.
	 * With the backdrop it wraps around as a focus trap; without it, Tab leaves the spotlight at either end.
	 */
	private _moveFocus(event: StandardKeyboardEvent): void {
		const focusable = this._collectFocusable();
		if (focusable.length === 0) {
			return;
		}

		const active = getActiveElement();
		const currentIndex = focusable.findIndex(element => element === active);

		// When focus isn't currently on a tracked element (e.g. it landed on the
		// callout container itself), start from the appropriate end so Tab goes to
		// the first element and Shift+Tab to the last.
		let nextIndex: number;
		if (currentIndex === -1) {
			nextIndex = event.shiftKey ? focusable.length - 1 : 0;
		} else {
			nextIndex = currentIndex + (event.shiftKey ? -1 : 1);
			if (nextIndex < 0 || nextIndex >= focusable.length) {
				if (!this._backdropVisible) {
					return;
				}
				nextIndex = (nextIndex + focusable.length) % focusable.length;
			}
		}

		event.preventDefault();
		event.stopPropagation();
		this._focus(focusable[nextIndex]);
	}

	private _focus(element: HTMLElement): void {
		if (this._options.focusTarget?.element === element) {
			this._options.focusTarget.focus();
		} else {
			element.focus();
		}
	}

	/**
	 * The focusable elements that Tab moves between, in DOM order: the
	 * spotlighted target (when it is interactive or the Next button is hidden), then any
	 * interactive content in the (possibly markdown) description, then the visible
	 * action buttons. Including the target keeps the spotlighted control
	 * keyboard-reachable, and querying the description keeps markdown links
	 * reachable despite `aria-modal`.
	 */
	private _collectFocusable(): HTMLElement[] {
		const targetFocusables = (this._options.allowTargetInteraction || this._options.advanceOnTargetClick || this._options.hideNext) && this._target
			? this._options.focusTarget ? [this._options.focusTarget.element]
				// eslint-disable-next-line eslint-js/no-restricted-syntax -- querying the spotlight target subtree for focusable controls
				: [this._target, ...this._target.querySelectorAll<HTMLElement>('a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])')]
			: [];
		return [...targetFocusables.filter(element => this._isTabbable(element)), ...this._collectCalloutFocusable()];
	}

	private _collectCalloutFocusable(): HTMLElement[] {
		const descriptionFocusables = Array.from(
			// eslint-disable-next-line eslint-js/no-restricted-syntax -- querying our own callout description subtree for focusable markdown content (e.g. links)
			this._description.querySelectorAll<HTMLElement>('a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])')
		);
		const buttons = [this._skipButton, this._backButton, this._nextButton]
			.filter(button => button.element.style.display !== 'none')
			.map(button => button.element);
		const closeButton = this._closeButton ? [this._closeButton.element] : [];
		return [...closeButton, ...descriptionFocusables, ...buttons].filter(element => this._isTabbable(element));
	}

	private _isTabbable(element: HTMLElement): boolean {
		if (!element.isConnected || element.getAttribute('aria-hidden') === 'true' || element.tabIndex === -1 || element.hasAttribute('disabled')) {
			return false;
		}
		const style = getWindow(this._container).getComputedStyle(element);
		return style.display !== 'none' && style.visibility !== 'hidden';
	}

	scheduleLayout(): void {
		if (this._scheduledLayout) {
			return;
		}
		const targetWindow = getWindow(this._container);
		this._scheduledLayout = scheduleAtNextAnimationFrame(targetWindow, () => {
			this._scheduledLayout = undefined;
			this.layout();
		});
	}

	/** Whether a non-modal spotlight has focus somewhere else in the window, outside the callout and its target. */
	private _isFocusElsewhere(): boolean {
		const active = getActiveElement();
		if (this._backdropVisible || !isHTMLElement(active) || active === active.ownerDocument.body) {
			return false;
		}
		return !this._root.contains(active) && !this._lastTargets.some(element => element.contains(active));
	}

	private _restoreFocus(): void {
		const previous = this._previousFocus;
		this._previousFocus = undefined;
		if (previous && previous.isConnected && !this._isFocusElsewhere()) {
			previous.focus();
		}
	}

	override dispose(): void {
		this._root.remove();
		super.dispose();
	}
}
