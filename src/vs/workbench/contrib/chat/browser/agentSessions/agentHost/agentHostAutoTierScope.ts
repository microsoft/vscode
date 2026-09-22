/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../../../base/common/event.js';
import { Disposable, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { IObservable, observableValue } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { IAgentHostService } from '../../../../../../platform/agentHost/common/agentService.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IDefaultAccountService } from '../../../../../../platform/defaultAccount/common/defaultAccount.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { IAuthenticationService } from '../../../../../services/authentication/common/authentication.js';
import { IWorkbenchEnvironmentService } from '../../../../../services/environment/common/environmentService.js';
import { resolveSessionForResource } from './agentHostAuth.js';

/** Enables client startup defaults only for this machine's Copilot using the managed account. */
export class AgentHostAutoTierScope extends Disposable {
	private readonly _allowed = observableValue(this, false);
	readonly allowed: IObservable<boolean> = this._allowed;
	private _generation = 0;

	constructor(
		private readonly isNativeClient: boolean,
		@IAgentHostService private readonly agentHostService: IAgentHostService,
		@IDefaultAccountService private readonly defaultAccountService: IDefaultAccountService,
		@IAuthenticationService private readonly authenticationService: IAuthenticationService,
		@IWorkbenchEnvironmentService private readonly environmentService: IWorkbenchEnvironmentService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ILogService private readonly logService: ILogService,
	) {
		super();
		if (!isNativeClient || environmentService.remoteAuthority) {
			return;
		}
		this._register(toDisposable(() => this._generation++));
		this._register(Event.any<unknown>(
			defaultAccountService.onDidChangeDefaultAccount,
			authenticationService.onDidChangeSessions,
			authenticationService.onDidRegisterAuthenticationProvider,
			authenticationService.onDidUnregisterAuthenticationProvider,
			agentHostService.rootState.onDidChange,
			Event.fromObservableLight(agentHostService.authenticationPending),
			Event.filter(configurationService.onDidChangeConfiguration, e => e.affectsConfiguration('chat.agentHost.unsafeTestToken')),
		)(() => this._refresh()));
		this._refresh();
	}

	private _refresh(): void {
		const generation = ++this._generation;
		this._allowed.set(false, undefined);
		if (!this.isNativeClient || this.environmentService.remoteAuthority || this.agentHostService.authenticationPending.get()
			|| (this.environmentService.enableSmokeTestDriver && this.configurationService.getValue('chat.agentHost.unsafeTestToken'))) {
			return;
		}
		void this._matchesAccount().then(matches => {
			if (generation === this._generation) {
				this._allowed.set(matches, undefined);
			}
		}, () => {
			if (generation === this._generation) {
				this.logService.warn('[Chat] Could not verify the Agent Host account for Auto startup defaults');
			}
		});
	}

	private async _matchesAccount(): Promise<boolean> {
		const account = await this.defaultAccountService.getDefaultAccount();
		const root = this.agentHostService.rootState.value;
		const resources = root && !(root instanceof Error)
			? root.agents.find(agent => agent.provider === 'copilotcli')?.protectedResources?.filter(resource => resource.required !== false)
			: undefined;
		if (!account || !resources?.length) {
			return false;
		}
		const sessions = await this.authenticationService.getSessions(account.authenticationProvider.id);
		const defaultSession = sessions.find(session => session.id === account.sessionId);
		if (!defaultSession || sessions.some(session => session.account.id !== defaultSession.account.id)) {
			return false;
		}
		for (const resource of resources) {
			// Account and session IDs are provider-scoped, not globally unique.
			for (const server of resource.authorization_servers ?? []) {
				if (await this.authenticationService.getOrActivateProviderIdForServer(URI.parse(server), URI.parse(resource.resource)) !== account.authenticationProvider.id) {
					return false;
				}
			}
			const selected = await resolveSessionForResource(
				URI.parse(resource.resource), resource.authorization_servers ?? [], resource.scopes_supported ?? [],
				this.authenticationService, this.logService, '[Chat Auto default]',
			);
			if (!selected || selected.account.id !== defaultSession.account.id
				|| !sessions.some(session => session.id === selected.id)) {
				return false;
			}
		}
		return true;
	}
}
