/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { ICommonEncryptionService } from 'vs/platform/encryption/common/encryptionService';

export const IEncryptionService = createDecorator<IEncryptionService>('encryptionService');

export interface IEncryptionService extends ICommonEncryptionService { }
