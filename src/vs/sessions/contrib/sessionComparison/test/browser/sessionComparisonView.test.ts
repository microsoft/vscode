/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { IRenderedMarkdown } from '../../../../../base/browser/markdownRenderer.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { IMarkdownString } from '../../../../../base/common/htmlContent.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IAccessibilityService } from '../../../../../platform/accessibility/common/accessibility.js';
import { TestAccessibilityService } from '../../../../../platform/accessibility/test/common/testAccessibilityService.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ContextKeyService } from '../../../../../platform/contextkey/browser/contextKeyService.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { NullHoverService } from '../../../../../platform/hover/test/browser/nullHoverService.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IMarkdownRenderer, IMarkdownRendererService } from '../../../../../platform/markdown/browser/markdownRenderer.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IChatWidgetService } from '../../../../../workbench/contrib/chat/browser/chat.js';
import { IChatMarkdownAnchorService } from '../../../../../workbench/contrib/chat/browser/widget/chatContentParts/chatMarkdownAnchorService.js';
import { ILanguageModelChatMetadata, ILanguageModelsService } from '../../../../../workbench/contrib/chat/common/languageModels.js';
import { ISession, ISessionChangesSummary, SessionStatus } from '../../../../services/sessions/common/session.js';
import { getSessionComparisonAttemptNames, ISessionComparison, ISessionComparisonParticipant, ISessionComparisonService, ISessionComparisonSynthesisPlan, nameSessionComparisonAttempts, SessionComparisonDecisionAssessment, SessionComparisonParticipantRole, SessionComparisonValidationSource, SessionComparisonValidationState } from '../../../../services/sessions/common/sessionComparison.js';
import { ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { buildSessionComparisonAccessibleContent } from '../../browser/sessionComparisonAccessibleView.js';
import { ISessionTurnTarget } from '../../browser/sessionComparisonNavigation.js';
import { SessionComparisonTranscript } from '../../browser/sessionComparisonView.js';
import { ISessionComparisonViewService } from '../../browser/sessionComparisonViewService.js';

const passed = { state: SessionComparisonValidationState.Passed, source: SessionComparisonValidationSource.JudgeRun } as const;
const unknown = { state: SessionComparisonValidationState.Unknown, source: SessionComparisonValidationSource.Unavailable } as const;

function participant(id: string, role: SessionComparisonParticipantRole, modelLabel: string): ISessionComparisonParticipant {
	return {
		id,
		role,
		sessionResource: URI.parse(`test:///${id}`),
		harness: { providerId: 'test', sessionTypeId: 'copilotcli', label: 'Copilot CLI', modelId: `copilot/${id}`, modelLabel },
	};
}

function reviewedComparison(): ISessionComparison {
	return {
		id: 'comparison',
		groupId: 'group',
		title: 'Fix the parser',
		createdAt: 0,
		workspace: URI.file('/repo'),
		prompt: 'Fix the parser',
		branch: 'main',
		judgeHarness: participant('judge', SessionComparisonParticipantRole.Judge, 'Claude Opus 4.6').harness,
		participants: [
			participant('attempt-1', SessionComparisonParticipantRole.Attempt, 'Claude Opus 4.6'),
			participant('attempt-2', SessionComparisonParticipantRole.Attempt, 'GPT-5.2'),
			participant('judge', SessionComparisonParticipantRole.Judge, 'Claude Opus 4.6'),
		],
		verdict: {
			recommendedParticipantId: 'attempt-2',
			explanation: 'It handled the empty input case and its tests pass.',
			rationale: {
				comparison: 'Only it covered empty input.',
				validation: 'Its parser tests pass.',
				codeQuality: 'A small, typed change.',
				solution: 'Returns diagnostics instead of throwing.',
			},
			conflicts: [],
			attempts: [{
				participantId: 'attempt-1',
				summary: 'Added structured errors to the parser.',
				validation: { tests: passed, build: unknown, lint: unknown, diagnostics: unknown },
				unresolvedIssues: ['Empty input still throws'],
				notableDifferences: [],
			}, {
				participantId: 'attempt-2',
				summary: 'Returned typed diagnostics from the parser.',
				validation: { tests: passed, build: passed, lint: passed, diagnostics: passed },
				unresolvedIssues: [],
				notableDifferences: [],
			}],
			decisionSections: [{
				id: 'errors',
				title: 'Error handling',
				description: 'How parse failures reach callers.',
				affectedFiles: ['src/parser.ts'],
				options: [
					{ participantId: 'attempt-1', approach: 'Threw structured errors from the parser.', assessment: SessionComparisonDecisionAssessment.Worse },
					{ participantId: 'attempt-2', approach: 'Returned typed diagnostics to the caller.', assessment: SessionComparisonDecisionAssessment.Better },
				],
				recommendedParticipantId: 'attempt-2',
			}, {
				id: 'tests',
				title: 'Tests',
				description: 'What the new tests cover.',
				affectedFiles: ['test/parser.test.ts'],
				options: [
					{ participantId: 'attempt-1', approach: 'Covered malformed tokens.', assessment: SessionComparisonDecisionAssessment.Neutral },
					{ participantId: 'attempt-2', approach: 'Covered malformed tokens and empty input.', assessment: SessionComparisonDecisionAssessment.Better },
				],
				recommendedParticipantId: 'attempt-2',
			}],
		},
	};
}

suite('Session comparison view', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function setup(initial: ISessionComparison, sessionStates: Record<string, { status: SessionStatus; description?: string; changes?: ISessionChangesSummary }>) {
		const comparison = observableValue<ISessionComparison | undefined>('comparison', initial);
		const sessions = new Map(Object.entries(sessionStates).map(([id, state]) => [URI.parse(`test:///${id}`).toString(), upcastPartial<ISession>({
			resource: URI.parse(`test:///${id}`),
			createdAt: new Date(0),
			status: observableValue(`${id}-status`, state.status),
			description: observableValue<IMarkdownString | undefined>(`${id}-description`, state.description ? { value: state.description } : undefined),
			lastTurnEnd: observableValue<Date | undefined>(`${id}-lastTurnEnd`, state.status === SessionStatus.Completed ? new Date(65_000) : undefined),
			changesSummary: observableValue<ISessionChangesSummary | undefined>(`${id}-changes`, state.changes),
		})]));
		const plans: (ISessionComparisonSynthesisPlan | undefined)[] = [];
		const opened: { participantId: string; target: ISessionTurnTarget | undefined }[] = [];
		let synthesized = 0;
		const instantiationService = store.add(new TestInstantiationService());
		const configurationService = new TestConfigurationService();
		store.add(configurationService.onDidChangeConfigurationEmitter);
		instantiationService.stub(IConfigurationService, configurationService);
		instantiationService.stub(IContextKeyService, store.add(new ContextKeyService(configurationService)));
		instantiationService.stub(IHoverService, NullHoverService);
		instantiationService.stub(IAccessibilityService, new TestAccessibilityService());
		instantiationService.stub(INotificationService, new class extends mock<INotificationService>() { }());
		instantiationService.stub(IChatWidgetService, new class extends mock<IChatWidgetService>() { }());
		instantiationService.stub(IChatMarkdownAnchorService, new class extends mock<IChatMarkdownAnchorService>() { }());
		instantiationService.stub(IMarkdownRendererService, new class extends mock<IMarkdownRendererService>() {
			override render(markdown: IMarkdownString, _options: unknown, outElement?: HTMLElement): IRenderedMarkdown {
				const element = outElement ?? mainWindow.document.createElement('div');
				element.textContent = markdown.value;
				return { element, dispose: () => { } };
			}
		}());
		const languageModels = new Map<string, ILanguageModelChatMetadata>();
		const onDidChangeLanguageModels = store.add(new Emitter<string>());
		instantiationService.stub(ILanguageModelsService, new class extends mock<ILanguageModelsService>() {
			override readonly onDidChangeLanguageModels = onDidChangeLanguageModels.event;
			override lookupLanguageModel(modelId: string) { return languageModels.get(modelId); }
		}());
		instantiationService.stub(ISessionsManagementService, new class extends mock<ISessionsManagementService>() {
			override readonly onDidChangeSessions = Event.None;
			override getSession(resource: URI): ISession | undefined {
				return sessions.get(resource.toString());
			}
		}());
		instantiationService.stub(ISessionComparisonService, new class extends mock<ISessionComparisonService>() {
			override getComparison(): ISessionComparison | undefined {
				return comparison.get();
			}
			override setSynthesisPlan(_comparisonId: string, plan: ISessionComparisonSynthesisPlan | undefined): void {
				plans.push(plan);
			}
			override async synthesize(): Promise<void> {
				synthesized++;
			}
			override canRetryJudge(): boolean {
				return false;
			}
		}());
		instantiationService.stub(ISessionComparisonViewService, new class extends mock<ISessionComparisonViewService>() {
			override async openParticipant(_comparisonId: string, participantId: string, target?: ISessionTurnTarget): Promise<void> {
				opened.push({ participantId, target });
			}
		}());
		const markdownRenderer: IMarkdownRenderer = {
			render(markdown: IMarkdownString, _options, outElement): IRenderedMarkdown {
				const element = outElement ?? mainWindow.document.createElement('div');
				element.textContent = markdown.value;
				return { element, dispose: () => { } };
			},
		};
		const transcript = store.add(instantiationService.createInstance(SessionComparisonTranscript, comparison, markdownRenderer));
		mainWindow.document.body.append(transcript.domNode);
		store.add({ dispose: () => transcript.domNode.remove() });
		const text = (selector: string) => Array.from(transcript.domNode.querySelectorAll<HTMLElement>(selector), element => element.textContent?.trim() ?? '');
		const visibleText = (selector: string) => Array.from(transcript.domNode.querySelectorAll<HTMLElement>(selector))
			.filter(element => !element.closest('[hidden]'))
			.map(element => element.textContent?.trim() ?? '');
		const registerModel = (modelId: string, metadata: ILanguageModelChatMetadata) => {
			languageModels.set(modelId, metadata);
			onDidChangeLanguageModels.fire(modelId);
		};
		return { transcript, comparison, plans, opened, text, visibleText, registerModel, get synthesized() { return synthesized; } };
	}

	test('shows each run live as a subagent pill before the review', () => {
		const comparison = reviewedComparison();
		const fixture = setup({ ...comparison, verdict: undefined, participants: comparison.participants.filter(candidate => candidate.role === SessionComparisonParticipantRole.Attempt) }, {
			'attempt-1': { status: SessionStatus.InProgress, description: 'Editing parser.ts' },
			'attempt-2': { status: SessionStatus.Completed, changes: { files: 2, additions: 12, deletions: 3 } },
		});

		assert.deepStrictEqual({
			prompt: fixture.text('.session-comparison-request-bubble'),
			status: fixture.text('.session-comparison-status-label'),
			runs: fixture.text('.session-comparison-run .chat-subagent-pill-label'),
			running: fixture.text('.session-comparison-run .chat-subagent-pill-widget.chat-subagent-running .chat-subagent-pill-label'),
			facts: fixture.visibleText('.session-comparison-run-facts'),
			review: fixture.visibleText('.session-comparison-review-note'),
			results: fixture.visibleText('.session-comparison-results'),
		}, {
			prompt: ['Fix the parser'],
			status: ['Running 2 models in parallel · 1 of 2 finished'],
			runs: ['Claude Opus 4.6', 'GPT-5.2'],
			running: ['Claude Opus 4.6'],
			facts: ['+12\u221232 files'],
			review: ['When every run finishes, Claude Opus 4.6 reviews them side by side and runs any missing checks.'],
			results: [],
		});
	});

	test('describes what each run did, keeps picks, and adapts the next step', async () => {
		const fixture = setup(reviewedComparison(), {
			'attempt-1': { status: SessionStatus.Completed },
			'attempt-2': { status: SessionStatus.Completed },
			'judge': { status: SessionStatus.Completed },
		});
		const actions = () => fixture.text('.session-comparison-next-actions .monaco-button');
		const initial = {
			status: fixture.text('.session-comparison-status-label'),
			review: fixture.text('.session-comparison-review .chat-subagent-pill-label'),
			suggestedRun: fixture.text('.session-comparison-run.suggested .chat-subagent-pill-label'),
			summaries: fixture.text('.session-comparison-run-summary-text'),
			verdict: fixture.text('.session-comparison-verdict-title'),
			options: fixture.text('.session-comparison-option-choice'),
			checked: fixture.text('.session-comparison-option-choice[aria-checked="true"]'),
			actions: actions(),
			judgmental: /\bbetter choice\b|\bworse choice\b|not recommended|\bwon\b/i.test(fixture.transcript.domNode.textContent ?? ''),
		};

		const radios = fixture.transcript.domNode.querySelectorAll<HTMLElement>('.session-comparison-option-choice');
		radios[0].click();
		const afterPick = { checked: fixture.text('.session-comparison-option-choice[aria-checked="true"]'), actions: actions(), plan: fixture.plans.at(-1) };

		fixture.transcript.domNode.querySelector<HTMLElement>('.session-comparison-option-jump')!.click();
		fixture.transcript.domNode.querySelector<HTMLElement>('.session-comparison-next-actions .monaco-button')!.click();
		await Promise.resolve();

		assert.deepStrictEqual({ initial, afterPick, opened: fixture.opened, synthesized: fixture.synthesized }, {
			initial: {
				status: ['Here\'s what each model did'],
				review: ['Review · Claude Opus 4.6'],
				suggestedRun: ['GPT-5.2'],
				summaries: ['Added structured errors to the parser.', 'Returned typed diagnostics from the parser.'],
				verdict: ['GPT-5.2is the strongest starting point.'],
				options: [
					'Claude Opus 4.6Threw structured errors from the parser.',
					'GPT-5.2SuggestedReturned typed diagnostics to the caller.',
					'Let the combined version decide',
					'Claude Opus 4.6Covered malformed tokens.',
					'GPT-5.2SuggestedCovered malformed tokens and empty input.',
					'Let the combined version decide',
				],
				checked: [
					'GPT-5.2SuggestedReturned typed diagnostics to the caller.',
					'GPT-5.2SuggestedCovered malformed tokens and empty input.',
				],
				actions: ['Continue with GPT-5.2', 'Combine Instead'],
				judgmental: false,
			},
			afterPick: {
				checked: [
					'Claude Opus 4.6Threw structured errors from the parser.',
					'GPT-5.2SuggestedCovered malformed tokens and empty input.',
				],
				actions: ['Combine What You Kept', 'Continue with GPT-5.2'],
				plan: { selections: [{ sectionId: 'errors', participantId: 'attempt-1' }, { sectionId: 'tests', participantId: 'attempt-2' }] },
			},
			opened: [{ participantId: 'attempt-1', target: { files: ['src/parser.ts'] } }],
			synthesized: 1,
		});
	});

	test('shows a model\'s icon once models finish registering', () => {
		const fixture = setup(reviewedComparison(), {
			'attempt-1': { status: SessionStatus.Completed },
			'attempt-2': { status: SessionStatus.Completed },
			'judge': { status: SessionStatus.Completed },
		});
		const icons = () => fixture.transcript.domNode.querySelectorAll('.session-comparison-verdict-title .session-comparison-model .codicon').length;
		const before = icons();
		fixture.registerModel('copilot/attempt-2', upcastPartial<ILanguageModelChatMetadata>({ id: 'gpt-5.2', name: 'GPT-5.2', vendor: 'copilot', family: 'gpt-5.2' }));
		assert.deepStrictEqual({ before, after: icons() }, { before: 0, after: 1 });
	});

	test('acknowledges the run the user continued with', () => {
		const fixture = setup({ ...reviewedComparison(), selectedParticipantId: 'attempt-2' }, {
			'attempt-1': { status: SessionStatus.Completed },
			'attempt-2': { status: SessionStatus.Completed },
			'judge': { status: SessionStatus.Completed },
		});
		assert.deepStrictEqual({
			note: fixture.text('.session-comparison-continued'),
			actions: fixture.text('.session-comparison-next-actions .monaco-button'),
		}, {
			note: ['You continued with GPT-5.2'],
			actions: ['Open GPT-5.2', 'Combine Instead'],
		});
	});

	test('reads the comparison as plain text for the Accessible View', () => {
		assert.deepStrictEqual(buildSessionComparisonAccessibleContent(reviewedComparison()).split('\n'), [
			'Comparison: Fix the parser',
			'Prompt: Fix the parser',
			'',
			'2 runs',
			'Run 1: Claude Opus 4.6',
			'What it did: Added structured errors to the parser.',
			'Tests passed; Build unknown; Lint unknown; Problems unknown',
			'Left open: Empty input still throws',
			'Run 2: GPT-5.2 (suggested)',
			'What it did: Returned typed diagnostics from the parser.',
			'Tests passed; Build passed; Lint passed; Problems passed',
			'',
			'GPT-5.2 is the strongest starting point. It handled the empty input case and its tests pass.',
			'Compared: Only it covered empty input.',
			'Checks: Its parser tests pass.',
			'Code: A small, typed change.',
			'Solution: Returns diagnostics instead of throwing.',
			'',
			'Where they differ',
			'',
			'Error handling',
			'How parse failures reach callers.',
			'Files: src/parser.ts',
			'Claude Opus 4.6: Threw structured errors from the parser.',
			'GPT-5.2: Returned typed diagnostics to the caller. (suggested) (kept)',
			'',
			'Tests',
			'What the new tests cover.',
			'Files: test/parser.test.ts',
			'Claude Opus 4.6: Covered malformed tokens.',
			'GPT-5.2: Covered malformed tokens and empty input. (suggested) (kept)',
		]);
	});

	test('names numbered attempts by model wherever the Judge wrote them', () => {
		const comparison = reviewedComparison();
		const names = getSessionComparisonAttemptNames(comparison);
		const claude = participant('attempt-2', SessionComparisonParticipantRole.Attempt, 'GPT-5.2');
		const sameModel = getSessionComparisonAttemptNames({
			...comparison,
			participants: [participant('attempt-1', SessionComparisonParticipantRole.Attempt, 'GPT-5.2'), { ...claude, harness: { ...claude.harness, label: 'Claude' } }],
		});
		const accessible = buildSessionComparisonAccessibleContent({
			...comparison,
			verdict: { ...comparison.verdict!, explanation: 'Attempt 2 handled empty input, unlike Attempt 1.' },
		}).split('\n');
		assert.deepStrictEqual({
			names,
			sameModel,
			single: nameSessionComparisonAttempts('Attempt 2 covered empty input; attempt 1\'s tests pass.', names),
			list: nameSessionComparisonAttempts('Attempts 1 and 2 both pass, unlike Attempt 3.', names),
			notAList: nameSessionComparisonAttempts('Attempt 1 has 6 tests vs 4 in Attempt 2 and 3 tests elsewhere.', names),
			accessibleVerdict: accessible.find(line => line.includes('strongest starting point')),
		}, {
			names: ['Claude Opus 4.6', 'GPT-5.2'],
			sameModel: ['Copilot CLI · GPT-5.2', 'Claude · GPT-5.2'],
			single: 'GPT-5.2 covered empty input; Claude Opus 4.6\'s tests pass.',
			list: 'Claude Opus 4.6 and GPT-5.2 both pass, unlike Attempt 3.',
			notAList: 'Claude Opus 4.6 has 6 tests vs 4 in GPT-5.2 and 3 tests elsewhere.',
			accessibleVerdict: 'GPT-5.2 is the strongest starting point. GPT-5.2 handled empty input, unlike Claude Opus 4.6.',
		});
	});
});
