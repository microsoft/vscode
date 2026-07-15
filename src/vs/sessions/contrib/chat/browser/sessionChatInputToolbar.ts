/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $ } from '../../../../base/browser/dom.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { autorun, derived, derivedOpts, IObservable, IReader, observableValue } from '../../../../base/common/observable.js';
import { isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { BrowserViewCommandId } from '../../../../platform/browserView/common/browserView.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { localize } from '../../../../nls.js';
import { IEditorService } from '../../../../workbench/services/editor/common/editorService.js';
import { isIChatSessionFileChange2 } from '../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { ChatTurnPillsWidget, diffStatsEqual, EMPTY_DIFF_STATS, IChatTurnPillsModel, IDiffStats, IPreviewFile, observeTurnStatusPillsConfig, openChatPreviewFile, previewFilesEqual, previewKind } from '../../../../workbench/contrib/chat/browser/widget/chatTurnPills.js';
import { isAgentHostProviderId } from '../../../common/agentHostSessionsProvider.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { IChat, isActiveSessionStatus } from '../../../services/sessions/common/session.js';
import { IActiveSession } from '../../../services/sessions/common/sessionsManagement.js';
import { LastTurnChangesMultiDiffSourceResolver } from './lastTurnChangesMultiDiffSourceResolver.js';
import './media/sessionChatInputToolbar.css';

/** The per-turn data both pills reflect. */
interface ITurnData {
	readonly stats: IDiffStats;
	/** Previewable files changed in the turn, primary (first) first. */
	readonly previewFiles: readonly IPreviewFile[];
}

const EMPTY_TURN_DATA: ITurnData = { stats: EMPTY_DIFF_STATS, previewFiles: [] };

/**
 * Compute the current turn's diff stats and previewable files from the chat's
 * last-turn changes ({@link IChat.lastTurnChanges}), which the provider derives
 * from the live output stream. Files are classified as created vs. edited with
 * the same rules as the Changes view (an addition has no original; a deletion
 * has no modified resource). Created files are listed before edited ones so the
 * primary (first) file is the first created one, falling back to the first
 * edited one. Returns {@link EMPTY_TURN_DATA} when the chat exposes no last-turn
 * changes (e.g. before its first turn, or a provider that can't determine them).
 */
function computeTurnData(chat: IChat, reader: IReader): ITurnData {
	const changes = chat.lastTurnChanges?.read(reader) ?? [];

	let insertions = 0, deletions = 0;
	const created: IPreviewFile[] = [];
	const edited: IPreviewFile[] = [];
	for (const change of changes) {
		insertions += change.insertions;
		deletions += change.deletions;

		if (change.modifiedUri === undefined) {
			continue; // a deletion has nothing to preview
		}
		const uri = isIChatSessionFileChange2(change) ? change.uri : change.modifiedUri;
		const kind = previewKind(uri);
		if (!kind) {
			continue;
		}
		const isCreated = change.originalUri === undefined;
		(isCreated ? created : edited).push({ uri, kind, created: isCreated });
	}

	return {
		stats: { files: changes.length, insertions, deletions },
		previewFiles: [...created, ...edited],
	};
}

function turnDataEqual(a: ITurnData, b: ITurnData): boolean {
	return diffStatsEqual(a.stats, b.stats) && previewFilesEqual(a.previewFiles, b.previewFiles);
}

/**
 * A floating toolbar shown above the chat input that surfaces the current turn's
 * chat status as clickable pills (see {@link ChatTurnPillsWidget}). Only shown
 * for agent host sessions while the viewed chat's turn is running or waiting for
 * input; once the turn completes the pills disappear here and reappear inside
 * the completed response. The pills are scoped to the viewed chat's last-turn
 * changes so they reflect only what that chat's most recent request produced.
 */
export class SessionChatInputToolbar extends Disposable {

	readonly element: HTMLElement;

	/** Sentinel distinguishing "no override" from an explicit `undefined` session. */
	private readonly _sessionOverride = observableValue<IActiveSession | undefined | 'unset'>('sessionOverride', 'unset');
	/** The chat whose last-turn changes are reflected. */
	private readonly _chat = observableValue<IChat | undefined>('chat', undefined);

	/** The session that owns the reflected chat, from an explicit override or resolved from the chat. */
	private readonly _session: IObservable<IActiveSession | undefined> = derived(reader => {
		const override = this._sessionOverride.read(reader);
		if (override !== 'unset') {
			return override;
		}
		const chat = this._chat.read(reader);
		if (!chat) {
			return undefined;
		}
		return this._findOwningSession(chat.resource, reader);
	});

	/** The current turn's diff stats and previewable files. */
	private readonly _turnData = derivedOpts<ITurnData>({ owner: this, equalsFn: turnDataEqual }, reader => {
		const chat = this._chat.read(reader);
		return chat ? computeTurnData(chat, reader) : EMPTY_TURN_DATA;
	});

	private readonly _diffStats = derivedOpts<IDiffStats>({ owner: this, equalsFn: diffStatsEqual }, reader => this._turnData.read(reader).stats);
	private readonly _previewFiles = derivedOpts<readonly IPreviewFile[]>({ owner: this, equalsFn: previewFilesEqual }, reader => this._turnData.read(reader).previewFiles);

	/** The URL of the last browser tool call in the viewed chat's last turn, if any. */
	private readonly _browserUrl = derived<string | undefined>(this, reader => {
		const chat = this._chat.read(reader);
		return chat?.lastTurnBrowserUrl?.read(reader);
	});

	/** Whether pills may show at all: an agent host session with an active turn. */
	private readonly _active = derived(reader => {
		const session = this._session.read(reader);
		const chat = this._chat.read(reader);
		if (!session || !chat || !isAgentHostProviderId(session.providerId)) {
			return false;
		}
		return isActiveSessionStatus(chat.status.read(reader));
	});

	constructor(
		@ICommandService private readonly _commandService: ICommandService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IOpenerService private readonly _openerService: IOpenerService,
		@ILogService private readonly _logService: ILogService,
		@ISessionsService private readonly _sessionsService: ISessionsService,
		@IEditorService private readonly _editorService: IEditorService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();

		this.element = $('.session-chat-input-toolbar.hidden');

		// Combine the active-turn gate with the per-pill visibility setting.
		const pillsConfig = observeTurnStatusPillsConfig(this._configurationService);
		const model: IChatTurnPillsModel = {
			stats: this._diffStats,
			previewFiles: this._previewFiles,
			browserUrl: this._browserUrl,
			changesEnabled: derived(reader => this._active.read(reader) && pillsConfig.read(reader).changes),
			previewEnabled: derived(reader => this._active.read(reader) && pillsConfig.read(reader).preview),
			browserEnabled: derived(reader => this._active.read(reader) && pillsConfig.read(reader).browser),
			openChanges: () => this._openChanges(),
			openPreviewFile: file => openChatPreviewFile(file, this._commandService, this._openerService, this._logService),
			openBrowser: url => this._openBrowser(url),
		};

		const pills = this._register(instantiationService.createInstance(ChatTurnPillsWidget, model));
		this.element.appendChild(pills.element);

		this._register(autorun(reader => {
			this.element.classList.toggle('hidden', !pills.isVisible.read(reader));
		}));
	}

	/**
	 * Track the currently-viewed chat; the toolbar reflects that chat's last-turn
	 * changes and status, resolving the owning session for provider gating and the
	 * open-changes action. Clears any explicit {@link setSession} override.
	 */
	setChat(chat: IChat | undefined): void {
		this._sessionOverride.set('unset', undefined);
		this._chat.set(chat, undefined);
	}

	/**
	 * Explicitly set the session and chat to reflect, bypassing chat-to-session
	 * resolution. Intended for component fixtures and callers that already hold
	 * both.
	 */
	setSession(session: IActiveSession | undefined, chat: IChat | undefined): void {
		this._sessionOverride.set(session, undefined);
		this._chat.set(chat, undefined);
	}

	private _findOwningSession(chatResource: URI, reader: IReader): IActiveSession | undefined {
		for (const session of this._sessionsService.visibleSessions.read(reader)) {
			if (session?.chats.read(reader).some(c => isEqual(c.resource, chatResource))) {
				return session;
			}
		}
		const active = this._sessionsService.activeSession.read(reader);
		return active?.chats.read(reader).some(c => isEqual(c.resource, chatResource)) ? active : undefined;
	}

	private async _openChanges(): Promise<void> {
		const chat = this._chat.get();
		if (!chat) {
			return;
		}
		// Open the multi-diff editor scoped to this chat's last turn. Its resource
		// list is resolved reactively via the `LastTurnChangesMultiDiffSourceResolver`
		// registered as a workbench contribution, so it live-updates as further
		// edits stream in.
		const multiDiffSource = LastTurnChangesMultiDiffSourceResolver.getMultiDiffSourceUri(chat.resource);
		await this._editorService.openEditor({
			multiDiffSource,
			label: localize('sessions.lastTurnChanges.title', "Last Turn Changes"),
		});
	}

	/**
	 * Open the integrated browser at the given URL, falling back to the default
	 * opener when the browser command is unavailable (e.g. web).
	 */
	private async _openBrowser(url: string): Promise<void> {
		try {
			await this._commandService.executeCommand(BrowserViewCommandId.Open, url);
		} catch (err) {
			this._logService.trace('[SessionChatInputToolbar] Falling back to default opener for browser URL', err);
			await this._openerService.open(url);
		}
	}
}
