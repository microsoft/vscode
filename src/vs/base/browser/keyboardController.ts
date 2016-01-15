/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import DomUtils = require('vs/base/browser/dom');
import Lifecycle = require('vs/base/common/lifecycle');

export interface IKeyboardController {

	addListener(type:'keydown', callback:(event:DomUtils.IKeyboardEvent)=>void): ()=>void;
	addListener(type:'keypress', callback:(event:DomUtils.IKeyboardEvent)=>void): ()=>void;
	addListener(type:'keyup', callback:(event:DomUtils.IKeyboardEvent)=>void): ()=>void;
	addListener(type:'input', callback:(event:Event)=>void): ()=>void;
	addListener(type:string, callback:(event:any)=>void): ()=>void;

	addListener2(type:'keydown', callback:(event:DomUtils.IKeyboardEvent)=>void): Lifecycle.IDisposable;
	addListener2(type:'keypress', callback:(event:DomUtils.IKeyboardEvent)=>void): Lifecycle.IDisposable;
	addListener2(type:'keyup', callback:(event:DomUtils.IKeyboardEvent)=>void): Lifecycle.IDisposable;
	addListener2(type:'input', callback:(event:Event)=>void): Lifecycle.IDisposable;
	addListener2(type:string, callback:(event:any)=>void): Lifecycle.IDisposable;

	dispose(): void;
}

export class KeyboardController implements IKeyboardController, Lifecycle.IDisposable {

	private _listeners:{ [type:string]:(e:any)=>void; };
	private _previousKeyDown:DomUtils.IKeyboardEvent;
	private _previousEventType:string;
	private _toDispose:Lifecycle.IDisposable[];

	constructor(domNode:HTMLElement) {
		this._listeners = {};
		this._previousKeyDown = null;
		this._previousEventType = null;
		this._toDispose = [];
		this._toDispose.push(DomUtils.addStandardDisposableListener(domNode, 'keydown', (e) => this._onKeyDown(e)));
		this._toDispose.push(DomUtils.addStandardDisposableListener(domNode, 'keypress', (e) => this._onKeyPress(e)));
		this._toDispose.push(DomUtils.addStandardDisposableListener(domNode, 'keyup', (e) => this._onKeyUp(e)));
		this._toDispose.push(DomUtils.addDisposableListener(domNode, 'input', (e) => this._onInput(e)));
	}

	public dispose(): void {
		this._toDispose = Lifecycle.disposeAll(this._toDispose);
		this._listeners = null;
		this._previousKeyDown = null;
		this._previousEventType = null;
	}

	public addListener(type:string, callback:(event:DomUtils.IKeyboardEvent)=>void):()=>void {
		this._listeners[type] = callback;
		return () => {
			if (!this._listeners) {
				// disposed
				return;
			}
			this._listeners[type] = null;
		};
	}

	public addListener2(type:string, callback:(event:DomUtils.IKeyboardEvent)=>void): Lifecycle.IDisposable {
		let unbind = this.addListener(type, callback);
		return {
			dispose: () => {
				unbind();
			}
		};
	}

	private _fire(type:string, event:any): void {
		if (this._listeners.hasOwnProperty(type)) {
			this._listeners[type](event);
		}
	}

	private _onKeyDown(e:DomUtils.IKeyboardEvent): void {
		this._previousKeyDown = e.clone();
		this._previousEventType = 'keydown';
		this._fire('keydown', e);
	}

	private _onKeyPress(e:DomUtils.IKeyboardEvent): void {

		if (this._previousKeyDown) {
			if (e.shiftKey && this._previousKeyDown.asKeybinding() !== e.asKeybinding()) {
				// Looks like Shift changed the resulting character, so eat it up!
				e.shiftKey = false;
			}

			if (this._previousEventType === 'keypress') {
				// Ensure a keydown is alwas fired before a keypress
				this._fire('keydown', this._previousKeyDown);
			}
		}

		this._previousEventType = 'keypress';
		this._fire('keypress', e);
	}

	private _onInput(e:Event): void {
		this._fire('input', e);
	}

	private _onKeyUp(e:DomUtils.IKeyboardEvent): void {
		this._fire('keyup', e);
	}

}
