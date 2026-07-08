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
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { isIChatSessionFileChange2 } from '../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { ChatTurnPillsWidget, diffStatsEqual, EMPTY_DIFF_STATS, IChatTurnPillsModel, IDiffStats, IPreviewFile, observeTurnStatusPillsConfig, openChatPreviewFile, previewFilesEqual, previewKind } from '../../../../workbench/contrib/chat/browser/widget/chatTurnPills.js';
import { isAgentHostProviderId } from '../../../common/agentHostSessionsProvider.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { SessionStatus } from '../../../services/sessions/common/session.js';
import { IActiveSession } from '../../../services/sessions/common/sessionsManagement.js';
import { VIEW_SESSION_CHANGES_COMMAND_ID } from '../../changes/browser/changesActions.js';
import './media/sessionChatInputToolbar.css';

/** The per-turn data both pills reflect. */
interface ITurnData {
	readonly stats: IDiffStats;
	/** Previewable files changed in the turn, primary (first) first. */
	readonly previewFiles: readonly IPreviewFile[];
}

const EMPTY_TURN_DATA: ITurnData = { stats: EMPTY_DIFF_STATS, previewFiles: [] };

/**
 * Compute the current turn's diff stats and previewable files from the session's
 * last-turn changes ({@link ISession.lastTurnChanges}), which the provider
 * derives from the live output stream. Files are classified as created vs.
 * edited with the same rules as the Changes view (an addition has no original; a
 * deletion has no modified resource). Created files are listed before edited ones
 * so the primary (first) file is the first created one, falling back to the first
 * edited one. Returns {@link EMPTY_TURN_DATA} when the session exposes no
 * last-turn changes (e.g. before its first turn, or a provider that can't
 * determine them).
 */
function computeTurnData(session: IActiveSession, reader: IReader): ITurnData {
	const changes = session.lastTurnChanges?.read(reader) ?? [];

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
 * session status as clickable pills (see {@link ChatTurnPillsWidget}). Only shown
 * for agent host sessions while a turn is actively in progress; once the turn
 * completes the pills disappear here and reappear inside the completed response.
 * The pills are scoped to the session's last-turn changes so they reflect only
 * what the most recent request produced.
 */
export class SessionChatInputToolbar extends Disposable {

	readonly element: HTMLElement;

	/** Sentinel distinguishing "no override" from an explicit `undefined` session. */
	private readonly _sessionOverride = observableValue<IActiveSession | undefined | 'unset'>('sessionOverride', 'unset');
	private readonly _chatResource = observableValue<URI | undefined>('chatResource', undefined);

	/** The session whose status is reflected, from an explicit override or resolved from the chat. */
	private readonly _session: IObservable<IActiveSession | undefined> = derived(reader => {
		const override = this._sessionOverride.read(reader);
		if (override !== 'unset') {
			return override;
		}
		const resource = this._chatResource.read(reader);
		if (!resource) {
			return undefined;
		}
		return this._findOwningSession(resource, reader);
	});

	/** The current turn's diff stats and previewable files. */
	private readonly _turnData = derivedOpts<ITurnData>({ owner: this, equalsFn: turnDataEqual }, reader => {
		const session = this._session.read(reader);
		return session ? computeTurnData(session, reader) : EMPTY_TURN_DATA;
	});

	private readonly _diffStats = derivedOpts<IDiffStats>({ owner: this, equalsFn: diffStatsEqual }, reader => this._turnData.read(reader).stats);
	private readonly _previewFiles = derivedOpts<readonly IPreviewFile[]>({ owner: this, equalsFn: previewFilesEqual }, reader => this._turnData.read(reader).previewFiles);

	/** Whether pills may show at all: an agent host session while a turn is streaming. */
	private readonly _active = derived(reader => {
		const session = this._session.read(reader);
		return !!session && isAgentHostProviderId(session.providerId) && session.status.read(reader) === SessionStatus.InProgress;
	});

	constructor(
		@ICommandService private readonly _commandService: ICommandService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IOpenerService private readonly _openerService: IOpenerService,
		@ILogService private readonly _logService: ILogService,
		@ISessionsService private readonly _sessionsService: ISessionsService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();

		this.element = $('.session-chat-input-toolbar.hidden');

		// Combine the active-turn gate with the per-pill visibility setting.
		const pillsConfig = observeTurnStatusPillsConfig(this._configurationService);
		const model: IChatTurnPillsModel = {
			stats: this._diffStats,
			previewFiles: this._previewFiles,
			changesEnabled: derived(reader => this._active.read(reader) && pillsConfig.read(reader).changes),
			previewEnabled: derived(reader => this._active.read(reader) && pillsConfig.read(reader).preview),
			openChanges: () => this._openChanges(),
			openPreviewFile: file => openChatPreviewFile(file, this._commandService, this._openerService, this._logService),
		};

		const pills = this._register(instantiationService.createInstance(ChatTurnPillsWidget, model));
		this.element.appendChild(pills.element);

		this._register(autorun(reader => {
			this.element.classList.toggle('hidden', !pills.isVisible.read(reader));
		}));
	}

	/**
	 * Track the currently-viewed chat; the toolbar resolves and reflects the
	 * status of the session that owns it. Clears any explicit {@link setSession}
	 * override.
	 */
	setChat(chatResource: URI | undefined): void {
		this._sessionOverride.set('unset', undefined);
		this._chatResource.set(chatResource, undefined);
	}

	/**
	 * Explicitly set the session to reflect, bypassing chat resolution. Intended
	 * for component fixtures and callers that already hold the session.
	 */
	setSession(session: IActiveSession | undefined): void {
		this._sessionOverride.set(session, undefined);
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
		const session = this._session.get();
		if (!session) {
			return;
		}
		await this._commandService.executeCommand(VIEW_SESSION_CHANGES_COMMAND_ID, session);
	}
}
