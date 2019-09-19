/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IElectronService } from 'vs/platform/electron/node/electron';
import { IWindowsMainService, ICodeWindow } from 'vs/platform/windows/electron-main/windows';
import { MessageBoxOptions, MessageBoxReturnValue, shell } from 'electron';
import { ILifecycleMainService } from 'vs/platform/lifecycle/electron-main/lifecycleMainService';

export class ElectronMainService implements IElectronService {

	_serviceBrand: undefined;

	constructor(
		@IWindowsMainService private readonly windowsMainService: IWindowsMainService,
		@ILifecycleMainService private readonly lifecycleMainService: ILifecycleMainService
	) {
	}

	//#region Window

	private get window(): ICodeWindow | undefined {
		return this.windowsMainService.getFocusedWindow() || this.windowsMainService.getLastActiveWindow();
	}

	async windowCount(): Promise<number> {
		return this.windowsMainService.getWindowCount();
	}

	//#endregion

	//#region Other

	async showMessageBox(options: MessageBoxOptions): Promise<MessageBoxReturnValue> {
		const result = await this.windowsMainService.showMessageBox(options, this.window);

		return {
			response: result.button,
			checkboxChecked: !!result.checkboxChecked
		};
	}

	async showItemInFolder(path: string): Promise<void> {
		shell.showItemInFolder(path);
	}

	async relaunch(options?: { addArgs?: string[], removeArgs?: string[] }): Promise<void> {
		return this.lifecycleMainService.relaunch(options);
	}

	//#endregion
}
