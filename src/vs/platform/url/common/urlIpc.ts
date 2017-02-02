/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import { IChannel, eventToCall, eventFromCall, Serializer, Deserializer } from 'vs/base/parts/ipc/common/ipc';
import { IURLService } from './url';
import Event, { filterEvent } from 'vs/base/common/event';
import { IWindowsService } from 'vs/platform/windows/common/windows';
import URI from 'vs/base/common/uri';

const URISerializer: Serializer<URI, any> = uri => uri.toJSON();
const URIDeserializer: Deserializer<URI, any> = raw => URI.revive(raw);

export interface IURLChannel extends IChannel {
	call(command: 'event:onOpenURL'): TPromise<void>;
	call(command: string, arg?: any): TPromise<any>;
}

export class URLChannel implements IURLChannel {

	private focusedWindowId: number;

	constructor(
		private service: IURLService,
		@IWindowsService windowsService: IWindowsService
	) {
		windowsService.onWindowFocus(id => this.focusedWindowId = id);
	}

	call(command: string, arg?: any): TPromise<any> {
		switch (command) {
			case 'event:onOpenURL': return eventToCall(filterEvent(this.service.onOpenURL, () => this.isWindowFocused(arg)), URISerializer);
		}
		return undefined;
	}

	/**
	 * We only want the focused window to get pinged with the onOpenUrl event.
	 * The idea here is to filter the onOpenUrl event with the knowledge of which
	 * was the last window to be focused. When first listening to the event,
	 * each client sends its window ID via the arguments to `call(...)`.
	 * When the event fires, the server has enough knowledge to filter the event
	 * and fire it only to the focused window.
	 */
	private isWindowFocused(windowID: number): boolean {
		return this.focusedWindowId === windowID;
	}
}

export class URLChannelClient implements IURLService {

	_serviceBrand: any;

	constructor(private channel: IChannel, private windowID: number) { }

	private _onOpenURL = eventFromCall<URI>(this.channel, 'event:onOpenURL', this.windowID, URIDeserializer);
	get onOpenURL(): Event<URI> { return this._onOpenURL; }

	open(url: string): void {
		return; // not implemented
	}
}