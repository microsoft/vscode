/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {onUnexpectedError} from 'vs/base/common/errors';
import {StyleMutator} from 'vs/base/browser/styleMutator';
import * as editorCommon from 'vs/editor/common/editorCommon';
import {ClassNames, IRenderingContext, IViewContext, IViewZone} from 'vs/editor/browser/editorBrowser';
import {ViewPart} from 'vs/editor/browser/view/viewPart';

export interface IMyViewZone {
	whitespaceId: number;
	delegate: IViewZone;
	isVisible: boolean;
}

export interface IMyRenderData {
	data: editorCommon.IViewWhitespaceViewportData[];
}

export class ViewZones extends ViewPart {

	private _whitespaceManager:editorCommon.IWhitespaceManager;
	private _zones: { [id:string]:IMyViewZone; };

	public domNode: HTMLElement;

	constructor(context:IViewContext, whitespaceManager:editorCommon.IWhitespaceManager) {
		super(context);
		this._whitespaceManager = whitespaceManager;
		this.domNode = document.createElement('div');
		this.domNode.className = ClassNames.VIEW_ZONES;
		this.domNode.style.position = 'absolute';
		this.domNode.setAttribute('role', 'presentation');
		this.domNode.setAttribute('aria-hidden', 'true');
		this._zones = {};
	}

	public dispose(): void {
		super.dispose();
		this._whitespaceManager = null;
		this._zones = {};
	}

	// ---- begin view event handlers

	public onConfigurationChanged(e:editorCommon.IConfigurationChangedEvent): boolean {

		if (e.lineHeight) {
			var id:string,
				zone:IMyViewZone,
				newComputedHeight:number,
				zone2Height:{[id:string]:number;} = {};

			for (id in this._zones) {
				if (this._zones.hasOwnProperty(id)) {
					zone = this._zones[id];
					newComputedHeight = this._heightInPixels(zone.delegate);
					this._safeCallOnComputedHeight(zone.delegate, newComputedHeight);
					zone2Height[id] = newComputedHeight;
					this._whitespaceManager.changeWhitespace(parseInt(id, 10), newComputedHeight);
				}
			}

			this._requestModificationFrame(() => {
				for (id in this._zones) {
					if (this._zones.hasOwnProperty(id)) {
						if (zone2Height.hasOwnProperty(id)) {
							// TODO@Alex - edit dom node properties only in render()
							StyleMutator.setHeight(this._zones[id].delegate.domNode, zone2Height[id]);
						}
					}
				}
			});

			return true;
		}

		return false;
	}

	public onLineMappingChanged(): boolean {

		var hadAChange = false,
			zone:IMyViewZone,
			id:string;

		for (id in this._zones) {
			if (this._zones.hasOwnProperty(id)) {
				zone = this._zones[id];
				var newAfterLineNumber = this._computeWhitespaceAfterLineNumber(zone.delegate);
				hadAChange = this._whitespaceManager.changeAfterLineNumberForWhitespace(parseInt(id, 10), newAfterLineNumber) || hadAChange;
			}
		}

		return hadAChange;
	}

	public onLayoutChanged(layoutInfo:editorCommon.IEditorLayoutInfo): boolean {
		return true;
	}

	public onScrollChanged(e:editorCommon.IScrollEvent): boolean {
		return e.vertical;
	}

	public onScrollWidthChanged(newScrollWidth: number): boolean {
		return true;
	}

	public onZonesChanged(): boolean {
		return true;
	}

	public onModelLinesDeleted(e:editorCommon.IModelContentChangedLinesDeletedEvent): boolean {
		return true;
	}

	public onModelLinesInserted(e:editorCommon.IViewLinesInsertedEvent): boolean {
		return true;
	}

	// ---- end view event handlers

	private _getZoneOrdinal(zone:IViewZone): number {

		if (typeof zone.afterColumn !== 'undefined') {
			return zone.afterColumn;
		}

		return 10000;
	}


	private _computeWhitespaceAfterLineNumber(zone:IViewZone): number {
		if (zone.afterLineNumber === 0) {
			return 0;
		}

		var zoneAfterModelPosition:editorCommon.IPosition;
		if (typeof zone.afterColumn !== 'undefined') {
			zoneAfterModelPosition = this._context.model.validateModelPosition({
				lineNumber: zone.afterLineNumber,
				column: zone.afterColumn
			});
		} else {
			var validAfterLineNumber = this._context.model.validateModelPosition({
				lineNumber: zone.afterLineNumber,
				column: 1
			}).lineNumber;

			zoneAfterModelPosition = {
				lineNumber: validAfterLineNumber,
				column: this._context.model.getModelLineMaxColumn(validAfterLineNumber)
			};
		}

		var viewPosition = this._context.model.convertModelPositionToViewPosition(zoneAfterModelPosition.lineNumber, zoneAfterModelPosition.column);
		return viewPosition.lineNumber;
	}

