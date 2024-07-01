/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IExtensionDescription } from 'vs/platform/extensions/common/extensions';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

export const IRemoteExtensionsScannerService = createDecorator<IRemoteExtensionsScannerService>('IRemoteExtensionsScannerService');

export const RemoteExtensionsScannerChannelName = 'remoteExtensionsScanner';

export interface IRemoteExtensionsScannerService {
	readonly _serviceBrand: undefined;

	whenExtensionsReady(): Promise<void>;
	scanExtensions(): Promise<IExtensionDescription[]>;
}
