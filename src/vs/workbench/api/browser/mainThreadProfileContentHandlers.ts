/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../base/common/cancellation.js';
import { Disposable, DisposableMap, IDisposable } from '../../../base/common/lifecycle.js';
import { revive } from '../../../base/common/marshalling.js';
import { URI } from '../../../base/common/uri.js';
import { ExtHostContext, ExtHostProfileContentHandlersShape, MainContext, MainThreadProfileContentHandlersShape } from '../common/extHost.protocol.js';
import { extHostNamedCustomer, IExtHostContext } from '../../services/extensions/common/extHostCustomers.js';
import { ISaveProfileResult, IUserDataProfileImportExportService } from '../../services/userDataProfile/common/userDataProfile.js';

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

	async $registerProfileContentHandler(id: string, name: string, description: string | undefined, extensionId: string): Promise<void> {
		this.registeredHandlers.set(id, this.userDataProfileImportExportService.registerProfileContentHandler(id, {
			name,
			description,
			extensionId,
			saveProfile: async (name: string, content: string, token: CancellationToken) => {
				const result = await this.proxy.$saveProfile(id, name, content, token);
				return result ? revive<ISaveProfileResult>(result) : null;
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
