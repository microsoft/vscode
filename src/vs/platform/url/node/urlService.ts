/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI, UriComponents } from 'vs/base/common/uri';
import product from 'vs/platform/product/common/product';
import { AbstractURLService } from 'vs/platform/url/common/urlService';

export class URLService extends AbstractURLService {

	create(options?: Partial<UriComponents>): URI {
		let { authority, path, query, fragment } = options ? options : { authority: undefined, path: undefined, query: undefined, fragment: undefined };

		if (authority && path && path.indexOf('/') !== 0) {
			path = `/${path}`; // URI validation requires a path if there is an authority
		}

		return URI.from({ scheme: product.urlProtocol, authority, path, query, fragment });
	}
}
