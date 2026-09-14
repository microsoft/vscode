/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { AccessibleContentProvider, AccessibleViewProviderId, AccessibleViewType } from '../../../../platform/accessibility/browser/accessibleView.js';
import { IAccessibleViewImplementation } from '../../../../platform/accessibility/browser/accessibleViewRegistry.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { AccessibilityVerbositySettingId } from '../../../../workbench/contrib/accessibility/browser/accessibilityConfiguration.js';
import { isIChatSessionFileChange2 } from '../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { IEditorService } from '../../../../workbench/services/editor/common/editorService.js';
import { SessionComparisonEditorFocusedContext } from '../../../common/contextkeys.js';
import { SessionStatus } from '../../../services/sessions/common/session.js';
import { getSessionComparisonAttemptLabel, getSessionComparisonFileKey, ISessionComparisonService, SessionComparisonParticipantRole, SessionComparisonValidationSource, SessionComparisonValidationState } from '../../../services/sessions/common/sessionComparison.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { SessionComparisonEditor } from './sessionComparisonEditor.js';
import { SessionComparisonEditorInput } from './sessionComparisonEditorInput.js';

export class SessionComparisonAccessibilityHelp implements IAccessibleViewImplementation {
	readonly priority = 115;
	readonly name = 'session-comparison-help';
	readonly type = AccessibleViewType.Help;
	readonly when = SessionComparisonEditorFocusedContext;

	getProvider(accessor: ServicesAccessor): AccessibleContentProvider | undefined {
		const editor = getActiveComparisonEditor(accessor);
		if (!editor) {
			return undefined;
		}
		const content = [
			localize('sessionComparisonAccessibilityHelp.overview', "You are in an implementation attempt comparison. After review, it identifies the winning attempt, explains the evidence, and lists strong points from the other attempts."),
			localize('sessionComparisonAccessibilityHelp.navigation', "When the Judge finishes, its chat closes and this comparison opens automatically. Use Synthesize Best Implementation to combine the strongest work in a new attempt, or Review Winning Attempt to open the winner and its changes. Use Tab and Shift+Tab to move between actions. Press Enter or Space to activate the focused action."),
			localize('sessionComparisonAccessibilityHelp.view', "Use Open Accessible View to read the comparison result as plain text."),
		].join('\n');
		return new AccessibleContentProvider(
			AccessibleViewProviderId.SessionComparison,
			{ type: AccessibleViewType.Help },
			() => content,
			() => editor.focus(),
			AccessibilityVerbositySettingId.SessionComparison,
		);
	}
}

export class SessionComparisonAccessibleView implements IAccessibleViewImplementation {
	readonly priority = 115;
	readonly name = 'session-comparison-view';
	readonly type = AccessibleViewType.View;
	readonly when = SessionComparisonEditorFocusedContext;

