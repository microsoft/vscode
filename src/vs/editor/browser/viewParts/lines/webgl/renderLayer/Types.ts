/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/**
 * Copyright (c) 2017 The xterm.js authors. All rights reserved.
 * @license MIT
 */

import { IDisposable } from 'vs/base/common/lifecycle';
import { IColorSet, IRenderDimensions } from 'vs/editor/browser/viewParts/lines/webgl/base/Types';

export interface IRenderLayer extends IDisposable {
	/**
	 * Called when the terminal loses focus.
	 */
	onBlur(/*terminal: Terminal*/): void;

	/**
	 * * Called when the terminal gets focus.
	 */
	onFocus(/*terminal: Terminal*/): void;

	/**
	 * Called when the cursor is moved.
	 */
	onCursorMove(/*terminal: Terminal*/): void;

	/**
	 * Called when options change.
	 */
	onOptionsChanged(/*terminal: Terminal*/): void;

	/**
	 * Called when the theme changes.
	 */
	setColors(/*terminal: Terminal, */colorSet: IColorSet): void;

	/**
	 * Called when the data in the grid has changed (or needs to be rendered
	 * again).
	 */
	onGridChanged(/*terminal: Terminal, */startRow: number, endRow: number): void;

	/**
	 * Calls when the selection changes.
	 */
	onSelectionChanged(/*terminal: Terminal, */start: [number, number] | undefined, end: [number, number] | undefined, columnSelectMode: boolean): void;

	/**
	 * Registers a handler to join characters to render as a group
	 */
	registerCharacterJoiner?(handler: (text: string) => [number, number][]): void;

	/**
	 * Deregisters the specified character joiner handler
	 */
	deregisterCharacterJoiner?(joinerId: number): void;

	/**
	 * Resize the render layer.
	 */
	resize(/*terminal: Terminal, */dim: IRenderDimensions): void;

	/**
	 * Clear the state of the render layer.
	 */
	reset(/*terminal: Terminal*/): void;
}
