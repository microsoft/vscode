/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { disposableTimeout } from '../../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../../base/common/errors.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { CommandsRegistry } from '../../../../../platform/commands/common/commands.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { registerWorkbenchContribution2, WorkbenchPhase, type IWorkbenchContribution } from '../../../../../workbench/common/contributions.js';
import {
	AGENT_SESSION_CLAIM_COMMAND_ID,
	AGENT_SESSION_CLAIM_HASH_ARG,
	AgentSessionClaimReadiness,
	agentSessionClaimTargets,
	computeAgentSessionClaimCommitment,
	parseAgentSessionClaimCommitment,
	parseAgentSessionClaimRequest,
} from '../../../../../workbench/contrib/chat/common/agentHostSessionClaim.js';
import { INativeWorkbenchEnvironmentService } from '../../../../../workbench/services/environment/electron-browser/environmentService.js';
import { ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';

/**
 * Terminal guard for a whole claim — readiness, hydration, and the settle. Each
 * wait is event-driven; this only turns one that will never end into a failure.
 */
export const AGENT_SESSION_CLAIM_BUDGET_MS = 60_000;
const BUDGET_EXCEEDED_OUTCOME = 'budgetExceeded';

/**
 * How far a claim had got when the guard fired. A closed vocabulary — no paths,
 * no product error text — so it is safe to report to the caller that is waiting
 * on it, and precise enough to say *which* wait never ended.
 */
const enum AgentSessionClaimPhase {
	Readiness = 'readiness',
	Hydration = 'hydration',
	Listing = 'listing',
	Open = 'open',
	Publish = 'publish',
}

/** Storage key prefix marking a commitment as spent, so a reload cannot replay it. */
const SPENT_CLAIM_STORAGE_PREFIX = 'agentHost.sessionClaim.spent.';

/**
 * The private launch path for claiming an existing remote Agent Host session.
 * Inert unless this window was started with the private, unlisted
 * `--agent-session-claim-hash` argument: the command is registered at runtime,
 * only when gated, so an ordinary window has no such command.
 */
export class AgentSessionClaimContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'sessions.contrib.agentSessionClaim';

	/** The launch commitment, cleared the first time the command is invoked. */
	private _commitment: string | undefined;
	private readonly _claim = this._register(new MutableDisposable());

	constructor(
		@INativeWorkbenchEnvironmentService environmentService: INativeWorkbenchEnvironmentService,
		@IStorageService private readonly _storageService: IStorageService,
		@ILogService private readonly _logService: ILogService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) {
		super();

		const commitment = parseAgentSessionClaimCommitment(environmentService.args[AGENT_SESSION_CLAIM_HASH_ARG]);
		// A reload re-runs this with the same argv, so the spent marker — not the
		// argument — is what makes a claim once-per-launch.
		if (!commitment || this._storageService.getBoolean(SPENT_CLAIM_STORAGE_PREFIX + commitment, StorageScope.APPLICATION, false)) {
			return;
		}
		this._commitment = commitment;
		this._register(CommandsRegistry.registerCommand({
			id: AGENT_SESSION_CLAIM_COMMAND_ID,
			// No `metadata`: an undescribed command is excluded from the Command
			// Palette, and no menu contributes it anywhere.
			handler: (_accessor, ...args: unknown[]) => this._claimExternalSession(args[0]),
		}));
		this._logService.info('[AgentSessionClaim] Claim command registered for this launch');
	}

	private async _claimExternalSession(rawRequest: unknown): Promise<void> {
		// Consume the gate first, before parsing and before any side effect: the
		// claim is one-use even when it fails.
		const commitment = this._commitment;
		this._commitment = undefined;
		if (!commitment) {
			throw new Error('Agent session claim rejected: no unused claim in this window');
		}
		this._storageService.store(SPENT_CLAIM_STORAGE_PREFIX + commitment, true, StorageScope.APPLICATION, StorageTarget.MACHINE);

		const request = parseAgentSessionClaimRequest(rawRequest);
		if (!request) {
			throw new Error('Agent session claim rejected: malformed request');
		}
		// Both sides are non-secret here, so a plain compare is enough: a
		// timing-leaked prefix of a hash does not help forge the rest.
		if (await computeAgentSessionClaimCommitment(request) !== commitment) {
			throw new Error('Agent session claim rejected: request does not match this launch');
		}

		// Driven by the registry's registration event, so a race with
		// `RemoteAgentHostContribution` waits rather than fails.
		const pending = new DisposableStore();
		const budget = pending.add(new CancellationTokenSource());
		let budgetExceeded = false;
		let phase = AgentSessionClaimPhase.Readiness;
		const enter = (next: AgentSessionClaimPhase) => {
			phase = next;
			this._logService.info(`[AgentSessionClaim] ${next}`);
		};
		pending.add(disposableTimeout(() => { budgetExceeded = true; budget.cancel(); }, AGENT_SESSION_CLAIM_BUDGET_MS));
		try {
			const readiness = await agentSessionClaimTargets.whenTargetReady(request.sessionType, budget.token);
			if (readiness.outcome !== AgentSessionClaimReadiness.Ready) {
				throw new Error(`Agent session claim ${readiness.outcome}: no handler registered for ${request.sessionType}`);
			}
			enter(AgentSessionClaimPhase.Hydration);
			this._claim.value = await readiness.target(URI.parse(request.sessionUri), (sessionResource, activationToken) => this._activateSession(sessionResource, activationToken, enter), budget.token);
			this._logService.info(`[AgentSessionClaim] Claimed ${request.sessionUri}`);
		} catch (err) {
			// Classified once: the guard can interrupt any of the waits, and
			// must read the same whichever it was — naming the one it caught.
			throw budgetExceeded
				? new Error(`Agent session claim ${BUDGET_EXCEEDED_OUTCOME}: ${request.sessionType} did not become claimable within ${AGENT_SESSION_CLAIM_BUDGET_MS}ms (phase: ${phase})`)
				: err;
		} finally {
			pending.dispose();
		}
	}

	/**
	 * Makes the claimed session active the one way the sidebar does — a single
	 * {@link ISessionsService.openSession} on the existing resource — so the
	 * window's session-scoped surfaces come up exactly as they do for a user who
	 * clicked the row. It shows a session that already exists and resolves once
	 * it has loaded: nothing here creates, composes, or submits.
	 *
	 * `openSession` throws for a resource no provider has listed yet, and the
	 * bridge can invoke the claim before the remote session list has caught up,
	 * so the exact resource is first awaited on the management service's own
	 * change event — the same reason the handler wait is event-driven.
	 *
	 * The services are resolved here rather than injected because this
	 * contribution is constructed in *every* window at `BlockStartup`, and an
	 * ungated one must not pull the sessions view up with it.
	 */
	private _activateSession(sessionResource: URI, token: CancellationToken, enter: (phase: AgentSessionClaimPhase) => void): Promise<void> {
		return this._instantiationService.invokeFunction(accessor => {
			const sessionsService = accessor.get(ISessionsService);
			const managementService = accessor.get(ISessionsManagementService);
			enter(AgentSessionClaimPhase.Listing);
			return whenSessionListed(managementService, sessionResource, token)
				.then(() => {
					enter(AgentSessionClaimPhase.Open);
					return sessionsService.openSession(sessionResource, { preserveFocus: false });
				})
				.then(() => enter(AgentSessionClaimPhase.Publish));
		});
	}
}

/**
 * Resolves as soon as {@link sessionResource} is one of the sessions the
 * providers list, driven purely by `onDidChangeSessions`: it schedules nothing
 * and polls nothing, and an already-listed session resolves with no clock
 * involved at all. The caller supplies its deadline through {@link token}.
 */
function whenSessionListed(managementService: ISessionsManagementService, sessionResource: URI, token: CancellationToken): Promise<void> {
	if (managementService.getSession(sessionResource)) {
		return Promise.resolve();
	}
	return new Promise((resolve, reject) => {
		const store = new DisposableStore();
		const settle = (settled: () => void) => { store.dispose(); settled(); };
		store.add(managementService.onDidChangeSessions(() => {
			if (managementService.getSession(sessionResource)) {
				settle(resolve);
			}
		}));
		store.add(token.onCancellationRequested(() => settle(() => reject(new CancellationError()))));
		if (token.isCancellationRequested) {
			settle(() => reject(new CancellationError()));
		}
	});
}

// Ahead of `RemoteAgentHostContribution` (`AfterRestored`) so the command
// exists before the bridge extension can be activated.
registerWorkbenchContribution2(AgentSessionClaimContribution.ID, AgentSessionClaimContribution, WorkbenchPhase.BlockStartup);
