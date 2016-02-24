/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as flags from 'vs/base/common/flags';
import {IDisposable, disposeAll} from 'vs/base/common/lifecycle';
import {IWorker, IWorkerCallback, IWorkerFactory} from 'vs/base/common/worker/workerClient';
import * as dom from 'vs/base/browser/dom';

function defaultGetWorkerUrl(workerId:string, label:string): string {
	return require.toUrl('./' + workerId + '?' + encodeURIComponent(label));
}
var getWorkerUrl = flags.getCrossOriginWorkerScriptUrl || defaultGetWorkerUrl;


/**
 * A worker that uses HTML5 web workers so that is has
 * its own global scope and its own thread.
 */
class WebWorker implements IWorker {

	private id:number;
	private worker:Worker;

	constructor(moduleId:string, id:number, label:string, onMessageCallback:IWorkerCallback) {
		this.id = id;
		this.worker = new Worker(getWorkerUrl('workerMain.js', label));
		this.postMessage(moduleId);
		this.worker.onmessage = function (ev:any) {
			onMessageCallback(ev.data);
		};
	}

	public getId(): number {
		return this.id;
	}

	public postMessage(msg:string): void {
		this.worker.postMessage(msg);
	}

	public dispose(): void {
		this.worker.terminate();
		this.worker = null;
	}
}

/**
 * A worker that runs in an iframe and therefore does have its
 * own global scope, but no own thread.
 */
class FrameWorker implements IWorker {

	private id: number;
	private iframe: HTMLIFrameElement;

	private onMessage: EventListener;
	private loaded: boolean;
	private beforeLoadMessages: any[];

	private _listeners: IDisposable[];

	constructor(moduleId:string, id: number, onMessageCallback:IWorkerCallback) {
		this.id = id;
		this._listeners = [];

		// Collect all messages sent to the worker until the iframe is loaded
		this.loaded = false;
		this.beforeLoadMessages = [];

		this.postMessage(moduleId);

		this.iframe = <HTMLIFrameElement> document.createElement('iframe');
		this.iframe.id = this.iframeId();
		this.iframe.src = require.toUrl('./workerMainCompatibility.html');
		(<any> this.iframe).frameborder = this.iframe.height = this.iframe.width = '0';
		this.iframe.style.display = 'none';
		this._listeners.push(dom.addDisposableListener(this.iframe, 'load', () => this.onLoaded()));

		this.onMessage = function(ev:any) {
			onMessageCallback(ev.data);
		};
		this._listeners.push(dom.addDisposableListener(window, 'message', this.onMessage));
		document.body.appendChild(this.iframe);
	}

	public dispose(): void {
		this._listeners = disposeAll(this._listeners);
		window.removeEventListener('message', this.onMessage);
		window.frames[this.iframeId()].close();
	}

	private iframeId(): string {
		return 'worker_iframe_' + this.id;
	}

	private onLoaded(): void {
		this.loaded = true;
		while (this.beforeLoadMessages.length > 0) {
			this.postMessage(this.beforeLoadMessages.shift());
		}
	}

	public getId(): number {
		return this.id;
	}

	public postMessage(msg:string): void {
		if (this.loaded === true) {
			var iframe = window.frames[this.iframeId()];
			if (iframe.postMessage) {
				iframe.postMessage(msg, '*');
			} else {
				iframe.contentWindow.postMessage(msg, '*');
			}
		} else {
			this.beforeLoadMessages.push(msg);
		}
	}
}

export class DefaultWorkerFactory implements IWorkerFactory {

	private static LAST_WORKER_ID = 0;

	public create(moduleId:string, onMessageCallback:IWorkerCallback):IWorker {
		var workerId = (++DefaultWorkerFactory.LAST_WORKER_ID);
		if (typeof WebWorker !== 'undefined') {
			return new WebWorker(moduleId, workerId, 'service' + workerId, onMessageCallback);
		}
		return new FrameWorker(moduleId, workerId, onMessageCallback);
	}
}