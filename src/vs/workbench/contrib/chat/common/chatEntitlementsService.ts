/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export const IChatEntitlementsService = createDecorator<IChatEntitlementsService>('chatEntitlementsService');

export enum ChatEntitlement {
	/** Signed out */
	Unknown = 1,
	/** Signed in but not yet resolved */
	Unresolved,
	/** Signed in and entitled to Limited */
	Available,
	/** Signed in but not entitled to Limited */
	Unavailable,
	/** Signed-up to Limited */
	Limited,
	/** Signed-up to Pro */
	Pro
}

export interface IChatEntitlements {
	readonly entitlement: ChatEntitlement;
	readonly quotas?: IQuotas;
}

export interface IQuotas {
	readonly chatTotal?: number;
	readonly completionsTotal?: number;

	readonly chatRemaining?: number;
	readonly completionsRemaining?: number;

	readonly resetDate?: string;
}

export interface IChatEntitlementsService {

	_serviceBrand: undefined;

	resolve(token: CancellationToken): Promise<IChatEntitlements | undefined>;
}
