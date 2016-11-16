/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ILifecycleMainService } from 'vs/platform/lifecycle/common/mainLifecycle';
import { IVSCodeWindow } from 'vs/code/common/window';
import { TPromise } from 'vs/base/common/winjs.base';

export class TestLifecycleService implements ILifecycleMainService {
	public _serviceBrand: any;

	public get wasUpdated(): boolean {
		return false;
	}

	public onBeforeQuit(clb: () => void): () => void {
		return () => { };
	}

	public onAfterUnload(clb: (vscodeWindow: IVSCodeWindow) => void): () => void {
		return () => { };
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