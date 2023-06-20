/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

export const IEncryptionService = createDecorator<IEncryptionService>('encryptionService');
export interface IEncryptionService extends ICommonEncryptionService { }

export const IEncryptionMainService = createDecorator<IEncryptionMainService>('encryptionMainService');
export interface IEncryptionMainService extends IEncryptionService { }

export interface ICommonEncryptionService {

	readonly _serviceBrand: undefined;

	encrypt(value: string): Promise<string>;

	decrypt(value: string): Promise<string>;

	isEncryptionAvailable(): Promise<boolean>;
}
