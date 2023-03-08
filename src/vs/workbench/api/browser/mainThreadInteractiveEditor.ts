/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableMap } from 'vs/base/common/lifecycle';
import { IInteractiveEditorService } from 'vs/editor/contrib/interactive/common/interactiveEditor';
import { ExtHostContext, ExtHostInteractiveEditorShape, MainContext, MainThreadInteractiveEditorShape } from 'vs/workbench/api/common/extHost.protocol';
import { IExtHostContext, extHostNamedCustomer } from 'vs/workbench/services/extensions/common/extHostCustomers';

@extHostNamedCustomer(MainContext.MainThreadInteractiveEditor)
export class MainThreadInteractiveEditor implements MainThreadInteractiveEditorShape {

	private readonly _registrations = new DisposableMap<number>();
	private readonly _proxy: ExtHostInteractiveEditorShape;

	constructor(
		extHostContext: IExtHostContext,
		@IInteractiveEditorService private readonly _interactiveEditorService: IInteractiveEditorService,
	) {
		this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostInteractiveEditor);
	}

	dispose(): void {
		this._registrations.dispose();
	}

	async $registerInteractiveEditorProvider(handle: number, debugName: string): Promise<void> {
		const unreg = this._interactiveEditorService.add({
			debugName,
			prepareInteractiveEditorSession: async (model, range, token) => {
				const session = await this._proxy.$prepareInteractiveSession(handle, model.uri, range, token);
				if (!session) {
					return undefined;
				}
				return {
					...session,
					dispose: () => {
						this._proxy.$releaseSession(handle, session.id);
					}
				};
			},
			provideResponse: (item, request, token) => {
				return this._proxy.$provideResponse(handle, item, request, token);
			}
		});

		this._registrations.set(handle, unreg);
	}

	async $unregisterInteractiveEditorProvider(handle: number): Promise<void> {
		this._registrations.deleteAndDispose(handle);
	}
}