	public addZone(zone:IViewZone): number {
		var computedHeight = this._heightInPixels(zone);
		var whitespaceId = this._whitespaceManager.addWhitespace(this._computeWhitespaceAfterLineNumber(zone), this._getZoneOrdinal(zone), computedHeight);

		var myZone:IMyViewZone = {
			whitespaceId: whitespaceId,
			delegate: zone,
			isVisible: false
		};

		this._safeCallOnComputedHeight(myZone.delegate, computedHeight);

		this._requestModificationFrame(() => {
			if (!myZone.delegate.domNode.hasAttribute('monaco-view-zone')) {
				// Do not position zone if it was removed in the meantime
				return;
			}
			myZone.delegate.domNode.style.position = 'absolute';
			StyleMutator.setHeight(myZone.delegate.domNode, computedHeight);
			myZone.delegate.domNode.style.width = '100%';
			StyleMutator.setDisplay(myZone.delegate.domNode, 'none');
		});

		this._zones[myZone.whitespaceId.toString()] = myZone;

		myZone.delegate.domNode.setAttribute('monaco-view-zone', myZone.whitespaceId.toString());
		this.domNode.appendChild(myZone.delegate.domNode);

		return myZone.whitespaceId;
	}

	public removeZone(id:number): boolean {
		if (this._zones.hasOwnProperty(id.toString())) {
			var zone = this._zones[id.toString()];
			delete this._zones[id.toString()];
			this._whitespaceManager.removeWhitespace(zone.whitespaceId);

			zone.delegate.domNode.removeAttribute('monaco-visible-view-zone');
			zone.delegate.domNode.removeAttribute('monaco-view-zone');

			this._requestModificationFrame(() => {
				if (zone.delegate.domNode.hasAttribute('monaco-view-zone')) {
					// This dom node was added again as a view zone, so no need to mutate the DOM here
					return;
				}
				if (zone.delegate.domNode.parentNode) {
					zone.delegate.domNode.parentNode.removeChild(zone.delegate.domNode);
				}
			});
			return true;
		}
		return false;
	}

	public layoutZone(id: number): boolean {
		var changed = false;
		if (this._zones.hasOwnProperty(id.toString())) {
			var zone = this._zones[id.toString()];

			var newComputedHeight = this._heightInPixels(zone.delegate);
			var newAfterLineNumber = this._computeWhitespaceAfterLineNumber(zone.delegate);
			// var newOrdinal = this._getZoneOrdinal(zone.delegate);

			changed = this._whitespaceManager.changeWhitespace(zone.whitespaceId, newComputedHeight) || changed;
			changed = this._whitespaceManager.changeAfterLineNumberForWhitespace(zone.whitespaceId, newAfterLineNumber) || changed;
			// TODO@Alex: change `newOrdinal` too
		}
		return changed;
	}

	public shouldSuppressMouseDownOnViewZone(id:number): boolean {
		if (this._zones.hasOwnProperty(id.toString())) {
			var zone = this._zones[id.toString()];
			return zone.delegate.suppressMouseDown;
		}
		return false;
	}

	private _heightInPixels(zone:IViewZone): number {
		if (typeof zone.heightInPx === 'number') {
			return zone.heightInPx;
		}
		if (typeof zone.heightInLines === 'number') {
			return this._context.configuration.editor.lineHeight * zone.heightInLines;
		}
		return this._context.configuration.editor.lineHeight;
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

	_render(ctx:IRenderingContext): void {
		var visibleWhitespaces = this._whitespaceManager.getWhitespaceViewportData();

		this._requestModificationFrame(() => {
			var visibleZones:{[id:string]:editorCommon.IViewWhitespaceViewportData;} = {},
				i:number,
				len:number,
				hasVisibleZone = false;

			for (i = 0, len = visibleWhitespaces.length; i < len; i++) {
				visibleZones[visibleWhitespaces[i].id.toString()] = visibleWhitespaces[i];
				hasVisibleZone = true;
			}

			var id:string,
				zone:IMyViewZone;

			for (id in this._zones) {
				if (this._zones.hasOwnProperty(id)) {
					zone = this._zones[id];

					if (visibleZones.hasOwnProperty(id)) {
						// zone is visible
						StyleMutator.setTop(zone.delegate.domNode, (visibleZones[id].verticalOffset - ctx.bigNumbersDelta));
						StyleMutator.setHeight(zone.delegate.domNode, visibleZones[id].height);
						if (!zone.isVisible) {
							StyleMutator.setDisplay(zone.delegate.domNode, 'block');
							zone.delegate.domNode.setAttribute('monaco-visible-view-zone', 'true');
							zone.isVisible = true;
						}
						this._safeCallOnDomNodeTop(zone.delegate, ctx.getScrolledTopFromAbsoluteTop(visibleZones[id].verticalOffset));
					} else {
						if (zone.isVisible) {
							StyleMutator.setDisplay(zone.delegate.domNode, 'none');
							zone.delegate.domNode.removeAttribute('monaco-visible-view-zone');
							zone.isVisible = false;
						}
						this._safeCallOnDomNodeTop(zone.delegate, ctx.getScrolledTopFromAbsoluteTop(-1000000));
					}
				}
			}

			if (hasVisibleZone) {
				StyleMutator.setWidth(this.domNode, ctx.scrollWidth);
			}
		});
	}
}
