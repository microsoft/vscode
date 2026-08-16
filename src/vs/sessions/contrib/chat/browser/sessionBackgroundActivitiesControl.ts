/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { autorun, IObservable, IReader } from '../../../../base/common/observable.js';
import { isEqual } from '../../../../base/common/resources.js';
import { localize } from '../../../../nls.js';
import { IActionWidgetService } from '../../../../platform/actionWidget/browser/actionWidget.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { ChatOriginKind, IChat, isActiveSessionStatus } from '../../../services/sessions/common/session.js';
import { IActiveSession } from '../../../services/sessions/common/sessionsManagement.js';
import { ISessionActivity, ISessionActivitySummary, SessionActivityPill } from './sessionActivityPill.js';
import type { ISessionChatPillsDebugData } from './sessionChatInputToolbarDebug.js';

const SUBAGENT_LABEL_MAX_LENGTH = 30;

interface ISubagentActivity extends ISessionActivity {
	/** The subagent chat to open, or `undefined` for a fake activity from debug data. */
	readonly chat: IChat | undefined;
}

/**
 * The activities this pill lists. Further kinds join this union; once more than
 * one kind can be listed at once, the summary needs a generic mixed-kind label.
 */
type IBackgroundActivity = ISubagentActivity;

/**
 * Lists the background activities of the viewed chat as one compact pill. Today
 * those are the chat's running subagents. Browsers have their own pill, see
 * `SessionBrowsersControl`.
 */
export class SessionBackgroundActivitiesControl extends Disposable {

	readonly element: HTMLElement;
	readonly isVisible: IObservable<boolean>;

	private readonly _pill: SessionActivityPill<IBackgroundActivity>;
	private _currentSession: IActiveSession | undefined;
	private _runningSubagents: readonly ISubagentActivity[] = [];
	private _debugData: ISessionChatPillsDebugData | undefined;

	constructor(
		private readonly _session: IObservable<IActiveSession | undefined>,
		private readonly _chat: IObservable<IChat | undefined>,
		private readonly _enabled: IObservable<boolean>,
		@IActionWidgetService actionWidgetService: IActionWidgetService,
		@ISessionsService private readonly _sessionsService: ISessionsService,
	) {
		super();

		this._pill = this._register(new SessionActivityPill<IBackgroundActivity>({
			className: 'session-background-activities',
			widgetId: 'sessionBackgroundActivities',
			getWidgetAriaLabel: () => localize('backgroundActivities.ariaLabel', "Background Activities"),
			getSummary: activities => this._summary(activities),
			openActivity: activity => this._openActivity(activity),
		}, actionWidgetService));
		this.element = this._pill.element;
		this.isVisible = this._pill.isVisible;

		this._register(autorun(reader => {
			const session = this._session.read(reader);
			const chat = this._chat.read(reader);
			const enabled = this._enabled.read(reader);
			this._currentSession = session;
			this._runningSubagents = enabled && session && chat ? this._collectRunningSubagents(session, chat, reader) : [];
			this._refresh();
		}));
	}

	setDebugData(data: ISessionChatPillsDebugData | undefined): void {
		this._debugData = data;
		this._refresh();
	}

	private _collectRunningSubagents(session: IActiveSession, parentChat: IChat, reader: IReader): ISubagentActivity[] {
		return session.chats.read(reader)
			.filter(chat =>
				chat.origin?.kind === ChatOriginKind.Tool &&
				!!chat.origin.parentChat &&
				isEqual(chat.origin.parentChat, parentChat.resource) &&
				isActiveSessionStatus(chat.status.read(reader)))
			.map(chat => ({
				chat,
				icon: Codicon.agent,
				label: this._subagentLabel(chat.title.read(reader)),
			}));
	}

	private _subagentLabel(title: string): string {
		const label = title.trim() || localize('backgroundActivities.subagent', "Subagent");
		return label.length > SUBAGENT_LABEL_MAX_LENGTH ? `${label.slice(0, SUBAGENT_LABEL_MAX_LENGTH)}...` : label;
	}

	private _refresh(): void {
		const subagents: readonly ISubagentActivity[] = this._debugData
			? this._debugData.subagents.map(label => ({ label, icon: Codicon.agent, chat: undefined }))
			: this._runningSubagents;
		this._pill.setCategories([{ title: localize('backgroundActivities.subagents', "Subagents"), activities: subagents }]);
	}

	private _summary(activities: readonly IBackgroundActivity[]): ISessionActivitySummary {
		return {
			icon: Codicon.agent,
			label: localize('backgroundActivities.activeSubagents', "{0} Active Subagents", activities.length),
			ariaLabel: localize('backgroundActivities.show', "Show {0} background activities", activities.length),
		};
	}

	private _openActivity(activity: IBackgroundActivity): void {
		if (activity.chat && this._currentSession) {
			this._sessionsService.openChat(this._currentSession, activity.chat.resource);
		}
	}
}
