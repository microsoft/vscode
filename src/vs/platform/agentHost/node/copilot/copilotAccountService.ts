/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CopilotClient, CopilotSession } from '@github/copilot-sdk';
import { raceCancellationError } from '../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../base/common/errors.js';
import { Disposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, observableValue, type IObservable, type IReader } from '../../../../base/common/observable.js';
import { ICopilotHomeService } from '../../../environment/common/copilotHome.js';
import { createDecorator, IInstantiationService } from '../../../instantiation/common/instantiation.js';
import { ILogService } from '../../../log/common/log.js';
import type { AuthenticateParams } from '../../common/agent.js';
import { copilotAccountContextKey, type CopilotAccountContext, type ICopilotServiceChoice } from '../../common/copilotAccountContext.js';
import { copilotEntraAuthorizationServer, copilotEntraDiscoveryResource, copilotEntraEmuAudience, copilotEntraM365Audience, copilotEntraResources } from '../../common/copilotEntraAuthentication.js';
import { readAuthenticationAccount } from '../../common/meta/agentAuthenticationAccount.js';
import { readCopilotAccountOperation } from '../../common/meta/copilotAccountOperation.js';
import type { ProtectedResourceMetadata } from '../../common/state/protocol/state.js';
import { AhpErrorCodes, ProtocolError } from '../../common/state/sessionProtocol.js';
import { IAgentConfigurationService } from '../agentConfigurationService.js';
import { CopilotEntraAuthentication, copilotEntraDiscoveryMetadata } from './copilotEntraAuthentication.js';
import { AGENT_HOST_COPILOT_CLIENT_NAME } from './copilotManagedSettings.js';

type LoginStep = Awaited<ReturnType<CopilotSession['rpc']['accounts']['login']['advance']>>;
type LoginAccount = NonNullable<Extract<LoginStep, { kind: 'completed' }>['result']['accounts']>[number];

interface ILoginAttempt {
	readonly client: Promise<CopilotClient>;
	readonly cancellation: CancellationTokenSource;
	readonly entraAccountId: string;
	session?: CopilotSession;
	flowId?: string;
}

export const ICopilotAccountService = createDecorator<ICopilotAccountService>('copilotAccountService');

export interface ICopilotAccountService {
	readonly _serviceBrand: undefined;
	readonly authentication: CopilotEntraAuthentication | undefined;
	readonly state: IObservable<CopilotAccountContext>;
	getProtectedResources(reader?: IReader): ProtectedResourceMetadata[];
	authenticate(client: Promise<CopilotClient>, params: AuthenticateParams, connection: CancellationToken): Promise<void>;
	requireReady(): Extract<CopilotAccountContext, { kind: 'ready' }>;
	isAuthenticationSession(sessionId: string): boolean;
	verifySessionContext(session: CopilotSession, expectedContext: CopilotAccountContext | undefined): Promise<void>;
	reset(): Promise<void>;
}

