/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { SessionStatus } from '../../../../services/sessions/common/session.js';
import { ISessionComparison, ISessionComparisonParticipant, SessionComparisonParticipantRole } from '../../../../services/sessions/common/sessionComparison.js';
import { describeSessionComparisonParticipant } from '../../browser/sessionComparisonContextBar.js';

suite('SessionComparisonContextBar', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	function participant(id: string, role: SessionComparisonParticipantRole): ISessionComparisonParticipant {
		return { id, role, sessionResource: URI.parse(`test:///${id}`), harness: { providerId: 'test', sessionTypeId: 'copilotcli', label: 'Copilot CLI', modelLabel: id } };
	}

	const runs = [participant('run-1', SessionComparisonParticipantRole.Attempt), participant('run-2', SessionComparisonParticipantRole.Attempt)];
	const judge = participant('judge', SessionComparisonParticipantRole.Judge);
	const comparison: ISessionComparison = {
		id: 'comparison',
		groupId: 'group',
		title: 'Fix the parser',
		createdAt: 0,
		workspace: URI.file('/repo'),
		prompt: 'Fix the parser',
		judgeHarness: judge.harness,
		participants: [...runs, judge],
	};
	const reviewed: ISessionComparison = {
		...comparison,
		verdict: { recommendedParticipantId: 'run-2', explanation: 'It handled empty input.', conflicts: [], attempts: [] },
	};

	test('tells each session what it is to its comparison', () => {
		const statuses = new Map([[runs[0].sessionResource!.toString(), SessionStatus.Completed], [runs[1].sessionResource!.toString(), SessionStatus.InProgress]]);
		const getStatus = (resource: URI) => statuses.get(resource.toString());
		assert.deepStrictEqual({
			running: describeSessionComparisonParticipant(comparison, runs[0], getStatus),
			reviewing: describeSessionComparisonParticipant(comparison, judge, getStatus),
			reviewed: describeSessionComparisonParticipant(reviewed, runs[0], getStatus),
			suggested: describeSessionComparisonParticipant(reviewed, runs[1], getStatus),
			continued: describeSessionComparisonParticipant({ ...reviewed, selectedParticipantId: 'run-1' }, runs[0], getStatus),
			reviewDone: describeSessionComparisonParticipant(reviewed, judge, getStatus),
		}, {
			running: 'Run 1 of 2 · 1 still running',
			reviewing: 'Reviewing 2 parallel runs',
			reviewed: 'Run 1 of 2 · the review is ready',
			suggested: 'Run 2 of 2 · suggested by the review',
			continued: 'Run 1 of 2 · you continued with this run',
			reviewDone: 'Reviewed 2 parallel runs',
		});
	});
});
