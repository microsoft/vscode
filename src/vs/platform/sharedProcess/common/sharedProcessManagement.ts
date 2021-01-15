/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

export const ISharedProcessManagementService = createDecorator<ISharedProcessManagementService>('sharedProcessManagement');

export interface ISharedProcessManagementService {

	readonly _serviceBrand: undefined;

	whenReady(): Promise<void>;

	toggleWindow(): Promise<void>;
}
