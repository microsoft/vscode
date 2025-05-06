/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IElementData } from '../../../../platform/simpleBrowserElements/common/nativeSimpleBrowserElementsService.js';
import { IRectangle } from '../../../../platform/window/common/window.js';

export const ISimpleBrowserElementsService = createDecorator<ISimpleBrowserElementsService>('simpleBrowserElementsService');

export interface ISimpleBrowserElementsService {
	_serviceBrand: undefined;

	// no browser implementation yet
	getElementData(rect: IRectangle, token: CancellationToken, cancellationId?: number): Promise<IElementData | undefined>;
}
