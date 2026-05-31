/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { FastDomNode, createFastDomNode } from '../../../../base/browser/fastDomNode.js';
import { Color } from '../../../../base/common/color.js';
import { IDisposable } from '../../../../base/common/lifecycle.js';
import { ViewPart } from '../../view/viewPart.js';
import { Position } from '../../../common/core/position.js';
import { IEditorConfiguration } from '../../../common/config/editorConfiguration.js';
import { TokenizationRegistry } from '../../../common/languages.js';
import { editorCursorForeground, editorOverviewRulerBorder, editorOverviewRulerBackground, editorMultiCursorSecondaryForeground, editorMultiCursorPrimaryForeground } from '../../../common/core/editorColorRegistry.js';
import { RenderingContext, RestrictedRenderingContext } from '../../view/renderingContext.js';
import { ViewContext } from '../../../common/viewModel/viewContext.js';
import { EditorTheme } from '../../../common/editorTheme.js';
import * as viewEvents from '../../../common/viewEvents.js';
import { EditorOption } from '../../../common/config/editorOptions.js';
import { OverviewRulerDecorationsGroup } from '../../../common/viewModel.js';
import { equals } from '../../../../base/common/arrays.js';

class Settings {

	public readonly lineHeight: number;
	public readonly pixelRatio: number;
	public readonly overviewRulerLanes: number;

	public readonly renderBorder: boolean;
	public readonly borderColor: string | null;

	public readonly hideCursor: boolean;
	public readonly cursorColorSingle: string | null;
	public readonly cursorColorPrimary: string | null;
	public readonly cursorColorSecondary: string | null;

	public readonly themeType: 'light' | 'dark' | 'hcLight' | 'hcDark';
	public readonly backgroundColor: Color | null;

	public readonly top: number;
	public readonly right: number;
	public readonly domWidth: number;
	public readonly domHeight: number;
	public readonly canvasWidth: number;
	public readonly canvasHeight: number;

	public readonly x: number[];
	public readonly w: number[];

	constructor(config: IEditorConfiguration, theme: EditorTheme) {
		const options = config.options;
		this.lineHeight = options.get(EditorOption.lineHeight);
		this.pixelRatio = options.get(EditorOption.pixelRatio);
		this.overviewRulerLanes = options.get(EditorOption.overviewRulerLanes);

		this.renderBorder = options.get(EditorOption.overviewRulerBorder);
		const borderColor = theme.getColor(editorOverviewRulerBorder);
		this.borderColor = borderColor ? borderColor.toString() : null;

		this.hideCursor = options.get(EditorOption.hideCursorInOverviewRuler);
		const cursorColorSingle = theme.getColor(editorCursorForeground);
		this.cursorColorSingle = cursorColorSingle ? cursorColorSingle.transparent(0.7).toString() : null;
		const cursorColorPrimary = theme.getColor(editorMultiCursorPrimaryForeground);
		this.cursorColorPrimary = cursorColorPrimary ? cursorColorPrimary.transparent(0.7).toString() : null;
		const cursorColorSecondary = theme.getColor(editorMultiCursorSecondaryForeground);
		this.cursorColorSecondary = cursorColorSecondary ? cursorColorSecondary.transparent(0.7).toString() : null;

		this.themeType = theme.type;

		const minimapOpts = options.get(EditorOption.minimap);
		const minimapEnabled = minimapOpts.enabled;
		const minimapSide = minimapOpts.side;
		const themeColor = theme.getColor(editorOverviewRulerBackground);
		const defaultBackground = TokenizationRegistry.getDefaultBackground();

		if (themeColor) {
			this.backgroundColor = themeColor;
		} else if (minimapEnabled && minimapSide === 'right') {
			this.backgroundColor = defaultBackground;
		} else {
			this.backgroundColor = null;
		}

		const layoutInfo = options.get(EditorOption.layoutInfo);
		const position = layoutInfo.overviewRuler;
		this.top = position.top;
		this.right = position.right;
		this.domWidth = position.width;
		this.domHeight = position.height;
		if (this.overviewRulerLanes === 0) {
			// overview ruler is off
			this.canvasWidth = 0;
			this.canvasHeight = 0;
		} else {
			this.canvasWidth = (this.domWidth * this.pixelRatio) | 0;
			this.canvasHeight = (this.domHeight * this.pixelRatio) | 0;
		}

		const [x, w] = this._initLanes(1, this.canvasWidth, this.overviewRulerLanes);
		this.x = x;
		this.w = w;
	}

