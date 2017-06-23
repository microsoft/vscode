/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { ViewEventHandler } from 'vs/editor/common/viewModel/viewEventHandler';
import { IOverviewRuler } from 'vs/editor/browser/editorBrowser';
import { OverviewRulerImpl } from 'vs/editor/browser/viewParts/overviewRuler/overviewRulerImpl';
import { ViewContext } from 'vs/editor/common/view/viewContext';
import * as viewEvents from 'vs/editor/common/view/viewEvents';
import { OverviewRulerPosition } from 'vs/editor/common/config/editorOptions';
import { OverviewRulerZone } from 'vs/editor/common/view/overviewZoneManager';

export class OverviewRuler extends ViewEventHandler implements IOverviewRuler {

	private _context: ViewContext;
	private _overviewRuler: OverviewRulerImpl;

	constructor(context: ViewContext, cssClassName: string, minimumHeight: number, maximumHeight: number) {
		super();
		this._context = context;
		this._overviewRuler = new OverviewRulerImpl(
			0,
			cssClassName,
			this._context.viewLayout.getScrollHeight(),
			this._context.configuration.editor.lineHeight,
			this._context.configuration.editor.pixelRatio,
			minimumHeight,
			maximumHeight,
			(lineNumber: number) => this._context.viewLayout.getVerticalOffsetForLineNumber(lineNumber)
		);

		this._context.addEventHandler(this);
	}

	public dispose(): void {
		this._context.removeEventHandler(this);
		this._overviewRuler.dispose();
		super.dispose();
	}

	// ---- begin view event handlers

	public onConfigurationChanged(e: viewEvents.ViewConfigurationChangedEvent): boolean {
		if (e.lineHeight) {
			this._overviewRuler.setLineHeight(this._context.configuration.editor.lineHeight, true);
		}

		if (e.pixelRatio) {
			this._overviewRuler.setPixelRatio(this._context.configuration.editor.pixelRatio, true);
		}

		return true;
	}

	public onFlushed(e: viewEvents.ViewFlushedEvent): boolean {
		return true;
	}

	public onScrollChanged(e: viewEvents.ViewScrollChangedEvent): boolean {
		this._overviewRuler.setScrollHeight(e.scrollHeight, true);
		return super.onScrollChanged(e) || e.scrollHeightChanged;
	}

	public onZonesChanged(e: viewEvents.ViewZonesChangedEvent): boolean {
		return true;
	}

	// ---- end view event handlers

	public getDomNode(): HTMLElement {
		return this._overviewRuler.getDomNode();
	}

	public setLayout(position: OverviewRulerPosition): void {
		this._overviewRuler.setLayout(position, true);
	}

	public setZones(zones: OverviewRulerZone[]): void {
		this._overviewRuler.setZones(zones, true);
	}
}