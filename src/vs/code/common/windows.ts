/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import Event from 'vs/base/common/event';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IDisposable } from 'vs/base/common/lifecycle';

export const IWindowEventService = createDecorator<IWindowEventService>('windowEventService');

export interface IWindowEventService {
	_serviceBrand: any;

	onNewWindowOpen: Event<number>;
	onWindowFocus: Event<number>;
}

export class ActiveWindowManager implements IDisposable {

	private disposables: IDisposable[] = [];
	private _activeWindowId: number;

	constructor(@IWindowEventService private windowService: IWindowEventService) {
		this.disposables.push(this.windowService.onNewWindowOpen(windowId => this.setActiveWindow(windowId)));
		this.disposables.push(this.windowService.onWindowFocus(windowId => this.setActiveWindow(windowId)));
	}

	private setActiveWindow(windowId: number) {
		this._activeWindowId = windowId;
	}

	public get activeClientId(): string {
		return `window:${ this._activeWindowId }`;
	}

	public dispose() {
		for (const disposable of this.disposables) {
			disposable.dispose();
		}
	}
}