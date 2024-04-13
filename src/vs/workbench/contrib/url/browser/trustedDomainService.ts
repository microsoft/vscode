/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { WindowIdleValue } from 'vs/base/browser/dom';
import { mainWindow } from 'vs/base/browser/window';
import { Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { IInstantiationService, createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { TRUSTED_DOMAINS_STORAGE_KEY, readAuthenticationTrustedDomains, readStaticTrustedDomains, readWorkspaceTrustedDomains } from 'vs/workbench/contrib/url/browser/trustedDomains';
import { testUrlMatchesGlob } from 'vs/workbench/contrib/url/common/urlGlob';
import { IAuthenticationService } from 'vs/workbench/services/authentication/common/authentication';

export const ITrustedDomainService = createDecorator<ITrustedDomainService>('ITrustedDomainService');

export interface ITrustedDomainService {
	_serviceBrand: undefined;

	isValid(resource: URI): Promise<boolean>;

	/**
	 * This method does the validity check using the latest cached values of trusted domains, which may be slightly out of date.
	 */
	isValidSync(resource: URI): boolean;
}

export class TrustedDomainService extends Disposable implements ITrustedDomainService {
	_serviceBrand: undefined;

	private _readWorkspaceTrustedDomainsResult: WindowIdleValue<Promise<string[]>>;
	private _workspaceTrustedDomainsCache: string[] = [];

	private _readAuthenticationTrustedDomainsResult: WindowIdleValue<Promise<string[]>>;
	private _authenticationTrustedDomainsCache: string[] = [];

	private _staticTrustedDomainsResult!: WindowIdleValue<string[]>;

	constructor(
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IAuthenticationService private readonly _authenticationService: IAuthenticationService,
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
		@IStorageService private readonly _storageService: IStorageService,
	) {
		super();

		const initAuthenticationTrustedDomainsResult = () => new WindowIdleValue(mainWindow, () =>
			this._instantiationService.invokeFunction(readAuthenticationTrustedDomains)
				.then(domains => this._authenticationTrustedDomainsCache = domains));

		this._readAuthenticationTrustedDomainsResult = initAuthenticationTrustedDomainsResult();
		this._authenticationService.onDidRegisterAuthenticationProvider(() => {
			this._readAuthenticationTrustedDomainsResult?.dispose();
			this._readAuthenticationTrustedDomainsResult = initAuthenticationTrustedDomainsResult();
		});

		const initWorkspaceTrustedDomainsResult = () => new WindowIdleValue(mainWindow, () =>
			this._instantiationService.invokeFunction(readWorkspaceTrustedDomains)
				.then(domains => this._workspaceTrustedDomainsCache = domains));

		this._readWorkspaceTrustedDomainsResult = initWorkspaceTrustedDomainsResult();
		this._workspaceContextService.onDidChangeWorkspaceFolders(() => {
			this._readWorkspaceTrustedDomainsResult?.dispose();
			this._readWorkspaceTrustedDomainsResult = initWorkspaceTrustedDomainsResult();
		});

		const initStaticDomainsResult = () => {
			return new WindowIdleValue(mainWindow, () => {
				const { defaultTrustedDomains, trustedDomains, } = this._instantiationService.invokeFunction(readStaticTrustedDomains);
				return [
					...defaultTrustedDomains,
					...trustedDomains
				];
			});
		};
		this._staticTrustedDomainsResult = initStaticDomainsResult();
		this._register(this._storageService.onDidChangeValue(StorageScope.APPLICATION, TRUSTED_DOMAINS_STORAGE_KEY, this._register(new DisposableStore()))(() => {
			this._staticTrustedDomainsResult?.dispose();
			this._staticTrustedDomainsResult = initStaticDomainsResult();
		}));
	}

	async isValid(resource: URI): Promise<boolean> {
		const [workspaceDomains, userDomains] = await Promise.all([this._readWorkspaceTrustedDomainsResult.value, this._readAuthenticationTrustedDomainsResult.value]);
		const { defaultTrustedDomains, trustedDomains, } = this._instantiationService.invokeFunction(readStaticTrustedDomains);
		const allTrustedDomains = [...defaultTrustedDomains, ...trustedDomains, ...userDomains, ...workspaceDomains];

		return isURLDomainTrusted(resource, allTrustedDomains);
	}

	isValidSync(resource: URI): boolean {
		const allTrustedDomains = [
			...this._staticTrustedDomainsResult.value,
			...this._workspaceTrustedDomainsCache,
			...this._authenticationTrustedDomainsCache
		];

		return isURLDomainTrusted(resource, allTrustedDomains);
	}
}

const rLocalhost = /^localhost(:\d+)?$/i;
const r127 = /^127.0.0.1(:\d+)?$/;

function isLocalhostAuthority(authority: string) {
	return rLocalhost.test(authority) || r127.test(authority);
}

/**
 * Case-normalize some case-insensitive URLs, such as github.
 */
function normalizeURL(url: string | URI): string {
	const caseInsensitiveAuthorities = ['github.com'];
	try {
		const parsed = typeof url === 'string' ? URI.parse(url, true) : url;
		if (caseInsensitiveAuthorities.includes(parsed.authority)) {
			return parsed.with({ path: parsed.path.toLowerCase() }).toString(true);
		} else {
			return parsed.toString(true);
		}
	} catch { return url.toString(); }
}

/**
 * Check whether a domain like https://www.microsoft.com matches
 * the list of trusted domains.
 *
 * - Schemes must match
 * - There's no subdomain matching. For example https://microsoft.com doesn't match https://www.microsoft.com
 * - Star matches all subdomains. For example https://*.microsoft.com matches https://www.microsoft.com and https://foo.bar.microsoft.com
 */
export function isURLDomainTrusted(url: URI, trustedDomains: string[]) {
	url = URI.parse(normalizeURL(url));
	trustedDomains = trustedDomains.map(normalizeURL);

	if (isLocalhostAuthority(url.authority)) {
		return true;
	}

	for (let i = 0; i < trustedDomains.length; i++) {
		if (trustedDomains[i] === '*') {
			return true;
		}

		if (testUrlMatchesGlob(url, trustedDomains[i])) {
			return true;
		}
	}

	return false;
}
