/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { HeaderContributor, ReqHeaders } from '../../networking/common/networking';

export class TestHeaderContributor implements HeaderContributor {
	headerKey = 'test';
	contributeHeaderValues(headers: ReqHeaders) {
		headers[this.headerKey] = 'true';
	}
}
