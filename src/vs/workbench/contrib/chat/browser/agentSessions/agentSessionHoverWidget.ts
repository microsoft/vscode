/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { IAgentSession, getAgentChangesSummary, hasValidDiff, AgentSessionStatus } from './agentSessionsModel.js';
import { IChatService } from '../../common/chatService/chatService.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ChatListWidget } from '../widget/chatListWidget.js';
import { CodeBlockModelCollection } from '../../common/widget/codeBlockModelCollection.js';
import { ChatViewModel } from '../../common/model/chatViewModel.js';
import { ChatModeKind } from '../../common/constants.js';
import { IChatWidgetService } from '../chat.js';
import { IMarkdownString, MarkdownString } from '../../../../../base/common/htmlContent.js';
import { localize } from '../../../../../nls.js';
import { fromNow, getDurationString } from '../../../../../base/common/date.js';
import { IChatModel } from '../../common/model/chatModel.js';

export class AgentSessionHoverWidget extends Disposable {

	public readonly domNode: HTMLElement;
	private modelRef: Promise<IChatModel | undefined>;

	constructor(
		private readonly session: IAgentSession,
		@IChatService private readonly chatService: IChatService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IChatWidgetService private readonly chatWidgetService: IChatWidgetService,
	) {
		super();
		this.domNode = dom.$('.agent-session-hover.interactive-session');
		this.domNode.style.width = '500px';
		this.domNode.style.height = '300px';
		this.domNode.style.overflow = 'hidden';

		this.modelRef = this.chatService.getOrRestoreSession(session.resource).then(modelRef => {
			if (this._store.isDisposed) {
				modelRef?.dispose();
				return;
			}

			if (!modelRef) {
				// Show fallback tooltip text
				const tooltip = this.buildFallbackTooltip(this.session);
				this.domNode.textContent = typeof tooltip === 'string' ? tooltip : tooltip.value;
				return;
			}

			this._register(modelRef);
			return modelRef.object;
		});
	}

	public async onRendered() {
		const model = await this.modelRef;
		if (!model || this._store.isDisposed) {
			return;
		}

		// Create view model
		const codeBlockCollection = this._register(this.instantiationService.createInstance(CodeBlockModelCollection, 'agentSessionHover'));
		const viewModel = this._register(this.instantiationService.createInstance(
			ChatViewModel,
			model,
			codeBlockCollection
		));

		// Create the chat list widget
		const container = dom.append(this.domNode, dom.$('.interactive-list'));
		const listWidget = this._register(this.instantiationService.createInstance(
			ChatListWidget,
			container,
			{
				rendererOptions: {
					renderStyle: 'compact',
					noHeader: true,
					editableCodeBlock: false,
				},
				currentChatMode: () => ChatModeKind.Ask,
			}
		));
		listWidget.setViewModel(viewModel);
		listWidget.layout(300, 500);

		// Handle followup clicks - open the session and accept input
		this._register(listWidget.onDidClickFollowup(async (followup) => {
			const widget = await this.chatWidgetService.openSession(model.sessionResource);
			if (widget) {
				widget.acceptInput(followup.message);
			}
		}));
	}

	private buildFallbackTooltip(session: IAgentSession): IMarkdownString {
		const lines: string[] = [];

		// Title
		lines.push(`**${session.label}**`);

		// Tooltip (from provider)
		if (session.tooltip) {
			const tooltip = typeof session.tooltip === 'string' ? session.tooltip : session.tooltip.value;
			lines.push(tooltip);
		} else {

			// Description
			if (session.description) {
				const description = typeof session.description === 'string' ? session.description : session.description.value;
				lines.push(description);
			}

			// Badge
			if (session.badge) {
				const badge = typeof session.badge === 'string' ? session.badge : session.badge.value;
				lines.push(badge);
			}
		}

		// Details line: Status • Provider • Duration/Time
		const details: string[] = [];

		// Status
		details.push(this.toStatusLabel(session.status));

		// Provider
		details.push(session.providerLabel);

		// Duration or start time
		if (session.timing.finishedOrFailedTime && session.timing.inProgressTime) {
			const duration = this.toDuration(session.timing.inProgressTime, session.timing.finishedOrFailedTime, true);
			if (duration) {
				details.push(duration);
			}
		} else {
			const startTime = session.timing.lastRequestStarted ?? session.timing.created;
			details.push(fromNow(startTime, true, true));
		}

		lines.push(details.join(' • '));

		// Diff information
		const diff = getAgentChangesSummary(session.changes);
		if (diff && hasValidDiff(session.changes)) {
			const diffParts: string[] = [];
			if (diff.files > 0) {
				diffParts.push(diff.files === 1 ? localize('tooltip.file', "1 file") : localize('tooltip.files', "{0} files", diff.files));
			}
			if (diff.insertions > 0) {
				diffParts.push(`+${diff.insertions}`);
			}
			if (diff.deletions > 0) {
				diffParts.push(`-${diff.deletions}`);
			}
			if (diffParts.length > 0) {
				lines.push(`$(diff) ${diffParts.join(', ')}`);
			}
		}

		// Archived status
		if (session.isArchived()) {
			lines.push(`$(archive) ${localize('tooltip.archived', "Archived")}`);
		}

		return new MarkdownString(lines.join('\n\n'), { supportThemeIcons: true });
	}

	private toDuration(startTime: number, endTime: number, useFullTimeWords: boolean): string | undefined {
		const elapsed = Math.round((endTime - startTime) / 1000) * 1000;
		if (elapsed < 1000) {
			return undefined;
		}

		return getDurationString(elapsed, useFullTimeWords);
	}

	private toStatusLabel(status: AgentSessionStatus): string {
		let statusLabel: string;
		switch (status) {
			case AgentSessionStatus.NeedsInput:
				statusLabel = localize('agentSessionNeedsInput', "Needs Input");
				break;
			case AgentSessionStatus.InProgress:
				statusLabel = localize('agentSessionInProgress', "In Progress");
				break;
			case AgentSessionStatus.Failed:
				statusLabel = localize('agentSessionFailed', "Failed");
				break;
			default:
				statusLabel = localize('agentSessionCompleted', "Completed");
		}

		return statusLabel;
	}
}
