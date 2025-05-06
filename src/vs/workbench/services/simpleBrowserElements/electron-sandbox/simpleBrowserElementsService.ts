/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IElementData, INativeSimpleBrowserElementsService, NativeSimpleBrowserElementsService } from '../../../../platform/simpleBrowserElements/common/nativeSimpleBrowserElementsService.js';
import { IRectangle } from '../../../../platform/window/common/window.js';
import { ipcRenderer } from '../../../../base/parts/sandbox/electron-sandbox/globals.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { registerSingleton, InstantiationType } from '../../../../platform/instantiation/common/extensions.js';
import { ISimpleBrowserElementsService } from '../browser/simpleBrowserElementsService.js';
import { IMainProcessService } from '../../../../platform/ipc/common/mainProcessService.js';
import { INativeWorkbenchEnvironmentService } from '../../environment/electron-sandbox/environmentService.js';

class WorkbenchNativeSimpleBrowserElementsService extends NativeSimpleBrowserElementsService {

	constructor(
		@INativeWorkbenchEnvironmentService environmentService: INativeWorkbenchEnvironmentService,
		@IMainProcessService mainProcessService: IMainProcessService
	) {
		super(environmentService.window.id, mainProcessService);
	}
}

let cancelSelectionIdPool = 0;

class WorkbenchSimpleBrowserElementsService implements ISimpleBrowserElementsService {
	_serviceBrand: undefined;

	constructor(
		@INativeSimpleBrowserElementsService private readonly simpleBrowser: INativeSimpleBrowserElementsService
	) { }

	async getElementData(rect: IRectangle, token: CancellationToken): Promise<IElementData | undefined> {
		const cancelSelectionId = cancelSelectionIdPool++;
		const onCancelChannel = `vscode:cancelElementSelection${cancelSelectionId}`;
		const disposable = token.onCancellationRequested(() => {
			ipcRenderer.send(onCancelChannel, cancelSelectionId);
		});
		try {
			const elementData = await this.simpleBrowser.getElementData(rect, token, cancelSelectionId);
			return elementData;
		} catch (error) {
			disposable.dispose();
			throw new Error(`Native Host: Error getting element data: ${error}`);
		} finally {
			disposable.dispose();
		}
	}
}

registerSingleton(ISimpleBrowserElementsService, WorkbenchSimpleBrowserElementsService, InstantiationType.Delayed);
registerSingleton(INativeSimpleBrowserElementsService, WorkbenchNativeSimpleBrowserElementsService, InstantiationType.Delayed);
