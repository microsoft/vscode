/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

export const IEncryptionService = createDecorator<IEncryptionService>('encryptionService');
export interface IEncryptionService extends ICommonEncryptionService {
	setUsePlainTextEncryption(): Promise<void>;
	getKeyStorageProvider(): Promise<KnownStorageProvider>;
}

export const IEncryptionMainService = createDecorator<IEncryptionMainService>('encryptionMainService');
export interface IEncryptionMainService extends IEncryptionService { }

export interface ICommonEncryptionService {

	readonly _serviceBrand: undefined;

	encrypt(value: string): Promise<string>;

	decrypt(value: string): Promise<string>;

	isEncryptionAvailable(): Promise<boolean>;
}

export const enum KnownStorageProvider {
	unknown = 'unknown',
	basicText = 'basic_text',

	// Linux
	gnomeAny = 'gnome_any',
	gnomeLibsecret = 'gnome_libsecret',
	gnomeKeyring = 'gnome_keyring',
	kwallet = 'kwallet',
	kwallet5 = 'kwallet5',
	kwallet6 = 'kwallet6',

	// Windows
	dplib = 'dpapi',

	// macOS
	keychainAccess = 'keychain_access',
}

export function isKwallet(backend: string): boolean {
	return backend === KnownStorageProvider.kwallet
		|| backend === KnownStorageProvider.kwallet5
		|| backend === KnownStorageProvider.kwallet6;
}

export function isGnome(backend: string): boolean {
	return backend === KnownStorageProvider.gnomeAny
		|| backend === KnownStorageProvider.gnomeLibsecret
		|| backend === KnownStorageProvider.gnomeKeyring;
}
