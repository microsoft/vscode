/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../../base/browser/dom.js';
import { PixelRatio } from '../../../../../../../base/browser/pixelRatio.js';
import { CodeWindow } from '../../../../../../../base/browser/window.js';
import { Color } from '../../../../../../../base/common/color.js';
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from '../../../../../../../base/common/lifecycle.js';
import { IAccessibilityService } from '../../../../../../../platform/accessibility/common/accessibility.js';
import { descriptionForeground, focusBorder, foreground } from '../../../../../../../platform/theme/common/colorRegistry.js';
import { isHighContrast } from '../../../../../../../platform/theme/common/theme.js';
import { IColorTheme, IThemeService } from '../../../../../../../platform/theme/common/themeService.js';
import { getImageGenerationFieldCellGlyph, getImageGenerationFieldCellTone, ImageGenerationField, imageGenerationFieldGlyphs, imageGenerationFieldTones } from './chatImageGenerationField.js';

// The water moves about a character per second, so 20 frames per second look as smooth as more.
const frameIntervalMs = 1000 / 20;
const cellLineHeight = 1.2;
const binaryOpacity = 0.4;
const repaint = 0xffff;

/**
 * Paints an {@link ImageGenerationField} into a canvas. Each glyph is rendered once per tone into
 * an atlas, and a frame only copies the cells that changed since the previous frame. The field
 * animates at up to 20 frames per second while it is on screen, and holds a still frame when
 * motion is reduced or a high contrast theme is active.
 */
export class ImageGenerationFieldCanvas extends Disposable {

	private readonly canvas: HTMLCanvasElement;
	private readonly field: ImageGenerationField;
	private readonly nextFrame = this._register(new MutableDisposable());
	private readonly windowObservers = this._register(new MutableDisposable<DisposableStore>());

	private targetWindow: CodeWindow | undefined;
	private width = 0;
	private height = 0;
	private cellSize = 0;
	private font = '';
	private offsetX = 0;
	private offsetY = 0;
	private atlas: HTMLCanvasElement | undefined;
	private painted = new Uint16Array(0);
	private visible = false;
	private lastPaintTime = 0;

	constructor(
		container: HTMLElement,
		seed: string,
		@IThemeService private readonly themeService: IThemeService,
		@IAccessibilityService private readonly accessibilityService: IAccessibilityService,
	) {
		super();
		this.canvas = dom.append(container, dom.$('canvas.chat-image-generation-field'));
		this.field = new ImageGenerationField(seed);

		const resizeObserver = this._register(new dom.DisposableResizeObserver('ChatImageGenerationProgressPart.field', entries => {
			const { width, height } = entries[entries.length - 1].contentRect;
			this.layout(width, height);
		}));
		this._register(resizeObserver.observe(this.canvas));
		this._register(themeService.onDidColorThemeChange(() => {
			this.atlas = undefined;
			this.painted.fill(repaint);
			this.update();
		}));
		this._register(accessibilityService.onDidChangeReducedMotion(() => this.update()));
	}

	private layout(width: number, height: number): void {
		this.width = width;
		this.height = height;
		if (!width || !height || !this.canvas.isConnected) {
			this.nextFrame.clear();
			return;
		}

		const targetWindow = dom.getWindow(this.canvas);
		if (targetWindow !== this.targetWindow) {
			this.targetWindow = targetWindow;
			this.observeWindow(targetWindow);
		}

		const pixelRatio = targetWindow.devicePixelRatio;
		const { cellSize, font } = getImageGenerationFieldMetrics(targetWindow.getComputedStyle(this.canvas), pixelRatio);
		const canvasWidth = Math.round(width * pixelRatio);
		const canvasHeight = Math.round(height * pixelRatio);
		const columns = Math.floor(canvasWidth / cellSize);
		const rows = Math.floor(canvasHeight / cellSize);

		if (cellSize !== this.cellSize || font !== this.font) {
			this.cellSize = cellSize;
			this.font = font;
			this.atlas = undefined;
		}
		if (canvasWidth !== this.canvas.width || canvasHeight !== this.canvas.height || columns !== this.field.columns || rows !== this.field.rows) {
			// Resizing clears the canvas, so every cell starts out empty.
			this.canvas.width = canvasWidth;
			this.canvas.height = canvasHeight;
			this.offsetX = Math.floor((canvasWidth - columns * cellSize) / 2);
			this.offsetY = Math.floor((canvasHeight - rows * cellSize) / 2);
			this.field.resize(columns, rows);
			this.painted = new Uint16Array(columns * rows);
		}
		this.update();
	}

	private observeWindow(targetWindow: CodeWindow): void {
		const store = new DisposableStore();
		store.add(PixelRatio.getInstance(targetWindow).onDidChange(() => this.layout(this.width, this.height)));
		if (typeof targetWindow.IntersectionObserver === 'function') {
			const observer = new targetWindow.IntersectionObserver(entries => {
				this.visible = entries[entries.length - 1].isIntersecting;
				this.update();
			});
			observer.observe(this.canvas);
			store.add(toDisposable(() => observer.disconnect()));
		} else {
			this.visible = true;
		}
		this.windowObservers.value = store;
	}

