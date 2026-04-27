/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isMacintosh } from '../../../base/common/platform.js';
import { ISharedKeychainMainService } from '../common/sharedKeychainService.js';
import { ILogService } from '../../log/common/log.js';
import { IProductService } from '../../product/common/productService.js';

type KeychainModule = typeof import('@vscode/macos-keychain');

export class SharedKeychainMainService implements ISharedKeychainMainService {
	declare readonly _serviceBrand: undefined;

	private _modulePromise: Promise<KeychainModule> | undefined;
	private readonly serviceName: string;
	private readonly enabled: boolean;

	constructor(
		@IProductService productService: IProductService,
		@ILogService private readonly logService: ILogService,
	) {
		this.enabled = isMacintosh && !!productService.darwinSharedKeychainServiceName;
		this.serviceName = productService.darwinSharedKeychainServiceName ?? '';
	}

	private getModule(): Promise<KeychainModule> {
		if (!this._modulePromise) {
			this._modulePromise = import('@vscode/macos-keychain');
		}
		return this._modulePromise;
	}

	async get(key: string): Promise<string | undefined> {
		if (!this.enabled) {
			return undefined;
		}
		try {
			const mod = await this.getModule();
			const value = mod.keychainGet(this.serviceName, key);
			this.logService.trace('[SharedKeychainMainService] get:', key, value !== undefined ? '(found)' : '(not found)');
			return value;
		} catch (err) {
			this.logService.error('[SharedKeychainMainService] get failed:', key, err);
			return undefined;
		}
	}

	async set(key: string, value: string): Promise<void> {
		if (!this.enabled) {
			return;
		}
		try {
			const mod = await this.getModule();
			mod.keychainSet(this.serviceName, key, value);
			this.logService.trace('[SharedKeychainMainService] set:', key);
		} catch (err) {
			this.logService.error('[SharedKeychainMainService] set failed:', key, err);
		}
	}

	async delete(key: string): Promise<boolean> {
		if (!this.enabled) {
			return false;
		}
		try {
			const mod = await this.getModule();
			const deleted = mod.keychainDelete(this.serviceName, key);
			this.logService.trace('[SharedKeychainMainService] delete:', key, deleted ? '(deleted)' : '(not found)');
			return deleted;
		} catch (err) {
			this.logService.error('[SharedKeychainMainService] delete failed:', key, err);
			return false;
		}
	}

	async keys(): Promise<string[]> {
		if (!this.enabled) {
			return [];
		}
		try {
			const mod = await this.getModule();
			const result = mod.keychainList(this.serviceName);
			this.logService.trace('[SharedKeychainMainService] keys: found', result.length, 'entries');
			return result;
		} catch (err) {
			this.logService.error('[SharedKeychainMainService] keys failed:', err);
			return [];
		}
	}
}
