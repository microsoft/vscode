/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { Event } from '../../../../../base/common/event.js';
import { constObservable } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ReasoningEffortConfigKey } from '../../../../../platform/agentHost/common/reasoningEffort.js';
import { IContextMenuService, IContextViewService } from '../../../../../platform/contextview/browser/contextView.js';
import { ContextMenuService } from '../../../../../platform/contextview/browser/contextMenuService.js';
import { ContextViewService } from '../../../../../platform/contextview/browser/contextViewService.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { HoverService } from '../../../../../platform/hover/browser/hoverService.js';
import { ILayoutService } from '../../../../../platform/layout/browser/layoutService.js';
import { IMarkdownRendererService, MarkdownRendererService } from '../../../../../platform/markdown/browser/markdownRenderer.js';
import { asCssVariable } from '../../../../../platform/theme/common/colorUtils.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup, registerWorkbenchServices } from '../../../../../workbench/test/browser/componentFixtures/fixtureUtils.js';
import { activeSessionViewBackground } from '../../../../common/theme.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { ISession } from '../../../../services/sessions/common/session.js';
import { ISessionComparison, ISessionComparisonAttemptVerdict, ISessionComparisonHarness, ISessionComparisonParticipant, ISessionComparisonService, SessionComparisonParticipantRole, SessionComparisonValidationEvidence, SessionComparisonValidationSource, SessionComparisonValidationState } from '../../../../services/sessions/common/sessionComparison.js';
import { SessionComparisonResult } from '../../browser/sessionComparisonResult.js';

import '../../../../browser/media/style.css';

const judgeResource = URI.parse('vscode-agent-host-copilot:/sessions/judge');

function harness(modelLabel: string, effort: 'high' | 'medium'): ISessionComparisonHarness {
	return {
		providerId: 'copilot',
		sessionTypeId: 'copilot-agent',
		label: 'Copilot',
		modelId: modelLabel.toLowerCase().replace(/[^a-z0-9.]+/g, '-'),
		modelLabel,
		modelConfiguration: { [ReasoningEffortConfigKey]: effort },
	};
}

function passed(source: SessionComparisonValidationSource.AttemptReport | SessionComparisonValidationSource.JudgeRun): SessionComparisonValidationEvidence {
	return { state: SessionComparisonValidationState.Passed, source };
}

const unknown: SessionComparisonValidationEvidence = { state: SessionComparisonValidationState.Unknown, source: SessionComparisonValidationSource.Unavailable };
const notApplicable: SessionComparisonValidationEvidence = { state: SessionComparisonValidationState.NotApplicable, source: SessionComparisonValidationSource.NotApplicable };

/** A finished four-attempt comparison of a listener leak fix, judged with a categorized verdict. */
function createComparison(options: { readonly synthesisStarted?: boolean } = {}): ISessionComparison {
	const attempt = (index: number, modelLabel: string, effort: 'high' | 'medium', elapsedMs: number, tokenCount: number): ISessionComparisonParticipant => ({
		id: `attempt-${index}`,
		role: SessionComparisonParticipantRole.Attempt,
		harness: harness(modelLabel, effort),
		sessionResource: URI.parse(`vscode-agent-host-copilot:/sessions/attempt-${index}`),
		completion: { elapsedMs, tokenCount, tokenCountIsComplete: true },
	});
	const attempts: ISessionComparisonAttemptVerdict[] = [{
		participantId: 'attempt-1',
		summary: 'Keeps one active response listener in `VoiceSessionController` and bounds the watcher lifetime.',
		validation: { tests: passed(SessionComparisonValidationSource.JudgeRun), build: passed(SessionComparisonValidationSource.AttemptReport), lint: passed(SessionComparisonValidationSource.AttemptReport), diagnostics: passed(SessionComparisonValidationSource.JudgeRun) },
		unresolvedIssues: [],
		notableDifferences: [],
	}, {
		participantId: 'attempt-2',
		summary: 'Replaces render-time listeners in the voice UI with a class-level `MutableDisposable`.',
		validation: { tests: passed(SessionComparisonValidationSource.JudgeRun), build: passed(SessionComparisonValidationSource.AttemptReport), lint: unknown, diagnostics: passed(SessionComparisonValidationSource.JudgeRun) },
		unresolvedIssues: ['Leaves the `VoiceSessionController` subscription leak in place.'],
		notableDifferences: ['Reusable render-time listener replacement pattern with a class-level `MutableDisposable`.'],
	}, {
		participantId: 'attempt-3',
		summary: 'Analysis only, with no code changes.',
		validation: { tests: { state: SessionComparisonValidationState.NotRun, source: SessionComparisonValidationSource.Unavailable }, build: notApplicable, lint: notApplicable, diagnostics: notApplicable },
		unresolvedIssues: ['No implementation or runnable validation evidence.'],
		notableDifferences: ['Contains analysis hints about disconnect cleanup risk, but no patch.'],
	}, {
		participantId: 'attempt-4',
		summary: 'Disposes DOM listeners per update in the sessions list and registers them with the widget.',
		validation: { tests: passed(SessionComparisonValidationSource.JudgeRun), build: passed(SessionComparisonValidationSource.JudgeRun), lint: passed(SessionComparisonValidationSource.AttemptReport), diagnostics: unknown },
		unresolvedIssues: ['Does not address the `VoiceSessionController` subscription leak.'],
		notableDifferences: [
			'Strong reusable pattern for update-scoped DOM-listener disposal in frequently re-rendered lists.',
			'Adds widget-level registration so session-list disposables are released on widget teardown.',
		],
	}];
	return {
		id: 'comparison-voice-listener-leak',
		groupId: 'group-voice-listener-leak',
		title: 'Fix voice session listener leak',
		createdAt: new Date('2026-05-14T11:20:00Z').getTime(),
		workspace: URI.parse('https://github.com/microsoft/vscode'),
		prompt: 'Fix the listener leak in voice sessions: response onDidChange subscriptions keep accumulating while a voice session is active.',
		branch: 'main',
		judgeHarness: harness('GPT-5.5', 'high'),
		synthesisHarness: harness('Claude Opus 5.5', 'high'),
		participants: [
			attempt(1, 'Claude Opus 5.5', 'high', 402_000, 412_380),
			attempt(2, 'GPT-5.3-Codex', 'medium', 305_000, 301_544),
			attempt(3, 'GPT-6 Astra', 'medium', 151_000, 118_906),
			attempt(4, 'GPT-6 Luna', 'medium', 478_000, 455_120),
			{ id: 'judge', role: SessionComparisonParticipantRole.Judge, harness: harness('GPT-5.5', 'high'), sessionResource: judgeResource },
			...(options.synthesisStarted ? [{ id: 'synthesis', role: SessionComparisonParticipantRole.Synthesis, harness: harness('Claude Opus 5.5', 'high'), sessionResource: URI.parse('vscode-agent-host-copilot:/sessions/synthesis') }] : []),
		],
		verdict: {
			recommendedParticipantId: 'attempt-1',
			explanation: 'Fixes the leak at its source, with dedicated tests.',
			rationale: {
				comparison: 'Attempt 1 fixes accumulating response `onDidChange` subscriptions in `VoiceSessionController`; Attempt 2 and 4 fix different UI listener sites, and Attempt 3 has no code changes.',
				validation: 'Judge-run targeted tests passed for Attempts 1, 2, and 4 with `scripts/test.sh --grep`; Attempt 3 has no implementation or runnable validation evidence.',
				codeQuality: 'Attempt 1 uses `MutableDisposable` and `disposableTimeout` to keep one active listener and bounded watcher lifetime, with minimal, localized code edits.',
				solution: 'It directly addresses the leak in active voice response watching and adds dedicated tests for listener replacement and timeout isolation behavior.',
			},
			conflicts: [],
			attempts,
		},
	};
}

