/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { autorun } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { isEqual } from '../../../../base/common/resources.js';
import { CommandsRegistry } from '../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { IChatWidgetService } from '../../../../workbench/contrib/chat/browser/chat.js';
import { IVoiceSessionController } from '../../../../workbench/contrib/chat/browser/voiceClient/voiceSessionController.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { INewChatVoiceTargetService, NEW_CHAT_VOICE_SENTINEL } from './newChatVoice.js';

/**
 * Bridges {@link IVoiceSessionController} to Agents window chat surfaces.
 * The shared controller uses `_chat.voice.*` commands; Agents hosts chats
 * through {@link ISessionsService}, so it registers them here.
 *
 * Commands are registered only while `agents.voice.enabled` is set:
 * - `_chat.voice.acceptInput` injects transcribed text into the focused chat widget.
 * - `_chat.voice.getCurrentSession` reports the active session's chat resource.
 * - `_chat.voice.switchToSession` activates the session that owns a chat resource.
 * - `_chat.voice.activateSession` narrates a session's pending voice item on demand.
 */
class SessionsVoiceBridgeContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'sessions.voiceBridge';

	private readonly _commandDisposables = this._register(new DisposableStore());

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IChatWidgetService private readonly chatWidgetService: IChatWidgetService,
		@ISessionsService private readonly sessionsService: ISessionsService,
		@ISessionsManagementService private readonly sessionsManagementService: ISessionsManagementService,
		@INewChatVoiceTargetService private readonly newChatVoiceTargetService: INewChatVoiceTargetService,
		@IVoiceSessionController private readonly voiceSessionController: IVoiceSessionController,
	) {
		super();

		this._updateCommands();
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('agents.voice.enabled')) {
				this._updateCommands();
			}
		}));
	}

	private _updateCommands(): void {
		this._commandDisposables.clear();

		if (this.configurationService.getValue<boolean>('agents.voice.enabled') !== true) {
			return;
		}

		// Prefer the active session widget; Agents often leaves DOM focus on the
		// sessions list, making `lastFocusedWidget` stale.
		this._commandDisposables.add(CommandsRegistry.registerCommand('_chat.voice.acceptInput', (_accessor, text: string) => {
			if (!text) {
				return;
			}
			// Route through the new-session composer so dictation creates the
			// session instead of using a stale `lastFocusedWidget`.
			const composer = this._activeComposerTarget();
			if (composer) {
				composer.sendQuery(text);
				return;
			}
			const widget = this._activeSessionWidget() ?? this.chatWidgetService.lastFocusedWidget;
			if (widget?.viewModel) {
				if (widget.viewModel.editing) {
					// Let the user review edited input before submitting.
					widget.input.setValue(text, false);
				} else {
					widget.acceptInput(text, { preserveFocus: true });
				}
			}
		}));

		// Report the shown session (the active Agents session), not DOM focus.
		// Before a session exists, report the composer sentinel so dictation uses it.
		this._commandDisposables.add(CommandsRegistry.registerCommand('_chat.voice.getCurrentSession', (): string | undefined => {
			// Composer targets take priority over the parent session chat widget.
			if (this._activeComposerTarget()) {
				return NEW_CHAT_VOICE_SENTINEL.toString();
			}
			const activeChat = this._createdActiveChatResource();
			if (activeChat) {
				return activeChat.toString();
			}
			return this.chatWidgetService.lastFocusedWidget?.viewModel?.sessionResource?.toString();
		}));

		// Reveal the session that owns the given chat resource.
		this._commandDisposables.add(CommandsRegistry.registerCommand('_chat.voice.switchToSession', async (_accessor, resourceStr: string): Promise<boolean> => {
			if (!resourceStr) {
				return false;
			}
			// The composer sentinel has no session; focus the composer.
			if (resourceStr === NEW_CHAT_VOICE_SENTINEL.toString()) {
				const composer = this._activeComposerTarget();
				composer?.focus();
				return !!composer;
			}
			let resource: URI;
			try {
				resource = URI.parse(resourceStr);
			} catch {
				return false;
			}

			// Chat resources map to their owning session and chat.
			const owner = this.sessionsManagementService.getSessionForChatResource(resource);
			if (owner) {
				await this.sessionsService.openSession(owner.session.resource, { preserveFocus: true });
				if (!isEqual(owner.chat.resource, owner.session.resource)) {
					await this.sessionsService.openChat(owner.session, owner.chat.resource);
				}
				return true;
			}

			// Otherwise, treat it as a session resource.
			const session = this.sessionsManagementService.getSession(resource);
			if (session) {
				await this.sessionsService.openSession(session.resource, { preserveFocus: true });
				return true;
			}

			try {
				await this.sessionsService.openSession(resource, { preserveFocus: true });
				return true;
			} catch {
				return false;
			}
		}));

		// Explicitly narrate a session's pending voice item (e.g. the user clicked
		// its pending-voice indicator). Deterministic - activates even when the
		// session is already the active one, where no focus/view-model change fires.
		// The resource is passed straight through so it matches the key the pending
		// indicator was set under (see IVoicePlaybackService.setPendingResponse).
		this._commandDisposables.add(CommandsRegistry.registerCommand('_chat.voice.activateSession', (_accessor, resourceStr: string): boolean => {
			if (!resourceStr || resourceStr === NEW_CHAT_VOICE_SENTINEL.toString()) {
				return false;
			}
			let resource: URI;
			try {
				resource = URI.parse(resourceStr);
			} catch {
				return false;
			}
			this.voiceSessionController.activateSession(resource);
			return true;
		}));
	}

	/**
	 * The active chat resource, only after its session exists.
	 * {@link IActiveSession.isCreated} distinguishes it from the welcome composer.
	 */
	private _createdActiveChatResource(): URI | undefined {
		const active = this.sessionsService.activeSession.get();
		return active?.isCreated.get() ? active.activeChat.get()?.resource : undefined;
	}

	/** The chat widget backing the currently active (created) session, if any. */
	private _activeSessionWidget() {
		const resource = this._createdActiveChatResource();
		return resource ? this.chatWidgetService.getWidgetBySessionResource(resource) : undefined;
	}

	/**
	 * The new-session composer voice should target.
	 * Welcome composers stop targeting once a session exists; in-session composers
	 * can opt in via {@link INewChatVoiceComposer.routesWhileSessionActive}.
	 */
	private _activeComposerTarget() {
		const composer = this.newChatVoiceTargetService.activeComposer.get();
		if (!composer) {
			return undefined;
		}
		if (composer.routesWhileSessionActive || !this._createdActiveChatResource()) {
			return composer;
		}
		return undefined;
	}
}

