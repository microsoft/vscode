/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../base/common/lifecycle.js';
import { ExtHostChatQuotaShape, IMainContext, IQuotaSnapshotsDto, MainContext, MainThreadChatQuotaShape } from './extHost.protocol.js';

export class ExtHostChatQuota extends Disposable implements ExtHostChatQuotaShape {

	private readonly _proxy: MainThreadChatQuotaShape;

	constructor(
		mainContext: IMainContext,
	) {
		super();
		this._proxy = mainContext.getProxy(MainContext.MainThreadChatQuota);
	}

	updateQuotas(quotas: IQuotaSnapshotsDto): void {
		this._proxy.$updateQuotas(quotas);
	}
}
