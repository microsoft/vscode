/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, IObservable, IReader } from '../../../../base/common/observable.js';
import { isEqual } from '../../../../base/common/resources.js';
import { localize } from '../../../../nls.js';
import { IActionWidgetService } from '../../../../platform/actionWidget/browser/actionWidget.js';
import { BrowserEditorInput } from '../../../../workbench/contrib/browserView/common/browserEditorInput.js';
import { browserViewUrlMatches, BrowserViewSharingState, IBrowserViewWorkbenchService } from '../../../../workbench/contrib/browserView/common/browserView.js';
import { IEditorService } from '../../../../workbench/services/editor/common/editorService.js';
import { ChatOriginKind, IChat } from '../../../services/sessions/common/session.js';
import { IActiveSession } from '../../../services/sessions/common/sessionsManagement.js';
import { ISessionActivity, ISessionActivitySummary, SessionActivityPill } from './sessionActivityPill.js';
import type { ISessionChatPillsDebugData } from './sessionChatInputToolbarDebug.js';

interface IBrowserActivity extends ISessionActivity {
	/** The browser to open, or `undefined` for a fake activity from debug data. */
	readonly input: BrowserEditorInput | undefined;
}

/** Lists the live browsers of the viewed chat (and its subagents) as one compact pill. */
export class SessionBrowsersControl extends Disposable {

	readonly element: HTMLElement;
	readonly isVisible: IObservable<boolean>;

	private readonly _pill: SessionActivityPill<IBrowserActivity>;
	private readonly _browserListeners = this._register(new MutableDisposable<DisposableStore>());
	/** Chats whose browsers belong to this pill: the viewed chat and its subagents. */
	private _ownerIds: ReadonlySet<string> = new Set();
	private _currentChat: IChat | undefined;
	private _enabledValue = false;
	private _debugData: ISessionChatPillsDebugData | undefined;

	constructor(
		private readonly _session: IObservable<IActiveSession | undefined>,
		private readonly _chat: IObservable<IChat | undefined>,
		private readonly _enabled: IObservable<boolean>,
		@IBrowserViewWorkbenchService private readonly _browserViewService: IBrowserViewWorkbenchService,
		@IActionWidgetService actionWidgetService: IActionWidgetService,
		@IEditorService private readonly _editorService: IEditorService,
	) {
		super();

		this._pill = this._register(new SessionActivityPill<IBrowserActivity>({
			className: 'session-browsers',
			widgetId: 'sessionBrowsers',
			getWidgetAriaLabel: () => localize('browsers.ariaLabel', "Browsers"),
			getSummary: activities => this._summary(activities),
			openActivity: activity => this._openActivity(activity),
		}, actionWidgetService));
		this.element = this._pill.element;
		this.isVisible = this._pill.isVisible;

		this._register(autorun(reader => {
			const session = this._session.read(reader);
			const chat = this._chat.read(reader);
			this._currentChat = chat;
			this._enabledValue = this._enabled.read(reader);
			// Read the chat list through the reader so browsers registered by a
			// subagent show up as soon as that subagent joins the session.
			this._ownerIds = session && chat ? this._collectOwnerIds(session, chat, reader) : new Set();
			this._refresh();
		}));
		this._register(this._browserViewService.onDidChangeBrowserViews(() => this._refreshBrowserListeners()));
		this._refreshBrowserListeners();
	}

	setDebugData(data: ISessionChatPillsDebugData | undefined): void {
		this._debugData = data;
		this._refresh();
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
		const activities = this._debugData
			? this._debugData.browsers.map(label => ({ label, icon: Codicon.globe, input: undefined }))
			: this._enabledValue ? this._collectBrowserActivities() : [];
		this._pill.setCategories([{ title: localize('browsers.browsers', "Browsers"), activities }]);
	}

	private _summary(activities: readonly IBrowserActivity[]): ISessionActivitySummary {
		return {
			icon: Codicon.globe,
			label: localize('browsers.activeBrowsers', "{0} Active Browsers", activities.length),
			ariaLabel: localize('browsers.show', "Show {0} browsers", activities.length),
		};
	}

	private _collectOwnerIds(session: IActiveSession, chat: IChat, reader: IReader): ReadonlySet<string> {
		const ownerIds = new Set<string>([chat.resource.toString()]);
		for (const candidate of session.chats.read(reader)) {
			if (candidate.origin?.kind === ChatOriginKind.Tool && candidate.origin.parentChat && isEqual(candidate.origin.parentChat, chat.resource)) {
				ownerIds.add(candidate.resource.toString());
			}
		}
		return ownerIds;
	}

	private _collectBrowserActivities(): IBrowserActivity[] {
		const activities: IBrowserActivity[] = [];
		for (const input of this._browserViewService.getKnownBrowserViews().values()) {
			const ownerId = input.model?.owner.sessionId;
			if (ownerId && this._ownerIds.has(ownerId)) {
				activities.push({
					input,
					icon: Codicon.globe,
					label: input.title?.trim() || localize('browsers.browser', "Browser"),
				});
			}
		}
		return activities;
	}

	private async _openActivity(activity: IBrowserActivity): Promise<void> {
		if (!activity.input) {
			return;
		}
		const input = this._getBrowserInputToOpen(activity.input);
		const existing = this._editorService.findEditors(input.resource)
			.find(identifier => identifier.editor instanceof BrowserEditorInput && identifier.editor.id === input.id);
		const targetGroup = existing?.groupId ?? await this._browserViewService.getPreferredGroup();
		await this._editorService.openEditor(input, undefined, targetGroup);
	}

	private _getBrowserInputToOpen(input: BrowserEditorInput): BrowserEditorInput {
		const url = input.url;
		if (input.model?.sharingState === BrowserViewSharingState.Shared || !url) {
			return input;
		}

		const activeSessionId = this._currentChat?.resource.toString();
		const shared = [...this._browserViewService.getContextualBrowserViews({ activeSessionId }).values()]
			.filter(candidate => candidate.model?.sharingState === BrowserViewSharingState.Shared && browserViewUrlMatches(candidate.url, url));
		return shared.find(candidate => candidate.url === url) ?? shared.at(0) ?? input;
	}
}
