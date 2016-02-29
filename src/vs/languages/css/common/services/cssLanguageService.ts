/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import URI from 'vs/base/common/uri';
import winjs = require('vs/base/common/winjs.base');
import nodes = require('vs/languages/css/common/parser/cssNodes');
import parser = require('vs/languages/css/common/parser/cssParser');
import EditorCommon = require('vs/editor/common/editorCommon');
import resourceService = require('vs/editor/common/services/resourceService');

interface Entry {
	node:nodes.Stylesheet;
	version:number;
}

export interface ILanguageService {
	join():winjs.TPromise<void>;
	getStylesheet(resource:URI):nodes.Stylesheet;
}

class PromiseWithTrigger<T> extends winjs.TPromise<T> {

	private _valueCallback:winjs.ValueCallback;
	private _errorCallback:winjs.ErrorCallback;

	constructor() {
		super((c, e, p) => {
			this._valueCallback = c;
			this._errorCallback = e;
		});
	}

	public resolve(data:T):PromiseWithTrigger<T> {
		this._valueCallback(data);
		return this;
	}

	public reject(err:any):PromiseWithTrigger<T> {
		this._errorCallback(err);
		return this;
	}
}

export class CSSLanguageService implements ILanguageService {

	private resourceService:resourceService.IResourceService;
	private entries:{[url:string]:Entry;};
	private activeDelay:PromiseWithTrigger<any>;
	private onChangeHandle:number;
	private callOnDispose:Function[];
	private createParser: () => parser.Parser;

	constructor(service:resourceService.IResourceService, createParser: () => parser.Parser, private _cssModeId:string) {
		this.resourceService = service;
		this.entries = {};
		this.callOnDispose = [];
		this.createParser = createParser;

		this.updateResources();
		this.callOnDispose.push(this.resourceService.addListener_(resourceService.ResourceEvents.ADDED, (e: resourceService.IResourceAddedEvent) => this.onResourceAdded(e)));
		this.callOnDispose.push(this.resourceService.addListener_(resourceService.ResourceEvents.REMOVED, (e: resourceService.IResourceRemovedEvent) => this.onResourceRemoved(e)));
		this.callOnDispose.push(this.resourceService.addListener_(resourceService.ResourceEvents.CHANGED, (e: resourceService.IResourceChangedEvent) => this.onResourceChange(e)));
	}

	public dispose():void {
		while(this.callOnDispose.length > 0) {
			this.callOnDispose.pop()();
		}
		clearTimeout(this.onChangeHandle);
		this.onChangeHandle = null;
		this.entries = null;
	}

	private onResourceAdded(e: resourceService.IResourceAddedEvent):void {
		if (this._isMyMirrorModel(e.addedElement)) {
			this._scheduleRefreshLanguageService();
		}
	}

	private onResourceRemoved(e: resourceService.IResourceRemovedEvent):void {
		var url = e.url.toString();
		if (this.entries.hasOwnProperty(url)) {
			delete this.entries[url];
		}
	}

	private onResourceChange(e: resourceService.IResourceChangedEvent):void {
		if (this._isMyModel(e.url)) {
			this._scheduleRefreshLanguageService();
		}
	}

	private _scheduleRefreshLanguageService(): void {
		if (!this.activeDelay) {
			this.activeDelay = new PromiseWithTrigger<any>();
		}
		if (this.onChangeHandle) {
			clearTimeout(this.onChangeHandle);
		}
		this.onChangeHandle = setTimeout(() => {
			this.updateResources();
			this.activeDelay.resolve(null);
			this.activeDelay = null;
			this.onChangeHandle = null;
		}, 50);
	}

	public join():winjs.TPromise<void> {
		return (this.activeDelay || winjs.TPromise.as(null));
	}

	private _isMyMirrorModel(resource:EditorCommon.IMirrorModel): boolean {
		return resource.getMode().getId() === this._cssModeId;
	}

	private _isMyModel(url:URI): boolean {
		return this._isMyMirrorModel(this.resourceService.get(url));
	}

	private updateResources():void {

		var n = 0;

		this.resourceService.all().filter((element) => this._isMyMirrorModel(element)).forEach((model:EditorCommon.IMirrorModel) => {
			// Reparse changes or new models
			var url = model.getAssociatedResource().toString(),
				entry = this.entries[url],
				hasEntry = typeof entry !== 'undefined';

			if(!hasEntry || entry.version !== model.getVersionId()) {

				if(!hasEntry) {
					entry = { node: null, version: -1 };
					this.entries[url] = entry;
				}

				entry.node = this.createParser().parseStylesheet(model);
				entry.node.setName(url);
				entry.version = model.getVersionId();

				n += 1;
			}
		});

//		console.info('[less] updating ' + n + ' resources took ms' + (new Date().getTime() - t1));
	}

	public getStylesheet(resource:URI):nodes.Stylesheet {
		if(this.entries.hasOwnProperty(resource.toString())) {
			return this.entries[resource.toString()].node;
		}
		return null;
	}

}