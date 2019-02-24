/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { ILifecycleService, LifecyclePhase, StartupKind } from 'vs/platform/lifecycle/common/lifecycle';

export class SimpleLifecycleService implements ILifecycleService {

	_serviceBrand: any;

	readonly onBeforeShutdown = Event.None;
	readonly onWillShutdown = Event.None;
	readonly onShutdown = Event.None;

	phase: LifecyclePhase;
	startupKind: StartupKind;

	when(): Promise<void> {
		return Promise.resolve();
	}
}