interface IRenderOptions {
	/** The width the Judge chat input lays the result out at. */
	readonly width?: number;
	readonly synthesisStarted?: boolean;
	/** Expands the row at this index, counted from the recommended attempt. */
	readonly expandRow?: number;
}

function renderResult(context: ComponentFixtureContext, options: IRenderOptions = {}): void {
	const { container, disposableStore } = context;
	const width = options.width ?? 784;
	const comparison = createComparison({ synthesisStarted: options.synthesisStarted });
	container.classList.add('agent-sessions-workbench');
	container.style.padding = '24px 0';
	container.style.width = `${width}px`;
	container.style.backgroundColor = asCssVariable(activeSessionViewBackground);
	const instantiationService = createEditorServices(disposableStore, {
		colorTheme: context.theme,
		additionalServices: reg => {
			registerWorkbenchServices(reg);
			reg.define(IContextViewService, ContextViewService);
			reg.define(IContextMenuService, ContextMenuService);
			reg.defineInstance(ILayoutService, new class extends mock<ILayoutService>() {
				override readonly mainContainer = container;
				override readonly activeContainer = container;
				override readonly onDidLayoutContainer = Event.None;
				override getContainer(): HTMLElement { return container; }
			}());
			reg.define(IHoverService, HoverService);
			reg.define(IMarkdownRendererService, MarkdownRendererService);
			reg.defineInstance(ISessionComparisonService, new class extends mock<ISessionComparisonService>() {
				override readonly comparisons = constObservable<readonly ISessionComparison[]>([comparison]);
				override getComparison(): ISessionComparison { return comparison; }
				override selectAttempt(): void { }
				override setSynthesisPlan(): void { }
				override async synthesize(): Promise<void> { }
			}());
			reg.defineInstance(ISessionsService, new class extends mock<ISessionsService>() {
				override async openSession(): Promise<void> { }
			}());
		},
	});
	const result = disposableStore.add(instantiationService.createInstance(
		SessionComparisonResult,
		constObservable(upcastPartial<ISession>({ resource: judgeResource })),
		() => { },
		instantiationService.invokeFunction(accessor => accessor.get(IMarkdownRendererService)),
	));
	dom.append(container, result.domNode);
	result.layout(width);
	if (options.expandRow !== undefined) {
		result.domNode.querySelectorAll<HTMLElement>('.session-comparison-scorecard-toggle')[options.expandRow]?.click();
	}
}

export default defineThemedFixtureGroup({ path: 'sessions/comparisonResult/' }, {
	Default: defineComponentFixture({ render: context => renderResult(context) }),
	WinnerExpanded: defineComponentFixture({ render: context => renderResult(context, { expandRow: 0 }) }),
	AttemptExpanded: defineComponentFixture({ render: context => renderResult(context, { expandRow: 3 }) }),
	SynthesisStarted: defineComponentFixture({ render: context => renderResult(context, { synthesisStarted: true }) }),
	Narrow: defineComponentFixture({ render: context => renderResult(context, { width: 520 }) }),
});
