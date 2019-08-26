/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI, UriComponents } from 'vs/base/common/uri';
import product from 'vs/platform/product/node/product';
import { AbstractURLService } from 'vs/platform/url/common/urlService';

export class URLService extends AbstractURLService {

	create(options?: Partial<UriComponents>): URI {
		const { authority, path, query, fragment } = options ? options : { authority: undefined, path: undefined, query: undefined, fragment: undefined };

		return URI.from({ scheme: product.urlProtocol, authority, path, query, fragment });
	}
}
