/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { IStatusbarEntry, IStatusbarEntryAccessor, IStatusbarService, StatusbarAlignment } from '../../../services/statusbar/browser/statusbar.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { IChatSessionsService, ChatSessionStatus, IChatSessionItem } from '../common/chatSessionsService.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { RunOnceScheduler } from '../../../../base/common/async.js';

export class ChatSessionsStatusBarEntry extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.chatSessionsStatusBarEntry';

	private entry: IStatusbarEntryAccessor | undefined = undefined;
	private inProgressCount = 0;
	private refreshScheduler = this._register(new RunOnceScheduler(() => this.update(), 5000)); // Refresh every 5 seconds

	constructor(
		@IChatSessionsService private readonly chatSessionsService: IChatSessionsService,
		@IStatusbarService private readonly statusbarService: IStatusbarService,
		@ICommandService private readonly commandService: ICommandService,
	) {
		super();

		this.registerListeners();
		this.update();
		// Start periodic refresh if there are any in-progress sessions initially
		this.scheduleRefresh();
	}

	private registerListeners(): void {
		// Listen to changes in session items from all providers
		this._register(this.chatSessionsService.onDidChangeSessionItems(() => {
			this.update();
			this.scheduleRefresh(); // Schedule periodic refresh after changes
		}));

		// Listen to changes in providers themselves
		this._register(this.chatSessionsService.onDidChangeItemsProviders(() => {
			this.update();
			this.scheduleRefresh();
		}));

		// Listen to availability changes
		this._register(this.chatSessionsService.onDidChangeAvailability(() => {
			this.update();
			this.scheduleRefresh();
		}));
	}

	private scheduleRefresh(): void {
		// Only schedule refresh if there are in-progress sessions to monitor
		if (this.inProgressCount > 0) {
			this.refreshScheduler.schedule();
		}
	}

	private async update(): Promise<void> {
		try {
			const inProgressSessions = await this.getInProgressSessions();
			this.inProgressCount = inProgressSessions.length;

			if (this.inProgressCount > 0) {
				if (!this.entry) {
					this.entry = this.statusbarService.addEntry(
						this.getEntryProps(inProgressSessions), 
						'chat.sessionsStatusBarEntry', 
						StatusbarAlignment.RIGHT, 
						{ location: { id: 'status.editor.mode', priority: 100.2 }, alignment: StatusbarAlignment.RIGHT }
					);
				} else {
					this.entry.update(this.getEntryProps(inProgressSessions));
				}
			} else {
				// Hide entry when no in-progress sessions
				this.entry?.dispose();
				this.entry = undefined;
				// Cancel scheduled refreshes when no sessions are in progress
				this.refreshScheduler.cancel();
			}
		} catch (error) {
			// Silently handle errors to avoid disrupting the status bar
			console.error('Error updating chat sessions status bar:', error);
		}
	}

	private async getInProgressSessions(): Promise<Array<{ provider: string; session: IChatSessionItem }>> {
		const inProgressSessions: Array<{ provider: string; session: IChatSessionItem }> = [];
		
		// Get all available providers
		const providers = this.chatSessionsService.getAllChatSessionItemProviders();
		
		// Check each provider for in-progress sessions
		for (const provider of providers) {
			try {
				const sessionItems = await this.chatSessionsService.provideChatSessionItems(
					provider.chatSessionType, 
					CancellationToken.None
				);
				
				for (const session of sessionItems) {
					if (session.status === ChatSessionStatus.InProgress) {
						inProgressSessions.push({ provider: provider.chatSessionType, session });
					}
				}
			} catch (error) {
				// Continue with other providers if one fails
				console.error(`Error fetching sessions for provider ${provider.chatSessionType}:`, error);
			}
		}

		return inProgressSessions;
	}

	private getEntryProps(inProgressSessions: Array<{ provider: string; session: IChatSessionItem }>): IStatusbarEntry {
		const count = inProgressSessions.length;
		const text = `$(loading~spin) ${count}`;
		const ariaLabel = localize('chatSessionsInProgress', "Chat sessions in progress: {0}", count);
		
		// Create detailed tooltip
		const tooltip = this.createTooltip(inProgressSessions);

		return {
			name: localize('chatSessionsStatus', "Chat Sessions Status"),
			text,
			ariaLabel,
			tooltip,
			command: 'workbench.view.chat.sessions', // Open Chat Sessions view
			showInAllWindows: true
		};
	}

	private createTooltip(inProgressSessions: Array<{ provider: string; session: IChatSessionItem }>): string {
		if (inProgressSessions.length === 0) {
			return '';
		}

		if (inProgressSessions.length === 1) {
			const session = inProgressSessions[0].session;
			return localize('workingOnSession', "Working on 1 session: {0}", session.label);
		}

		// Multiple sessions - show count and list
		const sessionLabels = inProgressSessions
			.slice(0, 5) // Limit to first 5 sessions to avoid overly long tooltips
			.map(({ session }) => session.label)
			.join(', ');

		if (inProgressSessions.length <= 5) {
			return localize('workingOnSessions', "Working on {0} sessions: {1}", inProgressSessions.length, sessionLabels);
		} else {
			return localize('workingOnSessionsMore', "Working on {0} sessions: {1}, and {2} more...", 
				inProgressSessions.length, sessionLabels, inProgressSessions.length - 5);
		}
	}

	override dispose(): void {
		super.dispose();
		
		this.entry?.dispose();
		this.entry = undefined;
	}
}