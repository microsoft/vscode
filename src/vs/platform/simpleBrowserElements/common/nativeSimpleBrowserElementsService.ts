/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../base/common/cancellation.js';
import { ProxyChannel } from '../../../base/parts/ipc/common/ipc.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { IMainProcessService } from '../../ipc/common/mainProcessService.js';
import { IRectangle } from '../../window/common/window.js';

export const INativeSimpleBrowserElementsService = createDecorator<INativeSimpleBrowserElementsService>('nativeSimpleBrowserElementsService');

export interface IElementData {
	readonly outerHTML: string;
	readonly computedStyle: string;
	readonly bounds: IRectangle;
}

export interface INativeSimpleBrowserElementsService {

	readonly _serviceBrand: undefined;

	// Properties
	readonly windowId: number;

	getElementData(rect: IRectangle, token: CancellationToken, cancellationId?: number): Promise<IElementData | undefined>;
}

// @ts-ignore: interface is implemented via proxy
export class NativeSimpleBrowserElementsService implements INativeSimpleBrowserElementsService {

	declare readonly _serviceBrand: undefined;

	constructor(
		readonly windowId: number,
		@IMainProcessService mainProcessService: IMainProcessService
	) {
		return ProxyChannel.toService<INativeSimpleBrowserElementsService>(mainProcessService.getChannel('simpleBrowserElements'), {
			context: windowId,
			properties: (() => {
				const properties = new Map<string, unknown>();
				properties.set('windowId', windowId);

				return properties;
			})()
		});
	}
}

