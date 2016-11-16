/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IVSCodeWindow } from 'vs/code/common/window';
import { TPromise } from 'vs/base/common/winjs.base';

export const ILifecycleMainService = createDecorator<ILifecycleMainService>('lifecycleMainService');

export interface ILifecycleMainService {
	_serviceBrand: any;

	/**
	 * Will be true if an update was applied. Will only be true for each update once.
	 */
	wasUpdated: boolean;

	onBeforeQuit(clb: () => void): () => void;
	onAfterUnload(clb: (vscodeWindow: IVSCodeWindow) => void): () => void;
	ready(): void;
	registerWindow(vscodeWindow: IVSCodeWindow): void;
	unload(vscodeWindow: IVSCodeWindow): TPromise<boolean /* veto */>;
	quit(fromUpdate?: boolean): TPromise<boolean /* veto */>;
}