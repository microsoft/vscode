/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { Disposable, DisposableMap, IDisposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { ExtHostContext, ExtHostProfileContentHandlersShape, MainContext, MainThreadProfileContentHandlersShape } from 'vs/workbench/api/common/extHost.protocol';
import { extHostNamedCustomer, IExtHostContext } from 'vs/workbench/services/extensions/common/extHostCustomers';
import { IUserDataProfileImportExportService } from 'vs/workbench/services/userDataProfile/common/userDataProfile';

@extHostNamedCustomer(MainContext.MainThreadProfileContentHandlers)
export class MainThreadProfileContentHandlers extends Disposable implements MainThreadProfileContentHandlersShape {

	private readonly proxy: ExtHostProfileContentHandlersShape;

	private readonly registeredHandlers = this._register(new DisposableMap<string, IDisposable>());

	constructor(
		context: IExtHostContext,
		@IUserDataProfileImportExportService private readonly userDataProfileImportExportService: IUserDataProfileImportExportService,
	) {
		super();
		this.proxy = context.getProxy(ExtHostContext.ExtHostProfileContentHandlers);
	}

	async $registerProfileContentHandler(id: string, name: string, extensionId: string): Promise<void> {
		this.registeredHandlers.set(id, this.userDataProfileImportExportService.registerProfileContentHandler(id, {
			name,
			extensionId,
			saveProfile: async (name: string, content: string, token: CancellationToken) => {
				const result = await this.proxy.$saveProfile(id, name, content, token);
				return result ? URI.revive(result) : null;
			},
			readProfile: async (uri: URI, token: CancellationToken) => {
				return this.proxy.$readProfile(id, uri, token);
			},
		}));
	}

	async $unregisterProfileContentHandler(id: string): Promise<void> {
		this.registeredHandlers.deleteAndDispose(id);
	}

}
