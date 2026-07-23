/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import '../media/onboardingTarget.css';

/**
 * Attribute used to mark a DOM element as an onboarding spotlight target.
 *
 * Components opt in by tagging their *own* element with this attribute. Tours
 * reference the id; they never reach into another component's markup or CSS
 * classes to locate a target (see the sessions "DOM Traversal & Intent" rule).
 */
export const ONBOARDING_TARGET_ATTR = 'data-onboarding-id';

export const ONBOARDING_TARGET_PULSE_CLASS = 'onboarding-target-pulse';

/**
 * Marks `element` as the onboarding target identified by `id`.
 *
 * @returns A disposable that removes the attribute again.
 */
export function markOnboardingTarget(element: HTMLElement, id: string): IDisposable {
	element.setAttribute(ONBOARDING_TARGET_ATTR, id);
	return toDisposable(() => {
		if (element.getAttribute(ONBOARDING_TARGET_ATTR) === id) {
			element.removeAttribute(ONBOARDING_TARGET_ATTR);
		}
	});
}

/**
 * Applies the standard onboarding pulse treatment to `element`.
 *
 * @returns A disposable that removes the pulse again.
 */
export function pulseOnboardingTarget(element: HTMLElement): IDisposable {
	element.classList.add(ONBOARDING_TARGET_PULSE_CLASS);
	return toDisposable(() => element.classList.remove(ONBOARDING_TARGET_PULSE_CLASS));
}

/**
 * Resolves the element marked with the given onboarding target id within the
 * provided window's document. Returns `undefined` if no such element exists
 * (e.g. the feature is not currently rendered).
 *
 * This is the *only* place onboarding queries the DOM, and it matches solely on
 * the onboarding attribute — never on foreign classes or structure.
 */
export function findOnboardingTarget(targetWindow: Window, id: string): HTMLElement | undefined {
	const selector = `[${ONBOARDING_TARGET_ATTR}="${CSS.escape(id)}"]`;
	// eslint-disable-next-line no-restricted-syntax -- matching only our own onboarding attribute (never foreign classes/structure) is the whole point of this helper
	const targets = Array.from(targetWindow.document.querySelectorAll<HTMLElement>(selector));
	return targets.find(target => isVisibleOnboardingTarget(targetWindow, target));
}

function isVisibleOnboardingTarget(targetWindow: Window, target: HTMLElement): boolean {
	if (!target.isConnected) {
		return false;
	}
	const style = targetWindow.getComputedStyle(target);
	if (style.display === 'none' || style.visibility === 'hidden') {
		return false;
	}
	const rect = target.getBoundingClientRect();
	return rect.width > 0 && rect.height > 0;
}
