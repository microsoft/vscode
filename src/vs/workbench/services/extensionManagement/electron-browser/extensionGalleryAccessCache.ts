/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ExtensionGalleryAuthProviderConfigKey } from '../../../../platform/extensionManagement/common/extensionGalleryManifest.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { ExtensionGalleryAccessProviderId, getEffectiveAuthProvider, ICachedAccess } from './extensionGalleryAccess.js';

const CACHED_ACCESS_KEY = 'marketplace.cachedAccess';

/**
 * Durable store for "was this account allowed to use this marketplace?", kept out of both services
 * so neither carries storage plumbing. A verdict is only honoured for the account, marketplace and
 * auth provider it was written for, so it cannot leak across a sign-out, switch or repointing.
 */
export class ExtensionGalleryAccessCache {

	private readonly authProvider: ExtensionGalleryAccessProviderId;

	constructor(
		@IStorageService private readonly storageService: IStorageService,
		@IConfigurationService configurationService: IConfigurationService,
		@IProductService productService: IProductService,
	) {
		this.authProvider = getEffectiveAuthProvider(
			configurationService.getValue<string>(ExtensionGalleryAuthProviderConfigKey),
			!!productService.enableExtensionGalleryEntraAuth);
	}

	/** The verdict for `accountId` at `serviceUrl`; a malformed or mismatched entry is dropped. */
	read(serviceUrl: string, accountId: string): boolean | undefined {
		const raw = this.storageService.get(CACHED_ACCESS_KEY, StorageScope.APPLICATION);
		if (!raw) {
			return undefined;
		}
		let parsed: unknown;
		try {
			parsed = JSON.parse(raw);
		} catch {
			// Corrupt/truncated storage — discard rather than crash startup on a parse error.
			this.clear();
			return undefined;
		}
		if (!this.isValidCachedAccess(parsed)) {
			this.clear();
			return undefined;
		}
		if (parsed.authProvider !== this.authProvider || parsed.serviceUrl !== serviceUrl || parsed.accountId !== accountId) {
			this.clear();
			return undefined;
		}
		return parsed.eligible;
	}

	/** Persists a durable verdict for `accountId` at `serviceUrl`. */
	write(serviceUrl: string, accountId: string, eligible: boolean): void {
		const access: ICachedAccess = { authProvider: this.authProvider, accountId, eligible, serviceUrl };
		this.storageService.store(CACHED_ACCESS_KEY, JSON.stringify(access), StorageScope.APPLICATION, StorageTarget.MACHINE);
	}

	/** Drops the persisted verdict (on sign-out, account change, or a rejected token). */
	clear(): void {
		this.storageService.remove(CACHED_ACCESS_KEY, StorageScope.APPLICATION);
	}

	private isValidCachedAccess(value: unknown): value is ICachedAccess {
		if (!value || typeof value !== 'object') {
			return false;
		}
		const candidate = value as Partial<ICachedAccess>;
		return (candidate.authProvider === 'github' || candidate.authProvider === 'microsoft')
			&& typeof candidate.accountId === 'string'
			&& typeof candidate.eligible === 'boolean'
			&& typeof candidate.serviceUrl === 'string';
	}
}