	getProvider(accessor: ServicesAccessor): AccessibleContentProvider | undefined {
		const editor = getActiveComparisonEditor(accessor);
		const input = editor?.input;
		if (!editor || !(input instanceof SessionComparisonEditorInput)) {
			return undefined;
		}
		const comparisonService = accessor.get(ISessionComparisonService);
		const sessionsManagementService = accessor.get(ISessionsManagementService);
		return new AccessibleContentProvider(
			AccessibleViewProviderId.SessionComparison,
			{ type: AccessibleViewType.View },
			() => {
				const comparison = comparisonService.getComparison(input.comparisonId);
				if (!comparison) {
					return localize('sessionComparisonAccessibleView.missing', "This comparison is no longer available.");
				}
				const lines = [comparison.title, comparison.prompt];
				const attempts = comparison.participants.filter(participant => participant.role === SessionComparisonParticipantRole.Attempt);
				if (comparison.verdict) {
					const recommended = attempts.find(participant => participant.id === comparison.verdict?.recommendedParticipantId);
					const recommendedIndex = recommended ? attempts.indexOf(recommended) : -1;
					const recommendedLabel = recommended
						? getSessionComparisonAttemptLabel(recommended, recommendedIndex)
						: localize('sessionComparisonAccessibleView.unknown', "Unknown");
					lines.push(
						'',
						localize('sessionComparisonAccessibleView.reviewReady', "Comparison review ready."),
						localize('sessionComparisonAccessibleView.winner', "{0} won.", recommendedLabel),
						localize('sessionComparisonAccessibleView.whyItWon', "Why it won:"),
						comparison.verdict.explanation,
					);
					const winnerVerdict = recommended
						? comparison.verdict.attempts.find(attempt => attempt.participantId === recommended.id)
						: undefined;
					if (winnerVerdict) {
						lines.push(winnerVerdict.summary);
						lines.push(localize(
							'sessionComparisonAccessibleView.validation',
							"Tests: {0}. Build: {1}. Lint: {2}. Diagnostics: {3}.",
							validationLabel(winnerVerdict.validation.tests, winnerVerdict.validationSource?.tests),
							validationLabel(winnerVerdict.validation.build, winnerVerdict.validationSource?.build),
							validationLabel(winnerVerdict.validation.lint, winnerVerdict.validationSource?.lint),
							validationLabel(winnerVerdict.validation.diagnostics, winnerVerdict.validationSource?.diagnostics),
						));
					}
					lines.push('', localize('sessionComparisonAccessibleView.otherStrengths', "Strong points from other attempts:"));
					for (const attempt of attempts.filter(attempt => attempt.id !== recommended?.id)) {
						const attemptIndex = attempts.indexOf(attempt);
						const attemptVerdict = comparison.verdict.attempts.find(candidate => candidate.participantId === attempt.id);
						const strengths = attemptVerdict?.notableDifferences.length ? attemptVerdict.notableDifferences : attemptVerdict?.summary ? [attemptVerdict.summary] : [];
						lines.push(getSessionComparisonAttemptLabel(attempt, attemptIndex));
						for (const strength of strengths) {
							lines.push(localize('sessionComparisonAccessibleView.strongPoint', "- {0}", strength));
						}
					}
					for (const conflict of comparison.verdict.conflicts) {
						lines.push(localize('sessionComparisonAccessibleView.synthesisConsideration', "Consider during synthesis: {0}", conflict));
					}
					return lines.join('\n');
				}
				for (const participant of comparison.participants) {
					const role = participant.role === SessionComparisonParticipantRole.Attempt
						? localize('sessionComparisonAccessibleView.attempt', "Attempt")
						: participant.role === SessionComparisonParticipantRole.Coordinator
							? localize('sessionComparisonAccessibleView.coordinator', "Coordinator")
							: participant.role === SessionComparisonParticipantRole.Judge
								? localize('sessionComparisonAccessibleView.judge', "Judge")
								: localize('sessionComparisonAccessibleView.synthesis', "Synthesis");
					const session = participant.sessionResource ? sessionsManagementService.getSession(participant.sessionResource) : undefined;
					const status = participant.launchError ?? (session
						? session.status.get() === SessionStatus.Completed
							? localize('sessionComparisonAccessibleView.completed', "Completed")
							: session.status.get() === SessionStatus.Error
								? localize('sessionComparisonAccessibleView.failed', "Failed")
								: localize('sessionComparisonAccessibleView.inProgress', "In progress")
						: localize('sessionComparisonAccessibleView.unknown', "Unknown"));
					const attemptIndex = participant.role === SessionComparisonParticipantRole.Attempt
						? attempts.findIndex(attempt => attempt.id === participant.id)
						: -1;
					const label = attemptIndex >= 0
						? getSessionComparisonAttemptLabel(participant, attemptIndex)
						: localize('sessionComparisonAccessibleView.participant', "{0}: {1}", role, participant.harness.modelLabel
							? localize('sessionComparisonAccessibleView.harnessAndModel', "{0} · {1}", participant.harness.label, participant.harness.modelLabel)
							: participant.harness.label);
					lines.push('', label, localize('sessionComparisonAccessibleView.status', "Status: {0}", status));
					if (participant.usage) {
						lines.push(participant.usage.cachedTokens === undefined
							? localize('sessionComparisonAccessibleView.partialUsage', "Usage: {0} input tokens, {1} output tokens. Partial data.", participant.usage.inputTokens, participant.usage.outputTokens)
							: localize('sessionComparisonAccessibleView.usage', "Usage: {0} input tokens, {1} cached input tokens, {2} output tokens.", participant.usage.inputTokens, participant.usage.cachedTokens, participant.usage.outputTokens));
						for (const model of participant.usage.models) {
							lines.push(localize(
								'sessionComparisonAccessibleView.modelUsage',
								"Model {0}: {1} input tokens, {2} cached input tokens, {3} output tokens.",
								model.model,
								model.inputTokens,
								model.cachedTokens,
								model.outputTokens,
							));
						}
					}
					const summary = session?.changesSummary?.get();
					if (summary) {
						lines.push(localize('sessionComparisonAccessibleView.changes', "Changed files: {0}, additions: {1}, deletions: {2}", summary.files, summary.additions, summary.deletions));
					}
				}
				const fileCounts = new Map<string, number>();
				for (const participant of comparison.participants.filter(candidate => candidate.role === SessionComparisonParticipantRole.Attempt)) {
					const session = participant.sessionResource ? sessionsManagementService.getSession(participant.sessionResource) : undefined;
					const files = new Set((session?.changes.get() ?? []).map(change => {
						const resource = isIChatSessionFileChange2(change) ? change.uri : change.modifiedUri;
						return getSessionComparisonFileKey(resource, session?.workspace.get()?.folders ?? []);
					}));
					for (const file of files) {
						fileCounts.set(file, (fileCounts.get(file) ?? 0) + 1);
					}
				}
				for (const [file, count] of [...fileCounts].sort(([a], [b]) => a.localeCompare(b))) {
					lines.push(count > 1
						? localize('sessionComparisonAccessibleView.overlappingFile', "Overlapping file: {0}", file)
						: localize('sessionComparisonAccessibleView.attemptSpecificFile', "Attempt-specific file: {0}", file));
				}
				return lines.join('\n');
			},
			() => editor.focus(),
			AccessibilityVerbositySettingId.SessionComparison,
		);
	}
}

