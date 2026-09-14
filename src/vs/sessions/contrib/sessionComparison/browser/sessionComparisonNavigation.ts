/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { onUnexpectedError } from '../../../../base/common/errors.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { autorun } from '../../../../base/common/observable.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IWorkbenchContribution } from '../../../../workbench/common/contributions.js';
import { ISession, SessionStatus } from '../../../services/sessions/common/session.js';
import { ISessionComparisonService, SessionComparisonParticipantRole } from '../../../services/sessions/common/sessionComparison.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { OPEN_SESSION_COMPARISON_COMMAND_ID } from '../common/sessionComparison.js';

export class SessionComparisonNavigationContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'sessions.contrib.sessionComparisonNavigation';

	private readonly _handledComparisons = new Set<string>();

	constructor(
		@ISessionComparisonService sessionComparisonService: ISessionComparisonService,
		@ISessionsManagementService sessionsManagementService: ISessionsManagementService,
		@ISessionsService private readonly sessionsService: ISessionsService,
		@ICommandService private readonly commandService: ICommandService,
	) {
		super();
		for (const comparison of sessionComparisonService.comparisons.get()) {
			if (comparison.verdict) {
				this._handledComparisons.add(comparison.id);
			}
		}
		this._register(autorun(reader => {
			for (const comparison of sessionComparisonService.comparisons.read(reader)) {
				if (!comparison.verdict || this._handledComparisons.has(comparison.id)) {
					continue;
				}
				const judge = comparison.participants.find(participant => participant.role === SessionComparisonParticipantRole.Judge);
				const judgeSession = judge?.sessionResource ? sessionsManagementService.getSession(judge.sessionResource) : undefined;
				if (!judgeSession || judgeSession.status.read(reader) !== SessionStatus.Completed) {
					continue;
				}
				this._handledComparisons.add(comparison.id);
				void this._showComparison(comparison.id, judgeSession).catch(onUnexpectedError);
			}
		}));
	}

	private async _showComparison(comparisonId: string, judgeSession: ISession): Promise<void> {
		this.sessionsService.closeSession(judgeSession);
		await this.commandService.executeCommand(OPEN_SESSION_COMPARISON_COMMAND_ID, comparisonId);
	}
}
