/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationError } from '../../../../../../base/common/errors.js';
import { Event } from '../../../../../../base/common/event.js';
import { Disposable, DisposableMap, DisposableStore, type IDisposable } from '../../../../../../base/common/lifecycle.js';
import { equals } from '../../../../../../base/common/objects.js';
import { URI } from '../../../../../../base/common/uri.js';
import type { IAgentConnection } from '../../../../../../platform/agentHost/common/agentService.js';
import type { AuthenticateParams } from '../../../../../../platform/agentHost/common/agent.js';
import { isMicrosoftCopilotAccountContext, readCopilotAccountContext, type CopilotAccountContext } from '../../../../../../platform/agentHost/common/copilotAccountContext.js';
import { readAuthenticationAccount } from '../../../../../../platform/agentHost/common/meta/agentAuthenticationAccount.js';
import { copilotEntraAuthorizationServer, copilotEntraClientId, copilotEntraDiscoveryResource, copilotEntraEmuAudience, copilotEntraM365Audience, copilotEntraResources } from '../../../../../../platform/agentHost/common/copilotEntraAuthentication.js';
import { copilotAccountOperationMeta, type CopilotAccountOperation } from '../../../../../../platform/agentHost/common/meta/copilotAccountOperation.js';
import type { ProtectedResourceMetadata } from '../../../../../../platform/agentHost/common/state/protocol/state.js';
import { IChatEntitlementService } from '../../../../../services/chat/common/chatEntitlementService.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { InstantiationType, registerSingleton } from '../../../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { localize } from '../../../../../../nls.js';
import { AuthenticationSession, IAuthenticationService } from '../../../../../services/authentication/common/authentication.js';
import { ChatConfiguration } from '../../../common/constants.js';
import { toAuthenticateRequest } from './agentHostAuth.js';

export const IAgentHostCopilotAccountService = createDecorator<IAgentHostCopilotAccountService>('agentHostCopilotAccountService');

export interface IAgentHostCopilotAccountService {
	readonly _serviceBrand: undefined;
	discover(connection: IAgentConnection, microsoftSessionId: string): Promise<CopilotAccountContext>;
	select(connection: IAgentConnection, discoveryId: string, selectionId: string): Promise<CopilotAccountContext>;
	selectLegacy(connection: IAgentConnection, credential: AuthenticateParams): Promise<void>;
	signOut(connection: IAgentConnection): Promise<void>;
}

interface ICredentialBinding extends IDisposable {
	readonly lifetime: DisposableStore;
	readonly sessionId: string;
	accountId?: string;
}

/** Programmatic setup boundary; choice/menu presentation is deliberately owned by the caller. */
export class AgentHostCopilotAccountService extends Disposable implements IAgentHostCopilotAccountService {
	declare readonly _serviceBrand: undefined;
	private readonly _bindings = this._register(new DisposableMap<IAgentConnection, ICredentialBinding>());

	constructor(
		@IAuthenticationService private readonly _authenticationService: IAuthenticationService,
		@IChatEntitlementService private readonly _entitlementService: IChatEntitlementService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
	}

	async discover(connection: IAgentConnection, microsoftSessionId: string): Promise<CopilotAccountContext> {
		const context = this.requireEnabled(connection);
		if (context.kind === 'legacy') {
			this._bindings.deleteAndDispose(connection);
		}
		const binding = this._bindings.get(connection) ?? this.bindIdentity(connection, microsoftSessionId);
		const sessions = await this._authenticationService.getSessions('microsoft', undefined, { clientId: copilotEntraClientId, silent: true }, true);
		this.assertCurrent(binding);
		if (!equals(context, this.requireEnabled(connection))) {
			throw new CancellationError();
		}
		const identity = sessions.find(session => session.id === microsoftSessionId);
		if (!identity) {
			throw new Error(localize('copilot.account.identityRequired', "Sign in with the intended Microsoft account before continuing."));
		}
		const resource = {
			resource: copilotEntraDiscoveryResource,
			authorization_servers: [copilotEntraAuthorizationServer],
			scopes_supported: ['User.Read'],
		};
		const current = this.requireEnabled(connection);
		if (current.kind !== 'incomplete' || current.entraAccountId !== identity.account.id) {
			await this.authenticate(connection, binding, identity.account, resource, { kind: 'discover' });
		}
		if (await this.prepareDiscoveryRetry(connection, binding, identity.account)) {
			await this.authenticate(connection, binding, identity.account, resource, { kind: 'discover' });
		}
		return this.requireEnabled(connection);
	}

