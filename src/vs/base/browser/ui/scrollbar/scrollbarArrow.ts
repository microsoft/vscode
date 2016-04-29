/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {IMouseEvent} from 'vs/base/browser/mouseEvent';
import {IMouseWheelEvent, IParent} from 'vs/base/browser/ui/scrollbar/scrollableElement';
import {GlobalMouseMoveMonitor, IStandardMouseMoveEventData, standardMouseMoveMerger} from 'vs/base/browser/globalMouseMoveMonitor';
import {Widget} from 'vs/base/browser/ui/widget';
import {TimeoutTimer, IntervalTimer} from 'vs/base/common/async';

export interface IMouseWheelEventFactory {
	(): IMouseWheelEvent;
}

/**
 * The arrow image size.
 */
export const ARROW_IMG_SIZE = 11;

export class ScrollbarArrow extends Widget {

	private _parent: IParent;
	private _mouseWheelEventFactory: IMouseWheelEventFactory;
	public bgDomNode: HTMLElement;
	public domNode: HTMLElement;
	private _mousedownRepeatTimer: IntervalTimer;
	private _mousedownScheduleRepeatTimer: TimeoutTimer;
	private _mouseMoveMonitor: GlobalMouseMoveMonitor<IStandardMouseMoveEventData>;

	constructor(className: string, top: number, left: number, bottom: number, right: number, bgWidth: number, bgHeight: number, mouseWheelEventFactory: IMouseWheelEventFactory, parent: IParent) {
		super();
		this._parent = parent;
		this._mouseWheelEventFactory = mouseWheelEventFactory;

		this.bgDomNode = document.createElement('div');
		this.bgDomNode.className = 'arrow-background';
		this.bgDomNode.style.position = 'absolute';
		setSize(this.bgDomNode, bgWidth, bgHeight);
		setPosition(this.bgDomNode, (top !== null ? 0 : null), (left !== null ? 0 : null), (bottom !== null ? 0 : null), (right !== null ? 0 : null));


		this.domNode = document.createElement('div');
		this.domNode.className = className;
		this.domNode.style.position = 'absolute';
		setSize(this.domNode, ARROW_IMG_SIZE, ARROW_IMG_SIZE);
		setPosition(this.domNode, top, left, bottom, right);

		this._mouseMoveMonitor = this._register(new GlobalMouseMoveMonitor<IStandardMouseMoveEventData>());
		this.onmousedown(this.bgDomNode, (e) => this._arrowMouseDown(e));
		this.onmousedown(this.domNode, (e) => this._arrowMouseDown(e));

		this._mousedownRepeatTimer = this._register(new IntervalTimer());
		this._mousedownScheduleRepeatTimer = this._register(new TimeoutTimer());
	}

	private _arrowMouseDown(e: IMouseEvent): void {
		let repeater = () => {
			this._parent.onMouseWheel(this._mouseWheelEventFactory());
		};

		let scheduleRepeater = () => {
			this._mousedownRepeatTimer.cancelAndSet(repeater, 1000 / 24);
		};

		repeater();
		this._mousedownRepeatTimer.cancel();
		this._mousedownScheduleRepeatTimer.cancelAndSet(scheduleRepeater, 200);

		this._mouseMoveMonitor.startMonitoring(
			standardMouseMoveMerger,
			(mouseMoveData: IStandardMouseMoveEventData) => {
				/* Intentional empty */
			},
			() => {
				this._mousedownRepeatTimer.cancel();
				this._mousedownScheduleRepeatTimer.cancel();
			}
		);

		e.preventDefault();
	}
}

function setPosition(domNode: HTMLElement, top: number, left: number, bottom: number, right: number) {
	if (top !== null) {
		domNode.style.top = top + 'px';
	}
	if (left !== null) {
		domNode.style.left = left + 'px';
	}
	if (bottom !== null) {
		domNode.style.bottom = bottom + 'px';
	}
	if (right !== null) {
		domNode.style.right = right + 'px';
	}
}

function setSize(domNode: HTMLElement, width: number, height: number) {
	if (width !== null) {
		domNode.style.width = width + 'px';
	}
	if (height !== null) {
		domNode.style.height = height + 'px';
	}
}
