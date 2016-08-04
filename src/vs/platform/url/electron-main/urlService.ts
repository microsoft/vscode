/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import Event, {Emitter} from 'vs/base/common/event';
import {IDisposable, dispose, toDisposable} from 'vs/base/common/lifecycle';
import {IURLService} from 'vs/platform/url/common/url';
import {app} from 'electron';

export class URLService implements IURLService, IDisposable {

	_serviceBrand: any;

	private _onOpenURL = new Emitter<string>();
	onOpenURL: Event<string> = this._onOpenURL.event;
	private disposables: IDisposable[] = [];

	constructor() {
		const handler = (e: Electron.Event, url: string) => {
			e.preventDefault();
			this._onOpenURL.fire(url);
		};

		app.on('open-url', handler);
		this.disposables.push(toDisposable(() => app.removeListener('open-url', handler)));

		// app.setAsDefaultProtocolClient('vscode');
	}

	dispose(): void {
		this.disposables = dispose(this.disposables);
	}
}