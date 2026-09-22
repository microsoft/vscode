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

export interface IOnboardingTargetOptions {
	/** Opens or expands the target before its spotlight step is shown. */
	readonly open?: () => Promise<void> | void;
	/** Identifies the prepared UI instance that owns this target. */
	readonly scope?: string | (() => string | undefined);
}

export interface IOnboardingTarget {
	readonly element: HTMLElement;
	readonly open?: () => Promise<void> | void;
}

interface IOnboardingTargetRegistration {
	readonly id: string;
	readonly options: IOnboardingTargetOptions;
}

const onboardingTargetRegistrations = new WeakMap<HTMLElement, IOnboardingTargetRegistration>();
const onboardingTargetProviders = new Map<string, { readonly resolve: (scope: string | undefined) => IOnboardingTarget | undefined }>();

/** Registers an adapter that resolves a control through its owning feature's API. */
export function registerOnboardingTargetProvider(id: string, provider: (scope: string | undefined) => IOnboardingTarget | undefined): IDisposable {
	if (onboardingTargetProviders.has(id)) {
		throw new Error(`An onboarding target provider for '${id}' is already registered.`);
	}
	const registration = { resolve: provider };
	onboardingTargetProviders.set(id, registration);
	return toDisposable(() => {
		if (onboardingTargetProviders.get(id) === registration) {
			onboardingTargetProviders.delete(id);
		}
	});
}

export function resolveOnboardingTarget(targetWindow: Window, id: string, scope?: string): IOnboardingTarget | undefined {
	const provider = onboardingTargetProviders.get(id);
	if (provider) {
		const target = provider.resolve(scope);
		if (!target || !isVisibleOnboardingTarget(targetWindow, target.element)) {
			return undefined;
		}
		return {
			element: target.element,
			open: () => {
				if (onboardingTargetProviders.get(id) === provider) {
					const current = provider.resolve(scope);
					if (current?.element === target.element && isVisibleOnboardingTarget(targetWindow, current.element)) {
						return current.open?.();
					}
				}
				return undefined;
			},
		};
	}
	const element = findOnboardingTarget(targetWindow, id, scope);
	return element ? { element, open: () => openOnboardingTarget(element) } : undefined;
}

/**
 * Marks `element` as the onboarding target identified by `id`.
 *
 * @returns A disposable that removes the attribute again.
 */
export function markOnboardingTarget(element: HTMLElement, id: string, options: IOnboardingTargetOptions = {}): IDisposable {
	const registration = { id, options };
	element.setAttribute(ONBOARDING_TARGET_ATTR, id);
	onboardingTargetRegistrations.set(element, registration);
	return toDisposable(() => {
		if (onboardingTargetRegistrations.get(element) === registration) {
			onboardingTargetRegistrations.delete(element);
			element.removeAttribute(ONBOARDING_TARGET_ATTR);
		}
	});
}

/** Opens or expands a target through the behavior registered by its owner. */
export function openOnboardingTarget(element: HTMLElement): Promise<void> | void {
	return onboardingTargetRegistrations.get(element)?.options.open?.();
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
export function findOnboardingTarget(targetWindow: Window, id: string, scope?: string): HTMLElement | undefined {
	const selector = `[${ONBOARDING_TARGET_ATTR}="${CSS.escape(id)}"]`;
	// eslint-disable-next-line no-restricted-syntax -- matching only our own onboarding attribute (never foreign classes/structure) is the whole point of this helper
	const targets = Array.from(targetWindow.document.querySelectorAll<HTMLElement>(selector));
	return targets.find(target => isVisibleOnboardingTarget(targetWindow, target) && matchesScope(target, scope));
}

function matchesScope(target: HTMLElement, scope: string | undefined): boolean {
	if (scope === undefined) {
		return true;
	}
	const registeredScope = onboardingTargetRegistrations.get(target)?.options.scope;
	return (typeof registeredScope === 'function' ? registeredScope() : registeredScope) === scope;
}

function isVisibleOnboardingTarget(targetWindow: Window, target: HTMLElement): boolean {
	if (!target.isConnected || target.ownerDocument !== targetWindow.document) {
		return false;
	}
	const style = targetWindow.getComputedStyle(target);
	if (style.display === 'none' || style.visibility === 'hidden') {
		return false;
	}
	const rect = target.getBoundingClientRect();
	return rect.width > 0 && rect.height > 0;
}
