/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../base/common/async.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { ISession } from '../../../../services/sessions/common/session.js';
import { ISessionComparison, ISessionComparisonService, SessionComparisonParticipantRole, SessionComparisonValidationState } from '../../../../services/sessions/common/sessionComparison.js';
import { SessionComparisonResult } from '../../browser/sessionComparisonResult.js';

suite('Sessions - Comparison Result', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('renders only in the Judge and invokes winner and synthesis actions', async () => {
		const attempt1Resource = URI.parse('test:///attempt-1');
		const attempt2Resource = URI.parse('test:///attempt-2');
		const judgeResource = URI.parse('test:///judge');
		const comparison: ISessionComparison = {
			id: 'comparison',
			groupId: 'group',
			title: 'Compare',
			createdAt: 0,
			workspace: URI.file('/repo'),
			prompt: 'Implement',
			participants: [{
				id: 'attempt-1',
				role: SessionComparisonParticipantRole.Attempt,
				sessionResource: attempt1Resource,
				harness: { providerId: 'test', sessionTypeId: 'test', label: 'Claude' },
			}, {
				id: 'attempt-2',
				role: SessionComparisonParticipantRole.Attempt,
				sessionResource: attempt2Resource,
				harness: { providerId: 'test', sessionTypeId: 'test', label: 'Codex' },
			}, {
				id: 'judge',
				role: SessionComparisonParticipantRole.Judge,
				sessionResource: judgeResource,
				harness: { providerId: 'test', sessionTypeId: 'test', label: 'Copilot' },
			}],
			verdict: {
				recommendedParticipantId: 'attempt-2',
				explanation: 'Codex handled the edge case and passed the focused test.',
				conflicts: [],
				attempts: [{
					participantId: 'attempt-1',
					summary: 'Added the core implementation.',
					validation: { tests: SessionComparisonValidationState.Passed, build: SessionComparisonValidationState.Unknown, lint: SessionComparisonValidationState.Unknown, diagnostics: SessionComparisonValidationState.Unknown },
					unresolvedIssues: [],
					notableDifferences: ['Clearer naming'],
				}, {
					participantId: 'attempt-2',
					summary: 'Handled the edge case.',
					validation: { tests: SessionComparisonValidationState.Passed, build: SessionComparisonValidationState.Passed, lint: SessionComparisonValidationState.Passed, diagnostics: SessionComparisonValidationState.Passed },
					unresolvedIssues: [],
					notableDifferences: [],
				}],
			},
		};
		const comparisons = observableValue<readonly ISessionComparison[]>('comparisons', [comparison]);
		const currentSession = observableValue<ISession | undefined>('session', upcastPartial<ISession>({ resource: judgeResource }));
		let selected: string | undefined;
		let opened: URI | undefined;
		let synthesized = false;
		let layouts = 0;
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(ISessionComparisonService, new class extends mock<ISessionComparisonService>() {
			override comparisons = comparisons;
			override selectAttempt(_comparisonId: string, participantId: string): void {
				selected = participantId;
			}
			override async synthesize(): Promise<void> {
				synthesized = true;
			}
		}());
		instantiationService.stub(ISessionsService, new class extends mock<ISessionsService>() {
			override async openSession(resource: URI): Promise<void> {
				opened = resource;
			}
		}());
		instantiationService.stub(INotificationService, new class extends mock<INotificationService>() { });
		const result = store.add(instantiationService.createInstance(SessionComparisonResult, currentSession, () => layouts++));

		const initialText = result.domNode.textContent;
		const buttons = result.domNode.querySelectorAll<HTMLElement>('.monaco-button');
		buttons[0].click();
		buttons[1].click();
		await timeout(0);
		currentSession.set(upcastPartial<ISession>({ resource: attempt1Resource }), undefined);

		assert.deepStrictEqual({
			initialText,
			selected,
			opened: opened?.toString(),
			synthesized,
			hiddenOutsideJudge: result.domNode.hidden,
			layouts,
		}, {
			initialText: 'Attempt 2: Codex wonWhy it wonCodex handled the edge case and passed the focused test.Strong points from other attemptsAttemptStrong pointsAttempt 1: ClaudeClearer namingFocus Winning SessionSynthesize Best Concepts',
			selected: 'attempt-2',
			opened: attempt2Resource.toString(),
			synthesized: true,
			hiddenOutsideJudge: true,
			layouts: 2,
		});
	});
});
