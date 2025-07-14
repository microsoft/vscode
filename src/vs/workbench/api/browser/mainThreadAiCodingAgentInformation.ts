/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// import { Disposable, DisposableMap } from '../../../base/common/lifecycle.js';
// import { extHostNamedCustomer, IExtHostContext } from '../../services/extensions/common/extHostCustomers.js';
// import { AiSettingsSearchResult, IAiSettingsSearchProvider, IAiSettingsSearchService } from '../../services/aiSettingsSearch/common/aiSettingsSearch.js';
// import { ExtHostContext, MainContext, ExtHostAiCodingAgentInformationShape, MainThreadAiCodingAgentInformationShape, } from '../common/extHost.protocol.js';
// import { IAiCodingAgentInformationProvider, IAiCodingAgentInformationService } from '../../services/aiCodingAgentInformation/common/aiCodingAgentInformation.js';

// @extHostNamedCustomer(MainContext.MainThreadAiCodingAgentInformation)
// export class MainThreadAiCodingAgentInformation extends Disposable implements MainThreadAiCodingAgentInformationShape {
// 	private readonly _proxy: ExtHostAiCodingAgentInformationShape;
// 	private readonly _registrations = this._register(new DisposableMap<number>());

// 	constructor(
// 		context: IExtHostContext,
// 		@IAiCodingAgentInformationService private readonly _aiCodingAgentInformationService: IAiCodingAgentInformationService,
// 	) {
// 		super();
// 		this._proxy = context.getProxy(ExtHostContext.ExtHostAiCodingAgentInformation);
// 	}

// 	$registerCodingAgentInfoProvider(handle: number): void {
// 		const provider: IAiCodingAgentInformationProvider = {
// 			getAllSessions: (token) => {
// 				return this._proxy.$getAllSessions(token);
// 			},
// 			getSessionDetails: (id, token) => {
// 				return this._proxy.$getSessionDetails(id, token);
// 			}
// 		}

// 		this._registrations.set(handle, this._aiCodingAgentInformationService.registerCodingAgentProvider(provider));
// 	}

// 	$unregisterCodingAgentInfoProvider(handle: number): void {
// 		this._registrations.deleteAndDispose(handle);
// 	}
// }
