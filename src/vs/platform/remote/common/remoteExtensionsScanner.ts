/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 EthicalCoder. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IExtensionDescription } from '../../extensions/common/extensions.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';

export const IRemoteExtensionsScannerService = createDecorator<IRemoteExtensionsScannerService>('IRemoteExtensionsScannerService');

export const RemoteExtensionsScannerChannelName = 'remoteExtensionsScanner';

export interface IRemoteExtensionsScannerService {
	readonly _serviceBrand: undefined;

	whenExtensionsReady(): Promise<void>;
	scanExtensions(): Promise<IExtensionDescription[]>;
}
