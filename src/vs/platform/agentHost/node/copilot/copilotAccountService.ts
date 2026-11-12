/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CopilotClient, CopilotSession, EntraAuthOptions, EntraTokenProvider, EntraTokenProviderArgs, EntraTokenProviderResult } from '@github/copilot-sdk';
import { raceCancellation, raceCancellationError, raceTimeout, Sequencer } from '../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { CancellationError, isCancellationError } from '../../../../base/common/errors.js';
import { Event } from '../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { observableValue, type IObservable, type IReader } from '../../../../base/common/observable.js';
import { localize } from '../../../../nls.js';
import { ICopilotHomeService } from '../../../environment/common/copilotHome.js';
import { createDecorator, IInstantiationService } from '../../../instantiation/common/instantiation.js';
import { ILogService } from '../../../log/common/log.js';
import type { AuthenticateParams } from '../../common/agent.js';
import type { CopilotAccountContext, ICopilotServiceChoice } from '../../common/copilotAccountContext.js';
import { copilotEntraAuthorizationServer, copilotEntraDiscoveryResource, copilotEntraEmuAudience, copilotEntraM365Audience, copilotEntraResources } from '../../common/copilotEntraAuthentication.js';
import type { ProtectedResourceMetadata } from '../../common/state/protocol/state.js';
import { AhpErrorCodes, ProtocolError } from '../../common/state/sessionProtocol.js';
import { IAgentConfigurationService } from '../agentConfigurationService.js';
import { IAgentHostAuthenticationService } from '../agentHostAuthenticationService.js';
import { CopilotEntraAuthentication, copilotEntraDiscoveryMetadata, copilotEntraResourceForRequest } from './copilotEntraAuthentication.js';
import { AGENT_HOST_COPILOT_CLIENT_NAME } from './copilotManagedSettings.js';

type LoginStep = Awaited<ReturnType<CopilotSession['rpc']['accounts']['login']['advance']>>;
type CompletedLogin = Extract<LoginStep, { kind: 'completed' }>['result'];
type LoginAccount = NonNullable<CompletedLogin['accounts']>[number];
type ReadyAccountContext = Extract<CopilotAccountContext, { kind: 'ready' }>;
type AccountClient = Pick<CopilotClient, 'createSession' | 'deleteSession'>;

/** What the runtime reports once its login flow completes. */
type LoginOutcome =
	| { readonly kind: 'ready'; readonly choice: ICopilotServiceChoice }
	| { readonly kind: 'choiceRequired'; readonly choices: readonly ICopilotServiceChoice[] };

const CREDENTIAL_WAIT_MS = 30_000;

interface ILoginAttempt {
	readonly client: Promise<AccountClient>;
	readonly cancellation: CancellationTokenSource;
	readonly entraAccountId: string;
	session?: CopilotSession;
	flowId?: string;
}

export const ICopilotAccountService = createDecorator<ICopilotAccountService>('copilotAccountService');

export interface ICopilotAccountService {
	readonly _serviceBrand: undefined;
	readonly authentication: CopilotEntraAuthentication | undefined;
	readonly authenticationOptions: EntraAuthOptions | undefined;
	readonly state: IObservable<CopilotAccountContext>;
	getProtectedResources(reader?: IReader): ProtectedResourceMetadata[];
	authenticate(client: Promise<AccountClient>, params: AuthenticateParams): Promise<void>;
	requireReady(): ReadyAccountContext;
	getSession(context: ReadyAccountContext, client: Promise<AccountClient>): Promise<CopilotSession>;
	/** Signs a newly created conversation in to the context's service; a resumed conversation keeps the sign-in the runtime saved with it. */
	authenticateSession(session: CopilotSession, client: AccountClient, context: ReadyAccountContext, token: CancellationToken): Promise<void>;
	isAuthenticationSession(sessionId: string): boolean;
	reset(): Promise<void>;
	releaseSession(): Promise<void>;
}

