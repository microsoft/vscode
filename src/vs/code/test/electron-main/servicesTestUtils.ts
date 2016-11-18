/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ILifecycleMainService } from 'vs/platform/lifecycle/common/mainLifecycle';
import { IVSCodeWindow } from 'vs/code/common/window';
import { TPromise } from 'vs/base/common/winjs.base';
import Event, { Emitter } from 'vs/base/common/event';

export class TestLifecycleService implements ILifecycleMainService {
	public _serviceBrand: any;

	private _onBeforeUnload = new Emitter<IVSCodeWindow>();
	onBeforeUnload: Event<IVSCodeWindow> = this._onBeforeUnload.event;

	private _onBeforeQuit = new Emitter<void>();
	onBeforeQuit: Event<void> = this._onBeforeQuit.event;

	public get wasUpdated(): boolean {
		return false;
	}

	public ready(): void {
	}

	public registerWindow(vscodeWindow: IVSCodeWindow): void {
	}

	public unload(vscodeWindow: IVSCodeWindow): TPromise<boolean /* veto */> {
		return TPromise.as(false);
	}

	public quit(fromUpdate?: boolean): TPromise<boolean /* veto */> {
		return TPromise.as(false);
	}
}