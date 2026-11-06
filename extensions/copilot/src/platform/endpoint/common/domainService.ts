/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createServiceIdentifier } from '../../../util/common/services';
import { Event } from '../../../util/vs/base/common/event';

export interface IDomainChangeEvent {
	capiUrlChanged: boolean;
	telemetryUrlChanged: boolean;
	dotcomUrlChanged: boolean;
	proxyUrlChanged: boolean;
}

/**
 * Very simple service used for dynamically setting the domains we use for API calls
 * This allows better testing, SKU isolation, and Proxima
 */
export interface IDomainService {
	readonly _serviceBrand: undefined;
	readonly onDidChangeDomains: Event<IDomainChangeEvent>;
}
export const IDomainService = createServiceIdentifier<IDomainService>('IDomainService');
