/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import DomUtils = require('vs/base/browser/dom');
import {Gesture} from 'vs/base/browser/touch';
import {EventEmitter} from 'vs/base/common/eventEmitter';
import {IDisposable} from 'vs/base/common/lifecycle';
import {IScrollable} from 'vs/base/common/scrollable';

export class DomNodeScrollable implements IScrollable {

	private eventEmitterHelper: EventEmitter;
	private domNode: HTMLElement;
	private gestureHandler: Gesture;

	constructor(domNode: HTMLElement) {
		this.eventEmitterHelper = new EventEmitter();
		this.domNode = domNode;
		this.gestureHandler = new Gesture(this.domNode);
	}

	public getScrollHeight(): number {
		return this.domNode.scrollHeight;
	}

	public getScrollWidth(): number {
		return this.domNode.scrollWidth;
	}

	public getScrollLeft(): number {
		return this.domNode.scrollLeft;
	}

	public setScrollLeft(scrollLeft: number): void {
		this.domNode.scrollLeft = scrollLeft;
	}

	public getScrollTop(): number {
		return this.domNode.scrollTop;
	}

	public setScrollTop(scrollTop: number): void {
		this.domNode.scrollTop = scrollTop;
	}

	public addScrollListener(callback: () => void): IDisposable {
		let localDisposable = this.eventEmitterHelper.addListener2('scroll', callback);
		let domDisposable = DomUtils.addDisposableListener(this.domNode, 'scroll', (e: Event) => {
			this.eventEmitterHelper.emit('scroll', { browserEvent: e });
		});

		return {
			dispose: () => {
				domDisposable.dispose();
				localDisposable.dispose();
			}
		}
	}

	public dispose() {
		this.domNode = null;
		this.eventEmitterHelper.dispose();
		if (this.gestureHandler) {
			this.gestureHandler.dispose();
			this.gestureHandler = null;
		}
	}
}
