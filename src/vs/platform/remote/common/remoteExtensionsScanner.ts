/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { InstallExtensionSummary } from '../../extensionManagement/common/extensionManagement.js';
import { IExtensionDescription } from '../../extensions/common/extensions.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';

export const IRemoteExtensionsScannerService = createDecorator<IRemoteExtensionsScannerService>('IRemoteExtensionsScannerService');

export const RemoteExtensionsScannerChannelName = 'remoteExtensionsScanner';

export interface IRemoteExtensionsScannerService {
	readonly _serviceBrand: undefined;

	/**
	 * Returns a promise that resolves to an array of extension identifiers that failed to install
	 */
	whenExtensionsReady(): Promise<InstallExtensionSummary>;
	scanExtensions(): Promise<IExtensionDescription[]>;
}