/** Owns the shared runtime login, independently of any window's account-menu presentation. */
export class CopilotAccountService extends Disposable implements ICopilotAccountService {
	declare readonly _serviceBrand: undefined;
	readonly authentication: CopilotEntraAuthentication | undefined;
	private readonly _state = observableValue<CopilotAccountContext>(this, { kind: 'signedOut' });
	readonly state: IObservable<CopilotAccountContext> = this._state;
	private _attempt: ILoginAttempt | undefined;
	private _releasing: Promise<void> | undefined;

	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
		@IAgentConfigurationService configurationService: IAgentConfigurationService,
		@ICopilotHomeService private readonly _home: ICopilotHomeService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
		configurationService.publishRootTransientValues?.({ [copilotAccountContextKey]: undefined }, true);
		if (configurationService.copilotM365EnabledAtStartup) {
			this.authentication = this._register(instantiationService.createInstance(CopilotEntraAuthentication));
			this._register(this.authentication.onDidRevoke(() => {
				void this.reset().catch(error => this._logService.error('[Copilot] Failed to release Microsoft account context', error));
			}));
			this._register(autorun(reader => configurationService.publishRootTransientValues?.({ [copilotAccountContextKey]: this.state.read(reader) }, true)));
		}
		this._register(toDisposable(() => {
			void this.reset().catch(error => this._logService.error('[Copilot] Failed to release Microsoft login', error));
		}));
	}

	getProtectedResources(reader?: IReader): ProtectedResourceMetadata[] {
		const state = this.state.read(reader);
		const resources = new Map<string, ProtectedResourceMetadata>([[copilotEntraDiscoveryResource, copilotEntraDiscoveryMetadata]]);
		const choices = state.kind === 'choiceRequired' ? state.choices : state.kind === 'ready' || state.kind === 'activating' ? [state.choice] : [];
		for (const choice of choices) {
			resources.set(choice.resource, resourceForChoice(choice));
		}
		for (const resource of this.authentication?.getProtectedResources(reader) ?? []) {
			resources.set(resource.resource, resource);
		}
		return [...resources.values()];
	}

	async authenticate(client: Promise<CopilotClient>, params: AuthenticateParams, connection: CancellationToken): Promise<void> {
		void client.catch(error => this._logService.error('[Copilot] Microsoft setup runtime startup failed', error));
		const operation = readCopilotAccountOperation(params);
		if (!this.authentication || !operation || connection.isCancellationRequested) {
			throw new ProtocolError(AhpErrorCodes.AuthRequired, 'Microsoft account setup is unavailable.');
		}
		if (operation.kind === 'discover') {
			const accountId = this.authentication.authorizeDiscovery(params, connection);
			await this.discoverForIdentity(client, accountId, params, connection);
			return;
		}
		const attempt = this._attempt;
		if (!attempt || attempt.flowId !== operation.discoveryId || readAuthenticationAccount(params)?.accountId !== attempt.entraAccountId) {
			throw new ProtocolError(AhpErrorCodes.AuthRequired, 'The Microsoft account choice is no longer current.');
		}
		await this.select(attempt, operation.selectionId, params);
	}

	private async discoverForIdentity(client: Promise<CopilotClient>, accountId: string, params: AuthenticateParams, connection: CancellationToken): Promise<void> {
		const state = this.state.get();
		if (state.kind === 'ready' || state.kind === 'choiceRequired') {
			return;
		}
		if (this._attempt && (state.kind === 'error' || state.kind === 'incomplete')) {
			await this.reset();
		}
		if (this._releasing) {
			await this._releasing;
		}
		if (this._attempt) {
			throw new ProtocolError(AhpErrorCodes.AuthRequired, 'Microsoft account discovery is already in progress.');
		}
		if (connection.isCancellationRequested) {
			throw new CancellationError();
		}
		this.authentication?.validateSelection(params, copilotEntraDiscoveryMetadata);
		await this.discover(client, accountId);
	}

	requireReady(): Extract<CopilotAccountContext, { kind: 'ready' }> {
		const state = this.state.get();
		if (state.kind !== 'ready') {
			throw new ProtocolError(AhpErrorCodes.AuthRequired, 'Choose a usable Copilot service before continuing.');
		}
		return state;
	}

	isAuthenticationSession(sessionId: string): boolean {
		return this._attempt?.session?.sessionId === sessionId;
	}

	async verifySessionContext(session: CopilotSession, expectedContext: CopilotAccountContext | undefined): Promise<void> {
		if (!this.authentication) {
			return;
		}
		const context = this.requireReady();
		if (context !== expectedContext) {
			throw new CancellationError();
		}
		await confirmAccount(session, context.choice);
		if (this.state.get() !== context) {
			throw new CancellationError();
		}
	}

	reset(): Promise<void> {
		const attempt = this._attempt;
		this._attempt = undefined;
		attempt?.cancellation.dispose(true);
		this._state.set({ kind: 'signedOut' }, undefined);
		if (!attempt) {
			return this._releasing ?? Promise.resolve();
		}
		return this.release(attempt);
	}

	private async discover(client: Promise<CopilotClient>, entraAccountId: string): Promise<void> {
		const attempt: ILoginAttempt = { client, entraAccountId, cancellation: new CancellationTokenSource() };
		this._attempt = attempt;
		this._state.set({ kind: 'discovering', entraAccountId }, undefined);
		try {
			const runtime = await raceCancellationError(client, attempt.cancellation.token);
			this.assertCurrent(attempt);
			attempt.session = await runtime.createSession({
				clientName: AGENT_HOST_COPILOT_CLIENT_NAME,
				configDirectory: this._home.home.fsPath,
				enableConfigDiscovery: false, enableSessionStore: false,
				availableTools: [], disabledMcpServers: ['github-mcp-server'],
				requestExtensions: false, requestCanvasRenderer: false,
				enableSessionTelemetry: false, enableHostGitOperations: false,
				infiniteSessions: { enabled: false }, memory: { enabled: false },
			});
			this.assertCurrent(attempt);
			const flow = await attempt.session.rpc.accounts.login.begin({ kind: 'entra' });
			attempt.flowId = flow.flowId;
			this.assertCurrent(attempt);
			let step = flow.step;
			while (step.kind === 'awaiting' || step.kind === 'needs-interaction') {
				step = await raceCancellationError(attempt.session.rpc.accounts.login.advance({ flowId: flow.flowId }), attempt.cancellation.token);
				this.assertCurrent(attempt);
			}
			await this.publishDiscovery(attempt, step);
		} catch (error) {
			if (this._attempt === attempt) {
				this._state.set({ kind: 'error', entraAccountId, stage: 'discovery' }, undefined);
				this._attempt = undefined;
			}
			await this.release(attempt).catch(cleanupError => this._logService.error('[Copilot] Failed to release rejected Microsoft login', cleanupError));
			throw error;
		}
	}

	private async publishDiscovery(attempt: ILoginAttempt, step: LoginStep): Promise<void> {
		if (step.kind !== 'completed') {
			throw new Error(step.kind === 'error' ? step.message : 'The runtime requested an unsupported Microsoft login interaction.');
		}
		if (!attempt.session || !attempt.flowId) {
			throw new CancellationError();
		}
		if (step.result.status === 'completed') {
			const { choice, derivedFrom } = await raceCancellationError(readActiveAccount(attempt.session), attempt.cancellation.token);
			this.assertCurrent(attempt);
			if (choice.host !== step.result.host || choice.accountName !== step.result.login) {
				throw new ProtocolError(AhpErrorCodes.AuthRequired, 'The runtime did not confirm the completed Copilot login.');
			}
			// Best effort until runtime #33336: confirmation does not prove the other service is unavailable.
			this._state.set({ kind: 'ready', entraAccountId: attempt.entraAccountId, discoveryId: attempt.flowId, choice, derivedFrom }, undefined);
			return;
		}
		if (step.result.status !== 'needs-account-selection') {
			throw new Error('Microsoft service discovery did not return selectable accounts.');
		}
		const choices = (step.result.accounts ?? []).map(toServiceChoice);
		if (choices.length !== 2 || new Set(choices.map(choice => choice.service)).size !== 2
			|| new Set(choices.map(choice => choice.selectionId)).size !== 2) {
			throw new Error('Microsoft service discovery did not return two distinct supported services.');
		}
		this._state.set({ kind: 'choiceRequired', entraAccountId: attempt.entraAccountId, discoveryId: attempt.flowId, choices }, undefined);
	}

	private async select(attempt: ILoginAttempt, selectionId: string, params: AuthenticateParams): Promise<void> {
		const state = this.state.get();
		if (state.kind === 'ready' && state.choice.selectionId === selectionId) {
			this.authentication?.validateSelection(params, resourceForChoice(state.choice));
			return;
		}
		const choice = state.kind === 'choiceRequired' && state.choices.find(choice => choice.selectionId === selectionId && choice.resource === params.resource);
		if (!choice || !attempt.session || !attempt.flowId) {
			throw new ProtocolError(AhpErrorCodes.AuthRequired, 'Select one of the currently offered Copilot services.');
		}
		this.authentication?.validateSelection(params, resourceForChoice(choice));
		this._state.set({ kind: 'activating', entraAccountId: attempt.entraAccountId, discoveryId: attempt.flowId, choice }, undefined);
		try {
			const step = await attempt.session.rpc.accounts.login.advance({ flowId: attempt.flowId, input: selectionId });
			this.assertCurrent(attempt);
			if (step.kind !== 'completed' || step.result.status !== 'completed') {
				throw new Error('The selected Copilot service was not activated.');
			}
			const derivedFrom = await confirmAccount(attempt.session, choice);
			this.assertCurrent(attempt);
			this._state.set({ kind: 'ready', entraAccountId: attempt.entraAccountId, discoveryId: attempt.flowId, choice, derivedFrom }, undefined);
		} catch (error) {
			if (this._attempt === attempt) {
				this._state.set({ kind: 'error', entraAccountId: attempt.entraAccountId, stage: 'activation' }, undefined);
			}
			throw error;
		}
	}

	private assertCurrent(attempt: ILoginAttempt): void {
		if (this._attempt !== attempt || attempt.cancellation.token.isCancellationRequested || this._store.isDisposed) {
			throw new CancellationError();
		}
	}

	private release(attempt: ILoginAttempt): Promise<void> {
		attempt.cancellation.dispose(true);
		const session = attempt.session;
		if (!session) {
			return this._releasing ?? Promise.resolve();
		}
		attempt.session = undefined;
		const releasing = (async () => {
			try {
				if (attempt.flowId) {
					await session.rpc.accounts.login.cancel({ flowId: attempt.flowId });
				}
			} finally {
				try {
					await session.disconnect();
				} finally {
					await (await attempt.client).deleteSession(session.sessionId);
				}
			}
		})().finally(() => {
			if (this._releasing === releasing) {
				this._releasing = undefined;
			}
		});
		this._releasing = releasing;
		return releasing;
	}
}

