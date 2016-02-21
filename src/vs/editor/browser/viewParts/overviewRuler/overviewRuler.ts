/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {IConfigurationChangedEvent, IOverviewRulerPosition} from 'vs/editor/common/editorCommon';
import {ViewEventHandler} from 'vs/editor/common/viewModel/viewEventHandler';
import {IOverviewRuler, IOverviewRulerZone, IViewContext} from 'vs/editor/browser/editorBrowser';
import {OverviewRulerImpl} from 'vs/editor/browser/viewParts/overviewRuler/overviewRulerImpl';

export class OverviewRuler extends ViewEventHandler implements IOverviewRuler {

	private _context:IViewContext;
	private _overviewRuler:OverviewRulerImpl;

	constructor(context:IViewContext, cssClassName:string, scrollHeight:number, minimumHeight:number, maximumHeight:number, getVerticalOffsetForLine:(lineNumber:number)=>number) {
		super();
		this._context = context;
		this._overviewRuler = new OverviewRulerImpl(0, cssClassName, scrollHeight, this._context.configuration.editor.lineHeight,
					minimumHeight, maximumHeight, getVerticalOffsetForLine);

		this._context.addEventHandler(this);
	}

	public destroy(): void {
		this.dispose();
	}

	public dispose(): void {
		this._context.removeEventHandler(this);
		this._overviewRuler.dispose();
	}

	public onConfigurationChanged(e:IConfigurationChangedEvent): boolean {
		if (e.lineHeight) {
			this._overviewRuler.setLineHeight(this._context.configuration.editor.lineHeight, true);
			return true;
		}
		return false;
	}

	public onZonesChanged(): boolean {
		return true;
	}

	public onModelFlushed(): boolean {
		return true;
	}

	public onScrollHeightChanged(scrollHeight:number): boolean {
		this._overviewRuler.setScrollHeight(scrollHeight, true);
		return true;
	}

	public getDomNode(): HTMLElement {
		return this._overviewRuler.getDomNode();
	}

	public setLayout(position:IOverviewRulerPosition): void {
		this._overviewRuler.setLayout(position, true);
	}

	public setZones(zones:IOverviewRulerZone[]): void {
		this._overviewRuler.setZones(zones, true);
	}
}