function getActiveComparisonEditor(accessor: ServicesAccessor): SessionComparisonEditor | undefined {
	const editor = accessor.get(IEditorService).activeEditorPane;
	return editor instanceof SessionComparisonEditor ? editor : undefined;
}

function validationLabel(state: SessionComparisonValidationState, source: SessionComparisonValidationSource | undefined): string {
	let label: string;
	switch (state) {
		case SessionComparisonValidationState.Passed:
			label = localize('sessionComparisonAccessibleView.validationPassed', "passed");
			break;
		case SessionComparisonValidationState.Failed:
			label = localize('sessionComparisonAccessibleView.validationFailed', "failed");
			break;
		case SessionComparisonValidationState.NotRun:
			label = localize('sessionComparisonAccessibleView.validationNotRun', "not run");
			break;
		case SessionComparisonValidationState.Unknown:
			label = localize('sessionComparisonAccessibleView.validationUnknown', "unknown");
			break;
	}
	switch (source) {
		case SessionComparisonValidationSource.AttemptReport:
			return localize('sessionComparisonAccessibleView.validationAttemptReported', "{0}, attempt reported", label);
		case SessionComparisonValidationSource.JudgeRun:
			return localize('sessionComparisonAccessibleView.validationJudgeVerified', "{0}, Judge verified", label);
		case SessionComparisonValidationSource.Unavailable:
			return localize('sessionComparisonAccessibleView.validationUnavailable', "{0}, evidence unavailable", label);
		default:
			return label;
	}
}
