/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { onUnexpectedError } from 'vs/base/common/errors';
import { FastDomNode, createFastDomNode } from 'vs/base/browser/fastDomNode';
import * as editorCommon from 'vs/editor/common/editorCommon';
import { ClassNames, IViewZone } from 'vs/editor/browser/editorBrowser';
import { ViewPart } from 'vs/editor/browser/view/viewPart';
import { ViewContext } from 'vs/editor/common/view/viewContext';
import { Position } from 'vs/editor/common/core/position';
import { RenderingContext, RestrictedRenderingContext } from 'vs/editor/common/view/renderingContext';
import { IViewLayout } from 'vs/editor/common/viewModel/viewModel';
import * as viewEvents from 'vs/editor/common/view/viewEvents';

export interface IMyViewZone {
	whitespaceId: number;
	delegate: IViewZone;
	isVisible: boolean;
	domNode: FastDomNode<HTMLElement>;
	marginDomNode: FastDomNode<HTMLElement>;
}

export interface IMyRenderData {
	data: editorCommon.IViewWhitespaceViewportData[];
}

interface IComputedViewZoneProps {
	afterViewLineNumber: number;
	heightInPx: number;
}

export class ViewZones extends ViewPart {

	private _viewLayout: IViewLayout;
	private _zones: { [id: string]: IMyViewZone; };
	private _lineHeight: number;
	private _contentWidth: number;
	private _contentLeft: number;

	public domNode: FastDomNode<HTMLElement>;

	public marginDomNode: FastDomNode<HTMLElement>;

	constructor(context: ViewContext, viewLayout: IViewLayout) {
		super(context);
		this._lineHeight = this._context.configuration.editor.lineHeight;
		this._contentWidth = this._context.configuration.editor.layoutInfo.contentWidth;
		this._contentLeft = this._context.configuration.editor.layoutInfo.contentLeft;
		this._viewLayout = viewLayout;

		this.domNode = createFastDomNode(document.createElement('div'));
		this.domNode.setClassName(ClassNames.VIEW_ZONES);
		this.domNode.setPosition('absolute');
		this.domNode.setAttribute('role', 'presentation');
		this.domNode.setAttribute('aria-hidden', 'true');

		this.marginDomNode = createFastDomNode(document.createElement('div'));
		this.marginDomNode.setClassName('margin-view-zones');
		this.marginDomNode.setPosition('absolute');
		this.marginDomNode.setAttribute('role', 'presentation');
		this.marginDomNode.setAttribute('aria-hidden', 'true');

		this._zones = {};
	}

	public dispose(): void {
		super.dispose();
		this._viewLayout = null;
		this._zones = {};
	}

	// ---- begin view event handlers

	private _recomputeWhitespacesProps(): boolean {
		let hadAChange = false;

		let keys = Object.keys(this._zones);
		for (let i = 0, len = keys.length; i < len; i++) {
			let id = keys[i];
			let zone = this._zones[id];
			let props = this._computeWhitespaceProps(zone.delegate);
			if (this._viewLayout.changeWhitespace(parseInt(id, 10), props.afterViewLineNumber, props.heightInPx)) {
				this._safeCallOnComputedHeight(zone.delegate, props.heightInPx);
				hadAChange = true;
			}
		}

		return hadAChange;
	}

	public onConfigurationChanged(e: viewEvents.ViewConfigurationChangedEvent): boolean {

		if (e.lineHeight) {
			this._lineHeight = this._context.configuration.editor.lineHeight;
			return this._recomputeWhitespacesProps();
		}

		if (e.layoutInfo) {
			this._contentWidth = this._context.configuration.editor.layoutInfo.contentWidth;
			this._contentLeft = this._context.configuration.editor.layoutInfo.contentLeft;
		}

		return true;
	}

	public onLineMappingChanged(e: viewEvents.ViewLineMappingChangedEvent): boolean {
		return this._recomputeWhitespacesProps();
	}

	public onLinesDeleted(e: viewEvents.ViewLinesDeletedEvent): boolean {
		return true;
	}

	public onScrollChanged(e: viewEvents.ViewScrollChangedEvent): boolean {
		return e.scrollTopChanged || e.scrollWidthChanged;
	}

	public onZonesChanged(e: viewEvents.ViewZonesChangedEvent): boolean {
		return true;
	}

