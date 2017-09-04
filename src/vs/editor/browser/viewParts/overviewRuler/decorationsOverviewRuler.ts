/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as editorCommon from 'vs/editor/common/editorCommon';
import { ViewPart } from 'vs/editor/browser/view/viewPart';
import { OverviewRulerImpl } from 'vs/editor/browser/viewParts/overviewRuler/overviewRulerImpl';
import { ViewContext } from 'vs/editor/common/view/viewContext';
import { RenderingContext, RestrictedRenderingContext } from 'vs/editor/common/view/renderingContext';
import { Position } from 'vs/editor/common/core/position';
import { TokenizationRegistry } from 'vs/editor/common/modes';
import { IDisposable } from 'vs/base/common/lifecycle';
import * as viewEvents from 'vs/editor/common/view/viewEvents';
import { OverviewRulerZone } from 'vs/editor/common/view/overviewZoneManager';
import { editorOverviewRulerBorder, editorCursorForeground } from 'vs/editor/common/view/editorColorRegistry';
import { Color } from 'vs/base/common/color';
import { ThemeColor } from 'vs/platform/theme/common/themeService';

export class DecorationsOverviewRuler extends ViewPart {

	static MIN_DECORATION_HEIGHT = 6;
	static MAX_DECORATION_HEIGHT = 60;

	private readonly _tokensColorTrackerListener: IDisposable;

	private _overviewRuler: OverviewRulerImpl;

	private _renderBorder: boolean;
	private _borderColor: string;
	private _cursorColor: string;

	private _shouldUpdateDecorations: boolean;
	private _shouldUpdateCursorPosition: boolean;

	private _hideCursor: boolean;
	private _cursorPositions: Position[];

	private _zonesFromDecorations: OverviewRulerZone[];
	private _zonesFromCursors: OverviewRulerZone[];

	constructor(context: ViewContext) {
		super(context);
		this._overviewRuler = new OverviewRulerImpl(
			1,
			'decorationsOverviewRuler',
			this._context.viewLayout.getScrollHeight(),
			this._context.configuration.editor.lineHeight,
			this._context.configuration.editor.pixelRatio,
			DecorationsOverviewRuler.MIN_DECORATION_HEIGHT,
			DecorationsOverviewRuler.MAX_DECORATION_HEIGHT,
			(lineNumber: number) => this._context.viewLayout.getVerticalOffsetForLineNumber(lineNumber)
		);
		this._overviewRuler.setLanesCount(this._context.configuration.editor.viewInfo.overviewRulerLanes, false);
		this._overviewRuler.setLayout(this._context.configuration.editor.layoutInfo.overviewRuler, false);

		this._renderBorder = this._context.configuration.editor.viewInfo.overviewRulerBorder;

		this._updateColors();

		this._updateBackground(false);
		this._tokensColorTrackerListener = TokenizationRegistry.onDidChange((e) => {
			if (e.changedColorMap) {
				this._updateBackground(true);
			}
		});

		this._shouldUpdateDecorations = true;
		this._zonesFromDecorations = [];

		this._shouldUpdateCursorPosition = true;
		this._hideCursor = this._context.configuration.editor.viewInfo.hideCursorInOverviewRuler;

		this._zonesFromCursors = [];
		this._cursorPositions = [];
	}

	public dispose(): void {
		super.dispose();
		this._overviewRuler.dispose();
		this._tokensColorTrackerListener.dispose();
	}

	private _updateBackground(render: boolean): void {
		const minimapEnabled = this._context.configuration.editor.viewInfo.minimap.enabled;
		this._overviewRuler.setUseBackground((minimapEnabled ? TokenizationRegistry.getDefaultBackground() : null), render);
	}

	// ---- begin view event handlers

	public onConfigurationChanged(e: viewEvents.ViewConfigurationChangedEvent): boolean {
		let prevLanesCount = this._overviewRuler.getLanesCount();
		let newLanesCount = this._context.configuration.editor.viewInfo.overviewRulerLanes;

		if (prevLanesCount !== newLanesCount) {
			this._overviewRuler.setLanesCount(newLanesCount, false);
		}

		if (e.lineHeight) {
			this._overviewRuler.setLineHeight(this._context.configuration.editor.lineHeight, false);
		}

		if (e.pixelRatio) {
			this._overviewRuler.setPixelRatio(this._context.configuration.editor.pixelRatio, false);
		}

		if (e.viewInfo) {
			this._renderBorder = this._context.configuration.editor.viewInfo.overviewRulerBorder;
			this._hideCursor = this._context.configuration.editor.viewInfo.hideCursorInOverviewRuler;
			this._shouldUpdateCursorPosition = true;
			this._updateBackground(false);
		}

		if (e.layoutInfo) {
			this._overviewRuler.setLayout(this._context.configuration.editor.layoutInfo.overviewRuler, false);
		}

		return true;
	}

