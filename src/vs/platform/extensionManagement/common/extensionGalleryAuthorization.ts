/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../base/common/uri.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { InstantiationType, registerSingleton } from '../../instantiation/common/extensions.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';

export const IExtensionGalleryAuthorizationService = createDecorator<IExtensionGalleryAuthorizationService>('IExtensionGalleryAuthorizationService');

export interface IExtensionGalleryAuthorizationService {
	readonly _serviceBrand: undefined;

	getAccessToken(targetUrl: string): Promise<string | undefined>;
}

export class ExtensionGalleryAuthorizationService extends Disposable implements IExtensionGalleryAuthorizationService {

	declare readonly _serviceBrand: undefined;

	protected authorization: {
		readonly accessToken: string | undefined;
		readonly serviceIndexUrl: string | undefined;
		readonly revision: number;
	} = { accessToken: undefined, serviceIndexUrl: undefined, revision: 0 };

	async getAccessToken(targetUrl: string): Promise<string | undefined> {
		const { accessToken, serviceIndexUrl } = this.authorization;
		if (!accessToken || !serviceIndexUrl || !this.isSameSecureOrigin(targetUrl, serviceIndexUrl)) {
			return undefined;
		}
		return accessToken;
	}

	setAuthorization(accessToken: string | undefined, serviceIndexUrl: string | undefined): number {
		this.authorization = { accessToken, serviceIndexUrl, revision: this.authorization.revision + 1 };
		return this.authorization.revision;
	}

	private isSameSecureOrigin(targetUrl: string, serviceIndexUrl: string): boolean {
		try {
			const target = URI.parse(targetUrl);
			const serviceIndex = URI.parse(serviceIndexUrl);
			return target.scheme === 'https'
				&& serviceIndex.scheme === 'https'
				&& target.authority.toLowerCase() === serviceIndex.authority.toLowerCase();
		} catch {
			return false;
		}
	}
}

registerSingleton(IExtensionGalleryAuthorizationService, ExtensionGalleryAuthorizationService, InstantiationType.Delayed);
