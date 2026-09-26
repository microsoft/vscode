/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { derived, derivedOpts, IObservable, IReader, observableSignal, observableValue } from '../../../../base/common/observable.js';
import { isEqual } from '../../../../base/common/resources.js';
import { localize } from '../../../../nls.js';
import { BrowserEditorInput } from '../../../../workbench/contrib/browserView/common/browserEditorInput.js';
import { browserViewUrlMatches, BrowserViewSharingState, getAgentBrowserViewsNewestFirst, IBrowserViewWorkbenchService } from '../../../../workbench/contrib/browserView/common/browserView.js';
import { getChatPillEntries, type IChatPillEntry, type IChatPillSection } from '../../../../workbench/browser/chatPills.js';
import { IEditorService } from '../../../../workbench/services/editor/common/editorService.js';
import { ChatOriginKind, IChat } from '../../../services/sessions/common/session.js';
import { IActiveSession } from '../../../services/sessions/common/sessionsManagement.js';
import type { ISessionChatPillsDebugData } from './sessionChatInputToolbarDebug.js';

const NO_URLS: ReadonlySet<string> = new Set();

function urlsEqual(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
	if (a === b) {
		return true;
	}
	if (a.size !== b.size) {
		return false;
	}
	for (const url of a) {
		if (!b.has(url)) {
			return false;
		}
	}
	return true;
}

/** Supplies the live browsers of the viewed chat (and its subagents) to its pill. */
export class SessionBrowsersControl extends Disposable {

	/** The pill's sections before the shared controller applies user visibility. */
	readonly sections: IObservable<readonly IChatPillSection[]>;
	/** The URLs the pill's browsers show, empty while the user has the pill hidden. */
	readonly urls: IObservable<ReadonlySet<string>>;
	/** Whether there are browsers to show, regardless of the user's visibility choice. */
	readonly hasData: IObservable<boolean>;

	private readonly _debugData = observableValue<ISessionChatPillsDebugData | undefined>(this, undefined);
	/** Browser titles and the known-browser set change outside the observable graph. */
	private readonly _browsersChanged = observableSignal(this);
	private readonly _browserListeners = this._register(new MutableDisposable<DisposableStore>());

	constructor(
		session: IObservable<IActiveSession | undefined>,
		chat: IObservable<IChat | undefined>,
		enabled: IObservable<boolean>,
		visible: IObservable<boolean>,
		@IBrowserViewWorkbenchService private readonly _browserViewService: IBrowserViewWorkbenchService,
		@IEditorService private readonly _editorService: IEditorService,
	) {
		super();

		// The browsers the pill lists, before the user's visibility choice. Empty while
		// the debug overlay supplies its own browsers in their place.
		const allBrowsers = derived(this, reader => {
			this._browsersChanged.read(reader);
			const currentSession = session.read(reader);
			const currentChat = chat.read(reader);
			return !this._debugData.read(reader) && enabled.read(reader) && currentSession && currentChat
				// Read the chat list through the reader so browsers registered by a
				// subagent show up as soon as that subagent joins the session.
				? getAgentBrowserViewsNewestFirst(this._browserViewService, this._collectOwnerIds(currentSession, currentChat, reader))
				: [];
		});

		const allSections = derived(this, reader => {
			const debugData = this._debugData.read(reader);
			const currentChat = chat.read(reader);
			const browsers = debugData
				? debugData.browsers.map(label => this._entry(label, undefined, currentChat))
				: allBrowsers.read(reader).map(input => this._entry(input.title?.trim() || localize('browsers.browser', "Browser"), input, currentChat));
			return browsers.length > 0
				? [{ title: localize('browsers.browsers', "Browsers"), entries: browsers }]
				: [];
		});

		// Browser titles and loading states change far more often than the pages
		// themselves, so only report a genuinely different set of URLs.
		const allUrls = derivedOpts<ReadonlySet<string>>({ owner: this, equalsFn: urlsEqual }, reader => {
			const urls = new Set<string>();
			for (const input of allBrowsers.read(reader)) {
				if (input.url) {
					urls.add(input.url);
				}
			}
			return urls;
		});

		this.hasData = derived(this, reader => getChatPillEntries(allSections.read(reader)).length > 0);
		this.sections = allSections;
		this.urls = derivedOpts<ReadonlySet<string>>({ owner: this, equalsFn: urlsEqual }, reader => visible.read(reader) ? allUrls.read(reader) : NO_URLS);

		this._register(this._browserViewService.onDidChangeBrowserViews(() => this._refreshBrowserListeners()));
		this._refreshBrowserListeners();
	}

	setDebugData(data: ISessionChatPillsDebugData | undefined): void {
		this._debugData.set(data, undefined);
	}

	private _refreshBrowserListeners(): void {
		const store = new DisposableStore();
		this._browserListeners.value = store;
		for (const input of this._browserViewService.getKnownBrowserViews().values()) {
			store.add(input.onDidChangeLabel(() => this._browsersChanged.trigger(undefined)));
		}
		this._browsersChanged.trigger(undefined);
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

	private _entry(label: string, input: BrowserEditorInput | undefined, chat: IChat | undefined): IChatPillEntry {
		return {
			id: input?.id ?? label,
			label,
			icon: Codicon.globe,
			open: () => { void this._openBrowser(input, chat); },
		};
	}

	private async _openBrowser(input: BrowserEditorInput | undefined, chat: IChat | undefined): Promise<void> {
		if (!input) {
			return;
		}
		const target = this._getBrowserInputToOpen(input, chat);
		const existing = this._editorService.findEditors(target.resource)
			.find(identifier => identifier.editor instanceof BrowserEditorInput && identifier.editor.id === target.id);
		const targetGroup = existing?.groupId ?? await this._browserViewService.getPreferredGroup();
		await this._editorService.openEditor(target, undefined, targetGroup);
	}

	private _getBrowserInputToOpen(input: BrowserEditorInput, chat: IChat | undefined): BrowserEditorInput {
		const url = input.url;
		if (input.model?.sharingState === BrowserViewSharingState.Shared || !url) {
			return input;
		}

		const activeSessionId = chat?.resource.toString();
		const shared = [...this._browserViewService.getContextualBrowserViews({ activeSessionId }).values()]
			.filter(candidate => candidate.model?.sharingState === BrowserViewSharingState.Shared && browserViewUrlMatches(candidate.url, url));
		return shared.find(candidate => candidate.url === url) ?? shared.at(0) ?? input;
	}
}
