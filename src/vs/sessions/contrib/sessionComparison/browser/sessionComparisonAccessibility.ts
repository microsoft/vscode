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
import { getSessionComparisonFileKey, ISessionComparisonService, SessionComparisonParticipantRole, SessionComparisonValidationState } from '../../../services/sessions/common/sessionComparison.js';
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
			localize('sessionComparisonAccessibilityHelp.overview', "You are in an implementation attempt comparison. It summarizes independent agent attempts, changed files, validation, the Judge recommendation, and optional synthesis."),
			localize('sessionComparisonAccessibilityHelp.navigation', "Use Tab and Shift+Tab to move between attempt, Judge, synthesis, and cleanup actions. Press Enter or Space to activate the focused action."),
			localize('sessionComparisonAccessibilityHelp.view', "Use Open Accessible View to read the complete comparison evidence as plain text."),
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
					lines.push('', localize('sessionComparisonAccessibleView.participant', "{0}: {1}", role, participant.harness.label), localize('sessionComparisonAccessibleView.status', "Status: {0}", status));
					const summary = session?.changesSummary?.get();
					if (summary) {
						lines.push(localize('sessionComparisonAccessibleView.changes', "Changed files: {0}, additions: {1}, deletions: {2}", summary.files, summary.additions, summary.deletions));
					}
					const attemptVerdict = comparison.verdict?.attempts.find(candidate => candidate.participantId === participant.id);
					if (attemptVerdict) {
						lines.push(localize(
							'sessionComparisonAccessibleView.validation',
							"Tests: {0}. Build: {1}. Lint: {2}. Diagnostics: {3}.",
							validationLabel(attemptVerdict.validation.tests),
							validationLabel(attemptVerdict.validation.build),
							validationLabel(attemptVerdict.validation.lint),
							validationLabel(attemptVerdict.validation.diagnostics),
						));
						lines.push(attemptVerdict.summary);
						for (const issue of attemptVerdict.unresolvedIssues) {
							lines.push(localize('sessionComparisonAccessibleView.unresolvedIssue', "Unresolved issue: {0}", issue));
						}
						for (const difference of attemptVerdict.notableDifferences) {
							lines.push(localize('sessionComparisonAccessibleView.notableDifference', "Notable difference: {0}", difference));
						}
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
				if (comparison.verdict) {
					const recommended = comparison.participants.find(participant => participant.id === comparison.verdict?.recommendedParticipantId);
					lines.push('', localize('sessionComparisonAccessibleView.recommendation', "Recommended attempt: {0}", recommended?.harness.label ?? localize('sessionComparisonAccessibleView.unknown', "Unknown")), comparison.verdict.explanation);
					for (const conflict of comparison.verdict.conflicts) {
						lines.push(localize('sessionComparisonAccessibleView.conflict', "Conflict: {0}", conflict));
					}
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

function validationLabel(state: SessionComparisonValidationState): string {
	switch (state) {
		case SessionComparisonValidationState.Passed:
			return localize('sessionComparisonAccessibleView.validationPassed', "passed");
		case SessionComparisonValidationState.Failed:
			return localize('sessionComparisonAccessibleView.validationFailed', "failed");
		case SessionComparisonValidationState.NotRun:
			return localize('sessionComparisonAccessibleView.validationNotRun', "not run");
		case SessionComparisonValidationState.Unknown:
			return localize('sessionComparisonAccessibleView.validationUnknown', "unknown");
	}
}
