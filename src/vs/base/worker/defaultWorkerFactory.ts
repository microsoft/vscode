/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import dom = require('vs/base/browser/dom');
import env = require('vs/base/common/flags');
import {IWorker, IWorkerCallback, IWorkerFactory} from 'vs/base/common/worker/workerClient';

function defaultGetWorkerUrl(workerId:string, label:string): string {
	return require.toUrl('./' + workerId + '?' + encodeURIComponent(label));
}
var getWorkerUrl = env.getCrossOriginWorkerScriptUrl || defaultGetWorkerUrl;


/**
 * A worker that uses HTML5 web workers so that is has
 * its own global scope and its own thread.
 */
class WebWorker implements IWorker {

	private id:number;
	private worker:any;

	constructor(id:number, label:string, onMessageCallback:IWorkerCallback) {
		this.id = id;
		this.worker = new Worker(getWorkerUrl('workerMain.js', label));
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

	public terminate(): void {
		this.worker.terminate();
	}
}

/**
 * A worker that runs in an iframe and therfore does have its
 * own global scope, but no own thread.
 */
class FrameWorker implements IWorker {

	private id: number;
	private iframe: HTMLIFrameElement;

	private onMessage: EventListener;
	private loaded: boolean;
	private beforeLoadMessages: any[];

	constructor(id: number, onMessageCallback:IWorkerCallback) {
		this.id = id;

		// Collect all messeges sent to the worker until the iframe is loaded
		this.loaded = false;
		this.beforeLoadMessages = [];

		this.iframe = <HTMLIFrameElement> document.createElement('iframe');
		this.iframe.id = this.iframeId();
		this.iframe.src = require.toUrl('./workerMainCompatibility.html');
		(<any> this.iframe).frameborder = this.iframe.height = this.iframe.width = '0';
		this.iframe.style.display = 'none';
		dom.addListener(this.iframe, 'load', () => this.onLoaded());

		this.onMessage = function(ev:any) {
			onMessageCallback(ev.data);
		};
		dom.addListener(window, 'message', this.onMessage);
		document.body.appendChild(this.iframe);
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

	public terminate(): void {
		window.removeEventListener('message', this.onMessage);
		window.frames[this.iframeId()].close();
	}
}

export class DefaultWorkerFactory implements IWorkerFactory {
	public create(id:number, onMessageCallback:IWorkerCallback, onCrashCallback:()=>void = null):IWorker {
		var result:IWorker = null;
		try {
			result = new WebWorker(id, 'service' + id, onMessageCallback);
		} catch (e) {
			result = new FrameWorker(id, onMessageCallback);
		}
		return result;
	}
}