	private get animated(): boolean {
		return !this.accessibilityService.isMotionReduced() && !isHighContrast(this.themeService.getColorTheme().type);
	}

	private update(): void {
		if (!this.field.columns || !this.field.rows) {
			return;
		}
		if (!this.animated) {
			this.nextFrame.clear();
			this.paint(0, true);
			return;
		}
		this.paint(Date.now(), false);
		if (this.visible) {
			this.scheduleFrame();
		} else {
			this.nextFrame.clear();
		}
	}

	private scheduleFrame(): void {
		const targetWindow = this.targetWindow;
		if (!targetWindow) {
			return;
		}
		// Wait out the frame interval on a timer so that fast displays don't wake the loop more often
		// than it paints, then paint on an animation frame, which the browser holds back while hidden.
		const delay = Math.min(frameIntervalMs, Math.max(0, this.lastPaintTime + frameIntervalMs - Date.now()));
		const timeout = targetWindow.setTimeout(() => {
			this.nextFrame.value = dom.scheduleAtNextAnimationFrame(targetWindow, () => {
				this.paint(Date.now(), false);
				this.scheduleFrame();
			});
		}, delay);
		this.nextFrame.value = toDisposable(() => targetWindow.clearTimeout(timeout));
	}

	private paint(timeMs: number, still: boolean): void {
		const context = this.canvas.getContext('2d');
		const atlas = this.atlas ??= this.createAtlas();
		if (!context || !atlas) {
			return;
		}
		this.lastPaintTime = timeMs;
		this.field.update(timeMs, still);

		const cells = this.field.cells;
		const columns = this.field.columns;
		const size = this.cellSize;
		for (let index = 0; index < cells.length; index++) {
			const cell = cells[index];
			if (cell === this.painted[index]) {
				continue;
			}
			this.painted[index] = cell;
			const x = this.offsetX + (index % columns) * size;
			const y = this.offsetY + Math.floor(index / columns) * size;
			context.clearRect(x, y, size, size);
			if (cell) {
				context.drawImage(atlas, getImageGenerationFieldCellGlyph(cell) * size, getImageGenerationFieldCellTone(cell) * size, size, size, x, y, size, size);
			}
		}
	}

	private createAtlas(): HTMLCanvasElement | undefined {
		const size = this.cellSize;
		const atlas = this.canvas.ownerDocument.createElement('canvas');
		atlas.width = size * imageGenerationFieldGlyphs.length;
		atlas.height = size * imageGenerationFieldTones.length;
		const context = atlas.getContext('2d');
		if (!context || !size) {
			return undefined;
		}

		context.font = this.font;
		context.textAlign = 'center';
		context.textBaseline = 'middle';
		const colors = getImageGenerationFieldToneColors(this.themeService.getColorTheme());
		for (let tone = 0; tone < imageGenerationFieldTones.length; tone++) {
			context.fillStyle = colors[tone];
			for (let glyph = 0; glyph < imageGenerationFieldGlyphs.length; glyph++) {
				// Clip each glyph to its own cell so that wide glyphs never bleed into their neighbors.
				context.save();
				context.beginPath();
				context.rect(glyph * size, tone * size, size, size);
				context.clip();
				context.fillText(imageGenerationFieldGlyphs[glyph], glyph * size + size / 2, tone * size + size / 2);
				context.restore();
			}
		}
		return atlas;
	}
}

/**
 * Returns the cell size and canvas font, in device pixels, of glyphs drawn in the given style.
 */
function getImageGenerationFieldMetrics(style: CSSStyleDeclaration, pixelRatio: number): { readonly cellSize: number; readonly font: string } {
	const fontSize = parseFloat(style.fontSize) || 10;
	return {
		cellSize: Math.max(1, Math.round(fontSize * cellLineHeight * pixelRatio)),
		font: `${Math.round(fontSize * pixelRatio)}px ${style.fontFamily}`,
	};
}

/**
 * Returns the color of each of the {@link imageGenerationFieldTones} in a theme.
 */
export function getImageGenerationFieldToneColors(theme: IColorTheme): string[] {
	const text = theme.getColor(foreground) ?? Color.white;
	const binary = theme.getColor(descriptionForeground) ?? text;
	const accent = theme.getColor(focusBorder) ?? text;
	const highContrast = isHighContrast(theme.type);
	return imageGenerationFieldTones.map(tone => {
		if (highContrast) {
			return (tone.crest ? text : binary).toString();
		}
		if (!tone.crest) {
			return binary.transparent(binaryOpacity * tone.strength).toString();
		}
		// Toward the top of a crest, glyphs move from the accent toward the foreground and gain opacity.
		return accent.mix(text, 0.1 + 0.4 * tone.strength).transparent(0.35 + 0.45 * tone.strength).toString();
	});
}
