/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../../base/common/event.js';
import { URI } from '../../../../../base/common/uri.js';
import { ITrustedDomainService } from '../../browser/trustedDomainService.js';
import { isURLDomainTrusted } from '../../../../../platform/url/common/trustedDomains.js';

export class MockTrustedDomainService implements ITrustedDomainService {
	_serviceBrand: undefined;

	constructor(private readonly _trustedDomains: string[] = []) {
	}

	readonly onDidChangeTrustedDomains: Event<void> = Event.None;

	get trustedDomains(): string[] {
		return this._trustedDomains;
	}

	isValid(resource: URI): boolean {
		return isURLDomainTrusted(resource, this._trustedDomains);
	}
}
