/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { IDisposable } from 'vs/base/common/lifecycle';
import { URI, UriComponents } from 'vs/base/common/uri';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

export interface ICanonicalUriIdentityProvider {
	readonly scheme: string;
	provideCanonicalUriIdentity(uri: UriComponents, token: CancellationToken): Promise<URI | undefined>;
}

export const ICanonicalUriIdentityService = createDecorator<ICanonicalUriIdentityService>('canonicalUriIdentityService');

export interface ICanonicalUriIdentityService {
	readonly _serviceBrand: undefined;
	registerCanonicalUriIdentityProvider(provider: ICanonicalUriIdentityProvider): IDisposable;
}
