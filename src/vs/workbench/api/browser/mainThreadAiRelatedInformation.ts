/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../base/common/cancellation.js';
import { Disposable, DisposableMap } from '../../../base/common/lifecycle.js';
import { ExtHostAiRelatedInformationShape, ExtHostContext, MainContext, MainThreadAiRelatedInformationShape } from '../common/extHost.protocol.js';
import { RelatedInformationType } from '../common/extHostTypes.js';
import { IAiRelatedInformationProvider, IAiRelatedInformationService, RelatedInformationResult } from '../../services/aiRelatedInformation/common/aiRelatedInformation.js';
import { IExtHostContext, extHostNamedCustomer } from '../../services/extensions/common/extHostCustomers.js';

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