	async select(connection: IAgentConnection, discoveryId: string, selectionId: string): Promise<CopilotAccountContext> {
		const context = this.requireEnabled(connection);
		if (context.kind !== 'choiceRequired' || context.discoveryId !== discoveryId) {
			throw new CancellationError();
		}
		const choice = context.choices.find(choice => choice.selectionId === selectionId);
		const root = connection.rootState.value;
		const resource = root && !(root instanceof Error) && root.agents.flatMap(agent => agent.protectedResources ?? []).find(resource => resource.resource === choice?.resource);
		if (!choice || !resource) {
			throw new Error(localize('copilot.account.choiceRequired', "Choose one of the currently available Copilot services."));
		}
		const identities = await this._authenticationService.getSessions('microsoft', undefined, { clientId: copilotEntraClientId, silent: true }, true);
		const current = this.requireEnabled(connection);
		if (current.kind !== 'choiceRequired' || current.discoveryId !== discoveryId) {
			throw new CancellationError();
		}
		const identity = identities.find(session => session.account.id === context.entraAccountId);
		if (!identity) {
			throw new Error(localize('copilot.account.identityRequired', "Sign in with the intended Microsoft account before continuing."));
		}
		const binding = this._bindings.get(connection) ?? this.bindIdentity(connection, identity.id);
		await this.authenticate(connection, binding, identity.account, resource, { kind: 'select', discoveryId, selectionId });
		const ready = this.requireEnabled(connection);
		if (ready.kind !== 'ready' || ready.discoveryId !== discoveryId || ready.choice.selectionId !== selectionId) {
			throw new Error(localize('copilot.account.notReady', "The selected Copilot service is not ready."));
		}
		return ready;
	}

	async selectLegacy(connection: IAgentConnection, credential: AuthenticateParams): Promise<void> {
		const context = this.requireEnabled(connection);
		const rootState = connection.rootState;
		const account = readAuthenticationAccount(credential);
		if (credential.target || !credential.token || !account || account.providerId === 'microsoft') {
			throw new Error(localize('copilot.account.legacyCredentialMismatch', "GitHub sign-in did not provide the selected account credential."));
		}
		const result = await connection.authenticate({
			...credential,
			_meta: { ...credential._meta, ...copilotAccountOperationMeta({ kind: 'useLegacy', context }) },
		});
		if (!result.authenticated) {
			throw new Error(localize('copilot.account.legacyRejected', "The agent host did not accept the selected GitHub account."));
		}
		if (connection.rootState !== rootState || this.requireEnabled(connection).kind !== 'legacy') {
			throw new CancellationError();
		}
		this._bindings.deleteAndDispose(connection);
	}

	async signOut(connection: IAgentConnection): Promise<void> {
		const binding = this._bindings.get(connection);
		if (!binding) {
			throw new Error(localize('copilot.account.noAuthority', "This window has not supplied Microsoft authentication to this agent host."));
		}
		this._bindings.deleteAndDispose(connection);
		if (!binding.accountId) {
			return;
		}
		const root = connection.rootState.value;
		const context = root && !(root instanceof Error) ? readCopilotAccountContext(root) : undefined;
		if (!isMicrosoftCopilotAccountContext(context) || context.kind !== 'signedOut' && context.entraAccountId !== binding.accountId) {
			throw new CancellationError();
		}
		await connection.authenticate({ resource: copilotEntraDiscoveryResource, scopes: ['User.Read'], token: '' });
	}

	private bindIdentity(connection: IAgentConnection, sessionId: string): ICredentialBinding {
		const lifetime = new DisposableStore();
		const binding: ICredentialBinding = { lifetime, sessionId, dispose: () => lifetime.dispose() };
		this._bindings.set(connection, binding);
		lifetime.add(this._authenticationService.onDidChangeSessions(event => {
			const replacement = [...event.event.added ?? [], ...event.event.changed ?? []].some(session => session.account.id === binding.accountId);
			if (event.providerId === 'microsoft' && !replacement && event.event.removed?.some(session => session.id === binding.sessionId || session.account.id === binding.accountId)) {
				const root = connection.rootState.value;
				if (root && !(root instanceof Error) && readCopilotAccountContext(root)?.kind === 'legacy') {
					this._bindings.deleteAndDispose(connection);
					return;
				}
				void this.signOut(connection).catch(error => this._logService.error('[Copilot] Failed to withdraw Microsoft identity', error));
			}
		}));
		lifetime.add(connection.rootState.onDidChange(() => {
			const root = connection.rootState.value;
			const context = root && !(root instanceof Error) ? readCopilotAccountContext(root) : undefined;
			if (root instanceof Error || isMicrosoftCopilotAccountContext(context) && context.kind !== 'signedOut' && binding.accountId && context.entraAccountId !== binding.accountId) {
				this._bindings.deleteAndDispose(connection);
			}
		}));
		if (connection.rootState.onDidError) {
			lifetime.add(Event.once(connection.rootState.onDidError)(() => this._bindings.deleteAndDispose(connection)));
		}
		return binding;
	}

	private bindAccount(binding: ICredentialBinding, accountId: string): void {
		this.assertCurrent(binding);
		if (binding.accountId !== undefined && binding.accountId !== accountId) {
			throw new Error(localize('copilot.account.signOutFirst', "Sign out of Copilot before choosing another Microsoft account."));
		}
		binding.accountId = accountId;
	}

	private assertCurrent(binding: ICredentialBinding): void {
		if (binding.lifetime.isDisposed) {
			throw new CancellationError();
		}
	}

