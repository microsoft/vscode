/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $ } from '../../../../base/browser/dom.js';
import { Button } from '../../../../base/browser/ui/button/button.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, IObservable, IReader, observableValue } from '../../../../base/common/observable.js';
import { isEqual } from '../../../../base/common/resources.js';
import { localize } from '../../../../nls.js';
import { ActionListItemKind, IActionListDelegate, IActionListItem } from '../../../../platform/actionWidget/browser/actionList.js';
import { IActionWidgetService } from '../../../../platform/actionWidget/browser/actionWidget.js';
import { defaultButtonStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { BrowserEditorInput } from '../../../../workbench/contrib/browserView/common/browserEditorInput.js';
import { browserViewUrlMatches, BrowserViewSharingState, IBrowserViewWorkbenchService } from '../../../../workbench/contrib/browserView/common/browserView.js';
import { IEditorService } from '../../../../workbench/services/editor/common/editorService.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { ChatOriginKind, IChat, SessionStatus } from '../../../services/sessions/common/session.js';
import { IActiveSession } from '../../../services/sessions/common/sessionsManagement.js';
import type { ISessionChatPillsDebugData } from './sessionChatInputToolbarDebug.js';
import './media/sessionBackgroundActivitiesControl.css';

const SUBAGENT_LABEL_MAX_LENGTH = 30;

interface IBackgroundBrowserActivity {
	readonly source: 'browser';
	readonly kind: 'browser';
	readonly input: BrowserEditorInput;
	readonly label: string;
}

interface IBackgroundSubagentActivity {
	readonly source: 'subagent';
	readonly kind: 'subagent';
	readonly chat: IChat;
	readonly label: string;
}

interface IDebugBackgroundActivity {
	readonly source: 'debug';
	readonly kind: 'browser' | 'subagent';
	readonly label: string;
}

type IBackgroundActivity = IBackgroundBrowserActivity | IBackgroundSubagentActivity | IDebugBackgroundActivity;

/** Combines live browsers and running subagents for the viewed chat into one compact control. */
export class SessionBackgroundActivitiesControl extends Disposable {

	readonly element: HTMLElement;
	readonly isVisible: IObservable<boolean>;

	private readonly _button: Button;
	private readonly _browserListeners = this._register(new MutableDisposable<DisposableStore>());
	private readonly _isVisible = observableValue(this, false);
	private _currentSession: IActiveSession | undefined;
	private _runningSubagents: readonly IBackgroundSubagentActivity[] = [];
	private _activities: readonly IBackgroundActivity[] = [];
	private _activitiesEnabled = false;
	private _debugData: ISessionChatPillsDebugData | undefined;

	constructor(
		private readonly _session: IObservable<IActiveSession | undefined>,
		private readonly _chat: IObservable<IChat | undefined>,
		private readonly _enabled: IObservable<boolean>,
		@IBrowserViewWorkbenchService private readonly _browserViewService: IBrowserViewWorkbenchService,
		@IActionWidgetService private readonly _actionWidgetService: IActionWidgetService,
		@IEditorService private readonly _editorService: IEditorService,
		@ISessionsService private readonly _sessionsService: ISessionsService,
	) {
		super();

		this.element = $('.session-background-activities.hidden');
		this.isVisible = this._isVisible;
		this._button = this._register(new Button(this.element, { secondary: true, small: true, supportIcons: true, ...defaultButtonStyles }));
		this._button.element.classList.add('session-background-activities-button');
		this._register(this._button.onDidClick(() => this._onDidClick()));

		this._register(autorun(reader => {
			const session = this._session.read(reader);
			const chat = this._chat.read(reader);
			this._currentSession = session;
			this._activitiesEnabled = this._enabled.read(reader);
			this._runningSubagents = this._activitiesEnabled && session && chat ? this._collectRunningSubagents(session, chat, reader) : [];
			this._refresh();
		}));
		this._register(this._browserViewService.onDidChangeBrowserViews(() => this._refreshBrowserListeners()));
		this._refreshBrowserListeners();
	}

	private _collectRunningSubagents(session: IActiveSession, parentChat: IChat, reader: IReader): IBackgroundSubagentActivity[] {
		return session.chats.read(reader)
			.filter(chat =>
				chat.origin?.kind === ChatOriginKind.Tool &&
				!!chat.origin.parentChat &&
				isEqual(chat.origin.parentChat, parentChat.resource) &&
				chat.status.read(reader) === SessionStatus.InProgress)
			.map(chat => ({
				source: 'subagent',
				kind: 'subagent',
				chat,
				label: this._subagentLabel(chat.title.read(reader)),
			}));
	}

	private _subagentLabel(title: string): string {
		const label = title.trim() || localize('backgroundActivities.subagent', "Subagent");
		return label.length > SUBAGENT_LABEL_MAX_LENGTH ? `${label.slice(0, SUBAGENT_LABEL_MAX_LENGTH)}...` : label;
	}

	private _refreshBrowserListeners(): void {
		const store = new DisposableStore();
		this._browserListeners.value = store;
		for (const input of this._browserViewService.getKnownBrowserViews().values()) {
			store.add(input.onDidChangeLabel(() => this._refresh()));
		}
		this._refresh();
	}

	private _refresh(): void {
		if (this._debugData) {
			this._activities = [
				...this._debugData.browsers.map(label => ({ source: 'debug', kind: 'browser', label }) as const),
				...this._debugData.subagents.map(label => ({ source: 'debug', kind: 'subagent', label }) as const),
			];
			this._render();
			return;
		}
		const browserActivities = this._activitiesEnabled ? this._collectBrowserActivities() : [];
		this._activities = [...browserActivities, ...this._runningSubagents];
		this._render();
	}

	private _collectBrowserActivities(): IBackgroundBrowserActivity[] {
		const session = this._currentSession;
		const chat = this._chat.get();
		if (!session || !chat) {
			return [];
		}

		const ownerIds = new Set<string>([chat.resource.toString()]);
		for (const candidate of session.chats.get()) {
			if (candidate.origin?.kind === ChatOriginKind.Tool && candidate.origin.parentChat && isEqual(candidate.origin.parentChat, chat.resource)) {
				ownerIds.add(candidate.resource.toString());
			}
		}

		const activities: IBackgroundBrowserActivity[] = [];
		for (const input of this._browserViewService.getKnownBrowserViews().values()) {
			const ownerId = input.model?.owner.sessionId;
			if (ownerId && ownerIds.has(ownerId)) {
				activities.push({
					source: 'browser',
					kind: 'browser',
					input,
					label: input.title?.trim() || localize('backgroundActivities.browser', "Browser"),
				});
			}
		}
		return activities;
	}

	private _render(): void {
		const count = this._activities.length;
		this._isVisible.set(count > 0, undefined);
		this.element.classList.toggle('hidden', count === 0);
		if (count === 0) {
			return;
		}

		let label: string;
		if (count === 1) {
			const activity = this._activities[0];
			const icon = activity.kind === 'browser' ? Codicon.globe : Codicon.agent;
			label = `$(${icon.id}) ${activity.label}`;
		} else if (this._activities.every(activity => activity.kind === 'browser')) {
			label = `$(${Codicon.globe.id}) ${localize('backgroundActivities.activeBrowsers', "{0} Active Browsers", count)} $(${Codicon.chevronDown.id})`;
		} else if (this._activities.every(activity => activity.kind === 'subagent')) {
			label = `$(${Codicon.agent.id}) ${localize('backgroundActivities.activeSubagents', "{0} Active Subagents", count)} $(${Codicon.chevronDown.id})`;
		} else {
			label = `$(${Codicon.sessionInProgress.id}) ${localize('backgroundActivities.mixed', "{0} Background Activities", count)} $(${Codicon.chevronDown.id})`;
		}

		this._button.label = label;
		const accessibleLabel = count === 1
			? localize('backgroundActivities.open', "Open {0}", this._activities[0].label)
			: localize('backgroundActivities.show', "Show {0} background activities", count);
		this._button.setTitle(accessibleLabel);
		this._button.setAriaLabel(accessibleLabel);
	}

	private _onDidClick(): void {
		if (this._activities.length === 1) {
			void this._openActivity(this._activities[0]);
			return;
		}
		if (this._activities.length > 1) {
			this._showPicker();
		}
	}

	private _showPicker(): void {
		if (this._actionWidgetService.isVisible) {
			return;
		}

		const browsers = this._activities.filter(activity => activity.kind === 'browser');
		const subagents = this._activities.filter(activity => activity.kind === 'subagent');
		const items: IActionListItem<IBackgroundActivity>[] = [];
		const addCategory = (title: string, icon: typeof Codicon.globe, activities: readonly IBackgroundActivity[]) => {
			if (activities.length === 0) {
				return;
			}
			if (items.length > 0) {
				items.push({ kind: ActionListItemKind.Separator, label: '' });
			}
			items.push({ kind: ActionListItemKind.Header, label: title, group: { title } });
			for (const activity of activities) {
				items.push({
					kind: ActionListItemKind.Action,
					label: activity.label,
					group: { title: '', icon },
					item: activity,
				});
			}
		};

		addCategory(localize('backgroundActivities.browsers', "Browsers"), Codicon.globe, browsers);
		addCategory(localize('backgroundActivities.subagents', "Subagents"), Codicon.agent, subagents);

		const triggerElement = this._button.element;
		const delegate: IActionListDelegate<IBackgroundActivity> = {
			onSelect: activity => {
				this._actionWidgetService.hide();
				void this._openActivity(activity);
			},
			onHide: () => triggerElement.focus(),
		};
		this._actionWidgetService.show(
			'sessionBackgroundActivities',
			false,
			items,
			delegate,
			triggerElement,
			undefined,
			[],
			{
				getAriaLabel: item => item.label ?? '',
				getWidgetAriaLabel: () => localize('backgroundActivities.ariaLabel', "Background Activities"),
			},
			{ minWidth: 220, maxWidth: 420 },
		);
	}

	private async _openActivity(activity: IBackgroundActivity): Promise<void> {
		if (activity.source === 'debug') {
			return;
		}
		if (activity.source === 'browser') {
			const input = this._getBrowserInputToOpen(activity.input);
			const existing = this._editorService.findEditors(input.resource)
				.find(identifier => identifier.editor instanceof BrowserEditorInput && identifier.editor.id === input.id);
			const targetGroup = existing?.groupId ?? await this._browserViewService.getPreferredGroup();
			await this._editorService.openEditor(input, undefined, targetGroup);
			return;
		}
		if (this._currentSession) {
			this._sessionsService.openChat(this._currentSession, activity.chat.resource);
		}
	}

	setDebugData(data: ISessionChatPillsDebugData | undefined): void {
		this._debugData = data;
		this._refresh();
	}

	private _getBrowserInputToOpen(input: BrowserEditorInput): BrowserEditorInput {
		const url = input.url;
		if (input.model?.sharingState === BrowserViewSharingState.Shared || !url) {
			return input;
		}

		const activeSessionId = this._chat.get()?.resource.toString();
		const shared = [...this._browserViewService.getContextualBrowserViews({ activeSessionId }).values()]
			.filter(candidate => candidate.model?.sharingState === BrowserViewSharingState.Shared && browserViewUrlMatches(candidate.url, url));
		return shared.find(candidate => candidate.url === url) ?? shared.at(0) ?? input;
	}
}
