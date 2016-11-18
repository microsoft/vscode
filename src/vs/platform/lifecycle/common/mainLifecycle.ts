/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IVSCodeWindow } from 'vs/code/common/window';
import { TPromise } from 'vs/base/common/winjs.base';
import Event from 'vs/base/common/event';

export const ILifecycleMainService = createDecorator<ILifecycleMainService>('lifecycleMainService');

export interface ILifecycleMainService {
	_serviceBrand: any;

	/**
	 * Will be true if an update was applied. Will only be true for each update once.
	 */
	wasUpdated: boolean;

	/**
	 * Fired before the window unloads. This can either happen as a matter of closing the
	 * window or when the window is being reloaded.
	 */
	onBeforeUnload: Event<IVSCodeWindow>;

	/**
	 * Due to the way we handle lifecycle with eventing, the general app.on('before-quit')
	 * event cannot be used because it can be called twice on shutdown. Instead the onBeforeQuit
	 * handler in this module can be used and it is only called once on a shutdown sequence.
	 */
	onBeforeQuit: Event<void>;

	ready(): void;
	registerWindow(vscodeWindow: IVSCodeWindow): void;
	unload(vscodeWindow: IVSCodeWindow): TPromise<boolean /* veto */>;
	quit(fromUpdate?: boolean): TPromise<boolean /* veto */>;
}