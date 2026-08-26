/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { CommandsRegistry } from '../../../../../platform/commands/common/commands.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { registerWorkbenchContribution2, WorkbenchPhase, type IWorkbenchContribution } from '../../../../../workbench/common/contributions.js';
import {
	AGENT_SESSION_CLAIM_COMMAND_ID,
	AGENT_SESSION_CLAIM_HASH_ARG,
	agentSessionClaimTargets,
	computeAgentSessionClaimCommitment,
	equalsConstantTime,
	parseAgentSessionClaimCommitment,
	parseAgentSessionClaimRequest,
} from '../../../../../workbench/contrib/chat/common/agentHostSessionClaim.js';
import { INativeWorkbenchEnvironmentService } from '../../../../../workbench/services/environment/electron-browser/environmentService.js';
import { IExtensionService } from '../../../../../workbench/services/extensions/common/extensions.js';

/**
 * The private launch path for claiming an existing remote Agent Host session.
 *
 * Inert unless this window was started with the private, unlisted
 * `--agent-session-claim-hash` argument: the command is registered at runtime,
 * only when gated, so an ordinary window has no such command to reach from the
 * Command Palette, a menu, a keybinding, a command URI, or `executeCommand`.
 */
export class AgentSessionClaimContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'sessions.contrib.agentSessionClaim';

	/** The launch commitment, cleared the first time the command is invoked. */
	private _commitment: string | undefined;
	private readonly _claim = this._register(new MutableDisposable());

	constructor(
		@INativeWorkbenchEnvironmentService environmentService: INativeWorkbenchEnvironmentService,
		@IExtensionService private readonly _extensionService: IExtensionService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();

		this._commitment = parseAgentSessionClaimCommitment(environmentService.args[AGENT_SESSION_CLAIM_HASH_ARG]);
		if (!this._commitment) {
			return;
		}
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

		const request = parseAgentSessionClaimRequest(rawRequest);
		if (!request) {
			throw new Error('Agent session claim rejected: malformed request');
		}
		if (!equalsConstantTime(await computeAgentSessionClaimCommitment(request), commitment)) {
			throw new Error('Agent session claim rejected: request does not match this launch');
		}

		// The commitment already pins the bridge's identity; this additionally
		// requires that exact reviewed extension to be present at that exact
		// version, which — with an evaluation profile that carries only reviewed
		// extensions — keeps the claim from being served in the wrong window.
		// VS Code does not attribute `executeCommand` to a calling extension, so
		// knowledge of the pre-image remains the only caller proof.
		await this._extensionService.whenInstalledExtensionsRegistered();
		const bridge = await this._extensionService.getExtension(request.bridgeExtensionId);
		if (bridge?.version !== request.bridgeExtensionVersion) {
			throw new Error('Agent session claim rejected: reviewed bridge extension is not installed at the expected version');
		}

		const target = agentSessionClaimTargets.get(request.sessionType);
		if (!target) {
			throw new Error(`Agent session claim rejected: no handler for ${request.sessionType}`);
		}
		this._claim.value = await target(URI.parse(request.sessionUri));
		this._logService.info(`[AgentSessionClaim] Claimed ${request.sessionUri}`);
	}
}

// Ahead of `RemoteAgentHostContribution` (`AfterRestored`) so the command
// exists before the bridge extension can be activated.
registerWorkbenchContribution2(AgentSessionClaimContribution.ID, AgentSessionClaimContribution, WorkbenchPhase.BlockStartup);