	private requireEnabled(connection: IAgentConnection): CopilotAccountContext {
		const root = connection.rootState.value;
		const context = root && !(root instanceof Error) ? readCopilotAccountContext(root) : undefined;
		if (!context || !this.canAuthenticate()) {
			throw new Error(localize('copilot.account.unavailable', "Microsoft Copilot account setup is unavailable."));
		}
		return context;
	}

	private canAuthenticate(): boolean {
		const sentiment = this._entitlementService.sentiment;
		return !sentiment.hidden && !sentiment.disabled && !sentiment.disabledInWorkspace && this._configurationService.getValue(ChatConfiguration.AgentEnabled) !== false;
	}

	private async prepareDiscoveryRetry(connection: IAgentConnection, binding: ICredentialBinding, account: AuthenticationSession['account']): Promise<boolean> {
		this.assertCurrent(binding);
		const context = this.requireEnabled(connection);
		if (context.kind !== 'incomplete' || context.entraAccountId !== account.id) {
			return false;
		}
		const root = connection.rootState.value;
		const resources = root && !(root instanceof Error) ? root.agents.flatMap(agent => agent.protectedResources ?? []) : [];
		const requirements = new Map(resources.filter(isDiscoveryCredentialResource).map(resource => [resource.resource, resource]));
		let accepted = false;
		for (const resource of requirements.values()) {
			const credential = await this.getCredential(account, resource);
			this.assertCurrent(binding);
			const current = this.requireEnabled(connection);
			if (current.kind !== 'incomplete' || current.entraAccountId !== account.id) {
				throw new CancellationError();
			}
			if (credential) {
				await this.forwardCredential(connection, binding, account, resource, credential);
				accepted = true;
			}
		}
		if (accepted) {
			this._logService.info('[Copilot] Retrying Microsoft service discovery after accepted credential preparation');
		}
		return accepted;
	}

	private async getCredential(account: AuthenticationSession['account'], resource: ProtectedResourceMetadata): Promise<AuthenticationSession | undefined> {
		const sessions = await this._authenticationService.getSessions('microsoft', resource.scopes_supported, {
			account, clientId: copilotEntraClientId, authorizationServer: URI.parse(copilotEntraAuthorizationServer), silent: true,
		}, true);
		return sessions.find(session => session.account.id === account.id);
	}

	private async authenticate(connection: IAgentConnection, binding: ICredentialBinding, account: AuthenticationSession['account'], resource: ProtectedResourceMetadata, operation: CopilotAccountOperation): Promise<void> {
		const context = this.requireEnabled(connection);
		const credential = await this.getCredential(account, resource);
		this.assertCurrent(binding);
		if (!equals(this.requireEnabled(connection), context)) {
			throw new CancellationError();
		}
		if (!credential) {
			throw new Error(localize('copilot.account.credentialRequired', "Microsoft Copilot needs additional permissions. Complete Microsoft authentication, then retry setup."));
		}
		await this.forwardCredential(connection, binding, account, resource, credential);
		await this.forwardCredential(connection, binding, account, resource, credential, operation);
	}

	private async forwardCredential(connection: IAgentConnection, binding: ICredentialBinding, account: AuthenticationSession['account'], resource: ProtectedResourceMetadata, credential: AuthenticationSession, operation?: CopilotAccountOperation): Promise<void> {
		this.assertCurrent(binding);
		const context = this.requireEnabled(connection);
		if (credential.account.id !== account.id || !credential.accessToken || !resource.scopes_supported?.every(scope => credential.scopes.includes(scope))) {
			throw new Error(localize('copilot.account.credentialMismatch', "Microsoft sign-in did not provide the requested account and permissions."));
		}
		const previousAccountId = binding.accountId;
		this.bindAccount(binding, account.id);
		const request = toAuthenticateRequest(resource.resource, resource.scopes_supported, credential, 'microsoft');
		const result = await connection.authenticate({
			...request,
			_meta: {
				...request._meta,
				...(operation ? copilotAccountOperationMeta(operation.kind === 'discover' ? { ...operation, context } : operation) : {}),
			},
		});
		this.assertCurrent(binding);
		if (!result.authenticated) {
			binding.accountId = previousAccountId;
			throw new Error(localize('copilot.account.rejected', "The agent host did not accept Microsoft account setup."));
		}
		if (!operation && !equals(this.requireEnabled(connection), context)) {
			throw new CancellationError();
		}
	}
}

function isDiscoveryCredentialResource(resource: ProtectedResourceMetadata): boolean {
	if (!resource.scopes_supported?.length) {
		return false;
	}
	const audience = resource.resource === copilotEntraResources.get(copilotEntraEmuAudience) ? copilotEntraEmuAudience
		: resource.resource === copilotEntraResources.get(copilotEntraM365Audience) ? copilotEntraM365Audience : undefined;
	return audience !== undefined && resource.scopes_supported.every(scope => scope === `${audience}/.default` || scope === `${audience}/user_impersonation`);
}

registerSingleton(IAgentHostCopilotAccountService, AgentHostCopilotAccountService, InstantiationType.Delayed);
