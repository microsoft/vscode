/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../base/common/cancellation.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { IRectangle } from '../../window/common/window.js';

export const INativeBrowserElementsService = createDecorator<INativeBrowserElementsService>('nativeBrowserElementsService');

export interface IElementData {
	readonly outerHTML: string;
	readonly computedStyle: string;
	readonly bounds: IRectangle;
}

export enum BrowserType {
	SimpleBrowser = 'simpleBrowser',
	LiveServer = 'liveServer',
}


export interface INativeBrowserElementsService {

	readonly _serviceBrand: undefined;

	// Properties
	readonly windowId: number;

	getElementData(rect: IRectangle, token: CancellationToken, browserType: BrowserType, cancellationId?: number): Promise<IElementData | undefined>;

	startDebugSession(token: CancellationToken, browserType: BrowserType, cancelAndDetachId?: number): Promise<void>;
}
