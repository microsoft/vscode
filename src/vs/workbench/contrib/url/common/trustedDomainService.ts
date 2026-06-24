/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { URI } from '../../../../base/common/uri.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export const ITrustedDomainService = createDecorator<ITrustedDomainService>('ITrustedDomainService');

export interface ITrustedDomainService {
	_serviceBrand: undefined;
	readonly onDidChangeTrustedDomains: Event<void>;
	isValid(resource: URI): boolean;
	readonly trustedDomains: string[];
}
