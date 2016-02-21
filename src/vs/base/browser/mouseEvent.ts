/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as platform from 'vs/base/common/platform';
import * as browser from 'vs/base/browser/browser';
import {IframeUtils} from 'vs/base/browser/iframe';

export interface IMouseEvent {
	browserEvent:MouseEvent;
	leftButton:boolean;
	middleButton:boolean;
	rightButton:boolean;
	target:HTMLElement;
	detail:number;
	posx:number;
	posy:number;
	ctrlKey:boolean;
	shiftKey:boolean;
	altKey:boolean;
	metaKey:boolean;
	timestamp:number;

	preventDefault(): void;
	stopPropagation(): void;
}

export class StandardMouseEvent implements IMouseEvent {

	public browserEvent:MouseEvent;

	public leftButton:boolean;
	public middleButton:boolean;
	public rightButton:boolean;
	public target:HTMLElement;
	public detail:number;
	public posx:number;
	public posy:number;
	public ctrlKey:boolean;
	public shiftKey:boolean;
	public altKey:boolean;
	public metaKey:boolean;
	public timestamp:number;

	constructor(e:MouseEvent) {
		this.timestamp = Date.now();
		this.browserEvent = e;
		this.leftButton = e.button === 0;
		this.middleButton = e.button === 1;
		this.rightButton = e.button === 2;

		this.target = e.target || (<any>e).targetNode || e.srcElement;

		this.detail = e.detail || 1;
		if (e.type === 'dblclick') {
			this.detail = 2;
		}
		this.posx = 0;
		this.posy = 0;
		this.ctrlKey = e.ctrlKey;
		this.shiftKey = e.shiftKey;
		this.altKey = e.altKey;
		this.metaKey = e.metaKey;

		let readClientCoords = () => {
			if (e.clientX || e.clientY) {
				this.posx = e.clientX + document.body.scrollLeft + document.documentElement.scrollLeft;
				this.posy = e.clientY + document.body.scrollTop + document.documentElement.scrollTop;
				return true;
			}
			return false;
		};

		let readPageCoords = () => {
			if (e.pageX || e.pageY) {
				this.posx = e.pageX;
				this.posy = e.pageY;
				return true;
			}
			return false;
		};

		let test1 = readPageCoords, test2 = readClientCoords;
		if (browser.isIE10) {
			// The if A elseif B logic here is inversed in IE10 due to an IE10 issue
			test1 = readClientCoords;
			test2 = readPageCoords;
		}

		if (!test1()) {
			test2();
		}

		// Find the position of the iframe this code is executing in relative to the iframe where the event was captured.
		let iframeOffsets = IframeUtils.getPositionOfChildWindowRelativeToAncestorWindow(self, e.view);
		this.posx -= iframeOffsets.left;
		this.posy -= iframeOffsets.top;
	}

	public preventDefault(): void {
		if (this.browserEvent.preventDefault) {
			this.browserEvent.preventDefault();
		}
	}

	public stopPropagation(): void {
		if (this.browserEvent.stopPropagation) {
			this.browserEvent.stopPropagation();
		}
	}
}

export interface IDataTransfer {
	dropEffect:string;
	effectAllowed:string;
	types:any[];
	files:any[];

	setData(type:string, data:string):void;
	setDragImage(image:any, x:number, y:number):void;

	getData(type:string):string;
	clearData(types?:string[]):void;
}

export class DragMouseEvent extends StandardMouseEvent {

	public dataTransfer:IDataTransfer;

	constructor(e:MouseEvent) {
		super(e);
		this.dataTransfer = (<any>e).dataTransfer;
	}

}

export class DropMouseEvent extends DragMouseEvent {

	constructor(e:MouseEvent) {
		super(e);
	}

}

interface IWebKitMouseWheelEvent {
	wheelDeltaY:number;
	wheelDeltaX:number;
}

interface IGeckoMouseWheelEvent {
	HORIZONTAL_AXIS:number;
	VERTICAL_AXIS:number;
	axis:number;
	detail:number;
}

export class StandardMouseWheelEvent {

	public browserEvent:MouseWheelEvent;
	public deltaY:number;
	public deltaX:number;
	public target:Node;

	constructor(e:MouseWheelEvent, deltaX:number = 0, deltaY:number = 0) {

		this.browserEvent = e || null;
		this.target = e ? (e.target || (<any>e).targetNode || e.srcElement) : null;

		this.deltaY = deltaY;
		this.deltaX = deltaX;

		if (e) {
			let e1 = <IWebKitMouseWheelEvent><any>e;
			let e2 = <IGeckoMouseWheelEvent><any>e;

			// vertical delta scroll
			if (typeof e1.wheelDeltaY !== 'undefined') {
				this.deltaY = e1.wheelDeltaY / 120;
			} else if (typeof e2.VERTICAL_AXIS !== 'undefined' && e2.axis === e2.VERTICAL_AXIS) {
				this.deltaY = -e2.detail / 3;
			}

			// horizontal delta scroll
			if (typeof e1.wheelDeltaX !== 'undefined') {
				if (browser.isSafari && platform.isWindows) {
					this.deltaX = - (e1.wheelDeltaX / 120);
				} else {
					this.deltaX = e1.wheelDeltaX / 120;
				}
			} else if (typeof e2.HORIZONTAL_AXIS !== 'undefined' && e2.axis === e2.HORIZONTAL_AXIS) {
				this.deltaX = -e.detail / 3;
			}

			// Assume a vertical scroll if nothing else worked
			if (this.deltaY === 0 && this.deltaX === 0 && e.wheelDelta) {
				this.deltaY = e.wheelDelta / 120;
			}
		}
	}

	public preventDefault(): void {
		if (this.browserEvent) {
			if (this.browserEvent.preventDefault) {
				this.browserEvent.preventDefault();
			}
		}
	}

	public stopPropagation(): void {
		if (this.browserEvent) {
			if (this.browserEvent.stopPropagation) {
				this.browserEvent.stopPropagation();
			}
		}
	}
}
