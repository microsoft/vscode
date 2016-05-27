/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {IConfigurationChangedEvent, OverviewRulerPosition, OverviewRulerZone, IScrollEvent} from 'vs/editor/common/editorCommon';
import {ViewEventHandler} from 'vs/editor/common/viewModel/viewEventHandler';
import {IOverviewRuler} from 'vs/editor/browser/editorBrowser';
import {OverviewRulerImpl} from 'vs/editor/browser/viewParts/overviewRuler/overviewRulerImpl';
import {ViewContext} from 'vs/editor/common/view/viewContext';

export class OverviewRuler extends ViewEventHandler implements IOverviewRuler {

	private _context:ViewContext;
	private _overviewRuler:OverviewRulerImpl;

	constructor(context:ViewContext, cssClassName:string, scrollHeight:number, minimumHeight:number, maximumHeight:number, getVerticalOffsetForLine:(lineNumber:number)=>number) {
		super();
		this._context = context;
		this._overviewRuler = new OverviewRulerImpl(0, cssClassName, scrollHeight, this._context.configuration.editor.lineHeight,
					this._context.configuration.editor.viewInfo.canUseTranslate3d, minimumHeight, maximumHeight, getVerticalOffsetForLine);

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

		if (e.viewInfo.canUseTranslate3d) {
			this._overviewRuler.setCanUseTranslate3d(this._context.configuration.editor.viewInfo.canUseTranslate3d, true);
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

	public onScrollChanged(e:IScrollEvent): boolean {
		this._overviewRuler.setScrollHeight(e.scrollHeight, true);
		return super.onScrollChanged(e) || e.scrollHeightChanged;
	}

	public getDomNode(): HTMLElement {
		return this._overviewRuler.getDomNode();
	}

	public setLayout(position:OverviewRulerPosition): void {
		this._overviewRuler.setLayout(position, true);
	}

	public setZones(zones:OverviewRulerZone[]): void {
		this._overviewRuler.setZones(zones, true);
	}
}