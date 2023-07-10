/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { ILogService } from 'vs/platform/log/common/log';

export const ISharedProcessLifecycleService = createDecorator<ISharedProcessLifecycleService>('sharedProcessLifecycleService');

export interface ISharedProcessLifecycleService {

	readonly _serviceBrand: undefined;

	/**
	 * An event for when the application will shutdown
	 */
	readonly onWillShutdown: Event<void>;
}

export class SharedProcessLifecycleService extends Disposable implements ISharedProcessLifecycleService {

	declare readonly _serviceBrand: undefined;

	private readonly _onWillShutdown = this._register(new Emitter<void>());
	readonly onWillShutdown = this._onWillShutdown.event;

	constructor(
		@ILogService private readonly logService: ILogService
	) {
		super();
	}

	fireOnWillShutdown(): void {
		this.logService.trace('Lifecycle#onWillShutdown.fire()');

		this._onWillShutdown.fire();
	}
}
