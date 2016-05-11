/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import {TPromise} from 'vs/base/common/winjs.base';
import {IChannel} from 'vs/base/parts/ipc/common/ipc';

export interface IAIChannel extends IChannel {
	call(command: 'create', data: { key: string; eventPrefix: string; data: { [k: string]: any }; }): TPromise<number>;
	call(command: 'log', data: { handle: number; eventName: string; data: { [k: string]: any }; }): TPromise<any>;
	call(command: 'dispose', data: { handle: number; }): TPromise<any>;
	call(command: string, arg: any): TPromise<any>;
}
