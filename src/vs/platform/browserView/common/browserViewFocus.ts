/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The focus a browser view reports to the workbench: its page has focus while its window does. The page keeps focus in
 * its window when another window is activated, without a blur of its own, but the workbench must not then take the view
 * for focused, which would make the view's window the active one.
 */
export class BrowserViewReportedFocus {

	private _viewFocused: boolean;
	private _windowFocused: boolean;
	private _reported: boolean;

	constructor(viewFocused: boolean, windowFocused: boolean, private readonly _report: (focused: boolean) => void) {
		this._viewFocused = viewFocused;
		this._windowFocused = windowFocused;
		this._reported = viewFocused && windowFocused;
	}

	/** Whether the view reports focus. */
	get focused(): boolean {
		return this._reported;
	}

	/** The page of the view gained or lost focus within its window. */
	setViewFocused(focused: boolean): void {
		this._viewFocused = focused;
		this._update();
	}

	/** The window of the view was activated or deactivated, or the view moved to a window that is, or is not, active. */
	setWindowFocused(focused: boolean): void {
		this._windowFocused = focused;
		this._update();
	}

	private _update(): void {
		const focused = this._viewFocused && this._windowFocused;
		if (focused !== this._reported) {
			this._reported = focused;
			this._report(focused);
		}
	}
}
