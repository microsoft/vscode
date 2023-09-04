/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { localize } from 'vs/nls';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { extHostCustomer, IExtHostContext } from 'vs/workbench/services/extensions/common/extHostCustomers';
import { IDisposable } from 'vs/base/common/lifecycle';
import { raceCancellationError } from 'vs/base/common/async';
import { IEditSessionIdentityCreateParticipant, IEditSessionIdentityService } from 'vs/platform/workspace/common/editSessions';
import { ExtHostContext, ExtHostWorkspaceShape } from 'vs/workbench/api/common/extHost.protocol';
import { WorkspaceFolder } from 'vs/platform/workspace/common/workspace';

class ExtHostEditSessionIdentityCreateParticipant implements IEditSessionIdentityCreateParticipant {

	private readonly _proxy: ExtHostWorkspaceShape;
	private readonly timeout = 10000;

	constructor(extHostContext: IExtHostContext) {
		this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostWorkspace);
	}

	async participate(workspaceFolder: WorkspaceFolder, token: CancellationToken): Promise<void> {
		const p = new Promise<any>((resolve, reject) => {

			setTimeout(
				() => reject(new Error(localize('timeout.onWillCreateEditSessionIdentity', "Aborted onWillCreateEditSessionIdentity-event after 10000ms"))),
				this.timeout
			);
			this._proxy.$onWillCreateEditSessionIdentity(workspaceFolder.uri, token, this.timeout).then(resolve, reject);
		});

		return raceCancellationError(p, token);
	}
}

@extHostCustomer
export class EditSessionIdentityCreateParticipant {

	private _saveParticipantDisposable: IDisposable;

	constructor(
		extHostContext: IExtHostContext,
		@IInstantiationService instantiationService: IInstantiationService,
		@IEditSessionIdentityService private readonly _editSessionIdentityService: IEditSessionIdentityService
	) {
		this._saveParticipantDisposable = this._editSessionIdentityService.addEditSessionIdentityCreateParticipant(instantiationService.createInstance(ExtHostEditSessionIdentityCreateParticipant, extHostContext));
	}

	dispose(): void {
		this._saveParticipantDisposable.dispose();
	}
}
