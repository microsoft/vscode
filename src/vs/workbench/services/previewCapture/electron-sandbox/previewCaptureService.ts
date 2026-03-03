/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ProxyChannel } from '../../../../base/parts/ipc/common/ipc.js';
import { IMainProcessService } from '../../../../platform/ipc/common/mainProcessService.js';
import { IPreviewCaptureService } from '../../../../platform/previewCapture/common/previewCapture.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';

// @ts-ignore: interface is implemented via proxy
class PreviewCaptureService implements IPreviewCaptureService {

	declare readonly _serviceBrand: undefined;

	constructor(
		@IMainProcessService mainProcessService: IMainProcessService
	) {
		return ProxyChannel.toService<IPreviewCaptureService>(
			mainProcessService.getChannel('previewCapture')
		);
	}
}

registerSingleton(IPreviewCaptureService, PreviewCaptureService, InstantiationType.Delayed);
