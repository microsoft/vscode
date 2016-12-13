/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { onUnexpectedError } from 'vs/base/common/errors';
import { StyleMutator } from 'vs/base/browser/styleMutator';
import * as editorCommon from 'vs/editor/common/editorCommon';
import { ClassNames, IViewZone } from 'vs/editor/browser/editorBrowser';
import { ViewPart } from 'vs/editor/browser/view/viewPart';
import { ViewContext } from 'vs/editor/common/view/viewContext';
import { Position } from 'vs/editor/common/core/position';
import { IRenderingContext, IRestrictedRenderingContext } from 'vs/editor/common/view/renderingContext';
import { IWhitespaceManager } from 'vs/editor/browser/viewLayout/layoutProvider';

export interface IMyViewZone {
	whitespaceId: number;
	delegate: IViewZone;
	isVisible: boolean;
}

export interface IMyRenderData {
	data: editorCommon.IViewWhitespaceViewportData[];
}

interface IComputedViewZoneProps {
	afterViewLineNumber: number;
	heightInPx: number;
}

export class ViewZones extends ViewPart {

	private _whitespaceManager: IWhitespaceManager;
	private _zones: { [id: string]: IMyViewZone; };
	private _lineHeight: number;
	private _contentWidth: number;
	private _contentLeft: number;

	public domNode: HTMLElement;

	public marginDomNode: HTMLElement;

	constructor(context: ViewContext, whitespaceManager: IWhitespaceManager) {
		super(context);
		this._lineHeight = this._context.configuration.editor.lineHeight;
		this._contentWidth = this._context.configuration.editor.layoutInfo.contentWidth;
		this._contentLeft = this._context.configuration.editor.layoutInfo.contentLeft;
		this._whitespaceManager = whitespaceManager;

		this.domNode = document.createElement('div');
		this.domNode.className = ClassNames.VIEW_ZONES;
		this.domNode.style.position = 'absolute';
		this.domNode.setAttribute('role', 'presentation');
		this.domNode.setAttribute('aria-hidden', 'true');

		this.marginDomNode = document.createElement('div');
		this.marginDomNode.className = 'margin-view-zones';
		this.marginDomNode.style.position = 'absolute';
		this.marginDomNode.setAttribute('role', 'presentation');
		this.marginDomNode.setAttribute('aria-hidden', 'true');

		this._zones = {};
	}

	public dispose(): void {
		super.dispose();
		this._whitespaceManager = null;
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
			if (this._whitespaceManager.changeWhitespace(parseInt(id, 10), props.afterViewLineNumber, props.heightInPx)) {
				this._safeCallOnComputedHeight(zone.delegate, props.heightInPx);
				hadAChange = true;
			}
		}