/** Adapts advertised resources to the runtime's account login flow. */
export class CopilotAccountService extends Disposable implements ICopilotAccountService {
	declare readonly _serviceBrand: undefined;
	readonly authentication: CopilotEntraAuthentication | undefined;
	readonly authenticationOptions: EntraAuthOptions | undefined;
	private readonly _state = observableValue<CopilotAccountContext>(this, { kind: 'legacy' });
	readonly state: IObservable<CopilotAccountContext> = this._state;
	private _attempt: ILoginAttempt | undefined;
	private _releasing: Promise<void> | undefined;
	private readonly _sessionRestoration = new Sequencer();

	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
		@IAgentConfigurationService configurationService: IAgentConfigurationService,
		@ICopilotHomeService private readonly _home: ICopilotHomeService,
		@ILogService private readonly _logService: ILogService,
		@IAgentHostAuthenticationService private readonly _authenticationService: IAgentHostAuthenticationService,
	) {
		super();
		if (configurationService.copilotM365EnabledAtStartup) {
			this.authentication = this._register(instantiationService.createInstance(CopilotEntraAuthentication));
			this.authenticationOptions = { ...this.authentication.options, tokenProvider: (request, cancellation) => this.acquire(request, cancellation) };
			this._register(this.authentication.onDidRevoke(() => {
				void this.reset().catch(error => this._logService.error('[Copilot] Failed to release Microsoft account', error));
			}));
		}
	}

	getProtectedResources(reader?: IReader): ProtectedResourceMetadata[] {
		const state = this.state.read(reader);
		const choices = state.kind === 'choiceRequired' ? state.choices : state.kind === 'ready' || state.kind === 'activating' ? [state.choice] : [];
		const resources = new Map<string, ProtectedResourceMetadata>([[copilotEntraDiscoveryResource, copilotEntraDiscoveryMetadata]]);
		for (const choice of choices) {
			resources.set(choice.resource, resourceForChoice(choice));
		}
		for (const resource of this.authentication?.getProtectedResources(reader) ?? []) {
			resources.set(resource.resource, { ...resources.get(resource.resource), ...resource });
		}
		return [...resources.values()];
	}

	async authenticate(client: Promise<AccountClient>, params: AuthenticateParams): Promise<void> {
		if (!this.authentication) {
			throw new ProtocolError(AhpErrorCodes.AuthRequired, 'Microsoft account setup is unavailable.');
		}
		if (params.resource === copilotEntraDiscoveryResource) {
			const accountId = this.authentication.authorizeDiscovery(params);
			const state = this.state.get();
			if (state.kind === 'ready' || state.kind === 'choiceRequired') {
				return;
			}
			await this.reset();
			await this.discover(client, accountId);
			return;
		}
		const state = this.state.get();
		const choice = state.kind === 'choiceRequired' && state.choices.find(choice => choice.resource === params.resource);
		const attempt = this._attempt;
		if (!choice || !attempt?.session || !attempt.flowId) {
			throw new ProtocolError(AhpErrorCodes.AuthRequired, 'Select one of the currently offered Copilot resources.');
		}
		this.authentication.validateSelection(params, resourceForChoice(choice));
		await this.select(attempt, choice);
	}

	private async select(attempt: ILoginAttempt, choice: ICopilotServiceChoice): Promise<void> {
		this.assertCurrent(attempt);
		this._state.set({ kind: 'activating', entraAccountId: attempt.entraAccountId, choice }, undefined);
		try {
			await this.activate(attempt, choice);
			this._state.set({ kind: 'ready', entraAccountId: attempt.entraAccountId, choice }, undefined);
		} catch (error) {
			if (this._attempt === attempt) {
				this._state.set({ kind: 'error', entraAccountId: attempt.entraAccountId, stage: 'activation' }, undefined);
			}
			throw error;
		}
	}

	/** Advances the runtime login to the chosen service and confirms the runtime activated it. */
	private async activate(attempt: ILoginAttempt, choice: ICopilotServiceChoice): Promise<void> {
		const { session, flowId } = attempt;
		if (!session || !flowId) {
			throw new CancellationError();
		}
		const step = await session.rpc.accounts.login.advance({ flowId, input: choice.selectionId });
		this.assertCurrent(attempt);
		if (step.kind !== 'completed' || step.result.status !== 'completed') {
			throw new Error('The selected Copilot service was not activated.');
		}
		await confirmAccount(session, choice);
		this.assertCurrent(attempt);
	}

	requireReady(): ReadyAccountContext {
		const state = this.state.get();
		if (state.kind !== 'ready') {
			throw new ProtocolError(AhpErrorCodes.AuthRequired, 'Authenticate an offered Copilot resource before continuing.', { resources: this.getProtectedResources() });
		}
		return state;
	}

	isAuthenticationSession(sessionId: string): boolean {
		return this._attempt?.session?.sessionId === sessionId;
	}

	getSession(context: ReadyAccountContext, client: Promise<AccountClient>): Promise<CopilotSession> {
		return this._sessionRestoration.queue(async () => {
			this.assertSelected(context);
			const session = this._attempt?.session ?? await this.restore(context, client);
			this.assertSelected(context);
			return session;
		});
	}

	private assertSelected(context: ReadyAccountContext): void {
		const state = this.state.get();
		if (state.kind !== 'ready') {
			throw new ProtocolError(AhpErrorCodes.AuthRequired, 'The selected Copilot account is no longer available.');
		}
		if (state !== context) {
			throw new CancellationError();
		}
	}

	/** Signs a restarted runtime back in to the selected service; the context stays ready so its catalog is kept. */
	private async restore(context: ReadyAccountContext, client: Promise<AccountClient>): Promise<CopilotSession> {
		const attempt: ILoginAttempt = { client, entraAccountId: context.entraAccountId, cancellation: new CancellationTokenSource() };
		this._attempt = attempt;
		try {
			const { session, outcome } = await this.login(attempt);
			this.assertCurrent(attempt);
			const choice = outcome.kind === 'ready' ? outcome.choice : outcome.choices.find(offered => sameServiceAccount(offered, context.choice));
			if (!choice || !sameServiceAccount(choice, context.choice)) {
				throw new ProtocolError(AhpErrorCodes.AuthRequired, 'The selected Copilot service is no longer available.');
			}
			if (outcome.kind === 'choiceRequired') {
				await this.activate(attempt, choice);
			}
			return session;
		} catch (error) {
			// Only the runtime disowning the selection ends the context; any other failure can be retried.
			await this.abandon(attempt, error instanceof ProtocolError ? 'discovery' : undefined);
			throw error;
		}
	}

	async authenticateSession(session: CopilotSession, client: AccountClient, context: ReadyAccountContext, token: CancellationToken): Promise<void> {
		await this.getSession(context, Promise.resolve(client));
		const attempt = this._attempt;
		if (!attempt || token.isCancellationRequested) {
			throw new CancellationError();
		}
		this.assertCurrent(attempt);
		const store = new DisposableStore();
		const cancellation = store.add(new CancellationTokenSource(token));
		store.add(attempt.cancellation.token.onCancellationRequested(() => cancellation.cancel()));
		try {
			await this.authenticateConversation(session, context.choice, cancellation.token);
			this.assertCurrent(attempt);
			if (cancellation.token.isCancellationRequested || this.state.get() !== context) {
				throw new CancellationError();
			}
		} finally {
			store.dispose();
		}
	}

	private async authenticateConversation(session: CopilotSession, expected: ICopilotServiceChoice, token: CancellationToken): Promise<void> {
		if (token.isCancellationRequested) {
			throw new CancellationError();
		}
		const beginning = session.rpc.accounts.login.begin({ kind: 'entra' });
		const flow = await raceCancellationError(beginning, token).catch(error => {
			if (isCancellationError(error)) {
				void beginning.then(flow => session.rpc.accounts.login.cancel({ flowId: flow.flowId }))
					.catch(cleanupError => this._logService.error('[Copilot] Failed to cancel late conversation login', cleanupError));
			}
			throw error;
		});
		try {
			if (token.isCancellationRequested) {
				throw new CancellationError();
			}
			let step = flow.step;
			while (step.kind === 'awaiting' || step.kind === 'needs-interaction') {
				step = await raceCancellationError(session.rpc.accounts.login.advance({ flowId: flow.flowId }), token);
			}
			let selected: ICopilotServiceChoice | undefined;
			if (step.kind === 'completed' && step.result.status === 'needs-account-selection') {
				const choices = (step.result.accounts ?? []).filter(account => account.kind === (expected.service === 'm365' ? 'loki' : 'entraEmu'));
				if (choices.length !== 1 || !sameService(toServiceChoice(choices[0]), expected)) {
					throw new ProtocolError(AhpErrorCodes.AuthRequired, localize('copilot.conversationServiceUnavailable', "The selected Copilot service is unavailable for this conversation."));
				}
				selected = toServiceChoice(choices[0]);
				step = await raceCancellationError(session.rpc.accounts.login.advance({ flowId: flow.flowId, input: selected.selectionId }), token);
			}
			if (step.kind !== 'completed' || step.result.status !== 'completed' || step.result.host !== expected.host) {
				throw new ProtocolError(AhpErrorCodes.AuthRequired, localize('copilot.conversationLoginFailed', "The runtime did not authenticate this conversation with the selected Copilot service."));
			}
			const active = await raceCancellationError(readActiveAccount(session), token);
			if (!sameService(active, expected) || active.host !== step.result.host || active.accountName !== step.result.login
				|| selected && (active.selectionId !== selected.selectionId || active.accountName !== selected.accountName)) {
				throw new ProtocolError(AhpErrorCodes.AuthRequired, localize('copilot.conversationLoginMismatch', "The runtime did not confirm this conversation's completed Copilot login."));
			}
		} finally {
			await session.rpc.accounts.login.cancel({ flowId: flow.flowId });
		}
	}

	reset(): Promise<void> {
		this._state.set({ kind: 'legacy' }, undefined);
		return this.releaseSession();
	}

	releaseSession(): Promise<void> {
		const attempt = this._attempt;
		this._attempt = undefined;
		attempt?.cancellation.dispose(true);
		return attempt ? this.release(attempt) : this._releasing ?? Promise.resolve();
	}

	private release(attempt: ILoginAttempt): Promise<void> {
		if (!attempt?.session) {
			return this._releasing ?? Promise.resolve();
		}
		const session = attempt.session;
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

	private async acquire(request: EntraTokenProviderArgs, cancellation: Parameters<EntraTokenProvider>[1]): Promise<EntraTokenProviderResult> {
		const resource = copilotEntraResourceForRequest(request);
		const attempt = this._attempt;
		const isCancelled = () => cancellation.isCancellationRequested || attempt?.cancellation.token.isCancellationRequested;
		if (isCancelled()) {
			return { kind: 'cancelled' };
		}
		if (!attempt || request.clientId !== this.authentication!.options.clientId || request.accountId && request.accountId !== attempt.entraAccountId) {
			return this.authentication!.options.tokenProvider!(request, cancellation);
		}
		const store = new DisposableStore();
		const changed = Event.toPromise(Event.filter(this._authenticationService.onDidAuthenticate ?? Event.None, event => event.resource === resource?.resource), store);
		try {
			const result = await this.authentication!.options.tokenProvider!(request, cancellation);
			if (isCancelled()) {
				return { kind: 'cancelled' };
			}
			const state = this.state.get();
			if (result.kind !== 'unavailable' || !resource || state.kind !== 'discovering' && state.kind !== 'activating') {
				return result;
			}
			await raceCancellation(raceCancellation(raceTimeout(changed, CREDENTIAL_WAIT_MS), cancellation), attempt.cancellation.token);
			return isCancelled() ? { kind: 'cancelled' } : this.authentication!.options.tokenProvider!(request, cancellation);
		} finally {
			store.dispose();
		}
	}

	private async discover(client: Promise<AccountClient>, entraAccountId: string): Promise<void> {
		const attempt: ILoginAttempt = { client, entraAccountId, cancellation: new CancellationTokenSource() };
		this._attempt = attempt;
		this._state.set({ kind: 'discovering', entraAccountId }, undefined);
		try {
			const { outcome } = await this.login(attempt);
			this.assertCurrent(attempt);
			this._state.set({ ...outcome, entraAccountId }, undefined);
		} catch (error) {
			await this.abandon(attempt, 'discovery');
			throw error;
		}
	}

	/** Runs the runtime login for an attempt, which owns the created session even when this fails. */
	private async login(attempt: ILoginAttempt): Promise<{ readonly session: CopilotSession; readonly outcome: LoginOutcome }> {
		const runtime = await raceCancellationError(attempt.client, attempt.cancellation.token);
		this.assertCurrent(attempt);
		const session = await runtime.createSession({
			clientName: AGENT_HOST_COPILOT_CLIENT_NAME, configDirectory: this._home.home.fsPath,
			enableConfigDiscovery: false, enableSessionStore: false, enableManagedSettings: true,
			availableTools: [], disabledMcpServers: ['github-mcp-server'],
			requestExtensions: false, requestCanvasRenderer: false, enableSessionTelemetry: false, enableHostGitOperations: false,
			infiniteSessions: { enabled: false }, memory: { enabled: false },
		});
		attempt.session = session;
		this.assertCurrent(attempt);
		const flow = await session.rpc.accounts.login.begin({ kind: 'entra' });
		attempt.flowId = flow.flowId;
		let step = flow.step;
		while (step.kind === 'awaiting' || step.kind === 'needs-interaction') {
			step = await raceCancellationError(session.rpc.accounts.login.advance({ flowId: flow.flowId }), attempt.cancellation.token);
			this.assertCurrent(attempt);
		}
		if (step.kind !== 'completed') {
			throw new Error(step.kind === 'error' ? step.message : 'The runtime requested an unsupported Microsoft login interaction.');
		}
		return { session, outcome: await readLoginOutcome(session, step.result) };
	}

	/** Releases a failed attempt; when it still owns the context, a given stage reports the failure. */
	private async abandon(attempt: ILoginAttempt, stage: 'discovery' | undefined): Promise<void> {
		if (this._attempt === attempt) {
			this._attempt = undefined;
			attempt.cancellation.dispose(true);
			if (stage) {
				this._state.set({ kind: 'error', entraAccountId: attempt.entraAccountId, stage }, undefined);
			}
		}
		await this.release(attempt).catch(cleanupError => this._logService.error('[Copilot] Failed to release rejected Microsoft login', cleanupError));
	}

	private assertCurrent(attempt: ILoginAttempt): void {
		if (this._attempt !== attempt || attempt.cancellation.token.isCancellationRequested || this._store.isDisposed) {
			throw new CancellationError();
		}
	}

	override dispose(): void {
		void this.reset().catch(error => this._logService.error('[Copilot] Failed to release Microsoft login', error));
		super.dispose();
	}
}

