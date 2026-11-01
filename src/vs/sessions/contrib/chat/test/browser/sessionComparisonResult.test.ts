/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { IRenderedMarkdown } from '../../../../../base/browser/markdownRenderer.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { timeout } from '../../../../../base/common/async.js';
import { IAction } from '../../../../../base/common/actions.js';
import { IMarkdownString } from '../../../../../base/common/htmlContent.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ContextKeyService } from '../../../../../platform/contextkey/browser/contextKeyService.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { NullHoverService } from '../../../../../platform/hover/test/browser/nullHoverService.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { IMarkdownRenderer } from '../../../../../platform/markdown/browser/markdownRenderer.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { AccessibilityVerbositySettingId } from '../../../../../workbench/contrib/accessibility/browser/accessibilityConfiguration.js';
import { AccessibilityCommandId } from '../../../../../workbench/contrib/accessibility/common/accessibilityCommands.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { ISession } from '../../../../services/sessions/common/session.js';
import { ISessionComparison, ISessionComparisonService, ISessionComparisonSynthesisPlan, SessionComparisonParticipantRole, SessionComparisonValidationEvidence, SessionComparisonValidationSource, SessionComparisonValidationState } from '../../../../services/sessions/common/sessionComparison.js';
import { buildSessionComparisonAccessibleContent, SessionComparisonResult, SessionComparisonResultFocused } from '../../browser/sessionComparisonResult.js';