function toServiceChoice(account: LoginAccount): ICopilotServiceChoice {
	const service = account.kind === 'entraEmu' ? 'github' : account.kind === 'loki' ? 'm365' : undefined;
	const resource = service && copilotEntraResources.get(service === 'github' ? copilotEntraEmuAudience : copilotEntraM365Audience);
	if (!service || !resource || !account.selectionId || !account.host || !account.login) {
		throw new Error('The runtime returned an unsupported Microsoft service choice.');
	}
	return { service, resource, selectionId: account.selectionId, host: account.host, accountName: account.login, displayName: account.login };
}

function resourceForChoice(choice: ICopilotServiceChoice): ProtectedResourceMetadata {
	const audience = choice.service === 'github' ? copilotEntraEmuAudience : copilotEntraM365Audience;
	return { resource: choice.resource, authorization_servers: [copilotEntraAuthorizationServer], scopes_supported: [`${audience}/${choice.service === 'github' ? 'user_impersonation' : '.default'}`] };
}

async function readActiveAccount(session: CopilotSession): Promise<{ choice: ICopilotServiceChoice; derivedFrom: string }> {
	const result = await session.rpc.accounts.get({ query: { kind: 'activeAccount' } });
	const account = result.kind === 'activeAccount' ? result.account : undefined;
	const authSelectionId = result.kind === 'activeAccount' ? result.authSelectionId : undefined;
	const selectionId = authSelectionId ?? account?.selectionId;
	if (!account?.active || !selectionId || !account.derivedFrom
		|| authSelectionId && account.selectionId && authSelectionId !== account.selectionId) {
		throw new ProtocolError(AhpErrorCodes.AuthRequired, 'The runtime did not confirm an active derived Copilot account.');
	}
	return { choice: toServiceChoice({ ...account, selectionId }), derivedFrom: account.derivedFrom };
}

async function confirmAccount(session: CopilotSession, choice: ICopilotServiceChoice): Promise<string> {
	const active = await readActiveAccount(session);
	if (active.choice.selectionId !== choice.selectionId || active.choice.host !== choice.host
		|| active.choice.accountName !== choice.accountName || active.choice.service !== choice.service) {
		throw new ProtocolError(AhpErrorCodes.AuthRequired, 'The runtime did not confirm the intended Copilot account and service.');
	}
	return active.derivedFrom;
}
