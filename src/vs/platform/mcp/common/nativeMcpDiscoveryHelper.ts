/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Platform } from '../../../base/common/platform.js';
import { URI } from '../../../base/common/uri.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';

export const INativeMcpDiscoveryHelperService = createDecorator<INativeMcpDiscoveryHelperService>('INativeMcpDiscoveryHelperService');

export const NativeMcpDiscoveryHelperChannelName = 'NativeMcpDiscoveryHelper';

export interface INativeMcpDiscoveryData {
	// platform and homedir are duplicated by the remote/native environment, but here for convenience
	platform: Platform;
	homedir: URI;
	winAppData?: URI;
	xdgHome?: URI;
}

export interface INativeMcpDiscoveryHelperService {
	readonly _serviceBrand: undefined;

	load(): Promise<INativeMcpDiscoveryData>;
}
