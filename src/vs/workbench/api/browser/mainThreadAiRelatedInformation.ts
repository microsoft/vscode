/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { Disposable, DisposableMap } from 'vs/base/common/lifecycle';
import { ExtHostAiRelatedInformationShape, ExtHostContext, MainContext, MainThreadAiRelatedInformationShape } from 'vs/workbench/api/common/extHost.protocol';
import { RelatedInformationType } from 'vs/workbench/api/common/extHostTypes';
import { IAiRelatedInformationProvider, IAiRelatedInformationService, RelatedInformationResult } from 'vs/workbench/services/aiRelatedInformation/common/aiRelatedInformation';
import { IExtHostContext, extHostNamedCustomer } from 'vs/workbench/services/extensions/common/extHostCustomers';

@extHostNamedCustomer(MainContext.MainThreadAiRelatedInformation)
export class MainThreadAiRelatedInformation extends Disposable implements MainThreadAiRelatedInformationShape {
	private readonly _proxy: ExtHostAiRelatedInformationShape;
	private readonly _registrations = this._register(new DisposableMap<number>());

	constructor(
		context: IExtHostContext,
		@IAiRelatedInformationService private readonly _aiRelatedInformationService: IAiRelatedInformationService,
	) {
		super();
		this._proxy = context.getProxy(ExtHostContext.ExtHostAiRelatedInformation);
	}

	$getAiRelatedInformation(query: string, types: RelatedInformationType[]): Promise<RelatedInformationResult[]> {
		// TODO: use a real cancellation token
		return this._aiRelatedInformationService.getRelatedInformation(query, types, CancellationToken.None);
	}

	$registerAiRelatedInformationProvider(handle: number, type: RelatedInformationType): void {
		const provider: IAiRelatedInformationProvider = {
			provideAiRelatedInformation: (query, token) => {
				return this._proxy.$provideAiRelatedInformation(handle, query, token);
			},
		};
		this._registrations.set(handle, this._aiRelatedInformationService.registerAiRelatedInformationProvider(type, provider));
	}

	$unregisterAiRelatedInformationProvider(handle: number): void {
		this._registrations.deleteAndDispose(handle);
	}
}
