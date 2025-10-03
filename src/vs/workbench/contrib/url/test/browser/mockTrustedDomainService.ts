/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../../base/common/event.js';
import { URI } from '../../../../../base/common/uri.js';
import { ITrustedDomainService } from '../../browser/trustedDomainService.js';
import { isURLDomainTrusted } from '../../common/trustedDomains.js';

export class MockTrustedDomainService implements ITrustedDomainService {
	_serviceBrand: undefined;

	constructor(private readonly _trustedDomains: string[] = []) {
	}

	onDidChangeTrustedDomains: Event<void> = Event.None;

	isValid(resource: URI): boolean {
		return isURLDomainTrusted(resource, this._trustedDomains);
	}
}