registerWorkbenchContribution2(SessionsVoiceBridgeContribution.ID, SessionsVoiceBridgeContribution, WorkbenchPhase.AfterRestored);

/**
 * Tells the shared voice controller which Agents session is active, so routing,
 * response deferral, and buffered playback follow the visible session.
 *
 * Agents can render multiple chat widgets while DOM focus stays on the sessions
 * list, so forward {@link ISessionsService.activeSession}. Draft composers report
 * `undefined` to avoid reusing a stale session.
 */
class SessionsVoiceActiveSessionContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'sessions.voiceActiveSession';

	constructor(
		@IVoiceSessionController private readonly voiceSessionController: IVoiceSessionController,
		@ISessionsService private readonly sessionsService: ISessionsService,
	) {
		super();

		this._register(autorun(reader => {
			const active = this.sessionsService.activeSession.read(reader);
			const resource = active?.isCreated.read(reader)
				? active.activeChat.read(reader)?.resource
				: undefined;
			this.voiceSessionController.setActiveSessionShown(resource);
		}));
	}
}

registerWorkbenchContribution2(SessionsVoiceActiveSessionContribution.ID, SessionsVoiceActiveSessionContribution, WorkbenchPhase.AfterRestored);

/**
 * Keeps hands-free listening anchored to the dictation session.
 * If the active session changes while listening, stop following it: submit
 * anything already dictated to the original session, or discard an empty turn,
 * so voice mode doesn't keep recording against a newly focused session.
 */
class SessionsVoiceListeningContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'sessions.voiceListening';

	constructor(
		@IVoiceSessionController voiceSessionController: IVoiceSessionController,
		@ISessionsService sessionsService: ISessionsService,
	) {
		super();

		let listeningSession: URI | undefined;
		this._register(autorun(reader => {
			const connected = voiceSessionController.isConnected.read(reader);
			const voiceState = voiceSessionController.voiceState.read(reader);
			const targetSession = voiceSessionController.targetSession.read(reader);
			const turns = voiceSessionController.transcriptTurns.read(reader);
			const activeSession = sessionsService.activeSession.read(reader);
			const currentSession = activeSession?.activeChat.read(reader)?.resource;

			if (!connected) {
				listeningSession = undefined;
				return;
			}

			if (voiceState !== 'listening') {
				// Let the next dictation capture its session.
				listeningSession = undefined;
				return;
			}

			if (!listeningSession) {
				listeningSession = targetSession ?? currentSession;
			} else if (!targetSession && currentSession && !isEqual(currentSession, listeningSession)) {
				const dictationSession = listeningSession;
				const activelyDictating = turns.some(t => t.speaker === 'user' && t.isPartial && t.text.trim().length > 0);
				if (activelyDictating) {
					// The user already spoke — submit their words to the session
					// they were dictating into rather than losing them or
					// misrouting to the newly focused session.
					voiceSessionController.finishListeningAndSubmitTo(dictationSession);
				} else {
					// Nothing dictated yet — just stop, discarding the empty turn.
					voiceSessionController.discardListening();
				}
				listeningSession = undefined;
			}
		}));
	}
}

registerWorkbenchContribution2(SessionsVoiceListeningContribution.ID, SessionsVoiceListeningContribution, WorkbenchPhase.Eventually);