	private _initLanes(canvasLeftOffset: number, canvasWidth: number, laneCount: number): [number[], number[]] {
		const remainingWidth = canvasWidth - canvasLeftOffset;

		if (laneCount >= 3) {
			const leftWidth = Math.floor(remainingWidth / 3);
			const rightWidth = Math.floor(remainingWidth / 3);
			const centerWidth = remainingWidth - leftWidth - rightWidth;
			const leftOffset = canvasLeftOffset;
			const centerOffset = leftOffset + leftWidth;
			const rightOffset = leftOffset + leftWidth + centerWidth;

			return [
				[
					0,
					leftOffset, // Left
					centerOffset, // Center
					leftOffset, // Left | Center
					rightOffset, // Right
					leftOffset, // Left | Right
					centerOffset, // Center | Right
					leftOffset, // Left | Center | Right
				], [
					0,
					leftWidth, // Left
					centerWidth, // Center
					leftWidth + centerWidth, // Left | Center
					rightWidth, // Right
					leftWidth + centerWidth + rightWidth, // Left | Right
					centerWidth + rightWidth, // Center | Right
					leftWidth + centerWidth + rightWidth, // Left | Center | Right
				]
			];
		} else if (laneCount === 2) {
			const leftWidth = Math.floor(remainingWidth / 2);
			const rightWidth = remainingWidth - leftWidth;
			const leftOffset = canvasLeftOffset;
			const rightOffset = leftOffset + leftWidth;

			return [
				[
					0,
					leftOffset, // Left
					leftOffset, // Center
					leftOffset, // Left | Center
					rightOffset, // Right
					leftOffset, // Left | Right
					leftOffset, // Center | Right
					leftOffset, // Left | Center | Right
				], [
					0,
					leftWidth, // Left
					leftWidth, // Center
					leftWidth, // Left | Center
					rightWidth, // Right
					leftWidth + rightWidth, // Left | Right
					leftWidth + rightWidth, // Center | Right
					leftWidth + rightWidth, // Left | Center | Right
				]
			];
		} else {
			const offset = canvasLeftOffset;
			const width = remainingWidth;

			return [
				[
					0,
					offset, // Left
					offset, // Center
					offset, // Left | Center
					offset, // Right
					offset, // Left | Right
					offset, // Center | Right
					offset, // Left | Center | Right
				], [
					0,
					width, // Left
					width, // Center
					width, // Left | Center
					width, // Right
					width, // Left | Right
					width, // Center | Right
					width, // Left | Center | Right
				]
			];
		}
	}

	public equals(other: Settings): boolean {
		return (
			this.lineHeight === other.lineHeight
			&& this.pixelRatio === other.pixelRatio
			&& this.overviewRulerLanes === other.overviewRulerLanes
			&& this.renderBorder === other.renderBorder
			&& this.borderColor === other.borderColor
			&& this.hideCursor === other.hideCursor
			&& this.cursorColorSingle === other.cursorColorSingle
			&& this.cursorColorPrimary === other.cursorColorPrimary
			&& this.cursorColorSecondary === other.cursorColorSecondary
			&& this.themeType === other.themeType
			&& Color.equals(this.backgroundColor, other.backgroundColor)
			&& this.top === other.top
			&& this.right === other.right
			&& this.domWidth === other.domWidth
			&& this.domHeight === other.domHeight
			&& this.canvasWidth === other.canvasWidth
			&& this.canvasHeight === other.canvasHeight
		);
	}
}