/** Reads a completed runtime login as the service it activated or the services still to choose from. */
async function readLoginOutcome(session: CopilotSession, result: CompletedLogin): Promise<LoginOutcome> {
	if (result.status === 'completed') {
		const choice = await readActiveAccount(session);
		if (choice.host !== result.host || choice.accountName !== result.login) {
			throw new ProtocolError(AhpErrorCodes.AuthRequired, 'The runtime did not confirm the completed Copilot login.');
		}
		return { kind: 'ready', choice };
	}
	if (result.status !== 'needs-account-selection') {
		throw new Error('Microsoft service discovery did not return selectable accounts.');
	}
	const choices = (result.accounts ?? []).map(toServiceChoice);
	if (choices.length !== 2 || new Set(choices.map(choice => choice.resource)).size !== 2 || new Set(choices.map(choice => choice.selectionId)).size !== 2) {
		throw new Error('Microsoft discovery did not return distinct supported services.');
	}
	return { kind: 'choiceRequired', choices };
}

function toServiceChoice(account: LoginAccount): ICopilotServiceChoice {
	const service = account.kind === 'entraEmu' ? 'github' : account.kind === 'loki' ? 'm365' : undefined;
	const resource = service && copilotEntraResources.get(service === 'github' ? copilotEntraEmuAudience : copilotEntraM365Audience);
	if (!service || !resource || !account.selectionId || !account.host || !account.login) {
		throw new Error('The runtime returned an unsupported Microsoft service choice.');
	}
	return { service, resource, selectionId: account.selectionId, host: account.host, accountName: account.login };
}

