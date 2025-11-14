/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BrowserType, IElementData, INativeBrowserElementsService } from '../../../../platform/browserElements/common/browserElements.js';
import { IRectangle } from '../../../../platform/window/common/window.js';
import { ipcRenderer } from '../../../../base/parts/sandbox/electron-browser/globals.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { registerSingleton, InstantiationType } from '../../../../platform/instantiation/common/extensions.js';
import { IBrowserElementsService } from '../browser/browserElementsService.js';
import { IMainProcessService } from '../../../../platform/ipc/common/mainProcessService.js';
import { INativeWorkbenchEnvironmentService } from '../../environment/electron-browser/environmentService.js';
import { NativeBrowserElementsService } from '../../../../platform/browserElements/common/nativeBrowserElementsService.js';

class WorkbenchNativeBrowserElementsService extends NativeBrowserElementsService {

	constructor(
		@INativeWorkbenchEnvironmentService environmentService: INativeWorkbenchEnvironmentService,
		@IMainProcessService mainProcessService: IMainProcessService
	) {
		super(environmentService.window.id, mainProcessService);
	}
}

let cancelSelectionIdPool = 0;
let cancelAndDetachIdPool = 0;

class WorkbenchBrowserElementsService implements IBrowserElementsService {
	_serviceBrand: undefined;

	constructor(
		@INativeBrowserElementsService private readonly simpleBrowser: INativeBrowserElementsService
	) { }

	async startDebugSession(token: CancellationToken, browserType: BrowserType): Promise<void> {
		const cancelAndDetachId = cancelAndDetachIdPool++;
		const onCancelChannel = `vscode:cancelCurrentSession${cancelAndDetachId}`;

		const disposable = token.onCancellationRequested(() => {
			ipcRenderer.send(onCancelChannel, cancelAndDetachId);
			disposable.dispose();
		});
		try {
			await this.simpleBrowser.startDebugSession(token, browserType, cancelAndDetachId);
		} catch (error) {
			disposable.dispose();
			throw new Error('No debug session target found', error);
		}
	}

	async getElementData(rect: IRectangle, token: CancellationToken, browserType: BrowserType | undefined): Promise<IElementData | undefined> {
		if (!browserType) {
			return undefined;
		}
		const cancelSelectionId = cancelSelectionIdPool++;
		const onCancelChannel = `vscode:cancelElementSelection${cancelSelectionId}`;
		const disposable = token.onCancellationRequested(() => {
			ipcRenderer.send(onCancelChannel, cancelSelectionId);
		});
		try {
			const elementData = await this.simpleBrowser.getElementData(rect, token, browserType, cancelSelectionId);
			return elementData;
		} catch (error) {
			disposable.dispose();
			throw new Error(`Native Host: Error getting element data: ${error}`);
		} finally {
			disposable.dispose();
		}
	}
}

registerSingleton(IBrowserElementsService, WorkbenchBrowserElementsService, InstantiationType.Delayed);
registerSingleton(INativeBrowserElementsService, WorkbenchNativeBrowserElementsService, InstantiationType.Delayed);
