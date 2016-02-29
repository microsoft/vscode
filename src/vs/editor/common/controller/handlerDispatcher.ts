/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {IDispatcherEvent, IHandler} from 'vs/editor/common/editorCommon';

export class DispatcherEvent implements IDispatcherEvent {

	private source:string;
	private data:any;

	constructor(source:string, data:any) {
		this.source = source;
		this.data = data;
	}

	public getSource(): string {
		return this.source;
	}

	public getData(): any {
		return this.data;
	}
}

interface IHandlersMap {
	[key:string]:IHandler;
}

export class HandlerDispatcher {
	private registry:IHandlersMap;

	constructor() {
		this.registry = {};
	}

	public setHandler(handlerId:string, handlerCallback:IHandler): void {
		this.registry[handlerId] = handlerCallback;
	}

	public clearHandlers(): void {
		this.registry = {};
	}

	private getHandler(handlerId:string): IHandler {
		return this.registry.hasOwnProperty(handlerId) ? this.registry[handlerId] : null;
	}

	public trigger(source:string, handlerId:string, payload:any): boolean {
		var handler = this.getHandler(handlerId);
		var handled = false;
		if (handler) {
			var e = new DispatcherEvent(source, payload);
			handled = handler(e);
		}
		return handled;
	}
}
