/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getActiveElement, isHTMLElement } from '../../../../base/browser/dom.js';
import { renderAsPlaintext } from '../../../../base/browser/markdownRenderer.js';
import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { localize } from '../../../../nls.js';
import { AccessibleContentProvider, AccessibleViewProviderId, AccessibleViewType } from '../../../../platform/accessibility/browser/accessibleView.js';
import { IAccessibleViewImplementation } from '../../../../platform/accessibility/browser/accessibleViewRegistry.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { AccessibilityVerbositySettingId } from '../../../../workbench/contrib/accessibility/browser/accessibilityConfiguration.js';
import { getSessionComparisonAttemptNames, ISessionComparison, ISessionComparisonParticipant, ISessionComparisonService, nameSessionComparisonAttempts, SessionComparisonParticipantRole, SessionComparisonValidationEvidence, SessionComparisonValidationState } from '../../../services/sessions/common/sessionComparison.js';
import { SessionComparisonViewFocused } from './sessionComparisonView.js';
import { ISessionComparisonViewService } from './sessionComparisonViewService.js';

/** Reads the comparison view as plain text: each run, what it did, and what differs between them. */
export class SessionComparisonAccessibleView implements IAccessibleViewImplementation {
	readonly priority = 121;
	readonly name = 'sessionComparison';
	readonly type = AccessibleViewType.View;
	readonly when = SessionComparisonViewFocused;

	getProvider(accessor: ServicesAccessor): AccessibleContentProvider | undefined {
		const comparisonId = accessor.get(ISessionComparisonViewService).activeComparisonId.get();
		const comparison = comparisonId ? accessor.get(ISessionComparisonService).getComparison(comparisonId) : undefined;
		if (!comparison) {
			return undefined;
		}
		const previouslyFocused = getActiveElement();
		return new AccessibleContentProvider(
			AccessibleViewProviderId.SessionsChat,
			{ type: AccessibleViewType.View, language: 'plaintext' },
			() => buildSessionComparisonAccessibleContent(comparison),
			() => {
				if (isHTMLElement(previouslyFocused) && previouslyFocused.isConnected) {
					previouslyFocused.focus();
				}
			},
			AccessibilityVerbositySettingId.SessionsChat,
		);
	}
}

export function buildSessionComparisonAccessibleContent(comparison: ISessionComparison): string {
	const runs = comparison.participants.filter(participant => participant.role === SessionComparisonParticipantRole.Attempt);
	const label = (participant: ISessionComparisonParticipant) => participant.harness.modelLabel ?? participant.harness.label;
	const attemptNames = getSessionComparisonAttemptNames(comparison);
	// Judge-written text, with its "Attempt N" references named by model.
	const judged = (markdown: string) => toPlainText(nameSessionComparisonAttempts(markdown, attemptNames));
	const verdict = comparison.verdict;
	const lines = [
		localize('sessionComparisonAccessible.title', "Comparison: {0}", comparison.title),
		localize('sessionComparisonAccessible.prompt', "Prompt: {0}", comparison.prompt),
		'',
		localize('sessionComparisonAccessible.runs', "{0} runs", runs.length),
	];
	for (const [index, run] of runs.entries()) {
		const runVerdict = verdict?.attempts.find(candidate => candidate.participantId === run.id);
		const suggested = verdict?.recommendedParticipantId === run.id ? localize('sessionComparisonAccessible.suggestedSuffix', " (suggested)") : '';
		lines.push(localize('sessionComparisonAccessible.run', "Run {0}: {1}{2}", index + 1, label(run), suggested));
		if (run.launchError) {
			lines.push(localize('sessionComparisonAccessible.runFailed', "Failed: {0}", run.launchError));
		}
		if (runVerdict) {
			lines.push(localize('sessionComparisonAccessible.runDid', "What it did: {0}", judged(runVerdict.summary)));
			const checks = ([
				[localize('sessionComparisonAccessible.tests', "Tests"), runVerdict.validation.tests],
				[localize('sessionComparisonAccessible.build', "Build"), runVerdict.validation.build],
				[localize('sessionComparisonAccessible.lint', "Lint"), runVerdict.validation.lint],
				[localize('sessionComparisonAccessible.problems', "Problems"), runVerdict.validation.diagnostics],
			] as const).map(([name, evidence]) => describeCheck(name, evidence)).filter((check): check is string => !!check);
			if (checks.length) {
				lines.push(checks.join('; '));
			}
			for (const issue of runVerdict.unresolvedIssues) {
				lines.push(localize('sessionComparisonAccessible.leftOpen', "Left open: {0}", judged(issue)));
			}
		}
	}
	if (!verdict) {
		return lines.join('\n');
	}
	const winner = runs.find(run => run.id === verdict.recommendedParticipantId);
	lines.push('');
	if (winner) {
		lines.push(localize('sessionComparisonAccessible.verdict', "{0} is the strongest starting point. {1}", label(winner), judged(verdict.explanation)));
	}
	if (verdict.rationale) {
		lines.push(
			localize('sessionComparisonAccessible.why.comparison', "Compared: {0}", judged(verdict.rationale.comparison)),
			localize('sessionComparisonAccessible.why.validation', "Checks: {0}", judged(verdict.rationale.validation)),
			localize('sessionComparisonAccessible.why.codeQuality', "Code: {0}", judged(verdict.rationale.codeQuality)),
			localize('sessionComparisonAccessible.why.solution', "Solution: {0}", judged(verdict.rationale.solution)),
		);
	}
	const sections = verdict.decisionSections ?? [];
	if (sections.length) {
		const kept = new Map(comparison.synthesisPlan?.selections.map(selection => [selection.sectionId, selection.participantId]));
		lines.push('', localize('sessionComparisonAccessible.differences', "Where they differ"));
		for (const section of sections) {
			const keptId = kept.has(section.id) ? kept.get(section.id) : section.recommendedParticipantId;
			lines.push('', judged(section.title), judged(section.description));
			if (section.affectedFiles.length) {
				lines.push(localize('sessionComparisonAccessible.files', "Files: {0}", section.affectedFiles.join(', ')));
			}
			for (const option of section.options) {
				const run = runs.find(candidate => candidate.id === option.participantId);
				if (!run) {
					continue;
				}
				lines.push(localize(
					'sessionComparisonAccessible.option',
					"{0}: {1}{2}{3}",
					label(run),
					judged(option.approach),
					option.participantId === section.recommendedParticipantId ? localize('sessionComparisonAccessible.suggestedSuffix', " (suggested)") : '',
					option.participantId === keptId ? localize('sessionComparisonAccessible.keptSuffix', " (kept)") : '',
				));
			}
			if (keptId === undefined) {
				lines.push(localize('sessionComparisonAccessible.decide', "The combined version decides (kept)"));
			}
		}
	}
	return lines.join('\n');
}

function describeCheck(name: string, evidence: SessionComparisonValidationEvidence): string | undefined {
	switch (evidence.state) {
		case SessionComparisonValidationState.Passed:
			return localize('sessionComparisonAccessible.checkPassed', "{0} passed", name);
		case SessionComparisonValidationState.Failed:
			return localize('sessionComparisonAccessible.checkFailed', "{0} failed", name);
		case SessionComparisonValidationState.NotRun:
			return localize('sessionComparisonAccessible.checkNotRun', "{0} not run", name);
		case SessionComparisonValidationState.Unknown:
			return localize('sessionComparisonAccessible.checkUnknown', "{0} unknown", name);
		default:
			return undefined;
	}
}

function toPlainText(markdown: string): string {
	return renderAsPlaintext(new MarkdownString(markdown), { omitMarkdownSyntax: true });
}
