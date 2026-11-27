/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { onUnexpectedError } from '../../../../base/common/errors.js';
import type { Event } from '../../../../base/common/event.js';
import type { IOverviewRulerPainter, IOverviewRulerPainterFrame } from '../overviewRuler/decorationsOverviewRuler.js';
import { EditorViewSurface, type IEditorViewSurfaceHost, packColor, packCssColor } from './editorViewSurfaces.js';
import type { EditorView, OverviewRulerConfig, OverviewRulerCursorInput, OverviewRulerDecorationGroup } from './editorViewTypes.js';

/**
 * Paints the overview ruler with the `@vscode/editor-view` renderer on an
 * auxiliary WebGPU surface. The renderer retains the ruler's settings and
 * marks and places them with the vertical layout it already mirrors, so a
 * frame sends only what changed.
 */
export class EditorViewOverviewRulerPainter implements IOverviewRulerPainter {

	private readonly _surface = new EditorViewSurface('overviewRuler');
	private _config = '';
	private _sentDecorations = false;
	private _failed = false;

	constructor(private readonly _host: IEditorViewSurfaceHost) { }

	public get onDidChangeCanPaint(): Event<void> {
		return this._host.onDidChangeEditorView;
	}

	public get canPaint(): boolean {
		const view = this._host.getEditorView();
		return !this._failed && view?.supportsSurfaces === true && view.renderOverviewRuler !== undefined;
	}

	/** Forget the state a replaced renderer retained, including its surface. */
	public reset(): void {
		this._surface.reset();
		this._config = '';
		this._sentDecorations = false;
	}

	public paint(canvas: HTMLCanvasElement, frame: IOverviewRulerPainterFrame): boolean {
		const view = this._host.getEditorView();
		if (!view || !this.canPaint) {
			return false;
		}
		try {
			return this._paint(view, canvas, frame);
		} catch (err) {
			// Keep the 2D ruler rather than failing again every frame.
			this._failed = true;
			onUnexpectedError(err);
			return false;
		}
	}

	public release(canvas: HTMLCanvasElement): void {
		this._surface.release(this._host.getEditorView(), canvas);
	}

	private _paint(view: EditorView, canvas: HTMLCanvasElement, frame: IOverviewRulerPainterFrame): boolean {
		this._surface.prepare(view, canvas, frame.width, frame.height);

		const config: OverviewRulerConfig = {
			width: frame.width,
			height: frame.height,
			lanes: frame.lanes,
			pixelRatio: frame.pixelRatio,
			background: frame.background ? packColor(frame.background) : 0,
			border: frame.border === null ? 0 : packCssColor(frame.border) ?? 0,
			hideCursor: frame.hideCursor,
		};
		const configKey = JSON.stringify(config);
		if (configKey !== this._config) {
			view.setOverviewRuler!(config);
			this._config = configKey;
		}

		if (frame.decorationsChanged || !this._sentDecorations) {
			const groups: OverviewRulerDecorationGroup[] = [];
			for (const group of frame.decorations) {
				const color = packCssColor(group.color);
				if (color !== undefined) {
					// `lane, startLineNumber, endLineNumber` to zero-based lines.
					groups.push({ color, data: group.data.map((value, i) => i % 3 === 0 ? value : value - 1) });
				}
			}
			view.setOverviewRulerDecorations!(groups);
			this._sentDecorations = true;
		}

		const cursors: OverviewRulerCursorInput[] = [];
		for (const cursor of frame.cursors) {
			const color = cursor.color === null ? undefined : packCssColor(cursor.color);
			if (color !== undefined) {
				cursors.push({ line: cursor.position.lineNumber - 1, color });
			}
		}
		return view.renderOverviewRuler!(this._surface.id, frame.scrollHeight, cursors);
	}
}