		return hadAChange;
	}

	public onConfigurationChanged(e: editorCommon.IConfigurationChangedEvent): boolean {

		if (e.lineHeight) {
			this._lineHeight = this._context.configuration.editor.lineHeight;
			return this._recomputeWhitespacesProps();
		}

		if (e.layoutInfo) {
			this._contentWidth = this._context.configuration.editor.layoutInfo.contentWidth;
			this._contentLeft = this._context.configuration.editor.layoutInfo.contentLeft;
		}

		return false;
	}

	public onLineMappingChanged(): boolean {
		return this._recomputeWhitespacesProps();
	}

	public onLayoutChanged(layoutInfo: editorCommon.EditorLayoutInfo): boolean {
		return true;
	}

	public onScrollChanged(e: editorCommon.IScrollEvent): boolean {
		return e.scrollTopChanged || e.scrollWidthChanged;
	}

	public onZonesChanged(): boolean {
		return true;
	}

	public onModelLinesDeleted(e: editorCommon.IModelContentChangedLinesDeletedEvent): boolean {
		return true;
	}

	public onModelLinesInserted(e: editorCommon.IViewLinesInsertedEvent): boolean {
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

		let viewPosition = this._context.model.convertModelPositionToViewPosition(zoneAfterModelPosition.lineNumber, zoneAfterModelPosition.column);
		let isVisible = this._context.model.modelPositionIsVisible(zoneBeforeModelPosition);
		return {
			afterViewLineNumber: viewPosition.lineNumber,
			heightInPx: (isVisible ? this._heightInPixels(zone) : 0)
		};
	}

	public addZone(zone: IViewZone): number {
		let props = this._computeWhitespaceProps(zone);
		let whitespaceId = this._whitespaceManager.addWhitespace(props.afterViewLineNumber, this._getZoneOrdinal(zone), props.heightInPx);

		let myZone: IMyViewZone = {
			whitespaceId: whitespaceId,
			delegate: zone,
			isVisible: false
		};

		this._safeCallOnComputedHeight(myZone.delegate, props.heightInPx);

		myZone.delegate.domNode.style.position = 'absolute';
		myZone.delegate.domNode.style.width = '100%';
		StyleMutator.setDisplay(myZone.delegate.domNode, 'none');
		myZone.delegate.domNode.setAttribute('monaco-view-zone', myZone.whitespaceId.toString());
		this.domNode.appendChild(myZone.delegate.domNode);

		if (myZone.delegate.marginDomNode) {
			myZone.delegate.marginDomNode.style.position = 'absolute';
			myZone.delegate.marginDomNode.style.width = '100%';
			StyleMutator.setDisplay(myZone.delegate.marginDomNode, 'none');
			myZone.delegate.marginDomNode.setAttribute('monaco-view-zone', myZone.whitespaceId.toString());
			this.marginDomNode.appendChild(myZone.delegate.marginDomNode);
		}

		this._zones[myZone.whitespaceId.toString()] = myZone;


		this.setShouldRender();

		return myZone.whitespaceId;
	}

	public removeZone(id: number): boolean {
		if (this._zones.hasOwnProperty(id.toString())) {
			let zone = this._zones[id.toString()];
			delete this._zones[id.toString()];
			this._whitespaceManager.removeWhitespace(zone.whitespaceId);

			zone.delegate.domNode.removeAttribute('monaco-visible-view-zone');
			zone.delegate.domNode.removeAttribute('monaco-view-zone');
			zone.delegate.domNode.parentNode.removeChild(zone.delegate.domNode);

			if (zone.delegate.marginDomNode) {
				zone.delegate.marginDomNode.removeAttribute('monaco-visible-view-zone');
				zone.delegate.marginDomNode.removeAttribute('monaco-view-zone');
				zone.delegate.marginDomNode.parentNode.removeChild(zone.delegate.marginDomNode);
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
			changed = this._whitespaceManager.changeWhitespace(zone.whitespaceId, props.afterViewLineNumber, props.heightInPx) || changed;
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

	public prepareRender(ctx: IRenderingContext): void {
		// Nothing to read
		if (!this.shouldRender()) {
			throw new Error('I did not ask to render!');
		}
	}

	public render(ctx: IRestrictedRenderingContext): void {
		let visibleWhitespaces = this._whitespaceManager.getWhitespaceViewportData();
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
					zone.delegate.domNode.setAttribute('monaco-visible-view-zone', 'true');
					zone.isVisible = true;
				}
				this._safeCallOnDomNodeTop(zone.delegate, ctx.getScrolledTopFromAbsoluteTop(visibleZones[id].verticalOffset));
			} else {
				if (zone.isVisible) {
					zone.delegate.domNode.removeAttribute('monaco-visible-view-zone');
					zone.isVisible = false;
				}
				this._safeCallOnDomNodeTop(zone.delegate, ctx.getScrolledTopFromAbsoluteTop(-1000000));
			}
			StyleMutator.setTop(zone.delegate.domNode, newTop);
			StyleMutator.setHeight(zone.delegate.domNode, newHeight);
			StyleMutator.setDisplay(zone.delegate.domNode, newDisplay);

			if (zone.delegate.marginDomNode) {
				StyleMutator.setTop(zone.delegate.marginDomNode, newTop);
				StyleMutator.setHeight(zone.delegate.marginDomNode, newHeight);
				StyleMutator.setDisplay(zone.delegate.marginDomNode, newDisplay);
			}
		}

		if (hasVisibleZone) {
			StyleMutator.setWidth(this.domNode, Math.max(ctx.scrollWidth, this._contentWidth));
			StyleMutator.setWidth(this.marginDomNode, this._contentLeft);
		}
	}
}