suite('Sessions - Comparison Result', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('renders the scorecard only in the Judge and invokes open, expand, and synthesis actions', async () => {
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
			synthesisHarness: { providerId: 'test', sessionTypeId: 'test', label: 'Copilot' },
			participants: [{
				id: 'attempt-1',
				role: SessionComparisonParticipantRole.Attempt,
				sessionResource: attempt1Resource,
				harness: { providerId: 'test', sessionTypeId: 'test', label: 'Claude' },
				completion: { elapsedMs: 95_000, tokenCount: 38, tokenCountIsComplete: true },
			}, {
				id: 'attempt-2',
				role: SessionComparisonParticipantRole.Attempt,
				sessionResource: attempt2Resource,
				harness: { providerId: 'test', sessionTypeId: 'test', label: 'Codex' },
				completion: { elapsedMs: 120_000, tokenCount: 25, tokenCountIsComplete: false },
			}, {
				id: 'judge',
				role: SessionComparisonParticipantRole.Judge,
				sessionResource: judgeResource,
				harness: { providerId: 'test', sessionTypeId: 'test', label: 'Copilot' },
			}],
			verdict: {
				recommendedParticipantId: 'attempt-2',
				explanation: 'Handled the edge case that the other attempt left open.',
				rationale: {
					comparison: 'Resolved the failure that the other attempt left open.',
					validation: 'Passed `focused tests`, build, lint, and diagnostics.',
					codeQuality: 'Kept the change small and aligned with existing types.',
					solution: 'Handled the `edge case` with typed diagnostics.',
				},
				conflicts: [],
				attempts: [{
					participantId: 'attempt-1',
					summary: 'Added the core implementation.',
					validation: {
						tests: { state: SessionComparisonValidationState.Passed, source: SessionComparisonValidationSource.JudgeRun },
						build: { state: SessionComparisonValidationState.Unknown, source: SessionComparisonValidationSource.Unavailable },
						lint: { state: SessionComparisonValidationState.Unknown, source: SessionComparisonValidationSource.Unavailable },
						diagnostics: { state: SessionComparisonValidationState.Unknown, source: SessionComparisonValidationSource.Unavailable },
					},
					unresolvedIssues: [],
					notableDifferences: ['Clearer `naming`'],
				}, {
					participantId: 'attempt-2',
					summary: 'Handled the edge case.',
					validation: {
						tests: { state: SessionComparisonValidationState.Passed, source: SessionComparisonValidationSource.JudgeRun },
						build: { state: SessionComparisonValidationState.Passed, source: SessionComparisonValidationSource.JudgeRun },
						lint: { state: SessionComparisonValidationState.Passed, source: SessionComparisonValidationSource.JudgeRun },
						diagnostics: { state: SessionComparisonValidationState.Passed, source: SessionComparisonValidationSource.JudgeRun },
					},
					unresolvedIssues: [],
					notableDifferences: [],
				}],
			},
		};
		const comparisons = observableValue<readonly ISessionComparison[]>('comparisons', [comparison]);
		const currentSession = observableValue<ISession | undefined>('session', upcastPartial<ISession>({ resource: judgeResource }));
		let selected: string | undefined;
		let opened: URI | undefined;
		let synthesisPlan: ISessionComparisonSynthesisPlan | undefined;
		const synthesisPlans: (ISessionComparisonSynthesisPlan | undefined)[] = [];
		let focusAttemptActions: readonly IAction[] = [];
		let synthesisActions: readonly IAction[] = [];
		let synthesized = 0;
		let layouts = 0;
		const instantiationService = store.add(new TestInstantiationService());
		const configurationService = new TestConfigurationService({
			[AccessibilityVerbositySettingId.SessionsChat]: true,
		});
		store.add(configurationService.onDidChangeConfigurationEmitter);
		instantiationService.stub(IConfigurationService, configurationService);
		const contextKeyService = store.add(new ContextKeyService(configurationService));
		instantiationService.stub(IContextKeyService, contextKeyService);
		instantiationService.stub(IKeybindingService, new class extends mock<IKeybindingService>() {
			override lookupKeybinding(commandId: string) {
				return commandId === AccessibilityCommandId.OpenAccessibleView
					? upcastPartial<ReturnType<IKeybindingService['lookupKeybinding']>>({ getAriaLabel: () => 'Option+F2' })
					: undefined;
			}
		}());
		instantiationService.stub(ISessionComparisonService, new class extends mock<ISessionComparisonService>() {
			override comparisons = comparisons;
			override selectAttempt(_comparisonId: string, participantId: string): void {
				selected = participantId;
			}
			override setSynthesisPlan(_comparisonId: string, plan: ISessionComparisonSynthesisPlan | undefined): void {
				synthesisPlan = plan;
				synthesisPlans.push(plan);
			}
			override getComparison(): ISessionComparison {
				return { ...comparison, synthesisPlan };
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
		instantiationService.stub(IContextMenuService, new class extends mock<IContextMenuService>() {
			override showContextMenu(delegate: Parameters<IContextMenuService['showContextMenu']>[0]): void {
				const actions = delegate.getActions?.() ?? [];
				if (actions.some(action => action.id === 'sessionComparison.additionalSynthesisInstructions')) {
					synthesisActions = actions;
				} else {
					focusAttemptActions = actions;
				}
			}
		}());
		instantiationService.stub(INotificationService, new class extends mock<INotificationService>() { });
		instantiationService.stub(IHoverService, NullHoverService);
		const renderedMarkdown: string[] = [];
		const markdownRenderer: IMarkdownRenderer = {
			render(markdown: IMarkdownString, _options, outElement): IRenderedMarkdown {
				renderedMarkdown.push(markdown.value);
				const element = outElement ?? mainWindow.document.createElement('div');
				element.textContent = markdown.value.replaceAll('`', '');
				return { element, dispose: () => { } };
			},
		};
		const result = store.add(instantiationService.createInstance(SessionComparisonResult, currentSession, () => layouts++, markdownRenderer));
		result.domNode.style.width = '800px';
		mainWindow.document.body.append(result.domNode);
		store.add({ dispose: () => result.domNode.remove() });


		const findButton = (label: string) => [...result.domNode.querySelectorAll<HTMLElement>('.monaco-button')].find(button => button.textContent === label);
		const initialText = result.domNode.textContent ?? '';
		const accessibleContent = buildSessionComparisonAccessibleContent(comparison);
		const rows = () => [...result.domNode.querySelectorAll<HTMLElement>('.session-comparison-scorecard-row')];
		assert.deepStrictEqual({
			title: result.domNode.querySelector('.session-comparison-result-title')?.textContent,
			markdown: renderedMarkdown.slice(0, 6),
			rows: rows().map(row => [...row.querySelectorAll('.session-comparison-scorecard-model, .session-comparison-result-tag, .session-comparison-scorecard-metric-value')].map(element => element.textContent).join(' ')),
			metricWinners: rows().map(row => [...row.querySelectorAll('.session-comparison-result-metric-winner')].map(element => element.getAttribute('aria-label'))),
			timeWinnerInRowLabel: rows().map(row => row.querySelector('.session-comparison-scorecard-toggle')?.getAttribute('aria-label')?.includes('Time 1m 35s, winner')),
			checksColumn: result.domNode.querySelector('.session-comparison-scorecard-checks, .session-comparison-scorecard-checks-header'),
			open: rows().map(row => row.querySelector('.session-comparison-scorecard-open')?.getAttribute('aria-label')),
			expanded: rows().map(row => row.querySelector('.session-comparison-scorecard-toggle')?.getAttribute('aria-expanded')),
			otherStrengths: initialText.includes('Clearer naming'),
			customSynthesis: initialText.includes('Custom Synthesis'),
			accessibleDecisions: accessibleContent.includes('Custom Synthesis'),
			accessibleMetrics: accessibleContent.includes('Attempt 1 (Claude): Total time 1m 35s (winner); Tokens used 38'),
			role: result.domNode.getAttribute('role'),
			label: result.domNode.getAttribute('aria-label'),
			tabIndex: result.domNode.tabIndex,
		}, {
			title: 'Codex won',
			markdown: [
				'Handled the edge case that the other attempt left open.',
				'Handled the `edge case` with typed diagnostics.', 'Resolved the failure that the other attempt left open.', 'Passed `focused tests`, build, lint, and diagnostics.', 'Kept the change small and aligned with existing types.',
				'Clearer `naming`',
			],
			rows: ['Codex Recommended 2m 25+', 'Claude 1m 35s 38'],
			metricWinners: [[], ['Time winner']],
			timeWinnerInRowLabel: [false, true],
			checksColumn: null,
			open: ['Open Attempt 2 (Codex)', 'Open Attempt 1 (Claude)'],
			expanded: ['false', 'false'],
			otherStrengths: true, customSynthesis: false, accessibleDecisions: false,
			accessibleMetrics: true, role: 'region',
			label: 'Attempt 2 (Codex) won. Use Option+F2 to open the comparison result in the Accessible View.', tabIndex: 0,
		});
		// The winner's expanded detail carries the same checks strip and Open link as any other
		// attempt, so recommended and non-recommended rows read consistently once expanded.
		rows()[0].querySelector<HTMLElement>('.session-comparison-scorecard-toggle')?.click();
		assert.deepStrictEqual({
			checks: [...rows()[0].querySelectorAll('.session-comparison-scorecard-check-item-label')].map(element => element.textContent),
			openLink: rows()[0].querySelector('.session-comparison-scorecard-detail .session-comparison-scorecard-open-link')?.textContent,
		}, {
			checks: ['Tests passed', 'Build passed', 'Lint passed', 'Diagnostics passed'],
			openLink: 'Open Attempt 2',
		});
		rows()[0].querySelector<HTMLElement>('.session-comparison-scorecard-toggle')?.click();
		result.domNode.dispatchEvent(new mainWindow.FocusEvent('focus'));
		assert.strictEqual(contextKeyService.getContextKeyValue(SessionComparisonResultFocused.key), true);
		result.domNode.querySelector<HTMLElement>('[aria-label="Open another attempt"]')?.click();
		await focusAttemptActions[0].run();
		assert.deepStrictEqual({ selected, opened: opened?.toString() }, { selected: 'attempt-1', opened: attempt1Resource.toString() });
		findButton('Open Attempt 2')?.click();
		await timeout(0);
		assert.deepStrictEqual({ selected, opened: opened?.toString() }, { selected: 'attempt-2', opened: attempt2Resource.toString() });
		result.domNode.querySelector<HTMLElement>('[aria-label="More synthesis options"]')?.click();
		assert.deepStrictEqual(synthesisActions.map(action => action.label), ['Additional Synthesis Instructions...']);
		await synthesisActions[0].run();
		const instructionsPanel = result.domNode.querySelector<HTMLElement>('.session-comparison-synthesis-instructions');
		const input = instructionsPanel?.querySelector<HTMLInputElement>('input, textarea');
		assert.ok(input);
		input.value = 'Preserve the public API and add focused tests.';
		input.dispatchEvent(new mainWindow.Event('input', { bubbles: true }));
		findButton('Start Synthesis with Instructions')?.click();
		findButton('Synthesize')?.click();
		await timeout(0);
		assert.deepStrictEqual({
			synthesized, synthesisPlan, savedPlan: synthesisPlans.at(-1), hidden: instructionsPanel?.hidden,
			inputLabel: input.getAttribute('aria-label'),
		}, {
			synthesized: 2,
			synthesisPlan: { instructions: 'Preserve the public API and add focused tests.' },
			savedPlan: { instructions: 'Preserve the public API and add focused tests.' },
			hidden: false, inputLabel: 'Additional synthesis instructions',
		});
		const layoutsBeforeExpand = layouts;
		rows()[1].querySelector<HTMLElement>('.session-comparison-scorecard-toggle')?.click();
		assert.deepStrictEqual({
			expanded: rows().map(row => row.querySelector('.session-comparison-scorecard-toggle')?.getAttribute('aria-expanded')),
			detailVisible: rows().map(row => !row.querySelector<HTMLElement>('.session-comparison-scorecard-detail')?.hidden),
			relaidOut: layouts > layoutsBeforeExpand,
		}, { expanded: ['false', 'true'], detailVisible: [false, true], relaidOut: true });
		rows()[1].querySelector<HTMLElement>('.session-comparison-scorecard-open-link')?.click();
		await timeout(0);
		const openedFromLink = { selected, opened: opened?.toString() };
		rows()[0].querySelector<HTMLElement>('.session-comparison-scorecard-open')?.click();
		await timeout(0);
		assert.deepStrictEqual({ openedFromLink, openedFromRow: { selected, opened: opened?.toString() } }, {
			openedFromLink: { selected: 'attempt-1', opened: attempt1Resource.toString() },
			openedFromRow: { selected: 'attempt-2', opened: attempt2Resource.toString() },
		});
		comparisons.set([{
			...comparison,
			participants: comparison.participants.map(participant => participant.id === 'attempt-1'
				? { ...participant, missingSession: true, launchError: 'Session could not be restored.' }
				: participant),
		}], undefined);
		const unavailableRow = rows()[1];
		assert.deepStrictEqual({
			tag: unavailableRow.querySelector('.session-comparison-result-tag')?.textContent,
			detailTitle: unavailableRow.querySelector('.session-comparison-scorecard-detail .session-comparison-result-eyebrow')?.textContent,
			rowLabel: unavailableRow.querySelector('.session-comparison-scorecard-toggle')?.getAttribute('aria-label'),
			failedLabelVisible: unavailableRow.textContent?.includes('Failed to start'),
		}, {
			tag: 'Session unavailable',
			detailTitle: 'Session unavailable',
			rowLabel: 'Attempt 1 (Claude), Session unavailable, Time 1m 35s, winner, Tokens 38',
			failedLabelVisible: false,
		});
		currentSession.set(upcastPartial<ISession>({ resource: attempt1Resource }), undefined);
		assert.strictEqual(result.domNode.hidden, true);
		comparisons.set([{ ...comparison, synthesisHarness: undefined }], undefined);
		currentSession.set(upcastPartial<ISession>({ resource: judgeResource }), undefined);
		assert.deepStrictEqual({
			winner: !!findButton('Open Attempt 2'),
			synthesize: !!findButton('Synthesize'),
			instructions: !!result.domNode.querySelector('.session-comparison-synthesis-instructions'),
		}, { winner: true, synthesize: false, instructions: false });
	});

	test('keeps validation in attempt details without a scorecard column', () => {
		const attempt1Resource = URI.parse('test:///attempt-1');
		const attempt2Resource = URI.parse('test:///attempt-2');
		const judgeResource = URI.parse('test:///judge');
		const notRun = { state: SessionComparisonValidationState.NotRun, source: SessionComparisonValidationSource.Unavailable } satisfies SessionComparisonValidationEvidence;
		const comparison: ISessionComparison = {
			id: 'comparison-uniform',
			groupId: 'group-uniform',
			title: 'Compare',
			createdAt: 0,
			workspace: URI.file('/repo'),
			prompt: 'Implement',
			participants: [{
				id: 'attempt-1',
				role: SessionComparisonParticipantRole.Attempt,
				sessionResource: attempt1Resource,
				harness: { providerId: 'test', sessionTypeId: 'test', label: 'Claude' },
				completion: { elapsedMs: 10_000, tokenCount: 10, tokenCountIsComplete: true },
			}, {
				id: 'attempt-2',
				role: SessionComparisonParticipantRole.Attempt,
				sessionResource: attempt2Resource,
				harness: { providerId: 'test', sessionTypeId: 'test', label: 'Codex' },
				completion: { elapsedMs: 12_000, tokenCount: 12, tokenCountIsComplete: true },
			}, {
				id: 'judge',
				role: SessionComparisonParticipantRole.Judge,
				sessionResource: judgeResource,
				harness: { providerId: 'test', sessionTypeId: 'test', label: 'Copilot' },
			}],
			verdict: {
				recommendedParticipantId: 'attempt-2',
				explanation: 'Handled the edge case.',
				rationale: { comparison: 'Comparison point.', validation: 'Validation point.', codeQuality: 'Code quality point.', solution: 'Solution point.' },
				conflicts: [],
				attempts: [{
					participantId: 'attempt-1',
					summary: 'Attempt 1 summary.',
					validation: { tests: notRun, build: notRun, lint: notRun, diagnostics: notRun },
					unresolvedIssues: [],
					notableDifferences: [],
				}, {
					participantId: 'attempt-2',
					summary: 'Attempt 2 summary.',
					validation: { tests: notRun, build: notRun, lint: notRun, diagnostics: notRun },
					unresolvedIssues: [],
					notableDifferences: [],
				}],
			},
		};
		const currentSession = observableValue<ISession | undefined>('session', upcastPartial<ISession>({ resource: judgeResource }));
		const instantiationService = store.add(new TestInstantiationService());
		const configurationService = new TestConfigurationService();
		store.add(configurationService.onDidChangeConfigurationEmitter);
		instantiationService.stub(IConfigurationService, configurationService);
		instantiationService.stub(IContextKeyService, store.add(new ContextKeyService(configurationService)));
		instantiationService.stub(IKeybindingService, new class extends mock<IKeybindingService>() { }());
		const comparisons = observableValue<readonly ISessionComparison[]>('comparisons', [comparison]);
		instantiationService.stub(ISessionComparisonService, new class extends mock<ISessionComparisonService>() {
			override comparisons = comparisons;
			override getComparison(): ISessionComparison { return comparison; }
		}());
		instantiationService.stub(ISessionsService, new class extends mock<ISessionsService>() { });
		instantiationService.stub(IContextMenuService, new class extends mock<IContextMenuService>() { });
		instantiationService.stub(INotificationService, new class extends mock<INotificationService>() { });
		const hoverCalls: { target: HTMLElement; content: unknown; keyboard: boolean }[] = [];
		instantiationService.stub(IHoverService, new class extends mock<IHoverService>() {
			override setupDelayedHover(
				target: HTMLElement,
				options: Parameters<IHoverService['setupDelayedHover']>[1],
				lifecycleOptions?: Parameters<IHoverService['setupDelayedHover']>[2],
			) {
				hoverCalls.push({
					target,
					content: (typeof options === 'function' ? options() : options).content,
					keyboard: lifecycleOptions?.setupKeyboardEvents === true,
				});
				return { dispose: () => { } };
			}
		}());
		const markdownRenderer: IMarkdownRenderer = {
			render(markdown: IMarkdownString, _options, outElement): IRenderedMarkdown {
				const element = outElement ?? mainWindow.document.createElement('div');
				element.textContent = markdown.value.replaceAll('`', '');
				return { element, dispose: () => { } };
			},
		};
		const result = store.add(instantiationService.createInstance(SessionComparisonResult, currentSession, () => { }, markdownRenderer));
		result.domNode.style.width = '800px';
		mainWindow.document.body.append(result.domNode);
		store.add({ dispose: () => result.domNode.remove() });

		const rows = () => [...result.domNode.querySelectorAll<HTMLElement>('.session-comparison-scorecard-row')];
		assert.deepStrictEqual({
			columns: [...result.domNode.querySelectorAll('.session-comparison-scorecard-columns > span')].map(column => column.textContent),
			checksHeader: result.domNode.querySelector('.session-comparison-scorecard-checks-header'),
			listAriaLabel: result.domNode.querySelector('.session-comparison-scorecard-rows')?.getAttribute('aria-label'),
			rowHovers: hoverCalls.filter(call => call.target.classList.contains('session-comparison-scorecard-checks')).map(call => call.content),
			checksCells: rows().map(row => row.querySelector('.session-comparison-scorecard-checks')),
			metricWinners: rows().map(row => [...row.querySelectorAll('.session-comparison-result-metric-winner')].map(element => element.getAttribute('aria-label'))),
			metricWinnersInRowLabel: rows().map(row => {
				const ariaLabel = row.querySelector('.session-comparison-scorecard-toggle')?.getAttribute('aria-label') ?? '';
				return { time: ariaLabel.includes('Time 10s, winner'), tokens: ariaLabel.includes('Tokens 10, winner') };
			}),
		}, {
			columns: ['', 'Attempt', 'Time', 'Tokens'],
			checksHeader: null,
			listAriaLabel: 'Attempts, recommended first',
			rowHovers: [],
			checksCells: [null, null],
			metricWinners: [[], ['Time winner', 'Token usage winner']],
			metricWinnersInRowLabel: [{ time: false, tokens: false }, { time: true, tokens: true }],
		});
		rows()[0].querySelector<HTMLElement>('.session-comparison-scorecard-toggle')?.click();
		assert.deepStrictEqual({
			checks: rows()[0].querySelector('.session-comparison-scorecard-checks-strip'),
			note: rows()[0].querySelector('.session-comparison-scorecard-validation-note')?.textContent,
			role: rows()[0].querySelector('.session-comparison-scorecard-validation-note')?.getAttribute('role'),
		}, {
			checks: null,
			note: 'Tests, build, lint, and diagnostics did not run for this comparison; the Judge reviewed the code changes only.',
			role: 'note',
		});

		const passed = { state: SessionComparisonValidationState.Passed, source: SessionComparisonValidationSource.JudgeRun } satisfies SessionComparisonValidationEvidence;
		const failed = { state: SessionComparisonValidationState.Failed, source: SessionComparisonValidationSource.JudgeRun } satisfies SessionComparisonValidationEvidence;
		const notApplicable = { state: SessionComparisonValidationState.NotApplicable, source: SessionComparisonValidationSource.NotApplicable } satisfies SessionComparisonValidationEvidence;
		const unknown = { state: SessionComparisonValidationState.Unknown, source: SessionComparisonValidationSource.Unavailable } satisfies SessionComparisonValidationEvidence;
		type Checks = readonly [SessionComparisonValidationEvidence, SessionComparisonValidationEvidence, SessionComparisonValidationEvidence, SessionComparisonValidationEvidence];
		/** Replaces the validation of Attempt 1 and Attempt 2; the recommended Attempt 2 renders first. */
		const setValidation = (attempt1: Checks, attempt2: Checks) => comparisons.set([{
			...comparison,
			verdict: comparison.verdict && {
				...comparison.verdict,
				attempts: comparison.verdict.attempts.map((attempt, index) => {
					const [tests, build, lint, diagnostics] = index === 0 ? attempt1 : attempt2;
					return { ...attempt, validation: { tests, build, lint, diagnostics } };
				}),
			},
		}], undefined);
		setValidation([unknown, unknown, unknown, unknown], [notRun, notApplicable, unknown, notRun]);
		setValidation([failed, passed, notRun, notRun], [passed, passed, notRun, notApplicable]);
		const detailChecks = [...result.domNode.querySelectorAll<HTMLElement>('.session-comparison-scorecard-check-item')];
		assert.deepStrictEqual({
			columns: [...result.domNode.querySelectorAll('.session-comparison-scorecard-columns > span')].map(column => column.textContent),
			checksCells: rows().map(row => row.querySelector('.session-comparison-scorecard-checks')),
			detailChecks: detailChecks.map(item => ({
				label: item.querySelector('.session-comparison-scorecard-check-item-label')?.textContent,
				role: item.getAttribute('role'),
				tabIndex: item.tabIndex,
				hover: hoverCalls.find(call => call.target === item),
			})),
		}, {
			columns: ['', 'Attempt', 'Time', 'Tokens'],
			checksCells: [null, null],
			detailChecks: [
				{ label: 'Tests passed', role: 'listitem', tabIndex: 0, hover: { target: detailChecks[0], content: 'Tests: Passed (Judge run). Whether the attempt\'s automated tests were run and passed.', keyboard: true } },
				{ label: 'Build passed', role: 'listitem', tabIndex: 0, hover: { target: detailChecks[1], content: 'Build: Passed (Judge run). Whether the project built or compiled successfully.', keyboard: true } },
				{ label: 'Lint not run', role: 'listitem', tabIndex: 0, hover: { target: detailChecks[2], content: 'Lint: Not run. Whether static analysis or linting ran cleanly.', keyboard: true } },
				{ label: 'Diagnostics not applicable', role: 'listitem', tabIndex: 0, hover: { target: detailChecks[3], content: 'Diagnostics: Not applicable. Whether the changed files are free of editor errors and warnings.', keyboard: true } },
				{ label: 'Tests failed', role: 'listitem', tabIndex: 0, hover: { target: detailChecks[4], content: 'Tests: Failed (Judge run). Whether the attempt\'s automated tests were run and passed.', keyboard: true } },
				{ label: 'Build passed', role: 'listitem', tabIndex: 0, hover: { target: detailChecks[5], content: 'Build: Passed (Judge run). Whether the project built or compiled successfully.', keyboard: true } },
				{ label: 'Lint not run', role: 'listitem', tabIndex: 0, hover: { target: detailChecks[6], content: 'Lint: Not run. Whether static analysis or linting ran cleanly.', keyboard: true } },
				{ label: 'Diagnostics not run', role: 'listitem', tabIndex: 0, hover: { target: detailChecks[7], content: 'Diagnostics: Not run. Whether the changed files are free of editor errors and warnings.', keyboard: true } },
			],
		});
	});
});
