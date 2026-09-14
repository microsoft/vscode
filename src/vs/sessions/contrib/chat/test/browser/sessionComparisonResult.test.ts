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
import { IContextViewService } from '../../../../../platform/contextview/browser/contextView.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { ISession } from '../../../../services/sessions/common/session.js';
import { ISessionComparison, ISessionComparisonService, ISessionComparisonSynthesisPlan, SessionComparisonParticipantRole, SessionComparisonValidationState } from '../../../../services/sessions/common/sessionComparison.js';
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
				decisionSections: [{
					id: 'error-handling',
					title: 'Error handling',
					description: 'Choose how parse failures are represented.',
					affectedFiles: ['src/parser.ts'],
					options: [{
						participantId: 'attempt-1',
						approach: 'Throw structured errors.',
					}, {
						participantId: 'attempt-2',
						approach: 'Return typed diagnostics.',
					}],
					recommendedParticipantId: 'attempt-2',
				}],
			},
		};
		const comparisons = observableValue<readonly ISessionComparison[]>('comparisons', [comparison]);
		const currentSession = observableValue<ISession | undefined>('session', upcastPartial<ISession>({ resource: judgeResource }));
		let selected: string | undefined;
		let opened: URI | undefined;
		let synthesisPlan: ISessionComparisonSynthesisPlan | undefined;
		let synthesized = 0;
		let layouts = 0;
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(ISessionComparisonService, new class extends mock<ISessionComparisonService>() {
			override comparisons = comparisons;
			override selectAttempt(_comparisonId: string, participantId: string): void {
				selected = participantId;
			}
			override setSynthesisPlan(_comparisonId: string, plan: ISessionComparisonSynthesisPlan | undefined): void {
				synthesisPlan = plan;
			}
			override async synthesize(): Promise<void> {
				synthesized++;
			}
		}());
		instantiationService.stub(ISessionsService, new class extends mock<ISessionsService>() {
			override async openSession(resource: URI): Promise<void> {
				opened = resource;
			}
		}());
		instantiationService.stub(INotificationService, new class extends mock<INotificationService>() { });
		instantiationService.stub(IContextViewService, upcastPartial<IContextViewService>({}));
		const result = store.add(instantiationService.createInstance(SessionComparisonResult, currentSession, () => layouts++));

		const initialText = result.domNode.textContent ?? '';
		const buttons = result.domNode.querySelectorAll<HTMLElement>('.monaco-button');
		const plannedSynthesis = [...buttons].find(button => button.textContent === 'Start Planned Synthesis');
		const title = result.domNode.querySelector<HTMLElement>('.session-comparison-result-title');
		const strengthsTitle = result.domNode.querySelector<HTMLElement>('.session-comparison-result-subtitle:last-of-type');
		const table = result.domNode.querySelector<HTMLElement>('.session-comparison-result-strengths');
		const actions = result.domNode.querySelector<HTMLElement>('.session-comparison-result-actions');
		const synthesisPlanSummary = result.domNode.querySelector<HTMLElement>('.session-comparison-synthesis-plan-summary');
		const synthesisSelect = result.domNode.querySelector<HTMLElement>('[aria-label="Approach for Error handling"]');
		const accessibility = {
			regionRole: result.domNode.getAttribute('role'),
			regionLabelledBy: result.domNode.getAttribute('aria-labelledby'),
			titleId: title?.id,
			tableLabelledBy: table?.getAttribute('aria-labelledby'),
			strengthsTitleId: strengthsTitle?.id,
			actionsRole: actions?.getAttribute('role'),
			actionsLabel: actions?.getAttribute('aria-label'),
			buttonLabels: [...buttons].map(button => button.getAttribute('aria-label')),
		};
		buttons[0].click();
		plannedSynthesis?.click();
		await timeout(0);
		currentSession.set(upcastPartial<ISession>({ resource: attempt1Resource }), undefined);

		assert.deepStrictEqual({
			content: {
				winner: initialText.includes('Attempt 2: Codex won'),
				customize: initialText.includes('Customize Synthesis'),
				section: initialText.includes('Error handling'),
				approach: initialText.includes('Return typed diagnostics.'),
				filesHidden: !initialText.includes('src/parser.ts'),
			},
			selected,
			opened: opened?.toString(),
			synthesized,
			synthesisPlan,
			hiddenOutsideJudge: result.domNode.hidden,
			layouts,
			synthesisPlanSummary: synthesisPlanSummary?.textContent,
			synthesisSelectLabel: synthesisSelect?.getAttribute('aria-label'),
			accessibility,
		}, {
			content: {
				winner: true,
				customize: true,
				section: true,
				approach: false,
				filesHidden: true,
			},
			selected: 'attempt-2',
			opened: attempt2Resource.toString(),
			synthesized: 1,
			synthesisPlan: { selections: [{ sectionId: 'error-handling', participantId: 'attempt-2' }] },
			hiddenOutsideJudge: true,
			layouts: 2,
			synthesisPlanSummary: 'Customize Synthesis',
			synthesisSelectLabel: 'Approach for Error handling',
			accessibility: {
				regionRole: 'region',
				regionLabelledBy: title?.id,
				titleId: title?.id,
				tableLabelledBy: strengthsTitle?.id,
				strengthsTitleId: strengthsTitle?.id,
				actionsRole: 'group',
				actionsLabel: 'Comparison result actions',
				buttonLabels: [
					'Focus winning session, Attempt 2: Codex',
					'Synthesize using the Judge recommendation',
					'Start synthesis with the selected approaches',
				],
			},
		});
	});
});
