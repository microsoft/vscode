/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 by Lotas Inc.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../platform/instantiation/common/instantiation.js';
import { ExtHostBashParserShape } from './extHost.protocol.js';

export const IExtHostBashParserService = createDecorator<IExtHostBashParserService>('IExtHostBashParserService');

export interface IExtHostBashParserService extends ExtHostBashParserShape {
	readonly _serviceBrand: undefined;
}


