/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TPromise } from 'vs/base/common/winjs.base';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

export const IOpenSettingsService = createDecorator<IOpenSettingsService>('openSettingsService');

export interface IOpenSettingsService {
	_serviceBrand: any;

	openGlobalSettings(): TPromise<void>;
	openWorkspaceSettings(): TPromise<void>;
	openGlobalKeybindingSettings(): TPromise<void>;

}
