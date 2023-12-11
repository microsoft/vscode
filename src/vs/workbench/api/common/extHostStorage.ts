/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { MainContext, MainThreadStorageShape, ExtHostStorageShape } from './extHost.protocol';
import { Emitter } from 'vs/base/common/event';
import { IExtHostRpcService } from 'vs/workbench/api/common/extHostRpcService';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IExtensionIdWithVersion } from 'vs/platform/extensionManagement/common/extensionStorage';
import { ILogService } from 'vs/platform/log/common/log';

export interface IStorageChangeEvent {
	shared: boolean;
	key: string;
	value: object;
}

export class ExtHostStorage implements ExtHostStorageShape {

	readonly _serviceBrand: undefined;

	private _proxy: MainThreadStorageShape;

	private readonly _onDidChangeStorage = new Emitter<IStorageChangeEvent>();
	readonly onDidChangeStorage = this._onDidChangeStorage.event;

	constructor(
		mainContext: IExtHostRpcService,
		private readonly _logService: ILogService
	) {
		this._proxy = mainContext.getProxy(MainContext.MainThreadStorage);
	}

	registerExtensionStorageKeysToSync(extension: IExtensionIdWithVersion, keys: string[]): void {
		this._proxy.$registerExtensionStorageKeysToSync(extension, keys);
	}

	async initializeExtensionStorage(shared: boolean, key: string, defaultValue?: object): Promise<object | undefined> {
		const value = await this._proxy.$initializeExtensionStorage(shared, key);

		let parsedValue: object | undefined;
		if (value) {
			parsedValue = this.safeParseValue(shared, key, value);
		}

		return parsedValue || defaultValue;
	}

	setValue(shared: boolean, key: string, value: object): Promise<void> {
		return this._proxy.$setValue(shared, key, value);
	}

	$acceptValue(shared: boolean, key: string, value: string): void {
		const parsedValue = this.safeParseValue(shared, key, value);
		if (parsedValue) {
			this._onDidChangeStorage.fire({ shared, key, value: parsedValue });
		}
	}

	private safeParseValue(shared: boolean, key: string, value: string): object | undefined {
		try {
			return JSON.parse(value);
		} catch (error) {
			// Do not fail this call but log it for diagnostics
			// https://github.com/microsoft/vscode/issues/132777
			this._logService.error(`[extHostStorage] unexpected error parsing storage contents (extensionId: ${key}, global: ${shared}): ${error}`);
		}

		return undefined;
	}
}

export interface IExtHostStorage extends ExtHostStorage { }
export const IExtHostStorage = createDecorator<IExtHostStorage>('IExtHostStorage');