	public onCursorStateChanged(e: viewEvents.ViewCursorStateChangedEvent): boolean {
		this._shouldUpdateCursorPosition = true;
		this._cursorPositions = [];
		for (let i = 0, len = e.selections.length; i < len; i++) {
			this._cursorPositions[i] = e.selections[i].getPosition();
		}
		return true;
	}

	public onDecorationsChanged(e: viewEvents.ViewDecorationsChangedEvent): boolean {
		this._shouldUpdateDecorations = true;
		return true;
	}

	public onFlushed(e: viewEvents.ViewFlushedEvent): boolean {
		this._shouldUpdateCursorPosition = true;
		this._shouldUpdateDecorations = true;
		return true;
	}

	public onScrollChanged(e: viewEvents.ViewScrollChangedEvent): boolean {
		this._overviewRuler.setScrollHeight(e.scrollHeight, false);
		return super.onScrollChanged(e) || e.scrollHeightChanged;
	}

	public onZonesChanged(e: viewEvents.ViewZonesChangedEvent): boolean {
		return true;
	}

	public onThemeChanged(e: viewEvents.ViewThemeChangedEvent): boolean {
		this._updateColors();
		this._shouldUpdateDecorations = true;
		this._shouldUpdateCursorPosition = true;
		return true;
	}

	// ---- end view event handlers

	public getDomNode(): HTMLElement {
		return this._overviewRuler.getDomNode();
	}

	private _updateColors() {
		let borderColor = this._context.theme.getColor(editorOverviewRulerBorder);
		this._borderColor = borderColor ? borderColor.toString() : null;

		let cursorColor = this._context.theme.getColor(editorCursorForeground);
		this._cursorColor = cursorColor ? cursorColor.transparent(0.7).toString() : null;

		this._overviewRuler.setThemeType(this._context.theme.type, false);
	}

	private _createZonesFromDecorations(): OverviewRulerZone[] {
		let decorations = this._context.model.getAllOverviewRulerDecorations();
		let zones: OverviewRulerZone[] = [];

		for (let i = 0, len = decorations.length; i < len; i++) {
			let dec = decorations[i];
			let overviewRuler = dec.source.options.overviewRuler;
			zones[i] = new OverviewRulerZone(
				dec.range.startLineNumber,
				dec.range.endLineNumber,
				overviewRuler.position,
				0,
				this.resolveRulerColor(overviewRuler.color),
				this.resolveRulerColor(overviewRuler.darkColor),
				this.resolveRulerColor(overviewRuler.hcColor)
			);
		}

		return zones;
	}

	private resolveRulerColor(color: string | ThemeColor): string {
		if (editorCommon.isThemeColor(color)) {
			let c = this._context.theme.getColor(color.id) || Color.transparent;
			return c.toString();
		}
		return color;
	}

	private _createZonesFromCursors(): OverviewRulerZone[] {
		let zones: OverviewRulerZone[] = [];

		for (let i = 0, len = this._cursorPositions.length; i < len; i++) {
			let cursor = this._cursorPositions[i];

			zones[i] = new OverviewRulerZone(
				cursor.lineNumber,
				cursor.lineNumber,
				editorCommon.OverviewRulerLane.Full,
				2,
				this._cursorColor,
				this._cursorColor,
				this._cursorColor
			);
		}

		return zones;
	}

	public prepareRender(ctx: RenderingContext): void {
		// Nothing to read
	}

	public render(ctx: RestrictedRenderingContext): void {
		if (this._shouldUpdateDecorations || this._shouldUpdateCursorPosition) {

			if (this._shouldUpdateDecorations) {
				this._shouldUpdateDecorations = false;
				this._zonesFromDecorations = this._createZonesFromDecorations();
			}

			if (this._shouldUpdateCursorPosition) {
				this._shouldUpdateCursorPosition = false;
				if (this._hideCursor) {
					this._zonesFromCursors = [];
				} else {
					this._zonesFromCursors = this._createZonesFromCursors();
				}
			}

			let allZones: OverviewRulerZone[] = [];
			allZones = allZones.concat(this._zonesFromCursors);
			allZones = allZones.concat(this._zonesFromDecorations);

			this._overviewRuler.setZones(allZones, false);
		}

		let hasRendered = this._overviewRuler.render(false);

		if (hasRendered && this._renderBorder && this._borderColor && this._overviewRuler.getLanesCount() > 0 && (this._zonesFromDecorations.length > 0 || this._zonesFromCursors.length > 0)) {
			let ctx2 = this._overviewRuler.getDomNode().getContext('2d');
			ctx2.beginPath();
			ctx2.lineWidth = 1;
			ctx2.strokeStyle = this._borderColor;
			ctx2.moveTo(0, 0);
			ctx2.lineTo(0, this._overviewRuler.getPixelHeight());
			ctx2.stroke();

			ctx2.moveTo(0, 0);
			ctx2.lineTo(this._overviewRuler.getPixelWidth(), 0);
			ctx2.stroke();
		}
	}
}
