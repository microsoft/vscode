/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { AgentHostChatContributionRegistry, IAgentHostChatContribution, IAgentHostChatContributionContext, ITurnEnd } from '../chatContribution.js';

/** Captures end-of-turn checkpoints before scheduling changeset recomputation. */
class CheckpointAndChangesetContribution extends Disposable implements IAgentHostChatContribution {

	readonly id = 'checkpointAndChangeset';
	readonly order = 100;

	constructor(private readonly _context: IAgentHostChatContributionContext) {
		super();
	}

	onTurnEnd(turn: ITurnEnd): void {
		if (turn.reason.kind === 'cancelled') {
			return;
		}
		if (turn.turnId === undefined) {
			this._context.changesets.onTurnComplete(turn.session, turn.turnId, turn.clientContext);
			return;
		}

		// Capture the end-of-turn git checkpoint BEFORE notifying the changeset
		// service so the per-turn changeset recompute can take the authoritative
		// git-diff fast path, including terminal-tool edits missed by the
		// FileEditTracker. Keep the capture fire-and-forget: later contributions
		// must not wait for it.
		const workingDirectories = this._context.agentConfigService.getEffectiveWorkingDirectories(turn.session)?.map(w => URI.parse(w));
		this._context.checkpointService.captureTurnCheckpoint(URI.parse(turn.session), URI.parse(turn.channel), turn.turnId, workingDirectories).then(() => {
			this._context.changesets.onTurnComplete(turn.session, turn.turnId, turn.clientContext);
		}, err => {
			// The successful-turn path previously logged capture failures here;
			// error turns still schedule the fallback changeset recompute silently.
			if (turn.reason.kind === 'success') {
				this._context.logService.warn(`[AgentSideEffects] Turn checkpoint capture failed for ${turn.session}/${turn.turnId}: ${err instanceof Error ? err.message : String(err)}`);
			}
			this._context.changesets.onTurnComplete(turn.session, turn.turnId, turn.clientContext);
		});
	}
}

AgentHostChatContributionRegistry.register(CheckpointAndChangesetContribution);
