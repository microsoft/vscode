/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { ILogService } from '../../../../log/common/log.js';
import { IAgentHostCheckpointService } from '../../../common/agentHostCheckpointService.js';
import { IAgentHostChangesetService } from '../../../common/agentHostChangesetService.js';
import type { IAgentHostChatContribution, IAgentHostChatContributionContext, ITurnEnd } from '../../../common/agentHostChatContributionsService.js';
import { IAgentConfigurationService } from '../../agentConfigurationService.js';
import { URI } from '../../../../../base/common/uri.js';

/** Captures end-of-turn checkpoints before scheduling changeset recomputation. */
export class CheckpointAndChangesetContribution extends Disposable implements IAgentHostChatContribution {

	static readonly id = 'checkpointAndChangeset';
	readonly order = 100;

	constructor(
		protected readonly _context: IAgentHostChatContributionContext,
		@ILogService private readonly _logService: ILogService,
		@IAgentHostCheckpointService private readonly _checkpointService: IAgentHostCheckpointService,
		@IAgentHostChangesetService private readonly _changesets: IAgentHostChangesetService,
		@IAgentConfigurationService private readonly _agentConfigService: IAgentConfigurationService,
	) {
		super();
	}

	onTurnEnd(turn: ITurnEnd): void {
		if (turn.reason.kind !== 'success' && turn.reason.kind !== 'error') {
			return;
		}
		if (turn.reason.kind === 'error' && turn.reason.resumable) {
			return;
		}
		if (turn.turnId === undefined) {
			this._onTurnComplete(turn);
			return;
		}

		// Preserve checkpoints for compare-turns and explicit Git strategies without blocking later contributions.
		const workingDirectories = this._agentConfigService.getEffectiveWorkingDirectories(turn.channel)?.map(w => URI.parse(w));
		this._checkpointService.captureTurnCheckpoint(URI.parse(turn.session), URI.parse(turn.channel), turn.turnId, workingDirectories).then(() => {
			this._onTurnComplete(turn);
		}, err => {
			// The successful-turn path previously logged capture failures here;
			// error turns still schedule the fallback changeset recompute silently.
			if (turn.reason.kind === 'success') {
				this._logService.warn(`[AgentSideEffects] Turn checkpoint capture failed for ${turn.session}/${turn.turnId}: ${err instanceof Error ? err.message : String(err)}`);
			}
			this._onTurnComplete(turn);
		});
	}

	private _onTurnComplete(turn: ITurnEnd): void {
		this._changesets.onTurnComplete(turn.channel, turn.turnId, turn.clientContext);
		if (turn.channel !== turn.session) {
			this._changesets.onTurnComplete(turn.session, turn.turnId, turn.clientContext);
		}
	}
}
