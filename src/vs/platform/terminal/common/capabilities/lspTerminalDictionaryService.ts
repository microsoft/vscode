/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { InstantiationType, registerSingleton } from '../../../instantiation/common/extensions.js';
import { createDecorator } from '../../../instantiation/common/instantiation.js';

// import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
// import { registerSingleton, InstantiationType } from '../../../../../platform/instantiation/common/extensions.js';
// import { Disposable } from '../../../../../base/common/lifecycle.js';

export const ILspTerminalDictionaryService = createDecorator<ILspTerminalDictionaryService>('lspTerminalDictionaryService');

export interface ILspTerminalDictionaryService {
	readonly _serviceBrand: undefined;
	set<T>(key: string, value: T): void;
	get<T>(key: string): T | undefined;
	has(key: string): boolean;
	delete(key: string): boolean;
	clear(): void;
}

export class LspTerminalDictionaryService extends Disposable implements ILspTerminalDictionaryService {
	readonly _serviceBrand: undefined;

	private readonly _dictionary = new Map<string, any>();
	// TODO may need to have two dictionary total
	// One that maps terminalId to virtualTerminalLspDocumentUri
	// One that maps virtualTerminalLspDocumentUri to actual textModelProvider that we can use to edit contents of it.

	constructor() {
		super();
	}

	set<T>(key: string, value: T): void {
		this._dictionary.set(key, value);
	}

	get<T>(key: string): T | undefined {
		return this._dictionary.get(key);
	}

	has(key: string): boolean {
		return this._dictionary.has(key);
	}

	delete(key: string): boolean {
		return this._dictionary.delete(key);
	}

	clear(): void {
		this._dictionary.clear();
	}
}

registerSingleton(ILspTerminalDictionaryService, LspTerminalDictionaryService, InstantiationType.Delayed);
