/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';

/**
 * Attribute used to mark a DOM element as an onboarding spotlight target.
 *
 * Components opt in by tagging their *own* element with this attribute. Tours
 * reference the id; they never reach into another component's markup or CSS
 * classes to locate a target (see the sessions "DOM Traversal & Intent" rule).
 */
export const ONBOARDING_TARGET_ATTR = 'data-onboarding-id';

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
	return targetWindow.document.querySelector<HTMLElement>(selector) ?? undefined;
}
