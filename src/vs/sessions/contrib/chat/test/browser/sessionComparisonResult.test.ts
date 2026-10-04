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
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { IMarkdownRenderer } from '../../../../../platform/markdown/browser/markdownRenderer.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { AccessibilityVerbositySettingId } from '../../../../../workbench/contrib/accessibility/browser/accessibilityConfiguration.js';
import { AccessibilityCommandId } from '../../../../../workbench/contrib/accessibility/common/accessibilityCommands.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { ISession } from '../../../../services/sessions/common/session.js';
import { ISessionComparison, ISessionComparisonService, ISessionComparisonSynthesisPlan, SessionComparisonParticipantRole, SessionComparisonValidationSource, SessionComparisonValidationState } from '../../../../services/sessions/common/sessionComparison.js';
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
		assert.deepStrictEqual({
			winner: initialText.includes('Attempt 2 (Codex) won'),
			rationale: renderedMarkdown.slice(0, 4),
			otherStrengths: initialText.includes('Clearer naming'),
			customSynthesis: initialText.includes('Custom Synthesis'),
			decisionTable: !!result.domNode.querySelector('.session-comparison-synthesis-table'),
			accessibleDecisions: accessibleContent.includes('Custom Synthesis'),
			accessibleMetrics: accessibleContent.includes('Attempt 1 (Claude): Total time 1m 35s (winner); Tokens used 38'),
			role: result.domNode.getAttribute('role'),
			label: result.domNode.getAttribute('aria-label'),
			tabIndex: result.domNode.tabIndex,
		}, {
			winner: true,
			rationale: ['Resolved the failure that the other attempt left open.', 'Passed `focused tests`, build, lint, and diagnostics.', 'Kept the change small and aligned with existing types.', 'Handled the `edge case` with typed diagnostics.'],
			otherStrengths: true, customSynthesis: false, decisionTable: false, accessibleDecisions: false,
			accessibleMetrics: true, role: 'region',
			label: 'Attempt 2 (Codex) won. Use Option+F2 to open the comparison result in the Accessible View.', tabIndex: 0,
		});
		result.domNode.dispatchEvent(new mainWindow.FocusEvent('focus'));
		assert.strictEqual(contextKeyService.getContextKeyValue(SessionComparisonResultFocused.key), true);
		result.domNode.querySelector<HTMLElement>('[aria-label="Focus another attempt"]')?.click();
		await focusAttemptActions[0].run();
		assert.deepStrictEqual({ selected, opened: opened?.toString() }, { selected: 'attempt-1', opened: attempt1Resource.toString() });
		findButton('Focus Winning Session')?.click();
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
		findButton('Synthesize Attempts')?.click();
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
		const metrics = result.domNode.querySelector<HTMLDetailsElement>('.session-comparison-result-metrics');
		assert.strictEqual(metrics?.open, false);
		metrics.querySelector('summary')?.click();
		assert.strictEqual(metrics.open, true);
		assert.ok(layouts > 0);
		currentSession.set(upcastPartial<ISession>({ resource: attempt1Resource }), undefined);
		assert.strictEqual(result.domNode.hidden, true);
		comparisons.set([{ ...comparison, synthesisHarness: undefined }], undefined);
		currentSession.set(upcastPartial<ISession>({ resource: judgeResource }), undefined);
		assert.deepStrictEqual({
			winner: !!findButton('Focus Winning Session'),
			synthesize: !!findButton('Synthesize Attempts'),
			instructions: !!result.domNode.querySelector('.session-comparison-synthesis-instructions'),
		}, { winner: true, synthesize: false, instructions: false });
	});
});
