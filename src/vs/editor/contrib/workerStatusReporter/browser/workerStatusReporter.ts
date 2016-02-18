/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


'use strict';

import 'vs/css!./workerStatusReporter';
import EditorBrowser = require('vs/editor/browser/editorBrowser');
import EditorCommon = require('vs/editor/common/editorCommon');
import Browser = require('vs/base/browser/browser');
import lifecycle = require('vs/base/common/lifecycle');
import {IThreadService, IThreadServiceStatusListener, IThreadServiceStatus} from 'vs/platform/thread/common/thread';

class WorkerStatusReporter implements EditorCommon.IEditorContribution, IThreadServiceStatusListener {

	public static ID = 'editor.contrib.workerStatusReporter';

	private _editor:EditorBrowser.ICodeEditor;
	private _toDispose:lifecycle.IDisposable[];
	private _threadService:IThreadService;

	private _domNode:HTMLElement;
	private _domNodes:HTMLElement[];

	constructor(editor:EditorBrowser.ICodeEditor, @IThreadService threadService: IThreadService) {
		this._threadService = threadService;
		this._threadService.addStatusListener(this);
		this._editor = editor;
		this._toDispose = [];

		this._domNodes = [];

		this._domNode = document.createElement('div');
		this._domNode.className = 'monaco-worker-status';
		if (Browser.canUseTranslate3d) {
			// Put the worker reporter in its own layer
			this._domNode.style.transform = 'translate3d(0px, 0px, 0px)';
		}
		this._editor.addOverlayWidget(this);
	}

	public getId():string {
		return WorkerStatusReporter.ID;
	}

	public dispose(): void {
		this._threadService.removeStatusListener(this);
		this._toDispose = lifecycle.disposeAll(this._toDispose);
	}

	public getDomNode():HTMLElement {
		return this._domNode;
	}

	public getPosition():EditorBrowser.IOverlayWidgetPosition {
		return { preference: EditorBrowser.OverlayWidgetPositionPreference.TOP_RIGHT_CORNER };
	}

	private _ensureDomNodes(desiredCount:number): void {
		// Remove extra dom nodes
		for (var i = this._domNodes.length - 1; i >= desiredCount; i++) {
			this._domNode.removeChild(this._domNodes[i]);
			this._domNodes.splice(i, 1);
		}

		// Create new dom nodes
		for (var i = this._domNodes.length; i < desiredCount; i++) {
			this._domNodes[i] = document.createElement('div');
			this._domNodes[i].className = 'worker';
			this._domNode.appendChild(this._domNodes[i]);
		}
	}

	public onThreadServiceStatus(status:IThreadServiceStatus): void {
		this._ensureDomNodes(status.workers.length);
		for (var i = 0; i < status.workers.length; i++) {
			var cnt = status.workers[i].queueSize;
			var workerStatus = 'idle';
			if (cnt > 5) {
				workerStatus = 'flooded';
			} else if (cnt > 0) {
				workerStatus = 'busy';
			}
			attr(this._domNodes[i], 'status', workerStatus);
		}
	}
}

function attr(target:HTMLElement, attrName:string, attrValue:string): void {
	target.setAttribute(attrName, attrValue);
}

// if (false) { //TODO@Debt
// 	EditorBrowserRegistry.registerEditorContribution(WorkerStatusReporter);
// }