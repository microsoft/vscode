/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export type CodeWindow = Window & typeof globalThis & {
	readonly vscodeWindowId: number;
};

export function ensureCodeWindow(targetWindow: Window, fallbackWindowId: number): asserts targetWindow is CodeWindow {
	const codeWindow = targetWindow as Partial<CodeWindow>;

	if (typeof codeWindow.vscodeWindowId !== 'number') {
		Object.defineProperty(codeWindow, 'vscodeWindowId', {
			get: () => fallbackWindowId
		});
	}
}

// eslint-disable-next-line no-restricted-globals
export const mainWindow = window as CodeWindow;

/**
 * @deprecated to support multi-window scenarios, use `DOM.mainWindow`
 * if you target the main global window or use helpers such as `DOM.getWindow()`
 * or `DOM.getActiveWindow()` to obtain the correct window for the context you are in.
 */
export const $window = mainWindow;

export function isAuxiliaryWindow(obj: Window): obj is CodeWindow {
	if (obj === mainWindow) {
		return false;
	}

	const candidate = obj as CodeWindow | undefined;

	return typeof candidate?.vscodeWindowId === 'number';
}
