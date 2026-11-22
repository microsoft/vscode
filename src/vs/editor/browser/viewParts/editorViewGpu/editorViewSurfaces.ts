/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Color } from '../../../../base/common/color.js';
import type { Event } from '../../../../base/common/event.js';
import type { EditorView } from './editorViewTypes.js';

/** What auxiliary-surface painters need from {@link EditorViewGpu}. */
export interface IEditorViewSurfaceHost {
	/** The renderer while it paints the editor, else `undefined`. */
	getEditorView(): EditorView | undefined;
	/** Fires when {@link getEditorView} changes. */
	readonly onDidChangeEditorView: Event<void>;
	/** Bring the renderer's lines up to date with the view model. */
	syncModel(): void;
}

export function packColor(color: Color): number {
	const { r, g, b, a } = color.rgba;
	return (((r & 0xff) << 24) | ((g & 0xff) << 16) | ((b & 0xff) << 8) | (Math.round(a * 255) & 0xff)) >>> 0;
}

let colorContext: OffscreenCanvasRenderingContext2D | null | undefined;
const cssColors = new Map<string, number | undefined>();

/**
 * Pack a CSS color as a 2D canvas resolves it for `fillStyle`, so every syntax
 * a DOM canvas paints works. `undefined` when the color is invalid.
 */
export function packCssColor(color: string): number | undefined {
	if (cssColors.has(color)) {
		return cssColors.get(color);
	}
	if (colorContext === undefined) {
		colorContext = typeof OffscreenCanvas === 'undefined' ? null : new OffscreenCanvas(1, 1).getContext('2d');
	}
	let resolved: string | undefined = color;
	if (colorContext) {
		// A context ignores colors it cannot parse, so resolve from two starting values.
		colorContext.fillStyle = '#000';
		colorContext.fillStyle = color;
		const first = colorContext.fillStyle;
		colorContext.fillStyle = '#fff';
		colorContext.fillStyle = color;
		resolved = typeof first === 'string' && first === colorContext.fillStyle ? first : undefined;
	}
	let packed: number | undefined;
	try {
		const parsed = resolved === undefined ? null : Color.Format.CSS.parse(resolved);
		packed = parsed ? packColor(parsed) : undefined;
	} catch {
		packed = undefined;
	}
	cssColors.set(color, packed);
	return packed;
}

/**
 * One auxiliary surface of the renderer, attached to a canvas its view part
 * owns and mounts.
 */
export class EditorViewSurface {

	private _canvas: HTMLCanvasElement | undefined;
	private _width = 0;
	private _height = 0;

	constructor(public readonly id: string) { }

	/**
	 * Attach the surface to `canvas`, or resize it, with a `width x height`
	 * backing store. Returns `true` when that cleared the canvas.
	 */
	public prepare(view: EditorView, canvas: HTMLCanvasElement, width: number, height: number): boolean {
		if (this._canvas !== canvas) {
			view.attachSurface!(this.id, canvas, width, height);
		} else if (this._width !== width || this._height !== height) {
			view.resizeSurface!(this.id, width, height);
		} else {
			return false;
		}
		this._canvas = canvas;
		this._width = width;
		this._height = height;
		return true;
	}

	public release(view: EditorView | undefined, canvas: HTMLCanvasElement): void {
		if (this._canvas === canvas) {
			view?.detachSurface?.(this.id);
			this._canvas = undefined;
		}
	}

	/** Forget the surface of a replaced renderer. */
	public reset(): void {
		this._canvas = undefined;
	}
}
