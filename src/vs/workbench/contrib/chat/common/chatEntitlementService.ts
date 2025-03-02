/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Event } from '../../../../base/common/event.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export const IChatEntitlementService = createDecorator<IChatEntitlementService>('chatEntitlementService');

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

export interface IChatQuotas {
	readonly chatQuotaExceeded: boolean;
	readonly completionsQuotaExceeded: boolean;
	readonly quotaResetDate: Date | undefined;

	readonly chatTotal?: number;
	readonly completionsTotal?: number;

	readonly chatRemaining?: number;
	readonly completionsRemaining?: number;
}

export interface IChatEntitlementService {

	_serviceBrand: undefined;

	readonly onDidChangeEntitlement: Event<void>;

	readonly entitlement: ChatEntitlement;

	readonly onDidChangeQuotaExceeded: Event<void>;
	readonly onDidChangeQuotaRemaining: Event<void>;

	readonly quotas: IChatQuotas;

	update(token: CancellationToken): Promise<void>;
}
