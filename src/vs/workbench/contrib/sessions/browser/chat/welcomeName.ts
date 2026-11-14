/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Event } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { autorun, derived, IObservable, observableSignalFromEvent, observableValue } from '../../../../../base/common/observable.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IDefaultAccountService } from '../../../../../platform/defaultAccount/common/defaultAccount.js';
import { deriveGitHubEndpoints } from '../../../../../platform/github/common/githubEndpoints.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { asJson, IRequestService, isSuccess } from '../../../../../platform/request/common/request.js';
import { IAuthenticationService } from '../../../../services/authentication/common/authentication.js';
import { NEW_SESSION_WELCOME_NAME_SETTING } from '../../common/chatConstants.js';

const githubProfileNames = new Map<string, Promise<string | undefined>>();

/** The configured name; none where the setting is not registered, such as in a window that does not register it. */
function getConfiguredWelcomeName(configurationService: IConfigurationService): string {
	return configurationService.getValue<string | undefined>(NEW_SESSION_WELCOME_NAME_SETTING)?.trim() ?? '';
}

/** Resolves the shared welcome name without requesting a profile while its surface is hidden. */
export class WelcomeName extends Disposable {
	private readonly _githubProfileName = observableValue<string | undefined>(this, undefined);
	private _githubProfileAccountKey: string | undefined;
	readonly name: IObservable<string | undefined>;

	constructor(
		private readonly enabled: IObservable<boolean>,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IDefaultAccountService private readonly defaultAccountService: IDefaultAccountService,
		@IAuthenticationService private readonly authenticationService: IAuthenticationService,
		@IRequestService private readonly requestService: IRequestService,
		@ILogService private readonly logService: ILogService,
	) {
		super();
		const configuredNameChanged = observableSignalFromEvent(this, Event.filter(
			this.configurationService.onDidChangeConfiguration, event => event.affectsConfiguration(NEW_SESSION_WELCOME_NAME_SETTING),
		));
		this.name = derived(this, reader => {
			configuredNameChanged.read(reader);
			return this._getWelcomeName(this._githubProfileName.read(reader));
		});
		this._register(autorun(reader => {
			configuredNameChanged.read(reader);
			this.enabled.read(reader);
			void this._refreshGitHubProfileName();
		}));
		this._register(this.defaultAccountService.onDidChangeDefaultAccount(() => void this._refreshGitHubProfileName()));
	}

	private _getWelcomeName(gitHubName: string | undefined, configuredName = getConfiguredWelcomeName(this.configurationService)): string | undefined {
		return configuredName.trim() || this._getFirstName(gitHubName);
	}

	private _getFirstName(name: string | undefined): string | undefined {
		return name?.trim().split(/\s+/u)[0] || undefined;
	}

	private async _refreshGitHubProfileName(): Promise<void> {
		if (!this.enabled.get() || getConfiguredWelcomeName(this.configurationService)) {
			this._githubProfileAccountKey = undefined;
			this._githubProfileName.set(undefined, undefined);
			return;
		}

		const account = this.defaultAccountService.currentDefaultAccount ?? await this.defaultAccountService.getDefaultAccount();
		if (!this.enabled.get() || getConfiguredWelcomeName(this.configurationService)) {
			this._githubProfileAccountKey = undefined;
			this._githubProfileName.set(undefined, undefined);
			return;
		}
		if (account?.authenticationProvider.id !== 'github' && account?.authenticationProvider.id !== 'github-enterprise') {
			this._githubProfileAccountKey = undefined;
			this._githubProfileName.set(undefined, undefined);
			return;
		}

		const accountKey = `${account.authenticationProvider.id}:${account.sessionId}`;
		if (this._githubProfileAccountKey !== accountKey) {
			this._githubProfileAccountKey = accountKey;
			this._githubProfileName.set(undefined, undefined);
		}

		let profileName = githubProfileNames.get(accountKey);
		if (!profileName) {
			profileName = this._fetchGitHubProfileName(account.authenticationProvider.id, account.authenticationProvider.enterprise, account.sessionId);
			githubProfileNames.set(accountKey, profileName);
		}
		const resolvedProfileName = await profileName;
		const currentAccount = this.defaultAccountService.currentDefaultAccount;
		if (
			!this._store.isDisposed
			&& this._githubProfileAccountKey === accountKey
			&& currentAccount?.authenticationProvider.id === account.authenticationProvider.id
			&& currentAccount.sessionId === account.sessionId
			&& this.enabled.get()
			&& !getConfiguredWelcomeName(this.configurationService)
		) {
			this._githubProfileName.set(resolvedProfileName, undefined);
		}
	}

	private async _fetchGitHubProfileName(providerId: string, enterprise: boolean, sessionId: string): Promise<string | undefined> {
		try {
			const enterpriseUri = enterprise ? this.defaultAccountService.resolveGitHubUrl('') : undefined;
			if (enterprise && !enterpriseUri) {
				this.logService.warn('Failed to fetch GitHub profile name because the enterprise URL is unavailable.');
				return undefined;
			}
			const sessions = await this.authenticationService.getSessions(providerId, [], { silent: true });
			const session = sessions.find(candidate => candidate.id === sessionId);
			if (!session) {
				return undefined;
			}
			const response = await this.requestService.request({
				type: 'GET',
				url: `${deriveGitHubEndpoints(enterpriseUri).apiBaseUri}/user`,
				disableCache: true,
				callSite: 'welcomeName.fetchGitHubProfileName',
				headers: {
					'Authorization': `token ${session.accessToken}`,
					'Accept': 'application/vnd.github.v3+json',
					'User-Agent': 'VSCode-Sessions',
				},
			}, CancellationToken.None);
			if (!isSuccess(response)) {
				this.logService.warn(`Failed to fetch GitHub profile name: ${response.res.statusCode ?? 'unknown status'}`);
				return undefined;
			}
			const profile = await asJson<{ readonly name?: string | null }>(response);
			return profile?.name?.trim() || undefined;
		} catch (error) {
			this.logService.warn('Failed to fetch GitHub profile name:', error);
			return undefined;
		}
	}
}
