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

interface IComputedViewZoneProps {
	afterViewLineNumber: number;
	heightInPx: number;
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

	private _recomputeWhitespacesProps(): boolean {
		let id:string;
		let zone2Height:{[id:string]:number;} = {};
		let hadAChange = false;

		for (id in this._zones) {
			if (this._zones.hasOwnProperty(id)) {
				let zone = this._zones[id];
				let props = this._computeWhitespaceProps(zone.delegate);
				if (this._whitespaceManager.changeWhitespace(parseInt(id, 10), props.afterViewLineNumber, props.heightInPx)) {
					this._safeCallOnComputedHeight(zone.delegate, props.heightInPx);
					zone2Height[id] = props.heightInPx;
					hadAChange = true;
				}
			}
		}

		if (hadAChange) {
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
		}

		return hadAChange;
	}

	public onConfigurationChanged(e:editorCommon.IConfigurationChangedEvent): boolean {

		if (e.lineHeight) {
			return this._recomputeWhitespacesProps();
		}

		return false;
	}

	public onLineMappingChanged(): boolean {
		return this._recomputeWhitespacesProps();
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


	private _computeWhitespaceProps(zone:IViewZone): IComputedViewZoneProps {
		if (zone.afterLineNumber === 0) {
			return {
				afterViewLineNumber: 0,
				heightInPx: this._heightInPixels(zone)
			};
		}

		let zoneAfterModelPosition:editorCommon.IPosition;
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

			zoneAfterModelPosition = {
				lineNumber: validAfterLineNumber,
				column: this._context.model.getModelLineMaxColumn(validAfterLineNumber)
			};
		}

		let zoneBeforeModelPosition:editorCommon.IPosition;
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

	public addZone(zone:IViewZone): number {
		let props = this._computeWhitespaceProps(zone);
		let whitespaceId = this._whitespaceManager.addWhitespace(props.afterViewLineNumber, this._getZoneOrdinal(zone), props.heightInPx);

		let myZone:IMyViewZone = {
			whitespaceId: whitespaceId,
			delegate: zone,
			isVisible: false
		};

		this._safeCallOnComputedHeight(myZone.delegate, props.heightInPx);

		this._requestModificationFrame(() => {
			if (!myZone.delegate.domNode.hasAttribute('monaco-view-zone')) {
				// Do not position zone if it was removed in the meantime
				return;
			}
			myZone.delegate.domNode.style.position = 'absolute';
			StyleMutator.setHeight(myZone.delegate.domNode, props.heightInPx);
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
		let changed = false;
		if (this._zones.hasOwnProperty(id.toString())) {
			let zone = this._zones[id.toString()];
			let props = this._computeWhitespaceProps(zone.delegate);
			// let newOrdinal = this._getZoneOrdinal(zone.delegate);
			changed = this._whitespaceManager.changeWhitespace(zone.whitespaceId, props.afterViewLineNumber, props.heightInPx) || changed;
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
