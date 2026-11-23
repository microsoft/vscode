/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, IDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';

type RegisterSheet = (dismiss: () => void) => IDisposable;

const navigationScopes = new WeakMap<HTMLElement, RegisterSheet>();

/** Connects sheets in a workbench scope to its navigation owner without importing their presentation. */
export function registerMobileSheetNavigation(scope: HTMLElement, registerSheet: RegisterSheet): IDisposable {
	navigationScopes.set(scope, registerSheet);
	return toDisposable(() => {
		if (navigationScopes.get(scope) === registerSheet) {
			navigationScopes.delete(scope);
		}
	});
}

/** Tracks a sheet for its open lifetime using the nearest registered workbench scope. */
export function trackMobileSheetNavigation(container: HTMLElement, dismiss: () => void): IDisposable {
	for (let scope: HTMLElement | null = container; scope; scope = scope.parentElement) {
		const registerSheet = navigationScopes.get(scope);
		if (registerSheet) {
			return registerSheet(dismiss);
		}
	}
	return Disposable.None;
}
