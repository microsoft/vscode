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

/** Starts end-of-turn checkpoint capture and schedules tracked then Git-backed changeset recomputation. */
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
		const checkpoint = this._checkpointService.captureTurnCheckpoint(URI.parse(turn.session), URI.parse(turn.channel), turn.turnId, workingDirectories);
		this._onTurnComplete(turn);
		void checkpoint.catch(err => {
			this._logService.warn(`[AgentSideEffects] Turn checkpoint capture failed for ${turn.session}/${turn.turnId}: ${err instanceof Error ? err.message : String(err)}`);
		}).then(() => {
			// Recover terminal-tool edits that providers cannot report through the file-edit tracker.
			this._changesets.refreshSessionChangeset(turn.session, 'auto');
		});
	}

	private _onTurnComplete(turn: ITurnEnd): void {
		this._changesets.onTurnComplete(turn.channel, turn.turnId, turn.clientContext);
		if (turn.channel !== turn.session) {
			this._changesets.onTurnComplete(turn.session, turn.turnId, turn.clientContext);
		}
	}
}
