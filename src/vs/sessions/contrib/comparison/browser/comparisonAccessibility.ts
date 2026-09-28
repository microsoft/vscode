/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getActiveElement, isHTMLElement } from '../../../../base/browser/dom.js';
import { localize } from '../../../../nls.js';
import { AccessibleContentProvider, AccessibleViewProviderId, AccessibleViewType } from '../../../../platform/accessibility/browser/accessibleView.js';
import { AccessibleViewRegistry, IAccessibleViewImplementation } from '../../../../platform/accessibility/browser/accessibleViewRegistry.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { AccessibilityVerbositySettingId } from '../../../../workbench/contrib/accessibility/browser/accessibilityConfiguration.js';
import { IChatService } from '../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { isIChatSessionFileChange2 } from '../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { ComparisonFocusedContext, ISessionComparisonService } from '../common/comparison.js';
import { getCandidateStatus } from './comparisonCandidateView.js';

class ComparisonAccessibility implements IAccessibleViewImplementation {
	readonly priority = 115;
	readonly when = ComparisonFocusedContext;
	readonly name: string;
	constructor(readonly type: AccessibleViewType) {
		this.name = type === AccessibleViewType.Help ? 'session-comparison-help' : 'session-comparison-view';
	}

	getProvider(accessor: ServicesAccessor): AccessibleContentProvider {
		const focused = getActiveElement();
		const comparisonService = accessor.get(ISessionComparisonService);
		const chatService = accessor.get(IChatService);
		return new AccessibleContentProvider(
			AccessibleViewProviderId.SessionComparison,
			{ type: this.type },
			() => this.type === AccessibleViewType.Help ? [
				localize('comparison.help.overview', "Compare implementations sends the same prompt to two to four independent agent sessions. Each attempt uses a separate Git worktree and the selected base branch or commit. Each session uses its normal permissions and billing."),
				localize('comparison.help.setup', "Choose a repository, enter a base branch or commit and a shared prompt, and use Add Attempt to choose an agent and model. Duplicate samples the same model again. Start Comparison launches all configured attempts."),
				localize('comparison.help.navigation', "Use Tab and Shift+Tab to move between controls and response regions. Press Enter or Space to activate buttons or expand the shared prompt. Use the arrow keys to scroll a focused response. Pickers can be dismissed with Escape."),
				localize('comparison.help.review', "Each attempt card shows its agent, model, status, response and changed files. Open Session lets you answer permission requests and inspect tool activity. Review Changes opens that attempt's diff against its base. Compare Code compares the final files of two finished attempts. Open Sessions Side by Side opens the live sessions together."),
				localize('comparison.help.preference', "Prefer This Implementation marks a finished attempt as your choice. Finished does not mean tests passed. Continue with Preferred opens the chosen session. No changes are merged and no other attempts are deleted or cancelled. Stop cancels only the selected attempt."),
				localize('comparison.help.history', "Use Comparison History in the header to reopen an earlier comparison. New Comparison starts a separate setup. Comparisons and your preferences are stored locally in this workspace. Interrupted launches are never rerun automatically."),
				localize('comparison.help.accessible', "Open Accessible View reads the current comparison, responses and changed file paths as text."),
			].join('\n') : buildComparisonAccessibleContent(comparisonService, chatService),
			() => { if (isHTMLElement(focused) && focused.isConnected) { focused.focus(); } },
			AccessibilityVerbositySettingId.SessionComparison,
		);
	}
}

export function buildComparisonAccessibleContent(service: ISessionComparisonService, chatService: IChatService): string {
	const run = service.runs.get().find(run => run.id === service.activeRunId.get());
	if (!run) {
		return localize('comparison.accessibleSetup', "New implementation comparison. Choose a repository, base branch, shared prompt and two to four attempts.");
	}
	const lines = [
		localize('comparison.accessibleTitle', "Compare implementations"),
		localize('comparison.accessibleBase', "Repository: {0}. Base: {1}.", run.folderUri.path, run.branch),
		localize('comparison.accessiblePrompt', "Shared prompt: {0}", run.prompt),
	];
	run.candidates.forEach((candidate, index) => {
		const session = service.getSession(candidate);
		lines.push('', localize('comparison.accessibleAttempt', "Attempt {0}. {1}. {2}. {3}.", String.fromCharCode(65 + index),
			candidate.target.modelLabel, candidate.target.providerLabel, getCandidateStatus(candidate, session)));
		if (run.preferredCandidateId === candidate.id) {
			lines.push(localize('comparison.accessiblePreferred', "Preferred implementation."));
		}
		if (candidate.error) { lines.push(candidate.error); }
		if (session) {
			const response = chatService.getSession(session.mainChat.get().resource)?.getRequests().findLast(request => !request.isHiddenFromTranscript)?.response?.response.getFinalResponse();
			if (response) { lines.push(response); }
			for (const change of session.changes.get()) {
				lines.push((isIChatSessionFileChange2(change) ? change.uri : change.modifiedUri).path);
			}
		}
	});
	return lines.join('\n');
}

AccessibleViewRegistry.register(new ComparisonAccessibility(AccessibleViewType.Help));
AccessibleViewRegistry.register(new ComparisonAccessibility(AccessibleViewType.View));
