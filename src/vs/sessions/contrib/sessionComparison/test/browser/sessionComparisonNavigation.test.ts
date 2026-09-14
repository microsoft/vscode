/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../base/common/async.js';
import { Event } from '../../../../../base/common/event.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { ISession, SessionStatus } from '../../../../services/sessions/common/session.js';
import { ISessionComparison, ISessionComparisonService, SessionComparisonParticipantRole } from '../../../../services/sessions/common/sessionComparison.js';
import { ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { OPEN_SESSION_COMPARISON_COMMAND_ID } from '../../common/sessionComparison.js';
import { SessionComparisonNavigationContribution } from '../../browser/sessionComparisonNavigation.js';

suite('SessionComparisonNavigationContribution', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('closes the completed Judge and opens its comparison', async () => {
		const judgeResource = URI.parse('test:/judge');
		const judgeStatus = observableValue('judgeStatus', SessionStatus.InProgress);
		const judgeSession = upcastPartial<ISession>({
			sessionId: 'judge',
			resource: judgeResource,
			status: judgeStatus,
		});
		const comparison = upcastPartial<ISessionComparison>({
			id: 'comparison',
			participants: [{
				id: 'judge-participant',
				role: SessionComparisonParticipantRole.Judge,
				harness: { providerId: 'provider', sessionTypeId: 'type', label: 'Judge' },
				sessionResource: judgeResource,
			}],
		});
		const comparisons = observableValue<readonly ISessionComparison[]>('comparisons', [comparison]);
		const closedSessions: string[] = [];
		const commands: { id: string; args: readonly unknown[] }[] = [];
		disposables.add(new SessionComparisonNavigationContribution(
			upcastPartial<ISessionComparisonService>({ comparisons }),
			upcastPartial<ISessionsManagementService>({ getSession: resource => resource.toString() === judgeResource.toString() ? judgeSession : undefined }),
			upcastPartial<ISessionsService>({ closeSession: session => closedSessions.push(session?.sessionId ?? '') }),
			upcastPartial<ICommandService>({
				onWillExecuteCommand: Event.None,
				onDidExecuteCommand: Event.None,
				executeCommand: async (id, ...args) => {
					commands.push({ id, args });
					return undefined;
				},
			}),
		));

		comparisons.set([{
			...comparison,
			verdict: {
				recommendedParticipantId: 'attempt',
				explanation: 'Recommended',
				conflicts: [],
				attempts: [],
			},
		}], undefined);
		await timeout(0);
		const beforeCompletion = { closedSessions: [...closedSessions], commands: [...commands] };

		judgeStatus.set(SessionStatus.Completed, undefined);
		await timeout(0);

		assert.deepStrictEqual({
			beforeCompletion,
			closedSessions,
			commands,
		}, {
			beforeCompletion: { closedSessions: [], commands: [] },
			closedSessions: ['judge'],
			commands: [{ id: OPEN_SESSION_COMPARISON_COMMAND_ID, args: ['comparison'] }],
		});
	});
});
