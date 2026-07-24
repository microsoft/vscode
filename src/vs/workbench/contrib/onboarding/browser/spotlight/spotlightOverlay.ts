/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, addDisposableListener, append, EventType, getActiveElement, getWindow, isHTMLElement, scheduleAtNextAnimationFrame } from '../../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../../base/browser/keyboardEvent.js';
import { Button } from '../../../../../base/browser/ui/button/button.js';
import { KeyCode, KeyMod } from '../../../../../base/common/keyCodes.js';
import { Disposable, DisposableStore, IDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { IMarkdownString, isMarkdownString } from '../../../../../base/common/htmlContent.js';
import { AnchorAlignment, AnchorAxisAlignment, AnchorPosition, IRect, layout2d } from '../../../../../base/common/layout.js';
import { renderMarkdown } from '../../../../../base/browser/markdownRenderer.js';
import { defaultButtonStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { localize } from '../../../../../nls.js';
import { SpotlightPlacement } from './spotlightTypes.js';
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
	/** Zero-based index of the current step. */
	readonly stepIndex: number;
	/** Total number of steps in the tour. */
	readonly stepCount: number;
	/** Whether a "Back" action should be offered. */
	readonly canGoBack: boolean;
	/** Whether this is the final step (the primary button becomes "Done"). */
	readonly isLastStep: boolean;
}

/** Options controlling how a step is shown. */
export interface ISpotlightShowOptions {
	readonly placement?: SpotlightPlacement;
	readonly allowTargetInteraction?: boolean;
	readonly padding?: number;
	readonly hideNext?: boolean;
	readonly targetOverlayVisible?: boolean;
	/**
	 * When set, the step advances (fires `onDidClickNext`) when the user clicks
	 * the spotlighted target itself. The "Next" button is hidden and the target
	 * is kept interactive so the user can press it to continue.
	 */
	readonly advanceOnTargetClick?: boolean;
}

/**
 * A pure-DOM spotlight overlay: dims the window, cuts a highlight hole around a
 * target element and shows an anchored callout. It owns no VS Code services so
 * it can be unit-tested and reused. Scheduling and content come from the
 * spotlight presentation.
 */
export class SpotlightOverlay extends Disposable {

	private readonly _root: HTMLElement;
	private readonly _blockers: readonly HTMLElement[];
	private readonly _hole: HTMLElement;
	private readonly _pointer: HTMLElement;
	private readonly _callout: HTMLElement;

	private readonly _title: HTMLElement;
	private readonly _description: HTMLElement;
	private readonly _counter: HTMLElement;
	private readonly _descriptionRenderStore = this._register(new DisposableStore());

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

	private _target: HTMLElement | undefined;
	private _options: ISpotlightShowOptions = {};
	private _hasShown = false;
	private _previousFocus: HTMLElement | undefined;
	private _scheduledLayout: IDisposable | undefined;

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

		const header = append(this._callout, $('.spotlight-callout-header'));
		this._title = append(header, $('h2.spotlight-callout-title'));
		this._title.id = 'spotlight-callout-title';
		this._callout.setAttribute('aria-labelledby', this._title.id);

		this._description = append(this._callout, $('.spotlight-callout-description'));
		this._description.id = 'spotlight-callout-description';
		this._callout.setAttribute('aria-describedby', this._description.id);

		const footer = append(this._callout, $('.spotlight-callout-footer'));
		this._counter = append(footer, $('.spotlight-callout-counter'));
		const actions = append(footer, $('.spotlight-callout-actions'));

		this._skipButton = this._register(new Button(actions, { ...defaultButtonStyles, secondary: true }));
		this._skipButton.label = localize('spotlight.endTour', "End Tour");
		this._skipButton.setTitle(localize('spotlight.endTour.tooltip', "End Tour (Esc)"));
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

		// Keyboard handling on the callout: Esc ends the tour, focus is trapped within.
		this._register(addDisposableListener(this._callout, EventType.KEY_DOWN, e => this._onKeyDown(e)));

		this._register({ dispose: () => this._restoreFocus() });
	}

	/** Show `content` spotlighting `target`. */
	show(target: HTMLElement, content: ISpotlightContent, options: ISpotlightShowOptions = {}): void {
		if (!this._hasShown) {
			this._hasShown = true;
			this._previousFocus = isHTMLElement(getActiveElement()) ? getActiveElement() as HTMLElement : undefined;
		}

		this._target = target;
		this._options = options;
		this._renderContent(content);
		const externalUiParticipates = !!options.targetOverlayVisible || !!options.allowTargetInteraction || !!options.advanceOnTargetClick || !!options.hideNext;
		this._root.classList.toggle('target-overlay-visible', externalUiParticipates);
		this._callout.setAttribute('aria-modal', externalUiParticipates ? 'false' : 'true');

		this._root.style.display = '';

		// Rebuild the per-step re-layout listeners.
		this._stepListeners.clear();
		const targetWindow = getWindow(this._container);

		const observer = new this._resizeObserverCtor(() => this.scheduleLayout());
		observer.observe(target);
		observer.observe(this._container);
		this._stepListeners.add({ dispose: () => observer.disconnect() });

		this._stepListeners.add(addDisposableListener(targetWindow, EventType.RESIZE, () => this.scheduleLayout()));
		this._stepListeners.add(addDisposableListener(targetWindow, EventType.SCROLL, () => this.scheduleLayout(), true));

		// Cancel any pending scheduled frame when the step changes. Registered
		// once here (not per schedule) so high-frequency scroll/resize events
		// don't accumulate no-op disposables in `_stepListeners`.
		this._stepListeners.add(toDisposable(() => {
			this._scheduledLayout?.dispose();
			this._scheduledLayout = undefined;
		}));

		// When the step advances by pressing the target, hide the Next button and
		// advance on a click of the (interactive) target instead. The target is
		// kept keyboard-reachable: it joins the focus trap (see `_collectFocusable`)
		// and we route Tab/Esc from it through the same handler, so keyboard-only
		// users can focus the spotlighted control and activate it to advance.
		const advanceOnTargetClick = !!options.advanceOnTargetClick;
		const hideNext = advanceOnTargetClick || !!options.hideNext;
		this._nextButton.element.style.display = hideNext ? 'none' : '';
		if (advanceOnTargetClick) {
			this._stepListeners.add(addDisposableListener(target, EventType.CLICK, () => this._onDidClickNext.fire('target')));
		}
		if (options.allowTargetInteraction || advanceOnTargetClick || options.hideNext) {
			this._stepListeners.add(addDisposableListener(target, EventType.KEY_DOWN, e => this._onKeyDown(e)));
		}

		this.layout();

		// Move focus to the spotlighted control (so keyboard users can activate it
		// to advance) or, otherwise, into the callout's primary action.
		(hideNext ? target : this._nextButton.element).focus();
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
		const padding = this._options.padding ?? DEFAULT_HOLE_PADDING;
		const holeLeft = Math.max(0, rect.left - padding);
		const holeTop = Math.max(0, rect.top - padding);
		const holeWidth = Math.min(viewportWidth - holeLeft, rect.width + padding * 2);
		const holeHeight = Math.min(viewportHeight - holeTop, rect.height + padding * 2);

		this._hole.style.left = `${holeLeft}px`;
		this._hole.style.top = `${holeTop}px`;
		this._hole.style.width = `${holeWidth}px`;
		this._hole.style.height = `${holeHeight}px`;

		// When the target is interactive (explicitly, or because the step advances
		// on a target click), arrange the click blockers around the hole so events
		// inside it reach the underlying element.
		if (this._options.allowTargetInteraction || this._options.advanceOnTargetClick) {
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
			this._pointer.style.left = `${pointerCenterX - pointerOffset}px`;
			this._pointer.style.top = `${side === 'bottom' ? callout.top + callout.height - pointerOffset : callout.top - pointerOffset}px`;
			return;
		}

		const pointerCenterY = this._clamp(targetCenterY, callout.top + POINTER_EDGE_MARGIN, callout.top + callout.height - POINTER_EDGE_MARGIN);
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
			const rendered = this._descriptionRenderStore.add(renderMarkdown(content.description));
			this._description.appendChild(rendered.element);
		} else {
			this._description.textContent = content.description;
		}

		this._counter.textContent = localize('spotlight.counter', "{0} of {1}", content.stepIndex + 1, content.stepCount);

		this._backButton.element.style.display = content.canGoBack ? '' : 'none';
		this._nextButton.label = content.isLastStep
			? localize('spotlight.done', "Done")
			: localize('spotlight.next', "Next");
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
			this._trapFocus(event);
		}
	}

	private _trapFocus(event: StandardKeyboardEvent): void {
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
			const delta = event.shiftKey ? -1 : 1;
			nextIndex = (currentIndex + delta + focusable.length) % focusable.length;
		}

		event.preventDefault();
		event.stopPropagation();
		focusable[nextIndex].focus();
	}

	/**
	 * The focusable elements participating in the focus trap, in DOM order: the
	 * spotlighted target (when it is interactive or the Next button is hidden), then any
	 * interactive content in the (possibly markdown) description, then the visible
	 * action buttons. Including the target keeps the spotlighted control
	 * keyboard-reachable, and querying the description keeps markdown links
	 * reachable despite `aria-modal`.
	 */
	private _collectFocusable(): HTMLElement[] {
		const targetFocusables = (this._options.allowTargetInteraction || this._options.advanceOnTargetClick || this._options.hideNext) && this._target
			// eslint-disable-next-line no-restricted-syntax -- querying the spotlight target subtree for focusable controls
			? [this._target, ...this._target.querySelectorAll<HTMLElement>('a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])')]
			: [];
		const descriptionFocusables = Array.from(
			// eslint-disable-next-line no-restricted-syntax -- querying our own callout description subtree for focusable markdown content (e.g. links)
			this._description.querySelectorAll<HTMLElement>('a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])')
		);
		const buttons = [this._skipButton, this._backButton, this._nextButton]
			.filter(button => button.element.style.display !== 'none')
			.map(button => button.element);
		return [...targetFocusables, ...descriptionFocusables, ...buttons].filter(element => this._isTabbable(element));
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

	private _restoreFocus(): void {
		const previous = this._previousFocus;
		this._previousFocus = undefined;
		if (previous && previous.isConnected) {
			previous.focus();
		}
	}

	override dispose(): void {
		this._root.remove();
		super.dispose();
	}
}