	public onLinesInserted(e: viewEvents.ViewLinesInsertedEvent): boolean {
		return true;
	}

	// ---- end view event handlers

	private _getZoneOrdinal(zone: IViewZone): number {

		if (typeof zone.afterColumn !== 'undefined') {
			return zone.afterColumn;
		}

		return 10000;
	}


	private _computeWhitespaceProps(zone: IViewZone): IComputedViewZoneProps {
		if (zone.afterLineNumber === 0) {
			return {
				afterViewLineNumber: 0,
				heightInPx: this._heightInPixels(zone)
			};
		}

		let zoneAfterModelPosition: Position;
		if (typeof zone.afterColumn !== 'undefined') {
			zoneAfterModelPosition = this._context.model.validateModelPosition({
				lineNumber: zone.afterLineNumber,
				column: zone.afterColumn
			});
		} else {
			let validAfterLineNumber = this._context.model.validateModelPosition({
				lineNumber: zone.afterLineNumber,
				column: 1
			}).lineNumber;

			zoneAfterModelPosition = new Position(
				validAfterLineNumber,
				this._context.model.getModelLineMaxColumn(validAfterLineNumber)
			);
		}

		let zoneBeforeModelPosition: Position;
		if (zoneAfterModelPosition.column === this._context.model.getModelLineMaxColumn(zoneAfterModelPosition.lineNumber)) {
			zoneBeforeModelPosition = this._context.model.validateModelPosition({
				lineNumber: zoneAfterModelPosition.lineNumber + 1,
				column: 1
			});
		} else {
			zoneBeforeModelPosition = this._context.model.validateModelPosition({
				lineNumber: zoneAfterModelPosition.lineNumber,
				column: zoneAfterModelPosition.column + 1
			});
		}

		let viewPosition = this._context.model.coordinatesConverter.convertModelPositionToViewPosition(zoneAfterModelPosition);
		let isVisible = this._context.model.coordinatesConverter.modelPositionIsVisible(zoneBeforeModelPosition);
		return {
			afterViewLineNumber: viewPosition.lineNumber,
			heightInPx: (isVisible ? this._heightInPixels(zone) : 0)
		};
	}

	public addZone(zone: IViewZone): number {
		let props = this._computeWhitespaceProps(zone);
		let whitespaceId = this._viewLayout.addWhitespace(props.afterViewLineNumber, this._getZoneOrdinal(zone), props.heightInPx);

		let myZone: IMyViewZone = {
			whitespaceId: whitespaceId,
			delegate: zone,
			isVisible: false,
			domNode: createFastDomNode(zone.domNode),
			marginDomNode: zone.marginDomNode ? createFastDomNode(zone.marginDomNode) : null
		};

		this._safeCallOnComputedHeight(myZone.delegate, props.heightInPx);

		myZone.domNode.setPosition('absolute');
		myZone.domNode.domNode.style.width = '100%';
		myZone.domNode.setDisplay('none');
		myZone.domNode.setAttribute('monaco-view-zone', myZone.whitespaceId.toString());
		this.domNode.domNode.appendChild(myZone.domNode.domNode);

		if (myZone.marginDomNode) {
			myZone.marginDomNode.setPosition('absolute');
			myZone.marginDomNode.domNode.style.width = '100%';
			myZone.marginDomNode.setDisplay('none');
			myZone.marginDomNode.setAttribute('monaco-view-zone', myZone.whitespaceId.toString());
			this.marginDomNode.domNode.appendChild(myZone.marginDomNode.domNode);
		}

		this._zones[myZone.whitespaceId.toString()] = myZone;


		this.setShouldRender();

		return myZone.whitespaceId;
	}

	public removeZone(id: number): boolean {
		if (this._zones.hasOwnProperty(id.toString())) {
			let zone = this._zones[id.toString()];
			delete this._zones[id.toString()];
			this._viewLayout.removeWhitespace(zone.whitespaceId);

			zone.domNode.removeAttribute('monaco-visible-view-zone');
			zone.domNode.removeAttribute('monaco-view-zone');
			zone.domNode.domNode.parentNode.removeChild(zone.domNode.domNode);

			if (zone.marginDomNode) {
				zone.marginDomNode.removeAttribute('monaco-visible-view-zone');
				zone.marginDomNode.removeAttribute('monaco-view-zone');
				zone.marginDomNode.domNode.parentNode.removeChild(zone.marginDomNode.domNode);
			}

			this.setShouldRender();

			return true;
		}
		return false;
	}

