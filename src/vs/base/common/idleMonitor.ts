/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import Event, { Emitter } from 'vs/base/common/event';
import { IDisposable } from 'vs/base/common/lifecycle';

export enum UserStatus {
	Idle,
	Active
}

export interface IIdleMonitor extends IDisposable {
	status: UserStatus;
	onStatusChange: Event<UserStatus>;
}

export class NeverIdleMonitor implements IIdleMonitor {
	status = UserStatus.Active;
	onStatusChange = new Emitter().event;
	dispose() {}
}