function resourceForChoice(choice: ICopilotServiceChoice): ProtectedResourceMetadata {
	const audience = choice.service === 'github' ? copilotEntraEmuAudience : copilotEntraM365Audience;
	return { resource: choice.resource, resource_name: choice.service === 'github' ? localize('copilot.githubResource', "GitHub Copilot") : localize('copilot.microsoftResource', "Microsoft 365 Copilot"), authorization_servers: [copilotEntraAuthorizationServer], scopes_supported: [`${audience}/${choice.service === 'github' ? 'user_impersonation' : '.default'}`], required: false };
}

async function readActiveAccount(session: CopilotSession): Promise<ICopilotServiceChoice> {
	const result = await session.rpc.accounts.get({ query: { kind: 'activeAccount' } });
	const account = result.kind === 'activeAccount' ? result.account : undefined;
	const authSelectionId = result.kind === 'activeAccount' ? result.authSelectionId : undefined;
	const selectionId = authSelectionId ?? account?.selectionId;
	if (!account?.active || !selectionId || !account.derivedFrom
		|| authSelectionId && account.selectionId && authSelectionId !== account.selectionId) {
		throw new ProtocolError(AhpErrorCodes.AuthRequired, 'The runtime did not confirm an active derived Copilot account.');
	}
	return toServiceChoice({ ...account, selectionId });
}

async function confirmAccount(session: CopilotSession, choice: ICopilotServiceChoice): Promise<void> {
	const active = await readActiveAccount(session);
	if (active.selectionId !== choice.selectionId || !sameServiceAccount(active, choice)) {
		throw new ProtocolError(AhpErrorCodes.AuthRequired, 'The runtime did not confirm the intended Copilot account and service.');
	}
}

function sameServiceAccount(first: ICopilotServiceChoice, second: ICopilotServiceChoice): boolean {
	return sameService(first, second) && first.accountName === second.accountName;
}

function sameService(first: ICopilotServiceChoice, second: ICopilotServiceChoice): boolean {
	return first.resource === second.resource && first.host === second.host && first.service === second.service;
}