const enum Constants {
	MIN_DECORATION_HEIGHT = 6
}

const enum OverviewRulerLane {
	Left = 1,
	Center = 2,
	Right = 4,
	Full = 7
}

type Cursor = {
	position: Position;
	color: string | null;
};

const enum ShouldRenderValue {
	NotNeeded = 0,
	Maybe = 1,
	Needed = 2
}

export class DecorationsOverviewRuler extends ViewPart {

	private _actualShouldRender: ShouldRenderValue = ShouldRenderValue.NotNeeded;

	private readonly _tokensColorTrackerListener: IDisposable;
	private readonly _domNode: FastDomNode<HTMLCanvasElement>;
	private _settings!: Settings;
	private _cursorPositions: Cursor[];

	private _renderedDecorations: OverviewRulerDecorationsGroup[] = [];
	private _renderedCursorPositions: Cursor[] = [];

	constructor(context: ViewContext) {
		super(context);

		this._domNode = createFastDomNode(document.createElement('canvas'));
		this._domNode.setClassName('decorationsOverviewRuler');
		this._domNode.setPosition('absolute');
		this._domNode.setLayerHinting(true);
		this._domNode.setContain('strict');
		this._domNode.setAttribute('aria-hidden', 'true');

		this._updateSettings(false);

		this._tokensColorTrackerListener = TokenizationRegistry.onDidChange((e) => {
			if (e.changedColorMap) {
				this._updateSettings(true);
			}
		});

		this._cursorPositions = [{ position: new Position(1, 1), color: this._settings.cursorColorSingle }];
	}

	public override dispose(): void {
		super.dispose();
		this._tokensColorTrackerListener.dispose();
	}

	private _updateSettings(renderNow: boolean): boolean {
		const newSettings = new Settings(this._context.configuration, this._context.theme);
		if (this._settings && this._settings.equals(newSettings)) {
			// nothing to do
			return false;
		}

		this._settings = newSettings;

		this._domNode.setTop(this._settings.top);
		this._domNode.setRight(this._settings.right);
		this._domNode.setWidth(this._settings.domWidth);
		this._domNode.setHeight(this._settings.domHeight);
		this._domNode.domNode.width = this._settings.canvasWidth;
		this._domNode.domNode.height = this._settings.canvasHeight;

		if (renderNow) {
			this._render();
		}

		return true;
	}

	// ---- begin view event handlers

	private _markRenderingIsNeeded(): true {
		this._actualShouldRender = ShouldRenderValue.Needed;
		return true;
	}

	private _markRenderingIsMaybeNeeded(): true {
		this._actualShouldRender = ShouldRenderValue.Maybe;
		return true;
	}

	public override onConfigurationChanged(e: viewEvents.ViewConfigurationChangedEvent): boolean {
		return this._updateSettings(false) ? this._markRenderingIsNeeded() : false;
	}
	public override onCursorStateChanged(e: viewEvents.ViewCursorStateChangedEvent): boolean {
		this._cursorPositions = [];
		for (let i = 0, len = e.selections.length; i < len; i++) {
			let color = this._settings.cursorColorSingle;
			if (len > 1) {
				color = i === 0 ? this._settings.cursorColorPrimary : this._settings.cursorColorSecondary;
			}
			this._cursorPositions.push({ position: e.selections[i].getPosition(), color });
		}
		this._cursorPositions.sort((a, b) => Position.compare(a.position, b.position));
		return this._markRenderingIsMaybeNeeded();
	}
	public override onDecorationsChanged(e: viewEvents.ViewDecorationsChangedEvent): boolean {
		if (e.affectsOverviewRuler) {
			return this._markRenderingIsMaybeNeeded();
		}
		return false;
	}
	public override onFlushed(e: viewEvents.ViewFlushedEvent): boolean {
		return this._markRenderingIsNeeded();
	}
	public override onScrollChanged(e: viewEvents.ViewScrollChangedEvent): boolean {
		return e.scrollHeightChanged ? this._markRenderingIsNeeded() : false;
	}
	public override onZonesChanged(e: viewEvents.ViewZonesChangedEvent): boolean {
		return this._markRenderingIsNeeded();
	}
	public override onThemeChanged(e: viewEvents.ViewThemeChangedEvent): boolean {
		return this._updateSettings(false) ? this._markRenderingIsNeeded() : false;
	}

