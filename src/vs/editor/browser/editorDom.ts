/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {IDisposable, Disposable} from 'vs/base/common/lifecycle';
import {StandardMouseEvent} from 'vs/base/browser/mouseEvent';
import * as dom from 'vs/base/browser/dom';
import {GlobalMouseMoveMonitor} from 'vs/base/browser/globalMouseMoveMonitor';

export class EditorMouseEvent extends StandardMouseEvent {
	_editorMouseEventBrand: void;

	editorPos: dom.IDomNodePagePosition;

	/**
	 * The horizontal position of the cursor relative to the viewport (i.e. scrolled).
	 */
	viewportx: number;

	/**
	 * The vertical position of the cursor relative to the viewport (i.e. scrolled).
	 */
	viewporty: number;

	constructor(e:MouseEvent, editorViewDomNode: HTMLElement) {
		super(e);
		this.editorPos = dom.getDomNodePagePosition(editorViewDomNode);

		this.viewportx = this.posx - dom.StandardWindow.scrollX;
		this.viewporty = this.posy - dom.StandardWindow.scrollY;
	}
}

export interface EditorMouseEventMerger {
	(lastEvent:EditorMouseEvent, currentEvent:EditorMouseEvent): EditorMouseEvent;
}

export class EditorMouseEventFactory {

	private _editorViewDomNode: HTMLElement;

	constructor(editorViewDomNode: HTMLElement) {
		this._editorViewDomNode = editorViewDomNode;
	}

	private _create(e:MouseEvent): EditorMouseEvent {
		return new EditorMouseEvent(e, this._editorViewDomNode);
	}

	public onContextMenu(target:HTMLElement, callback:(e:EditorMouseEvent)=>void): IDisposable {
		return dom.addDisposableListener(target, 'contextmenu', (e:MouseEvent) => {
			callback(this._create(e));
		});
	}

	public onMouseUp(target:HTMLElement, callback:(e:EditorMouseEvent)=>void): IDisposable {
		return dom.addDisposableListener(target, 'mouseup', (e:MouseEvent) => {
			callback(this._create(e));
		});
	}

	public onMouseDown(target:HTMLElement, callback:(e:EditorMouseEvent)=>void): IDisposable {
		return dom.addDisposableListener(target, 'mousedown', (e:MouseEvent) => {
			callback(this._create(e));
		});
	}

	public onMouseLeave(target:HTMLElement, callback:(e:EditorMouseEvent)=>void): IDisposable {
		return dom.addDisposableNonBubblingMouseOutListener(target, (e:MouseEvent) => {
			callback(this._create(e));
		});
	}

	public onMouseMoveThrottled(target:HTMLElement, callback:(e:EditorMouseEvent)=>void, merger:EditorMouseEventMerger, minimumTimeMs:number): IDisposable {
		let myMerger: dom.IEventMerger<EditorMouseEvent> = (lastEvent:EditorMouseEvent, currentEvent:MouseEvent): EditorMouseEvent => {
			return merger(lastEvent, this._create(currentEvent));
		};
		return dom.addDisposableThrottledListener<EditorMouseEvent>(target, 'mousemove', callback, myMerger, minimumTimeMs);
	}
}

export class GlobalEditorMouseMoveMonitor extends Disposable {

	private _editorViewDomNode: HTMLElement;
	private _globalMouseMoveMonitor: GlobalMouseMoveMonitor<EditorMouseEvent>;

	constructor(editorViewDomNode: HTMLElement) {
		super();
		this._editorViewDomNode = editorViewDomNode;
		this._globalMouseMoveMonitor = this._register(new GlobalMouseMoveMonitor<EditorMouseEvent>());
	}

	public startMonitoring(merger:EditorMouseEventMerger, mouseMoveCallback:(e:EditorMouseEvent)=>void, onStopCallback:()=>void): void {
		let myMerger: dom.IEventMerger<EditorMouseEvent> = (lastEvent:EditorMouseEvent, currentEvent:MouseEvent): EditorMouseEvent => {
			return merger(lastEvent, new EditorMouseEvent(currentEvent, this._editorViewDomNode));
		};
		this._globalMouseMoveMonitor.startMonitoring(myMerger, mouseMoveCallback, onStopCallback);
	}
}
