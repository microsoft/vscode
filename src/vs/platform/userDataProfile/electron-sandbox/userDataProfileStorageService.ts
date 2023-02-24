/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IUserDataProfileStorageService, NativeUserDataProfileStorageService } from 'vs/platform/userDataProfile/common/userDataProfileStorageService';
import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';

registerSingleton(IUserDataProfileStorageService, NativeUserDataProfileStorageService, InstantiationType.Delayed);