	// ---- end view event handlers

	public getDomNode(): HTMLElement {
		return this._domNode.domNode;
	}

	public prepareRender(ctx: RenderingContext): void {
		// Nothing to read
	}

	public render(editorCtx: RestrictedRenderingContext): void {
		this._render();
		this._actualShouldRender = ShouldRenderValue.NotNeeded;
	}

	private _render(): void {
		const backgroundColor = this._settings.backgroundColor;
		if (this._settings.overviewRulerLanes === 0) {
			// overview ruler is off
			this._domNode.setBackgroundColor(backgroundColor ? Color.Format.CSS.formatHexA(backgroundColor) : '');
			this._domNode.setDisplay('none');
			return;
		}

		const decorations = this._context.viewModel.getAllOverviewRulerDecorations(this._context.theme);
		decorations.sort(OverviewRulerDecorationsGroup.compareByRenderingProps);

		if (this._actualShouldRender === ShouldRenderValue.Maybe && !OverviewRulerDecorationsGroup.equalsArr(this._renderedDecorations, decorations)) {
			this._actualShouldRender = ShouldRenderValue.Needed;
		}
		if (this._actualShouldRender === ShouldRenderValue.Maybe && !equals(this._renderedCursorPositions, this._cursorPositions, (a, b) => a.position.lineNumber === b.position.lineNumber && a.color === b.color)) {
			this._actualShouldRender = ShouldRenderValue.Needed;
		}
		if (this._actualShouldRender === ShouldRenderValue.Maybe) {
			// both decorations and cursor positions are unchanged, nothing to do
			return;
		}
		this._renderedDecorations = decorations;
		this._renderedCursorPositions = this._cursorPositions;

		this._domNode.setDisplay('block');
		const canvasWidth = this._settings.canvasWidth;
		const canvasHeight = this._settings.canvasHeight;
		const lineHeight = this._settings.lineHeight;
		const viewLayout = this._context.viewLayout;
		const outerHeight = this._context.viewLayout.getScrollHeight();
		const heightRatio = canvasHeight / outerHeight;

		const minDecorationHeight = (Constants.MIN_DECORATION_HEIGHT * this._settings.pixelRatio) | 0;
		const halfMinDecorationHeight = (minDecorationHeight / 2) | 0;

		const canvasCtx = this._domNode.domNode.getContext('2d')!;
		if (backgroundColor) {
			if (backgroundColor.isOpaque()) {
				// We have a background color which is opaque, we can just paint the entire surface with it
				canvasCtx.fillStyle = Color.Format.CSS.formatHexA(backgroundColor);
				canvasCtx.fillRect(0, 0, canvasWidth, canvasHeight);
			} else {
				// We have a background color which is transparent, we need to first clear the surface and
				// then fill it
				canvasCtx.clearRect(0, 0, canvasWidth, canvasHeight);
				canvasCtx.fillStyle = Color.Format.CSS.formatHexA(backgroundColor);
				canvasCtx.fillRect(0, 0, canvasWidth, canvasHeight);
			}
		} else {
			// We don't have a background color
			canvasCtx.clearRect(0, 0, canvasWidth, canvasHeight);
		}

		const x = this._settings.x;
		const w = this._settings.w;



		for (const decorationGroup of decorations) {
			const color = decorationGroup.color;
			const decorationGroupData = decorationGroup.data;

			canvasCtx.fillStyle = color;

			let prevLane = 0;
			let prevY1 = 0;
			let prevY2 = 0;
			for (let i = 0, len = decorationGroupData.length / 3; i < len; i++) {
				const lane = decorationGroupData[3 * i];
				const startLineNumber = decorationGroupData[3 * i + 1];
				const endLineNumber = decorationGroupData[3 * i + 2];

				let y1 = (viewLayout.getVerticalOffsetForLineNumber(startLineNumber) * heightRatio) | 0;
				let y2 = ((viewLayout.getVerticalOffsetForLineNumber(endLineNumber) + lineHeight) * heightRatio) | 0;
				const height = y2 - y1;
				if (height < minDecorationHeight) {
					let yCenter = ((y1 + y2) / 2) | 0;
					if (yCenter < halfMinDecorationHeight) {
						yCenter = halfMinDecorationHeight;
					} else if (yCenter + halfMinDecorationHeight > canvasHeight) {
						yCenter = canvasHeight - halfMinDecorationHeight;
					}
					y1 = yCenter - halfMinDecorationHeight;
					y2 = yCenter + halfMinDecorationHeight;
				}

				if (y1 > prevY2 + 1 || lane !== prevLane) {
					// flush prev
					if (i !== 0) {
						canvasCtx.fillRect(x[prevLane], prevY1, w[prevLane], prevY2 - prevY1);
					}
					prevLane = lane;
					prevY1 = y1;
					prevY2 = y2;
				} else {
					// merge into prev
					if (y2 > prevY2) {
						prevY2 = y2;
					}
				}
			}
			canvasCtx.fillRect(x[prevLane], prevY1, w[prevLane], prevY2 - prevY1);
		}

		// Draw cursors
		if (!this._settings.hideCursor) {
			const cursorHeight = (2 * this._settings.pixelRatio) | 0;
			const halfCursorHeight = (cursorHeight / 2) | 0;
			const cursorX = this._settings.x[OverviewRulerLane.Full];
			const cursorW = this._settings.w[OverviewRulerLane.Full];

			let prevY1 = -100;
			let prevY2 = -100;
			let prevColor: string | null = null;
			for (let i = 0, len = this._cursorPositions.length; i < len; i++) {
				const color = this._cursorPositions[i].color;
				if (!color) {
					continue;
				}
				const cursor = this._cursorPositions[i].position;

				let yCenter = (viewLayout.getVerticalOffsetForLineNumber(cursor.lineNumber) * heightRatio) | 0;
				if (yCenter < halfCursorHeight) {
					yCenter = halfCursorHeight;
				} else if (yCenter + halfCursorHeight > canvasHeight) {
					yCenter = canvasHeight - halfCursorHeight;
				}
				const y1 = yCenter - halfCursorHeight;
				const y2 = y1 + cursorHeight;

				if (y1 > prevY2 + 1 || color !== prevColor) {
					// flush prev
					if (i !== 0 && prevColor) {
						canvasCtx.fillRect(cursorX, prevY1, cursorW, prevY2 - prevY1);
					}
					prevY1 = y1;
					prevY2 = y2;
				} else {
					// merge into prev
					if (y2 > prevY2) {
						prevY2 = y2;
					}
				}
				prevColor = color;
				canvasCtx.fillStyle = color;
			}
			if (prevColor) {
				canvasCtx.fillRect(cursorX, prevY1, cursorW, prevY2 - prevY1);
			}
		}

		if (this._settings.renderBorder && this._settings.borderColor && this._settings.overviewRulerLanes > 0) {
			canvasCtx.beginPath();
			canvasCtx.lineWidth = 1;
			canvasCtx.strokeStyle = this._settings.borderColor;
			canvasCtx.moveTo(0, 0);
			canvasCtx.lineTo(0, canvasHeight);
			canvasCtx.moveTo(1, 0);
			canvasCtx.lineTo(canvasWidth, 0);
			canvasCtx.stroke();
		}
	}
}
