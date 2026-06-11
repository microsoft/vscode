/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IDefaultAccountService } from '../../../../platform/defaultAccount/common/defaultAccount.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { asJson, IRequestService, isSuccess } from '../../../../platform/request/common/request.js';
import { AuthenticationSession, IAuthenticationService } from '../../authentication/common/authentication.js';
import { GITHUB_AUTH_PROVIDER_ID, GITHUB_ENTERPRISE_AUTH_PROVIDER_ID, IAccountProfileImageRequest, IAccountProfileImageService, isGitHubAuthenticationProvider } from './accountProfileImage.js';

const GITHUB_PROFILE_IMAGE_SIZE = 64;
const GITHUB_DOTCOM_URL = 'https://github.com/';
const GITHUB_DOTCOM_API_URL = 'https://api.github.com/';

interface IGitHubUserResponse {
	readonly avatar_url?: string;
}

class AccountProfileImageService extends Disposable implements IAccountProfileImageService {

	declare readonly _serviceBrand: undefined;

	private readonly profileImageUrlCache = new Map<string, string>();
	private readonly profileImageUrlRequestCache = new Map<string, Promise<string | undefined>>();

	constructor(
		@IAuthenticationService private readonly authenticationService: IAuthenticationService,
		@IDefaultAccountService private readonly defaultAccountService: IDefaultAccountService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ILogService private readonly logService: ILogService,
		@IProductService private readonly productService: IProductService,
		@IRequestService private readonly requestService: IRequestService,
	) {
		super();
	}

	async getDefaultProfileImageUrl(): Promise<string | undefined> {
		try {
			const defaultAccount = await this.defaultAccountService.getDefaultAccount();
			if (!defaultAccount || !isGitHubAuthenticationProvider(defaultAccount.authenticationProvider.id)) {
				return undefined;
			}

			return this.getProfileImageUrl({
				providerId: defaultAccount.authenticationProvider.id,
				accountName: defaultAccount.accountName,
				sessionId: defaultAccount.sessionId,
			});
		} catch (error) {
			this.logService.error(error);
			return undefined;
		}
	}

	async getProfileImageUrl(request: IAccountProfileImageRequest): Promise<string | undefined> {
		try {
			const accountName = request.accountName?.trim();
			const providerId = request.providerId;
			if (!accountName || (providerId !== GITHUB_AUTH_PROVIDER_ID && providerId !== GITHUB_ENTERPRISE_AUTH_PROVIDER_ID)) {
				return undefined;
			}

			if (providerId === GITHUB_AUTH_PROVIDER_ID) {
				return getGitHubAccountProfileImageUrl(accountName, GITHUB_DOTCOM_URL);
			}

			const apiBaseUrl = this.getGitHubProviderApiBaseUrl(providerId);
			if (!apiBaseUrl) {
				return undefined;
			}

			const cacheKey = `${providerId}:${request.sessionId ?? accountName}:${apiBaseUrl}`;
			const cached = this.profileImageUrlCache.get(cacheKey);
			if (cached) {
				return cached;
			}

			let pendingRequest = this.profileImageUrlRequestCache.get(cacheKey);
			if (!pendingRequest) {
				pendingRequest = this.resolveEnterpriseProfileImageUrl({
					providerId,
					accountName,
					sessionId: request.sessionId,
				}, apiBaseUrl);
				this.profileImageUrlRequestCache.set(cacheKey, pendingRequest);
			}

			try {
				const avatarUrl = await pendingRequest;
				if (avatarUrl) {
					this.profileImageUrlCache.set(cacheKey, avatarUrl);
				}
				return avatarUrl;
			} finally {
				this.profileImageUrlRequestCache.delete(cacheKey);
			}
		} catch (error) {
			this.logService.error(error);
			return undefined;
		}
	}

	private async resolveEnterpriseProfileImageUrl(request: { readonly providerId: string; readonly accountName: string; readonly sessionId?: string }, apiBaseUrl: string): Promise<string | undefined> {
		const session = await this.getAccountSession(request.providerId, request.accountName, request.sessionId);
		if (!session) {
			return undefined;
		}

		const response = await this.requestService.request({
			type: 'GET',
			url: new URL('user', apiBaseUrl).toString(),
			disableCache: true,
			headers: {
				'Accept': 'application/vnd.github+json',
				'Authorization': `Bearer ${session.accessToken}`,
			},
			callSite: 'accountProfileImage.githubAvatar',
		}, CancellationToken.None);

		if (!isSuccess(response)) {
			return undefined;
		}

		const data = await asJson<IGitHubUserResponse>(response);
		return data?.avatar_url;
	}

	private async getAccountSession(providerId: string, accountName: string, sessionId: string | undefined): Promise<AuthenticationSession | undefined> {
		const sessions = await this.authenticationService.getSessions(providerId);
		return sessionId
			? sessions.find(session => session.id === sessionId)
			: sessions.find(session => session.account.label === accountName);
	}

	private getGitHubProviderApiBaseUrl(providerId: string): string | undefined {
		if (providerId === GITHUB_AUTH_PROVIDER_ID) {
			return GITHUB_DOTCOM_API_URL;
		}

		const baseUrl = this.getGitHubProviderBaseUrl(providerId);
		try {
			const url = new URL(baseUrl);
			return `${url.protocol}//api.${url.hostname}${url.port ? ':' + url.port : ''}/`;
		} catch (error) {
			this.logService.error(error);
		}

		return undefined;
	}

	private getGitHubProviderBaseUrl(providerId: string): string {
		if (providerId === this.defaultAccountService.getDefaultAccountAuthenticationProvider().id) {
			return this.defaultAccountService.resolveGitHubUrl('');
		}

		if (providerId === GITHUB_ENTERPRISE_AUTH_PROVIDER_ID) {
			const providerUriSetting = this.productService.defaultChatAgent.providerUriSetting;
			if (!providerUriSetting) {
				return GITHUB_DOTCOM_URL;
			}

			const value = this.configurationService.getValue<string | undefined>(providerUriSetting);
			if (value) {
				try {
					const enterpriseUrl = new URL(value);
					return `${enterpriseUrl.protocol}//${enterpriseUrl.host}/`;
				} catch (error) {
					this.logService.error(error);
				}
			}
		}

		return GITHUB_DOTCOM_URL;
	}
}

function getGitHubAccountProfileImageUrl(accountName: string, baseUrl: string): string {
	return new URL(`${encodeURIComponent(accountName.trim())}.png?size=${GITHUB_PROFILE_IMAGE_SIZE}`, baseUrl).toString();
}

registerSingleton(IAccountProfileImageService, AccountProfileImageService, InstantiationType.Delayed);
