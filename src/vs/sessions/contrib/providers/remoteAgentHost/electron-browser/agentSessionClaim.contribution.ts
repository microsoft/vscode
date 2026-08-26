/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { Disposable, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { CommandsRegistry } from '../../../../../platform/commands/common/commands.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { registerWorkbenchContribution2, WorkbenchPhase, type IWorkbenchContribution } from '../../../../../workbench/common/contributions.js';
import {
	AGENT_SESSION_CLAIM_COMMAND_ID,
	AGENT_SESSION_CLAIM_HASH_ARG,
	agentSessionClaimTargets,
	computeAgentSessionClaimCommitment,
	parseAgentSessionClaimCommitment,
	parseAgentSessionClaimRequest,
} from '../../../../../workbench/contrib/chat/common/agentHostSessionClaim.js';
import { INativeWorkbenchEnvironmentService } from '../../../../../workbench/services/environment/electron-browser/environmentService.js';

/** How long the claim waits for its handler, and for the session, in total. */
const CLAIM_TIMEOUT_MS = 60_000;

/** Storage key prefix marking a commitment as spent, so a reload cannot replay it. */
const SPENT_CLAIM_STORAGE_PREFIX = 'agentHost.sessionClaim.spent.';

/**
 * The private launch path for claiming an existing remote Agent Host session.
 *
 * Inert unless this window was started with the private, unlisted
 * `--agent-session-claim-hash` argument: the command is registered at runtime,
 * only when gated, so an ordinary window has no such command at all.
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
	) {
		super();

		const commitment = parseAgentSessionClaimCommitment(environmentService.args[AGENT_SESSION_CLAIM_HASH_ARG]);
		// A reload re-runs this constructor with the same argv, so the spent
		// marker — not the argument — is what makes a claim once-per-launch.
		if (!commitment || this._storageService.getBoolean(SPENT_CLAIM_STORAGE_PREFIX + commitment, StorageScope.APPLICATION, false)) {
			return;
		}
		this._commitment = commitment;
		this._register(CommandsRegistry.registerCommand({
			id: AGENT_SESSION_CLAIM_COMMAND_ID,
			// No `metadata` on purpose: an undescribed command is excluded from
			// the Command Palette, and no menu contributes it anywhere.
			handler: (_accessor, ...args: unknown[]) => this._claimExternalSession(args[0]),
		}));
		this._logService.info('[AgentSessionClaim] Claim command registered for this launch');
	}

	private async _claimExternalSession(rawRequest: unknown): Promise<void> {
		// Consume the gate first, before parsing and before any side effect:
		// the claim is one-use even when it fails, so a wrong or malformed
		// attempt cannot be retried against the same commitment.
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

		// Wait for the exact session type rather than failing on a race with
		// `RemoteAgentHostContribution` that the caller cannot control.
		const timeout = this._register(new CancellationTokenSource());
		const timer = setTimeout(() => timeout.cancel(), CLAIM_TIMEOUT_MS);
		try {
			const target = await agentSessionClaimTargets.waitFor(request.sessionType, CLAIM_TIMEOUT_MS, timeout.token);
			if (!target) {
				throw new Error(`Agent session claim timed out: no handler for ${request.sessionType}`);
			}
			this._claim.value = await target(URI.parse(request.sessionUri), timeout.token);
			this._logService.info(`[AgentSessionClaim] Claimed ${request.sessionUri}`);
		} finally {
			clearTimeout(timer);
		}
	}
}

// Ahead of `RemoteAgentHostContribution` (`AfterRestored`) so the command
// exists before the bridge extension can be activated.
registerWorkbenchContribution2(AgentSessionClaimContribution.ID, AgentSessionClaimContribution, WorkbenchPhase.BlockStartup);
