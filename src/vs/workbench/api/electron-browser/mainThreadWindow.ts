/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import { IWindowService } from 'vs/platform/windows/common/windows';
import { MainThreadWindowShape, ExtHostWindowShape, ExtHostContext } from '../node/extHost.protocol';
import { IThreadService } from 'vs/workbench/services/thread/common/threadService';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';

export class MainThreadWindow extends MainThreadWindowShape {

	private readonly proxy: ExtHostWindowShape;
	private disposables: IDisposable[] = [];

	constructor(
		@IThreadService threadService: IThreadService,
		@IWindowService private windowService: IWindowService
	) {
		super();
		this.proxy = threadService.get(ExtHostContext.ExtHostWindow);

		windowService.onDidChangeFocus(this.proxy.$onDidChangeWindowFocus, this.proxy, this.disposables);
	}

	$getWindowVisibility(): TPromise<boolean> {
		return this.windowService.isFocused();
	}

	dispose(): void {
		this.disposables = dispose(this.disposables);
	}
}
