/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { localize } from '../../../../nls.js';
import { IOpenSubagentChatContext, OpenSubagentChatActionViewItem, SubagentChatStatus } from '../../../../workbench/contrib/chat/browser/widget/chatContentParts/chatSubagentOpenChat.js';

/** Where a comparison participant is in its lifecycle, as shown on its pill. */
export const enum SessionComparisonRunStatus {
	/** Its worktree and session are still being created. */
	Starting = 'starting',
	Running = 'running',
	/** Blocked on the user, e.g. a tool approval. */
	NeedsInput = 'needsInput',
	Completed = 'completed',
	Failed = 'failed',
}

export interface ISessionComparisonRunPillContext extends IOpenSubagentChatContext {
	readonly runStatus: SessionComparisonRunStatus;
	/** Describes the pill for tooltips and screen readers, e.g. "Run 2 of 3". */
	readonly role?: string;
}

function isRunPillContext(context: unknown): context is ISessionComparisonRunPillContext {
	return !!context && typeof context === 'object' && typeof (context as ISessionComparisonRunPillContext).runStatus === 'string';
}

/**
 * One participant of a comparison, drawn as a subagent pill: status, model,
 * elapsed time and what it is doing right now. Selecting it opens the
 * participant's own session.
 */
export class SessionComparisonRunPill extends OpenSubagentChatActionViewItem {

	protected override get pillContext(): ISessionComparisonRunPillContext | undefined {
		return isRunPillContext(this._context) ? this._context : undefined;
	}

	protected override get isActive(): boolean {
		const status = this.pillContext?.runStatus;
		return status === SessionComparisonRunStatus.Starting || status === SessionComparisonRunStatus.Running || status === SessionComparisonRunStatus.NeedsInput;
	}

	protected override get status(): SubagentChatStatus | undefined {
		switch (this.pillContext?.runStatus) {
			case SessionComparisonRunStatus.Starting:
			case SessionComparisonRunStatus.Running:
				return 'running';
			case SessionComparisonRunStatus.NeedsInput:
				return 'waiting';
			case SessionComparisonRunStatus.Completed:
				return 'completed';
			case SessionComparisonRunStatus.Failed:
				return 'failed';
			default:
				return undefined;
		}
	}

	protected override get statusIcon(): ThemeIcon {
		switch (this.status) {
			case 'failed':
				return Codicon.error;
			case 'completed':
				return Codicon.check;
			default:
				return Codicon.commentDiscussion;
		}
	}

	protected override get activityLabel(): string {
		switch (this.pillContext?.runStatus) {
			case SessionComparisonRunStatus.Starting:
				return localize('sessionComparison.run.starting', "Setting up its worktree...");
			case SessionComparisonRunStatus.NeedsInput:
				return localize('sessionComparison.run.needsInput', "Waiting for your input");
			default:
				return super.activityLabel;
		}
	}

	// The title already names the model.
	protected override get showModel(): boolean {
		return false;
	}

	protected override getTooltip(): string {
		const context = this.pillContext;
		const status = this._statusLabel();
		return [
			context?.role ? localize('sessionComparison.run.tooltipTitle', "{0}: {1}", context.role, context.title ?? '') : context?.title,
			status,
			context?.isChatAvailable ? localize('sessionComparison.run.openHint', "Select to open its session") : undefined,
		].filter(Boolean).join('\n');
	}

	protected override updateAriaLabel(): void {
		this.element?.setAttribute('aria-label', [this.getTooltip().replace(/\n/g, '. '), this.activityAriaLabel, this.durationLabel].filter(Boolean).join('. '));
	}

	private _statusLabel(): string | undefined {
		switch (this.pillContext?.runStatus) {
			case SessionComparisonRunStatus.Starting:
				return localize('sessionComparison.run.statusStarting', "Starting");
			case SessionComparisonRunStatus.Running:
				return localize('sessionComparison.run.statusRunning', "Running");
			case SessionComparisonRunStatus.NeedsInput:
				return localize('sessionComparison.run.statusNeedsInput', "Needs input");
			case SessionComparisonRunStatus.Completed:
				return localize('sessionComparison.run.statusCompleted', "Finished");
			case SessionComparisonRunStatus.Failed:
				return localize('sessionComparison.run.statusFailed', "Failed");
			default:
				return undefined;
		}
	}
}
