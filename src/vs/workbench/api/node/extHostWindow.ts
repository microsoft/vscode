/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import Event, { Emitter } from 'vs/base/common/event';
import { IThreadService } from 'vs/workbench/services/thread/common/threadService';
import { ExtHostWindowShape, MainContext, MainThreadWindowShape } from './extHost.protocol';

export class ExtHostWindow implements ExtHostWindowShape {

	private _proxy: MainThreadWindowShape;

	private _onDidChangeWindowFocus = new Emitter<boolean>();
	readonly onDidChangeWindowFocus: Event<boolean> = this._onDidChangeWindowFocus.event;

	private _isFocused = true;
	get isFocused(): boolean { return this._isFocused; }

	constructor(threadService: IThreadService) {
		this._proxy = threadService.get(MainContext.MainThreadWindow);
		this._proxy.$getWindowVisibility().then(isFocused => this.$onDidChangeWindowFocus(isFocused));
	}

	$onDidChangeWindowFocus(isFocused: boolean): void {
		if (isFocused === this._isFocused) {
			return;
		}

		this._isFocused = isFocused;
		this._onDidChangeWindowFocus.fire(isFocused);
	}
}