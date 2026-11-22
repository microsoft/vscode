/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { equals } from '../../../../base/common/arrays.js';
import { onUnexpectedError } from '../../../../base/common/errors.js';
import type { Event } from '../../../../base/common/event.js';
import type { RGBA8 } from '../../../common/core/misc/rgba.js';
import { MinimapPosition } from '../../../common/model.js';
import type { IMinimapPainter, IMinimapPainterFrame } from '../minimap/minimap.js';
import type { MinimapCharRenderer } from '../minimap/minimapCharRenderer.js';
import { EditorViewSurface, type IEditorViewSurfaceHost, packColor } from './editorViewSurfaces.js';
import type { EditorView, MinimapConfig, MinimapDecorationInput } from './editorViewTypes.js';

function packRGBA8(color: RGBA8): number {
	return ((color.r << 24) | (color.g << 16) | (color.b << 8) | color.a) >>> 0;
}

function decorationEquals(a: MinimapDecorationInput, b: MinimapDecorationInput): boolean {
	return a.startLine === b.startLine && a.startColumn === b.startColumn
		&& a.endLine === b.endLine && a.endColumn === b.endColumn
		&& a.color === b.color && a.position === b.position && a.zIndex === b.zIndex;
}

/**
 * Paints the minimap with the `@vscode/editor-view` renderer on an auxiliary
 * WebGPU surface. The renderer retains the minimap's settings, char sheet and
 * decorations, so a frame only sends what changed and skips painting when
 * nothing did.
 */
export class EditorViewMinimapPainter implements IMinimapPainter {

	private readonly _surface = new EditorViewSurface('minimap');
	private _config = '';
	private _charRenderer: MinimapCharRenderer | undefined;
	private _useLighterFont = false;
	private _decorations: MinimapDecorationInput[] = [];
	private _failed = false;

	constructor(private readonly _host: IEditorViewSurfaceHost) { }

	public get onDidChangeCanPaint(): Event<void> {
		return this._host.onDidChangeEditorView;
	}

	public get canPaint(): boolean {
		const view = this._host.getEditorView();
		return !this._failed && view?.supportsSurfaces === true && view.renderMinimap !== undefined;
	}

	/** Forget the state a replaced renderer retained, including its surface. */
	public reset(): void {
		this._surface.reset();
		this._config = '';
		this._charRenderer = undefined;
		this._decorations = [];
	}

	public paint(canvas: HTMLCanvasElement, frame: IMinimapPainterFrame): boolean {
		const view = this._host.getEditorView();
		if (!view || !this.canPaint) {
			return false;
		}
		try {
			return this._paint(view, canvas, frame);
		} catch (err) {
			// Keep the 2D minimap rather than failing again every frame.
			this._failed = true;
			onUnexpectedError(err);
			return false;
		}
	}

	public release(canvas: HTMLCanvasElement): void {
		this._surface.release(this._host.getEditorView(), canvas);
	}

	private _paint(view: EditorView, canvas: HTMLCanvasElement, frame: IMinimapPainterFrame): boolean {
		let changed = this._surface.prepare(view, canvas, frame.width, frame.height) || frame.invalidated;

		const config: MinimapConfig = {
			width: frame.width,
			height: frame.height,
			lineHeight: frame.lineHeight,
			charWidth: frame.charWidth,
			fontScale: frame.fontScale,
			renderCharacters: frame.renderCharacters,
			background: packRGBA8(frame.background),
			foregroundAlpha: frame.foregroundAlpha / 255,
			selectionColor: frame.selectionColor ? packColor(frame.selectionColor) : 0,
			defaultForeground: packRGBA8(frame.defaultForeground),
			tabSize: frame.tabSize,
		};
		const configKey = JSON.stringify(config);
		if (configKey !== this._config) {
			view.setMinimap!(config);
			this._config = configKey;
			changed = true;
		}

		if (frame.renderCharacters && (this._charRenderer !== frame.charRenderer || this._useLighterFont !== frame.useLighterFont)) {
			const data = frame.charRenderer.getCharData(frame.useLighterFont);
			view.setMinimapCharSheet!(frame.charRenderer.scale, new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
			this._charRenderer = frame.charRenderer;
			this._useLighterFont = frame.useLighterFont;
			changed = true;
		}

		if (frame.decorations) {
			const decorations = frame.decorations.map((decoration): MinimapDecorationInput => ({
				startLine: decoration.range.startLineNumber - 1,
				startColumn: decoration.range.startColumn - 1,
				endLine: decoration.range.endLineNumber - 1,
				endColumn: decoration.range.endColumn - 1,
				color: packColor(decoration.color),
				position: decoration.position === MinimapPosition.Gutter ? 'gutter' : 'inline',
				zIndex: decoration.zIndex,
			}));
			if (!equals(decorations, this._decorations, decorationEquals)) {
				view.setMinimapDecorations!(decorations);
				this._decorations = decorations;
				changed = true;
			}
		}

		if (!changed) {
			return true;
		}
		this._host.syncModel();
		return view.renderMinimap!(this._surface.id, {
			startLine: frame.startLineNumber - 1,
			endLine: frame.endLineNumber,
			topPaddingLines: frame.topPaddingLineCount,
			sampling: frame.sampling && { ratio: frame.sampling.ratio, lines: frame.sampling.lines.map(line => line - 1) },
		});
	}
}
