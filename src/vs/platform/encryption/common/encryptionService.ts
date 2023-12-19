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

// The values provided to the `password-store` command line switch.
// Notice that they are not the same as the values returned by
// `getSelectedStorageBackend` in the `safeStorage` API.
export const enum PasswordStoreCLIOption {
	kwallet = 'kwallet',
	kwallet5 = 'kwallet5',
	gnome = 'gnome',
	gnomeKeyring = 'gnome-keyring',
	gnomeLibsecret = 'gnome-libsecret',
	basic = 'basic'
}

// The values returned by `getSelectedStorageBackend` in the `safeStorage` API.
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

	// The rest of these are not returned by `getSelectedStorageBackend`
	// but these were added for platform completeness.

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
