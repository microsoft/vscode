/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../../../base/browser/keyboardEvent.js';
import { Button } from '../../../../../../base/browser/ui/button/button.js';
import { renderIcon } from '../../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { Action } from '../../../../../../base/common/actions.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { toErrorMessage } from '../../../../../../base/common/errorMessage.js';
import { KeyCode } from '../../../../../../base/common/keyCodes.js';
import { Disposable, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { generateUuid } from '../../../../../../base/common/uuid.js';
import { localize } from '../../../../../../nls.js';
import { WorkbenchToolBar } from '../../../../../../platform/actions/browser/toolbar.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../../platform/notification/common/notification.js';
import { defaultButtonStyles } from '../../../../../../platform/theme/browser/defaultStyles.js';
import { getIconRegistry } from '../../../../../../platform/theme/common/iconRegistry.js';
import { IWorkbenchAssignmentService } from '../../../../../services/assignment/common/assignmentService.js';
import './media/chatSessionArchiveNudge.css';

export const CHAT_SESSION_ARCHIVE_NUDGE_TITLE_TREATMENT = 'chatSessionArchiveNudgeTitle';
export const CHAT_SESSION_ARCHIVE_NUDGE_ICON_TREATMENT = 'chatSessionArchiveNudgeIcon';

export interface IChatSessionArchiveNudgeOptions {
	readonly hasWorktree: boolean;
	readonly pullRequestCount: number;
	readonly onArchive: () => Promise<void>;
	readonly onDismiss: () => void;
}

/** A session-scoped suggestion whose owner decides when archiving is appropriate. */
export class ChatSessionArchiveNudge extends Disposable {
	readonly domNode: HTMLElement;

	private readonly iconElement: HTMLElement;
	private readonly titleElement: HTMLElement;
	private readonly descriptionElement: HTMLElement;
	private readonly worktreeElement: HTMLElement;
	private readonly archiveButton: Button;
	private readonly dismissAction: Action;
	private archiving = false;
	private titleTreatment: string | undefined;
	private treatmentRequest = 0;

	constructor(
		private options: IChatSessionArchiveNudgeOptions,
		@IInstantiationService instantiationService: IInstantiationService,
		@INotificationService private readonly notificationService: INotificationService,
		@IWorkbenchAssignmentService private readonly assignmentService: IWorkbenchAssignmentService,
		@ILogService private readonly logService: ILogService,
	) {
		super();

		const id = generateUuid();
		this.domNode = dom.$('.chat-session-archive-nudge', { role: 'group', 'aria-labelledby': `${id}-title` });
		this._register(toDisposable(() => this.domNode.remove()));

		const header = dom.append(this.domNode, dom.$('.chat-session-archive-nudge-header'));
		this.iconElement = dom.append(header, renderIcon(Codicon.gitMerge));
		this.iconElement.classList.add('chat-session-archive-nudge-icon');
		this.iconElement.setAttribute('aria-hidden', 'true');
		this.titleElement = dom.append(header, dom.$('h3.chat-session-archive-nudge-title', { id: `${id}-title` }));
		const actions = dom.append(header, dom.$('.chat-session-archive-nudge-actions'));
		this.dismissAction = this._register(new Action(
			'chat.sessionArchiveNudge.dismiss',
			localize('chat.sessionArchiveNudge.dismiss', "Dismiss Archive Suggestion"),
			ThemeIcon.asClassName(Codicon.close),
			true,
			() => this.dismiss(),
		));
		const toolbar = this._register(instantiationService.createInstance(WorkbenchToolBar, actions, {
			ariaLabel: localize('chat.sessionArchiveNudge.actions', "Archive suggestion actions"),
		}));
		toolbar.setActions([this.dismissAction]);

		const body = dom.append(this.domNode, dom.$('.chat-session-archive-nudge-body'));
		this.descriptionElement = dom.append(body, dom.$('.chat-session-archive-nudge-description', { id: `${id}-description` }));
		dom.append(this.descriptionElement, dom.$('p', undefined, localize('chat.sessionArchiveNudge.overview', "Archive this session to keep your session list focused.")));
		dom.append(this.descriptionElement, dom.$('p', undefined, localize('chat.sessionArchiveNudge.recovery', "Your conversation stays available to you and your agents. Find it with the session list filter and unarchive anytime.")));
		this.worktreeElement = dom.append(body, dom.$('p.chat-session-archive-nudge-worktree', { id: `${id}-worktree` }, localize('chat.sessionArchiveNudge.worktree', "The worktree is cleaned up when you archive and recreated when you unarchive.")));

		const footer = dom.append(this.domNode, dom.$('.chat-session-archive-nudge-footer'));
		this.archiveButton = this._register(new Button(footer, { ...defaultButtonStyles, secondary: true }));
		this.archiveButton.label = localize('chat.sessionArchiveNudge.archive', "Archive");
		this._register(this.archiveButton.onDidClick(() => this.archive()));
		this._register(dom.addDisposableListener(this.domNode, dom.EventType.KEY_DOWN, event => {
			const keyboardEvent = new StandardKeyboardEvent(event);
			if (keyboardEvent.equals(KeyCode.Escape)) {
				keyboardEvent.preventDefault();
				keyboardEvent.stopPropagation();
				this.dismiss();
			}
		}, true));

		this.setOptions(options);
		this._register(this.assignmentService.onDidRefetchAssignments(() => void this.updateTreatments()));
		void this.updateTreatments();
	}

	setOptions(options: IChatSessionArchiveNudgeOptions): void {
		this.options = options;
		this.updateTitle();
		this.worktreeElement.hidden = !options.hasWorktree;
		this.archiveButton.element.setAttribute('aria-describedby', options.hasWorktree
			? `${this.descriptionElement.id} ${this.worktreeElement.id}`
			: this.descriptionElement.id);
	}

	private updateTitle(): void {
		const title = this.titleTreatment ?? (this.options.pullRequestCount > 1
			? localize('chat.sessionArchiveNudge.archiveQuestionAll', "All PRs merged. Archive this session?")
			: localize('chat.sessionArchiveNudge.archiveQuestion', "PR merged. Archive this session?"));
		if (this.titleElement.textContent !== title) {
			this.titleElement.textContent = title;
		}
	}

	private async updateTreatments(): Promise<void> {
		const request = ++this.treatmentRequest;
		let title: string | undefined;
		let iconId: string | undefined;
		try {
			[title, iconId] = await Promise.all([
				this.assignmentService.getTreatment<string>(CHAT_SESSION_ARCHIVE_NUDGE_TITLE_TREATMENT),
				this.assignmentService.getTreatment<string>(CHAT_SESSION_ARCHIVE_NUDGE_ICON_TREATMENT),
			]);
		} catch (error) {
			this.logService.warn('[ChatSessionArchiveNudge] Failed to resolve title and icon treatments', error);
			return;
		}
		if (this._store.isDisposed || request !== this.treatmentRequest) {
			return;
		}

		this.titleTreatment = typeof title === 'string' && title.trim() ? title : undefined;
		if (title !== undefined && !this.titleTreatment) {
			this.logService.warn('[ChatSessionArchiveNudge] Ignoring invalid title treatment');
		}
		const icon = typeof iconId === 'string' && getIconRegistry().getIcon(iconId)?.id === iconId ? ThemeIcon.fromId(iconId) : undefined;
		if (iconId !== undefined && !icon) {
			this.logService.warn('[ChatSessionArchiveNudge] Ignoring invalid icon treatment');
		}
		this.iconElement.className = `chat-session-archive-nudge-icon ${ThemeIcon.asClassName(icon ?? Codicon.gitMerge)}`;
		this.updateTitle();
	}

	private dismiss(): void {
		if (!this.archiving && !this._store.isDisposed) {
			this.options.onDismiss();
		}
	}

	private async archive(): Promise<void> {
		if (this.archiving || this._store.isDisposed) {
			return;
		}

		this.setArchiving(true);
		try {
			await this.options.onArchive();
		} catch (error) {
			this.notificationService.error(localize('chat.sessionArchiveNudge.archiveError', "Unable to archive the session: {0}", toErrorMessage(error)));
		} finally {
			if (!this._store.isDisposed) {
				this.setArchiving(false);
			}
		}
	}

	private setArchiving(archiving: boolean): void {
		this.archiving = archiving;
		this.domNode.setAttribute('aria-busy', String(archiving));
		this.archiveButton.enabled = !archiving;
		this.dismissAction.enabled = !archiving;
		this.archiveButton.label = archiving
			? localize('chat.sessionArchiveNudge.archiving', "Archiving...")
			: localize('chat.sessionArchiveNudge.archive', "Archive");
	}
}
