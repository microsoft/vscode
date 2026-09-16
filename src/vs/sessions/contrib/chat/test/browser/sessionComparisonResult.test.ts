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
import { IConfigurationChangeEvent, IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ContextKeyService } from '../../../../../platform/contextkey/browser/contextKeyService.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { IMarkdownRenderer } from '../../../../../platform/markdown/browser/markdownRenderer.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { AccessibilityVerbositySettingId } from '../../../../../workbench/contrib/accessibility/browser/accessibilityConfiguration.js';
import { AccessibilityCommandId } from '../../../../../workbench/contrib/accessibility/common/accessibilityCommands.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { ISession } from '../../../../services/sessions/common/session.js';
import { ISessionComparison, ISessionComparisonService, ISessionComparisonSynthesisPlan, SessionComparisonDecisionAssessment, SessionComparisonParticipantRole, SessionComparisonValidationState } from '../../../../services/sessions/common/sessionComparison.js';
import { buildSessionComparisonAccessibleContent, SessionComparisonResult, SessionComparisonResultFocused } from '../../browser/sessionComparisonResult.js';

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
				completion: { elapsedMs: 95_000, tokenCount: 38 },
			}, {
				id: 'attempt-2',
				role: SessionComparisonParticipantRole.Attempt,
				sessionResource: attempt2Resource,
				harness: { providerId: 'test', sessionTypeId: 'test', label: 'Codex' },
				completion: { elapsedMs: 120_000, tokenCount: 25 },
			}, {
				id: 'judge',
				role: SessionComparisonParticipantRole.Judge,
				sessionResource: judgeResource,
				harness: { providerId: 'test', sessionTypeId: 'test', label: 'Copilot' },
			}],
			verdict: {
				recommendedParticipantId: 'attempt-2',
				explanation: 'This legacy explanation should not render when categorized rationale is available.',
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
					validation: { tests: SessionComparisonValidationState.Passed, build: SessionComparisonValidationState.Unknown, lint: SessionComparisonValidationState.Unknown, diagnostics: SessionComparisonValidationState.Unknown },
					unresolvedIssues: [],
					notableDifferences: ['Clearer `naming`'],
				}, {
					participantId: 'attempt-2',
					summary: 'Handled the edge case.',
					validation: { tests: SessionComparisonValidationState.Passed, build: SessionComparisonValidationState.Passed, lint: SessionComparisonValidationState.Passed, diagnostics: SessionComparisonValidationState.Passed },
					unresolvedIssues: [],
					notableDifferences: [],
				}],
				decisionSections: [{
					id: 'error-handling',
					title: '`Error` handling',
					description: 'Choose how `parse` failures are represented.',
					affectedFiles: ['src/parser.ts'],
					options: [{
						participantId: 'attempt-1',
						approach: 'Throw `structured` errors.',
						assessment: SessionComparisonDecisionAssessment.Worse,
					}, {
						participantId: 'attempt-2',
						approach: 'Return typed `diagnostics`.',
						assessment: SessionComparisonDecisionAssessment.Better,
					}],
					recommendedParticipantId: 'attempt-2',
				}, {
					id: 'validation',
					title: 'Validation',
					description: 'Choose the validation scope.',
					affectedFiles: ['test/parser.test.ts'],
					options: [{
						participantId: 'attempt-1',
						approach: 'Run parser tests.',
						assessment: SessionComparisonDecisionAssessment.Neutral,
					}, {
						participantId: 'attempt-2',
						approach: 'Run parser and integration tests.',
						assessment: SessionComparisonDecisionAssessment.Better,
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

		const initialText = result.domNode.textContent ?? '';
		const buttons = result.domNode.querySelectorAll<HTMLElement>('.monaco-button');
		const focusWinner = [...buttons].find(button => button.textContent === 'Focus Winning Session');
		const synthesizeAttempts = [...buttons].find(button => button.textContent === 'Synthesize Attempts');
		const startWithInstructions = [...buttons].find(button => button.textContent === 'Start Synthesis with Instructions');
		const customSynthesis = [...buttons].find(button => button.textContent === 'Custom Synthesis');
		const focusAttemptDropdown = [...buttons].find(button => button.getAttribute('aria-label') === 'Focus another attempt');
		const synthesisDropdown = [...buttons].find(button => button.getAttribute('aria-label') === 'More synthesis options');
		const useClaude = [...buttons].find(button => button.textContent === 'Use Attempt 1 (Claude)');
		const useCodex = [...buttons].find(button => button.textContent === 'Use Attempt 2 (Codex)');
		const synthesizerDecides = [...buttons].find(button => button.textContent === 'Synthesizer Decides');
		const startCustomSynthesis = [...buttons].find(button => button.textContent === 'Start Custom Synthesis');
		const title = result.domNode.querySelector<HTMLElement>('.session-comparison-result-title');
		const winnerLink = title?.querySelector<HTMLAnchorElement>('.session-comparison-result-attempt-link');
		const strengthsTitle = result.domNode.querySelector<HTMLElement>('.session-comparison-result-subtitle:last-of-type');
		const strengthsTable = result.domNode.querySelector<HTMLElement>('.session-comparison-result-strengths');
		const otherAttemptLink = strengthsTable?.querySelector<HTMLAnchorElement>('tbody .session-comparison-result-attempt-link');
		const actions = result.domNode.querySelector<HTMLElement>('.session-comparison-result-actions');
		const actionButtons = [...actions?.children ?? []];
		const synthesisSplitButton = synthesizeAttempts?.closest<HTMLElement>('.monaco-button-dropdown');
		const synthesisPrimaryButton = synthesisSplitButton?.querySelector<HTMLElement>('.monaco-text-button');
		const instructionsPanel = result.domNode.querySelector<HTMLElement>('.session-comparison-synthesis-instructions');
		const instructionsInput = instructionsPanel?.querySelector<HTMLInputElement>('input, textarea');
		const synthesisPanel = result.domNode.querySelector<HTMLElement>('.session-comparison-synthesis-plan');
		const decisionTable = result.domNode.querySelector<HTMLElement>('.session-comparison-synthesis-table');
		const rationaleList = result.domNode.querySelector<HTMLElement>('.session-comparison-result-rationale');
		const metricsDetails = result.domNode.querySelector<HTMLDetailsElement>('.session-comparison-result-metrics');
		const metricsTable = result.domNode.querySelector<HTMLTableElement>('.session-comparison-result-metrics-table');
		const panelHiddenBefore = synthesisPanel?.hidden;
		const instructionsHiddenBefore = instructionsPanel?.hidden;
		const regionLabelWithHint = result.domNode.getAttribute('aria-label');
		await configurationService.setUserConfiguration(AccessibilityVerbositySettingId.SessionsChat, false);
		configurationService.onDidChangeConfigurationEmitter.fire(upcastPartial<IConfigurationChangeEvent>({
			affectsConfiguration: key => key === AccessibilityVerbositySettingId.SessionsChat,
			affectedKeys: new Set([AccessibilityVerbositySettingId.SessionsChat]),
		}));
		const regionLabelWithoutHint = result.domNode.getAttribute('aria-label');
		await configurationService.setUserConfiguration(AccessibilityVerbositySettingId.SessionsChat, true);
		configurationService.onDidChangeConfigurationEmitter.fire(upcastPartial<IConfigurationChangeEvent>({
			affectsConfiguration: key => key === AccessibilityVerbositySettingId.SessionsChat,
			affectedKeys: new Set([AccessibilityVerbositySettingId.SessionsChat]),
		}));
		result.domNode.dispatchEvent(new mainWindow.FocusEvent('focus'));
		const accessibility = {
			regionRole: result.domNode.getAttribute('role'),
			regionLabelWithHint,
			regionLabelWithoutHint,
			regionTabIndex: result.domNode.tabIndex,
			focusContext: contextKeyService.getContextKeyValue(SessionComparisonResultFocused.key),
			titleId: title?.id,
			tableLabelledBy: strengthsTable?.getAttribute('aria-labelledby'),
			strengthsTitleId: strengthsTitle?.id,
			actionsRole: actions?.getAttribute('role'),
			actionsLabel: actions?.getAttribute('aria-label'),
			focusAttemptDropdownLabel: focusAttemptDropdown?.getAttribute('aria-label'),
			customControls: customSynthesis?.getAttribute('aria-controls'),
			panelId: synthesisPanel?.id,
			synthesisDropdownLabel: synthesisDropdown?.getAttribute('aria-label'),
			instructionsLabelledBy: instructionsPanel?.getAttribute('aria-labelledby'),
			instructionsTitleId: instructionsPanel?.querySelector('h3')?.id,
			instructionsDescribedBy: instructionsInput?.getAttribute('aria-describedby'),
			instructionsDescriptionId: instructionsPanel?.querySelector('p')?.id,
			instructionsInputLabel: instructionsInput?.getAttribute('aria-label'),
			startWithInstructionsLabel: startWithInstructions?.getAttribute('aria-label'),
			columnHeaders: [...decisionTable?.querySelectorAll('thead th') ?? []].map(header => header.textContent),
			rowHeaderScope: decisionTable?.querySelector('tbody th')?.getAttribute('scope'),
			rationaleSections: [...rationaleList?.querySelectorAll('.session-comparison-result-rationale-section') ?? []].map(section => section.classList.contains('primary') ? 'primary' : 'supporting'),
			rationaleCategories: [...rationaleList?.querySelectorAll('dt') ?? []].map(item => item.textContent),
			rationaleItems: [...rationaleList?.querySelectorAll('dd li') ?? []].map(item => item.textContent),
			metricsCollapsed: !metricsDetails?.open,
			metricsTableLabelledBy: metricsTable?.getAttribute('aria-labelledby'),
			metricsSummaryId: metricsDetails?.querySelector('summary')?.id,
			metricsHeaders: [...metricsTable?.querySelectorAll('thead th') ?? []].map(header => header.textContent),
			metricsRows: [...metricsTable?.querySelectorAll('tbody tr') ?? []].map(row => [...row.children].map(cell => cell.textContent)),
			metricWinnerBadges: [...metricsTable?.querySelectorAll('.session-comparison-result-metric-winner') ?? []].map(badge => ({
				text: badge.textContent,
				ariaLabel: badge.getAttribute('aria-label'),
			})),
			winnerLink: { text: winnerLink?.textContent, href: winnerLink?.getAttribute('href') },
			otherAttemptLink: { text: otherAttemptLink?.textContent, href: otherAttemptLink?.getAttribute('href') },
		};
		const actionLayout = {
			count: actionButtons.length,
			sameRow: new Set(actionButtons.map(button => button.getBoundingClientRect().top)).size === 1,
			synthesisLabel: synthesisPrimaryButton?.textContent,
			synthesisPrimaryWiderThanDropdown: (synthesisPrimaryButton?.getBoundingClientRect().width ?? 0) > (synthesisDropdown?.getBoundingClientRect().width ?? 0),
		};
		metricsDetails?.querySelector('summary')?.click();
		await timeout(0);
		const metricsExpanded = metricsDetails?.open;
		result.domNode.style.maxHeight = '160px';
		result.domNode.scrollTop = result.domNode.scrollHeight;
		const resultScroll = {
			overflowY: mainWindow.getComputedStyle(result.domNode).overflowY,
			contentExceedsViewport: result.domNode.scrollHeight > result.domNode.clientHeight,
			scrollAdvanced: result.domNode.scrollTop > 0,
		};
		otherAttemptLink?.click();
		await timeout(0);
		const otherAttemptLinkFocus = {
			selected,
			opened: opened?.toString(),
		};
		winnerLink?.click();
		await timeout(0);
		const winnerLinkFocus = {
			selected,
			opened: opened?.toString(),
		};
		focusAttemptDropdown?.click();
		await focusAttemptActions[0]?.run();
		const alternateFocus = {
			selected,
			opened: opened?.toString(),
		};
		focusWinner?.click();
		await timeout(0);
		const winnerFocus = {
			selected,
			opened: opened?.toString(),
		};
		synthesisDropdown?.click();
		await synthesisActions[0]?.run();
		if (instructionsInput) {
			instructionsInput.value = 'Preserve the public API and add focused tests.';
			instructionsInput.dispatchEvent(new mainWindow.Event('input', { bubbles: true }));
		}
		startWithInstructions?.click();
		synthesizeAttempts?.click();
		customSynthesis?.click();
		useClaude?.click();
		synthesizerDecides?.click();
		useCodex?.click();
		startCustomSynthesis?.click();
		await timeout(0);
		const choiceState = {
			customExpanded: customSynthesis?.getAttribute('aria-expanded'),
			panelHidden: synthesisPanel?.hidden,
			instructionsPanelHidden: instructionsPanel?.hidden,
			instructionsValue: instructionsInput?.value,
			claudePressed: useClaude?.getAttribute('aria-pressed'),
			codexPressed: useCodex?.getAttribute('aria-pressed'),
			synthesizerPressed: synthesizerDecides?.getAttribute('aria-pressed'),
			codexLabel: useCodex?.getAttribute('aria-label'),
		};
		currentSession.set(upcastPartial<ISession>({ resource: attempt1Resource }), undefined);
		const hiddenOutsideJudge = result.domNode.hidden;
		comparisons.set([{
			...comparison,
			verdict: comparison.verdict && {
				...comparison.verdict,
				decisionSections: comparison.verdict.decisionSections?.slice(0, 1),
			},
		}], undefined);
		currentSession.set(upcastPartial<ISession>({ resource: judgeResource }), undefined);
		const singleDecisionCustomSynthesis = {
			action: [...result.domNode.querySelectorAll<HTMLElement>('.monaco-button')].some(button => button.textContent === 'Custom Synthesis'),
			panel: !!result.domNode.querySelector('.session-comparison-synthesis-plan'),
			recommended: [...result.domNode.querySelectorAll<HTMLElement>('.monaco-button')].some(button => button.textContent === 'Synthesize Attempts'),
		};
		result.layout(1200);
		const comparisonLayout = {
			width: result.domNode.style.width,
			marginLeft: result.domNode.style.marginLeft,
			marginRight: result.domNode.style.marginRight,
		};
		const accessibleContent = buildSessionComparisonAccessibleContent(comparison);

		assert.deepStrictEqual({
			content: {
				winner: initialText.includes('Attempt 2 (Codex) won'),
				customize: initialText.includes('Custom Synthesis'),
				section: initialText.includes('Error handling'),
				approach: initialText.includes('Return typed diagnostics.'),
				fileSummary: initialText.includes('1 file affected'),
				rawFileHidden: !initialText.includes('src/parser.ts'),
				assessments: initialText.includes('Better choice') && initialText.includes('Worse choice'),
				rationale: initialText.includes('Solution')
					&& initialText.includes('Handled the edge case with typed diagnostics.')
					&& initialText.includes('Validation')
					&& initialText.includes('Passed focused tests, build, lint, and diagnostics.')
					&& initialText.includes('Code quality')
					&& initialText.includes('Kept the change small and aligned with existing types.')
					&& initialText.includes('Comparison')
					&& initialText.includes('Resolved the failure that the other attempt left open.'),
				legacyExplanationHidden: !initialText.includes('This legacy explanation should not render'),
			},
			selected,
			opened: opened?.toString(),
			winnerFocus,
			alternateFocus,
			otherAttemptLinkFocus,
			winnerLinkFocus,
			focusAttemptActions: focusAttemptActions.map(action => action.label),
			synthesized,
			synthesisPlan,
			synthesisPlans,
			hiddenOutsideJudge,
			singleDecisionCustomSynthesis,
			comparisonLayout,
			accessibleContent,
			layoutNotified: layouts >= 5,
			panelHiddenBefore,
			instructionsHiddenBefore,
			choiceState,
			actionLayout,
			resultScroll,
			accessibility,
			metricsExpanded,
			renderedMarkdown,
		}, {
			content: {
				winner: true,
				customize: true,
				section: true,
				approach: true,
				fileSummary: true,
				rawFileHidden: true,
				assessments: true,
				rationale: true,
				legacyExplanationHidden: true,
			},
			selected: 'attempt-2',
			opened: attempt2Resource.toString(),
			winnerFocus: {
				selected: 'attempt-2',
				opened: attempt2Resource.toString(),
			},
			alternateFocus: {
				selected: 'attempt-1',
				opened: attempt1Resource.toString(),
			},
			otherAttemptLinkFocus: {
				selected: 'attempt-1',
				opened: attempt1Resource.toString(),
			},
			winnerLinkFocus: {
				selected: 'attempt-2',
				opened: attempt2Resource.toString(),
			},
			focusAttemptActions: ['Focus Attempt 1 (Claude)'],
			synthesized: 3,
			synthesisPlan: {
				selections: [
					{ sectionId: 'error-handling', participantId: 'attempt-2' },
					{ sectionId: 'validation', participantId: 'attempt-2' },
				],
				instructions: 'Preserve the public API and add focused tests.',
			},
			synthesisPlans: [
				{ selections: [], instructions: 'Preserve the public API and add focused tests.' },
				{ selections: [], instructions: 'Preserve the public API and add focused tests.' },
				{ selections: [], instructions: 'Preserve the public API and add focused tests.' },
				{
					selections: [
						{ sectionId: 'error-handling', participantId: 'attempt-1' },
						{ sectionId: 'validation', participantId: 'attempt-2' },
					],
					instructions: 'Preserve the public API and add focused tests.',
				},
				{
					selections: [
						{ sectionId: 'error-handling', participantId: undefined },
						{ sectionId: 'validation', participantId: 'attempt-2' },
					],
					instructions: 'Preserve the public API and add focused tests.',
				},
				{
					selections: [
						{ sectionId: 'error-handling', participantId: 'attempt-2' },
						{ sectionId: 'validation', participantId: 'attempt-2' },
					],
					instructions: 'Preserve the public API and add focused tests.',
				},
				{
					selections: [
						{ sectionId: 'error-handling', participantId: 'attempt-2' },
						{ sectionId: 'validation', participantId: 'attempt-2' },
					],
					instructions: 'Preserve the public API and add focused tests.',
				},
			],
			hiddenOutsideJudge: true,
			singleDecisionCustomSynthesis: {
				action: false,
				panel: false,
				recommended: true,
			},
			comparisonLayout: {
				width: 'calc(1200px - var(--session-view-content-horizontal-padding, var(--vscode-spacing-size320)) - var(--session-view-content-horizontal-padding, var(--vscode-spacing-size320)))',
				marginLeft: '-125px',
				marginRight: '0px',
			},
			accessibleContent: [
				'Comparison result',
				'Attempt 2 (Codex) won',
				'',
				'Why it won',
				'Comparison: Resolved the failure that the other attempt left open.',
				'Solution: Handled the edge case with typed diagnostics.',
				'Validation: Passed focused tests, build, lint, and diagnostics.',
				'Code quality: Kept the change small and aligned with existing types.',
				'',
				'Strong points from other attempts',
				'Attempt 1 (Claude): Clearer naming',
				'',
				'Attempt time and token usage',
				'Attempt 1 (Claude): Total time 1m 35s (winner); Total tokens 38',
				'Attempt 2 (Codex): Total time 2m; Total tokens 25 (winner)',
				'',
				'Custom Synthesis',
				'',
				'Error handling',
				'Choose how parse failures are represented.',
				'Affected files: src/parser.ts',
				'Attempt 1 (Claude): Worse choice. Throw structured errors.',
				'Attempt 2 (Codex): Better choice. Return typed diagnostics. Selected.',
				'',
				'Validation',
				'Choose the validation scope.',
				'Affected files: test/parser.test.ts',
				'Attempt 1 (Claude): Neutral choice. Run parser tests.',
				'Attempt 2 (Codex): Better choice. Run parser and integration tests. Selected.',
			].join('\n'),
			layoutNotified: true,
			panelHiddenBefore: true,
			instructionsHiddenBefore: true,
			choiceState: {
				customExpanded: 'true',
				panelHidden: false,
				instructionsPanelHidden: false,
				instructionsValue: 'Preserve the public API and add focused tests.',
				claudePressed: 'false',
				codexPressed: 'true',
				synthesizerPressed: 'false',
				codexLabel: 'Attempt 2 (Codex) for Error handling. Better choice. Return typed diagnostics. Selected',
			},
			actionLayout: {
				count: 3,
				sameRow: true,
				synthesisLabel: 'Synthesize Attempts',
				synthesisPrimaryWiderThanDropdown: true,
			},
			resultScroll: {
				overflowY: 'auto',
				contentExceedsViewport: true,
				scrollAdvanced: true,
			},
			accessibility: {
				regionRole: 'region',
				regionLabelWithHint: 'Attempt 2 (Codex) won. Use Option+F2 to open the comparison result in the Accessible View.',
				regionLabelWithoutHint: 'Attempt 2 (Codex) won',
				regionTabIndex: 0,
				focusContext: true,
				titleId: title?.id,
				tableLabelledBy: strengthsTitle?.id,
				strengthsTitleId: strengthsTitle?.id,
				actionsRole: 'group',
				actionsLabel: 'Comparison result actions',
				focusAttemptDropdownLabel: 'Focus another attempt',
				customControls: synthesisPanel?.id,
				panelId: synthesisPanel?.id,
				synthesisDropdownLabel: 'More synthesis options',
				instructionsLabelledBy: instructionsPanel?.querySelector('h3')?.id,
				instructionsTitleId: instructionsPanel?.querySelector('h3')?.id,
				instructionsDescribedBy: instructionsPanel?.querySelector('p')?.id,
				instructionsDescriptionId: instructionsPanel?.querySelector('p')?.id,
				instructionsInputLabel: 'Additional synthesis instructions',
				startWithInstructionsLabel: 'Start recommended synthesis with the additional instructions',
				columnHeaders: ['Decision', 'Attempt 1 (Claude)', 'Attempt 2 (Codex)', 'Synthesizer'],
				rowHeaderScope: 'row',
				rationaleSections: ['primary', 'supporting'],
				rationaleCategories: ['Comparison', 'Solution', 'Validation', 'Code quality'],
				rationaleItems: [
					'Resolved the failure that the other attempt left open.',
					'Handled the edge case with typed diagnostics.',
					'Passed focused tests, build, lint, and diagnostics.',
					'Kept the change small and aligned with existing types.',
				],
				metricsCollapsed: true,
				metricsTableLabelledBy: metricsDetails?.querySelector('summary')?.id,
				metricsSummaryId: metricsDetails?.querySelector('summary')?.id,
				metricsHeaders: ['Attempt', 'Total time', 'Total tokens'],
				metricsRows: [
					['Attempt 1 (Claude)', '1m 35s Winner', '38'],
					['Attempt 2 (Codex)', '2m', '25 Winner'],
				],
				metricWinnerBadges: [
					{ text: 'Winner', ariaLabel: 'Time winner' },
					{ text: 'Winner', ariaLabel: 'Token usage winner' },
				],
				winnerLink: { text: 'Attempt 2 (Codex)', href: '#' },
				otherAttemptLink: { text: 'Attempt 1 (Claude)', href: '#' },
			},
			metricsExpanded: true,
			renderedMarkdown: [
				'Resolved the failure that the other attempt left open.',
				'Handled the `edge case` with typed diagnostics.',
				'Passed `focused tests`, build, lint, and diagnostics.',
				'Kept the change small and aligned with existing types.',
				'Clearer `naming`',
				'`Error` handling',
				'Choose how `parse` failures are represented.',
				'Throw `structured` errors.',
				'Return typed `diagnostics`.',
				'Validation',
				'Choose the validation scope.',
				'Run parser tests.',
				'Run parser and integration tests.',
				'Resolved the failure that the other attempt left open.',
				'Handled the `edge case` with typed diagnostics.',
				'Passed `focused tests`, build, lint, and diagnostics.',
				'Kept the change small and aligned with existing types.',
				'Clearer `naming`',
			],
		});
	});
});
