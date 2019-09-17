/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IElectronService } from 'vs/platform/electron/node/electron';
import { IWindowsMainService, ICodeWindow } from 'vs/platform/windows/electron-main/windows';
import { MessageBoxOptions, MessageBoxReturnValue } from 'electron';
import { IServerChannel } from 'vs/base/parts/ipc/common/ipc';
import { Event } from 'vs/base/common/event';

export class ElectronMainService implements IElectronService {

	_serviceBrand: undefined;

	constructor(
		@IWindowsMainService private readonly windowsMainService: IWindowsMainService
	) {
	}

	private get window(): ICodeWindow | undefined {
		return this.windowsMainService.getFocusedWindow() || this.windowsMainService.getLastActiveWindow();
	}

	async showMessageBox(options: MessageBoxOptions): Promise<MessageBoxReturnValue> {
		const result = await this.windowsMainService.showMessageBox(options, this.window);

		return {
			response: result.button,
			checkboxChecked: !!result.checkboxChecked
		};
	}
}

export class ElectronChannel implements IServerChannel {

	private service: { [key: string]: unknown };

	constructor(service: IElectronService) {
		this.service = service as unknown as { [key: string]: unknown };
	}

	listen<T>(_: unknown, event: string): Event<T> {
		throw new Error(`Event not found: ${event}`);
	}

	call(_: unknown, command: string, arg?: any): Promise<any> {
		const target = this.service[command];
		if (typeof target === 'function') {
			if (Array.isArray(arg)) {
				return target.apply(this.service, arg);
			}

			return target.call(this.service, arg);
		}

		throw new Error(`Call Not Found in ElectronService: ${command}`);
	}
}