	public layoutZone(id: number): boolean {
		let changed = false;
		if (this._zones.hasOwnProperty(id.toString())) {
			let zone = this._zones[id.toString()];
			let props = this._computeWhitespaceProps(zone.delegate);
			// let newOrdinal = this._getZoneOrdinal(zone.delegate);
			changed = this._viewLayout.changeWhitespace(zone.whitespaceId, props.afterViewLineNumber, props.heightInPx) || changed;
			// TODO@Alex: change `newOrdinal` too

			if (changed) {
				this._safeCallOnComputedHeight(zone.delegate, props.heightInPx);
				this.setShouldRender();
			}
		}
		return changed;
	}

	public shouldSuppressMouseDownOnViewZone(id: number): boolean {
		if (this._zones.hasOwnProperty(id.toString())) {
			let zone = this._zones[id.toString()];
			return zone.delegate.suppressMouseDown;
		}
		return false;
	}

	private _heightInPixels(zone: IViewZone): number {
		if (typeof zone.heightInPx === 'number') {
			return zone.heightInPx;
		}
		if (typeof zone.heightInLines === 'number') {
			return this._lineHeight * zone.heightInLines;
		}
		return this._lineHeight;
	}

	private _safeCallOnComputedHeight(zone: IViewZone, height: number): void {
		if (typeof zone.onComputedHeight === 'function') {
			try {
				zone.onComputedHeight(height);
			} catch (e) {
				onUnexpectedError(e);
			}
		}
	}

	private _safeCallOnDomNodeTop(zone: IViewZone, top: number): void {
		if (typeof zone.onDomNodeTop === 'function') {
			try {
				zone.onDomNodeTop(top);
			} catch (e) {
				onUnexpectedError(e);
			}
		}
	}

	public prepareRender(ctx: RenderingContext): void {
		// Nothing to read
	}

	public render(ctx: RestrictedRenderingContext): void {
		let visibleWhitespaces = this._viewLayout.getWhitespaceViewportData();
		let visibleZones: { [id: string]: editorCommon.IViewWhitespaceViewportData; } = {};

		let hasVisibleZone = false;
		for (let i = 0, len = visibleWhitespaces.length; i < len; i++) {
			visibleZones[visibleWhitespaces[i].id.toString()] = visibleWhitespaces[i];
			hasVisibleZone = true;
		}

		let keys = Object.keys(this._zones);
		for (let i = 0, len = keys.length; i < len; i++) {
			let id = keys[i];
			let zone = this._zones[id];

			let newTop = 0;
			let newHeight = 0;
			let newDisplay = 'none';
			if (visibleZones.hasOwnProperty(id)) {
				newTop = visibleZones[id].verticalOffset - ctx.bigNumbersDelta;
				newHeight = visibleZones[id].height;
				newDisplay = 'block';
				// zone is visible
				if (!zone.isVisible) {
					zone.domNode.setAttribute('monaco-visible-view-zone', 'true');
					zone.isVisible = true;
				}
				this._safeCallOnDomNodeTop(zone.delegate, ctx.getScrolledTopFromAbsoluteTop(visibleZones[id].verticalOffset));
			} else {
				if (zone.isVisible) {
					zone.domNode.removeAttribute('monaco-visible-view-zone');
					zone.isVisible = false;
				}
				this._safeCallOnDomNodeTop(zone.delegate, ctx.getScrolledTopFromAbsoluteTop(-1000000));
			}
			zone.domNode.setTop(newTop);
			zone.domNode.setHeight(newHeight);
			zone.domNode.setDisplay(newDisplay);

			if (zone.marginDomNode) {
				zone.marginDomNode.setTop(newTop);
				zone.marginDomNode.setHeight(newHeight);
				zone.marginDomNode.setDisplay(newDisplay);
			}
		}

		if (hasVisibleZone) {
			this.domNode.setWidth(Math.max(ctx.scrollWidth, this._contentWidth));
			this.marginDomNode.setWidth(this._contentLeft);
		}
	}
}
