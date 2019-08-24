/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IExtensionDescription } from 'vs/platform/extensions/common/extensions';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

export const IExtensionStoragePaths = createDecorator<IExtensionStoragePaths>('IExtensionStoragePaths');

export interface IExtensionStoragePaths {
	_serviceBrand: any;
	whenReady: Promise<any>;
	workspaceValue(extension: IExtensionDescription): string | undefined;
	globalValue(extension: IExtensionDescription): string;
}
