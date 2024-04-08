/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable } from 'vs/base/common/lifecycle';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { ExtHostAccessibilityServiceShape, MainContext, MainThreadAccessibilityServiceShape } from 'vs/workbench/api/common/extHost.protocol';
import { IExtHostRpcService } from 'vs/workbench/api/common/extHostRpcService';
import * as vscode from 'vscode';
import { Disposable as VSCodeDisposable } from './extHostTypes';

export interface IExtHostAccessibilityService extends IDisposable, ExtHostAccessibilityServiceShape {
	readonly _serviceBrand: undefined;
}

export const IExtHostAccessibilityService = createDecorator<IExtHostAccessibilityService>('IExtHostAccessibilityService');

class ExtHostAccessibilityService implements IExtHostAccessibilityService {
	protected _proxy: MainThreadAccessibilityServiceShape;
	declare readonly _serviceBrand: undefined;
	constructor(
		@IExtHostRpcService extHostRpc: IExtHostRpcService
	) {
		this._proxy = extHostRpc.getProxy(MainContext.MainThreadAccessibilityService);
	}

	dispose(): void {
		// nothing to do
	}

	$registerAccessibilityHelpProvider(provider: vscode.AccessibilityHelpProvider): vscode.Disposable {
		// to do cache and check if already registered
		this._proxy.$registerAccessibilityHelpProvider(provider);
		return new VSCodeDisposable(() => {
			this._proxy.$unregisterAccessibilityHelpProvider(provider.id);
		});
	}

}
