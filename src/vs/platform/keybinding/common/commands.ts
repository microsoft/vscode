/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {IDisposable} from 'vs/base/common/lifecycle';
import Event, {Emitter} from 'vs/base/common/event';


export class ApiCommands {

	static Instance = new ApiCommands();

	private _commands: { [id: string]: [(...args: any[]) => any, any] } = Object.create(null);
	private _onDidAddCommand = new Emitter<{ id: string; handler: (...args: any[]) => any; thisArg?: any }>();

	add(id: string, handler: (...args: any[]) => any, thisArg?: any) {
		if (this._commands[id]) {
			throw new Error();
		}
		this._commands[id] = [handler, thisArg];
		this._onDidAddCommand.fire({ id, handler, thisArg });
	}

	track(callback: (event: { id: string; handler: (...args: any[]) => any; thisArg?: any }) => any): IDisposable {
		for (let id in this._commands) {
			let [handler, thisArg] = this._commands[id];
			callback({ id, handler, thisArg });
		}
		return this._onDidAddCommand.event(callback);
	}
}

export function addApiCommand(id: string, handler: (...args: any[]) => any, thisArg?: any) {
	ApiCommands.Instance.add(id, handler, thisArg);
}