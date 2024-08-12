/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { createDecorator, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { ITitleService } from 'vs/workbench/services/title/browser/titleService';
import { Disposable } from 'vs/base/common/lifecycle';

export interface IWindowTitleVariableService {
	readonly _serviceBrand: undefined;
	setVariable(key: string, value: string): void;
}

export const IWindowTitleVariableService = createDecorator<IWindowTitleVariableService>('windowTitleVariableService');

export class WindowTitleVariableService extends Disposable implements IWindowTitleVariableService {
	declare readonly _serviceBrand: undefined;
	private readonly _contextKeyMap = new Map<string, IContextKey<string>>();

	constructor(
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@ITitleService private readonly titleService: ITitleService
	) {
		super();
	}

	setVariable(key: string, value: string): void {
		const prefixedKey = `windowTitleVariable.${key}`;

		let contextKey = this._contextKeyMap.get(prefixedKey);
		if (!contextKey) {
			contextKey = this.contextKeyService.createKey(prefixedKey, value);
			this._contextKeyMap.set(prefixedKey, contextKey);
			this.titleService.registerVariables([
				{ name: prefixedKey, contextKey: prefixedKey }
			]);
		} else {
			contextKey.set(value);
		}
	}
}

export function registerWindowTitleVariable(accessor: ServicesAccessor, key: string, value: string) {
	const windowTitleVariableService = accessor.get(IWindowTitleVariableService);
	windowTitleVariableService.setVariable(key, value);
}
