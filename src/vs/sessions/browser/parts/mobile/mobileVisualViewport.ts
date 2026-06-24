/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../base/browser/dom.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { derived, IObservable, observableValue } from '../../../../base/common/observable.js';
import { IContextKey, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { ILayoutService } from '../../../../platform/layout/browser/layoutService.js';
import { KeyboardVisibleContext } from '../../../common/contextkeys.js';

/**
 * Threshold (in CSS pixels) above which the visual viewport delta is
 * treated as a virtual keyboard being visible. A few dozen pixels can
 * appear briefly during URL-bar collapse / address-bar shrink, so we
 * require a clearly keyboard-sized delta before flipping the context.
 */
export const KEYBOARD_VISIBLE_THRESHOLD_PX = 50;

/**
 * CSS custom property exposed on the workbench main container that
 * reflects the current virtual keyboard height in pixels (e.g.
 * `--vscode-keyboard-height: 320px`). Consumers can read this from
 * CSS (`bottom: var(--vscode-keyboard-height, 0px)`) when they need
 * to keep UI above the keyboard without subscribing to the observable.
 */
const KEYBOARD_HEIGHT_CSS_VAR = '--vscode-keyboard-height';

/**
 * Service decorator for {@link MobileVisualViewport}. Consumers inject
 * this to observe the virtual keyboard height of the agents workbench
 * window or to gate behaviour on whether the keyboard is currently
 * visible.
 */
export const IMobileVisualViewport = createDecorator<IMobileVisualViewport>('mobileVisualViewport');

/**
 * Service interface for {@link MobileVisualViewport}. See the class for
 * a full description of the publishing surface.
 */
export interface IMobileVisualViewport {
	readonly _serviceBrand: undefined;

	/**
	 * Observable: the current virtual keyboard height in CSS pixels,
	 * computed as `max(0, window.innerHeight - visualViewport.height)`.
	 * Always `0` on platforms without `visualViewport` support.
	 */
	readonly keyboardHeight: IObservable<number>;

	/**
	 * Observable: `true` when {@link keyboardHeight} exceeds
	 * {@link KEYBOARD_VISIBLE_THRESHOLD_PX}. Cheaper for consumers than
	 * subscribing to `keyboardHeight` directly when they only care
	 * about the keyboard-visible transition (it only fires on the
	 * boolean flip, not on every height micro-change during the
	 * keyboard open/close animation).
	 */
	readonly isKeyboardVisible: IObservable<boolean>;
}

/**
 * Tracks the virtual keyboard height of the agents workbench window via
 * the `window.visualViewport` API and exposes it to consumers in three
 * complementary forms:
 *
 *  1. As an {@link IObservable} (`keyboardHeight`) for code that wants
 *     to react to keyboard changes via `autorun` / `derived`.
 *  2. As a CSS custom property (`--vscode-keyboard-height`) set on the
 *     workbench main container, so styles can position fixed UI above
 *     the keyboard without touching JavaScript at all.
 *  3. As a reactive {@link KeyboardVisibleContext} context key (`true`
 *     when the keyboard height exceeds {@link KEYBOARD_VISIBLE_THRESHOLD_PX}),
 *     so `when:` clauses on commands/menus can adapt to the keyboard.
 *
 * # Why this helper exists
 *
 * On iOS Safari (and to a lesser extent some Android browsers), the
 * *layout viewport* — what `vh` units, `window.innerHeight`, and
 * `position: fixed` resolve against — does NOT shrink when the virtual
 * keyboard opens. Only the *visual viewport* (the actually visible
 * area) shrinks. As a consequence, naive layouts that anchor to the
 * bottom of the layout viewport end up hidden behind the keyboard.
 *
 * The standard `window.visualViewport` API exposes the real visible
 * area and fires `resize` / `scroll` events when the keyboard opens
 * or closes. This helper subscribes to those events once for the
 * lifetime of the workbench window and publishes the keyboard height
 * (`max(0, window.innerHeight - visualViewport.height)`).
 *
 * # Auxiliary windows
 *
 * The helper uses {@link DOM.getWindow} to resolve the correct window
 * object for the layout-service main container, so it works correctly
 * when the workbench is hosted inside an auxiliary window (each aux
 * window has its own `visualViewport`).
 *
 * # Graceful degradation
 *
 * Browsers that do not implement `visualViewport` (very old engines,
 * some embedded webviews) get a constant `keyboardHeight` of `0`, no
 * CSS variable update, and a context key that stays `false`. Consumers
 * never need to check for the API themselves.
 */
export class MobileVisualViewport extends Disposable implements IMobileVisualViewport {

	declare readonly _serviceBrand: undefined;

	private readonly _keyboardHeight = observableValue<number>(this, 0);

	readonly keyboardHeight: IObservable<number> = this._keyboardHeight;

	readonly isKeyboardVisible: IObservable<boolean> = derived(this, reader =>
		this._keyboardHeight.read(reader) > KEYBOARD_VISIBLE_THRESHOLD_PX
	);

	private readonly _keyboardVisibleCtx: IContextKey<boolean>;
	private readonly mainContainer: HTMLElement;

	constructor(
		@IContextKeyService contextKeyService: IContextKeyService,
		@ILayoutService layoutService: ILayoutService,
	) {
		super();

		this.mainContainer = layoutService.mainContainer;
		this._keyboardVisibleCtx = KeyboardVisibleContext.bindTo(contextKeyService);

		const targetWindow = DOM.getWindow(this.mainContainer);
		const visualViewport = targetWindow.visualViewport;

		if (!visualViewport) {
			// No visualViewport API available — keep observables/context
			// keys at their default zero/false state.
			return;
		}

		const update = () => {
			const height = Math.max(0, targetWindow.innerHeight - visualViewport.height);
			if (this._keyboardHeight.get() !== height) {
				this._keyboardHeight.set(height, undefined);
			}
			this.mainContainer.style.setProperty(KEYBOARD_HEIGHT_CSS_VAR, `${height}px`);
			this._keyboardVisibleCtx.set(height > KEYBOARD_VISIBLE_THRESHOLD_PX);
		};

		this._register(DOM.addDisposableListener(visualViewport, 'resize', update));
		this._register(DOM.addDisposableListener(visualViewport, 'scroll', update));

		// Seed the initial value so consumers see the current state on
		// startup (e.g., the workbench was opened while the keyboard
		// was already visible).
		update();
	}

	override dispose(): void {
		this.mainContainer.style.removeProperty(KEYBOARD_HEIGHT_CSS_VAR);
		this._keyboardVisibleCtx.reset();
		super.dispose();
	}
}

registerSingleton(IMobileVisualViewport, MobileVisualViewport, InstantiationType.Eager);
