/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../base/common/cancellation.js';
import { IDisposable } from '../../../base/common/lifecycle.js';
import { URI, UriComponents } from '../../../base/common/uri.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';

export interface ICanonicalUriProvider {
	readonly scheme: string;
	provideCanonicalUri(uri: UriComponents, targetScheme: string, token: CancellationToken): Promise<URI | undefined>;
}

export const ICanonicalUriService = createDecorator<ICanonicalUriService>('canonicalUriIdentityService');

export interface ICanonicalUriService {
	readonly _serviceBrand: undefined;
	registerCanonicalUriProvider(provider: ICanonicalUriProvider): IDisposable;
}
