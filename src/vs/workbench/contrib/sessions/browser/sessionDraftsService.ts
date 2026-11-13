/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { toAction } from '../../../../base/common/actions.js';
import { Sequencer } from '../../../../base/common/async.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { createCommandUri } from '../../../../base/common/htmlContent.js';
import { Disposable, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, derived, IObservable, observableFromEvent } from '../../../../base/common/observable.js';
import { basename } from '../../../../base/common/resources.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { localize } from '../../../../nls.js';
import { CommandsRegistry } from '../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { observableConfigValue } from '../../../../platform/observable/common/platformObservableUtils.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { NotificationText } from '../../../../platform/notification/common/notificationMessage.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { IChatEntitlementService } from '../../../services/chat/common/chatEntitlementService.js';
import { ILifecycleService } from '../../../services/lifecycle/common/lifecycle.js';
import { IChatDraft } from '../../chat/common/attachments/chatDraft.js';
import { writeNewChatDraftState } from '../common/newChatDraftState.js';
import { hasSessionDraftContent, ISavedSessionDraft, ISavedSessionDraftTarget, SavedSessionDrafts } from '../common/savedSessionDrafts.js';
import { SESSIONS_DRAFTS_ENABLED_SETTING } from '../common/sessionConfig.js';
import { ISessionsManagementService } from '../common/sessionsManagement.js';
import { ISendRequestOptions } from '../common/sessionsProvider.js';
import { ISessionsService } from './sessionsService.js';
import { ISessionGroupsService } from './sessionGroupsService.js';
import { IPendingSessionSection } from './views/pendingSessions.js';

const openDraftCommandId = 'sessions.drafts.open';

export const ISessionDraftsService = createDecorator<ISessionDraftsService>('sessionDraftsService');

export interface ISessionDraftsService {
	readonly _serviceBrand: undefined;
	readonly enabled: IObservable<boolean>;
	readonly sections: IObservable<readonly IPendingSessionSection[]>;
	readonly onDidOpenDraft: Event<string>;
	createComposer(): SessionDraftComposer;
	registerComposer(composer: SessionDraftComposer, restore: (draft: ISavedSessionDraft, token?: CancellationToken) => Promise<void>, clear: () => void): IDisposable;
	stowAndClear(composer?: SessionDraftComposer): ISavedSessionDraft | undefined;
	open(id: string, options?: { removeFromDrafts?: boolean }): Promise<void>;
	save(input: IChatDraft, target: ISavedSessionDraftTarget, id?: string): ISavedSessionDraft;
	restoreRecovery(input: IChatDraft, target: ISavedSessionDraftTarget): Promise<void>;
	getDraftRevision(composer: SessionDraftComposer): string | undefined;
	finishScheduledComposer(composer: SessionDraftComposer, revision: string | undefined): void;
	stow(composer: SessionDraftComposer, options?: { notifyCreated?: boolean }): ISavedSessionDraft | undefined;
}

/** Snapshot ownership is independent of the provisional provider session and of its editor's lifetime. */
export class SessionDraftComposer implements IDisposable {
	id: string;
	input: IChatDraft = { inputText: '', attachments: [] };
	target: ISavedSessionDraftTarget = {};
	sending: ISavedSessionDraft | undefined;
	isSending = false;
	isScheduling = false;
	isRestoring = false;
	disposed = false;
	private sendTracked = false;

	constructor(private readonly service: SessionDraftsService) {
		this.id = generateUuid();
	}

	updateInput(input: IChatDraft): void {
		this.input = input;
		this.service.updateNavigation(this);
	}

	willSend(input: IChatDraft): void {
		this.input = input;
		this.sendTracked = false;
		try {
			this.sending = this.service.getDraftRevision(this) ? this.service.stow(this) : undefined;
		} catch (error) {
			this.service.reportSaveError(error);
		}
		this.isSending = true;
	}

	trackSend(options: ISendRequestOptions, sessionId: string): void {
		if (this.sending) {
			this.service.trackSend(options, this.sending, sessionId);
			this.sendTracked = true;
		}
	}

	didSend(accepted: boolean): void {
		this.isSending = false;
		if (accepted) {
			if (this.sending && !this.sendTracked) {
				this.service.acceptSend(this.sending);
			}
			this.id = generateUuid();
		} else if (this.disposed && this.sending) {
			// A failed request's snapshot remains available even when navigation destroyed its editor.
			this.service.retain(this.sending);
		}
		this.sending = undefined;
	}

	dispose(): void {
		this.disposed = true;
	}
}

export class SessionDraftsService extends Disposable implements ISessionDraftsService {
	declare readonly _serviceBrand: undefined;
	readonly enabled: IObservable<boolean>;
	readonly sections: IObservable<readonly IPendingSessionSection[]>;
	private readonly _onDidOpenDraft = this._register(new Emitter<string>());
	readonly onDidOpenDraft = this._onDidOpenDraft.event;
	private readonly model: SavedSessionDrafts;
	private current: { composer: SessionDraftComposer; restore: (draft: ISavedSessionDraft, token?: CancellationToken) => Promise<void>; clear: () => void } | undefined;
	private readonly sends = new Map<ISendRequestOptions, { draft: ISavedSessionDraft; sessionId: string }>();
	private readonly openQueue = new Sequencer();
	private opening = false;
	private stowing = false;

	constructor(
		@IStorageService private readonly storageService: IStorageService,
		@IConfigurationService configurationService: IConfigurationService,
		@ISessionsService private readonly sessionsService: ISessionsService,
		@ISessionsManagementService sessionsManagementService: ISessionsManagementService,
		@IDialogService private readonly dialogService: IDialogService,
		@INotificationService private readonly notificationService: INotificationService,
		@ILogService private readonly logService: ILogService,
		@ISessionGroupsService private readonly groupsService: ISessionGroupsService,
		@IChatEntitlementService entitlementService: IChatEntitlementService,
		@ILifecycleService private readonly lifecycleService: ILifecycleService,
	) {
		super();
		const configured = observableConfigValue(SESSIONS_DRAFTS_ENABLED_SETTING, false, configurationService);
		const hidden = observableFromEvent(this, entitlementService.onDidChangeSentiment, () => entitlementService.sentiment.hidden);
		this.enabled = derived(this, reader => configured.read(reader) && !hidden.read(reader));
		this.model = this._register(new SavedSessionDrafts(storageService));
		this._register(CommandsRegistry.registerCommand(openDraftCommandId, async (_accessor, id: string) => {
			if (!await this.openDraft(id, CancellationToken.None)) {
				throw new Error(localize('draft.noLongerAvailable', "This draft is no longer available."));
			}
		}));
		this._register(autorun(reader => {
			const error = this.model.error.read(reader);
			if (error && this.enabled.read(reader)) {
				this.logService.error('[SessionDrafts] Could not read saved drafts', error);
				this.notificationService.error(localize('draft.storageFailed', "Could not read saved drafts. Their stored content has not been changed: {0}", error.message));
			}
		}));
		this._register(sessionsService.registerSavedDraftOpener(async (id, token) => {
			if (!this.enabled.get() || !this.model.drafts.get().some(draft => draft.id === id) || token.isCancellationRequested) {
				return false;
			}
			return this.openDraft(id, token);
		}));
		this._register(autorun(reader => {
			this.enabled.read(reader);
			if (this.current) {
				this.updateNavigation(this.current.composer);
			}
		}));
		this.sections = derived(this, reader => {
			if (!this.enabled.read(reader)) {
				return [];
			}
			const items = this.model.drafts.read(reader).map(draft => ({
				pendingSession: true as const,
				id: draft.id,
				kind: 'draft' as const,
				title: draft.input.inputText.trim().split('\n')[0] || localize('draft.attachmentTitle', "Attached Context"),
				description: draft.target.folderUri ? basename(draft.target.folderUri) : '',
				folderUri: draft.target.folderUri,
				providerId: draft.target.providerId,
				sessionType: draft.target.sessionTypeId,
				environmentId: draft.target.environmentId,
				harness: draft.target.harness,
				applicationId: draft.target.applicationId,
				isQuickChat: !draft.target.folderUri,
				open: () => this.open(draft.id),
				actions: [
					toAction({ id: 'sessions.drafts.resume', label: localize('draft.resume', "Resume Draft"), class: ThemeIcon.asClassName(Codicon.play), run: () => this.open(draft.id) }),
					toAction({ id: 'sessions.drafts.delete', label: localize('draft.delete', "Delete Draft"), class: ThemeIcon.asClassName(Codicon.trash), run: () => this.delete(draft.id) }),
				],
			}));
			return items.length ? [{ id: 'drafts', label: localize('drafts', "Drafts"), items }] : [];
		});
		this._register(sessionsManagementService.onDidSendRequest(event => {
			const send = this.sends.get(event.options);
			if (send) {
				this.model.remove(send.draft.id, send.draft.revision);
				this.sends.delete(event.options);
			}
		}));
		this._register(sessionsManagementService.onDidEndNewSessionRequest(event => {
			for (const [options, send] of this.sends) {
				if (send.sessionId === event.session.sessionId) {
					this.sends.delete(options);
				}
			}
		}));
		this._register(sessionsManagementService.onDidReplaceNewDraftSession(event => {
			for (const send of this.sends.values()) {
				if (send.sessionId === event.from.sessionId) {
					send.sessionId = event.to.sessionId;
				}
			}
		}));
	}

	createComposer(): SessionDraftComposer {
		const composer = new SessionDraftComposer(this);
		composer.target = { groupId: this.groupsService.getPendingNewSessionGroup() };
		return composer;
	}

	registerComposer(composer: SessionDraftComposer, restore: (draft: ISavedSessionDraft, token?: CancellationToken) => Promise<void>, clear: () => void): IDisposable {
		const restoreComposer = async (draft: ISavedSessionDraft, token?: CancellationToken) => {
			composer.isRestoring = true;
			try {
				await restore(draft, token);
				if (!token?.isCancellationRequested && !composer.disposed) {
					composer.id = draft.id;
					composer.target = draft.target;
				}
			} finally {
				composer.isRestoring = false;
			}
		};
		this.current = { composer, restore: restoreComposer, clear };
		this.updateNavigation(composer);
		return toDisposable(() => {
			composer.dispose();
			if (this.current?.composer === composer) {
				this.current = undefined;
			}
		});
	}

	stowAndClear(composer = this.current?.composer): ISavedSessionDraft | undefined {
		const current = this.current;
		if (!this.enabled.get() || !current || current.composer !== composer || current.composer.isSending) {
			return undefined;
		}
		if (this.opening || current.composer.isScheduling) {
			throw new Error(localize('draft.newSessionBusy', "Wait for the draft to finish opening or scheduling before starting a new session."));
		}
		const saved = this.stow(current.composer, { notifyCreated: true });
		if (saved) {
			this.clearLegacyInput(current.composer);
			// Change identity before clearing: emptying the old identity would delete the saved draft.
			this.stowing = true;
			try {
				current.composer.id = generateUuid();
				current.composer.updateInput({ inputText: '', attachments: [] });
				current.clear();
				this.sessionsService.setCurrentDraftId(undefined, true);
			} finally {
				this.stowing = false;
			}
		}
		return saved;
	}

	stow(composer: SessionDraftComposer, options?: { notifyCreated?: boolean }): ISavedSessionDraft | undefined {
		if (!this.enabled.get() || this.lifecycleService.willShutdown || composer.isScheduling || composer.isRestoring) {
			return undefined;
		}
		if (!hasSessionDraftContent(composer.input)) {
			if (this.model.drafts.get().some(draft => draft.id === composer.id)) {
				this.model.remove(composer.id);
			}
			return undefined;
		}
		const isNew = !this.model.drafts.get().some(draft => draft.id === composer.id);
		const saved = this.model.save(composer.input, composer.target, composer.id);
		if (isNew && options?.notifyCreated) {
			this.notificationService.info(NotificationText.format(
				localize('draft.created', "Created draft. {0}"),
				NotificationText.link(localize('draft.open', "Open Draft"), createCommandUri(openDraftCommandId, saved.id).toString()),
			));
		}
		return saved;
	}

	reportSaveError(error: unknown): void {
		this.logService.error('[SessionDrafts] Save failed', error);
		this.notificationService.error(localize('draft.saveFailed', "Could not save this draft. The current input has been kept: {0}", String(error)));
	}

	save(input: IChatDraft, target: ISavedSessionDraftTarget, id?: string): ISavedSessionDraft {
		if (!this.enabled.get()) {
			throw new Error(localize('drafts.disabled', "Saved drafts are disabled."));
		}
		return this.model.save(input, target, id);
	}

	getDraftRevision(composer: SessionDraftComposer): string | undefined {
		return this.model.drafts.get().find(draft => draft.id === composer.id)?.revision;
	}

	finishScheduledComposer(composer: SessionDraftComposer, revision: string | undefined): void {
		if (revision) {
			this.model.remove(composer.id, revision);
		}
		composer.id = generateUuid();
	}

	async restoreRecovery(input: IChatDraft, target: ISavedSessionDraftTarget): Promise<void> {
		if (this.current && (this.current.composer.isSending || hasSessionDraftContent(this.current.composer.input))) {
			throw new Error(localize('draft.recoveryOccupied', "The schedule is cancelled and its content is retained. Open an empty New Session and choose Edit as Draft again to recover it without replacing your current input."));
		}
		await this.sessionsService.openNewSession();
		if (!this.current || hasSessionDraftContent(this.current.composer.input)) {
			throw new Error(localize('draft.recoveryNotReady', "The schedule is cancelled and its content is retained. Clear the new-session input before recovering this request."));
		}
		const now = Date.now();
		await this.current.restore({ id: generateUuid(), revision: generateUuid(), createdAt: now, updatedAt: now, input, target });
	}

	retain(draft: ISavedSessionDraft): void {
		if (!this.model.drafts.get().some(candidate => candidate.id === draft.id)) {
			this.model.save(draft.input, draft.target, draft.id);
		}
	}

	updateNavigation(composer: SessionDraftComposer): void {
		if (!this.opening && !this.stowing && this.current?.composer === composer) {
			this.sessionsService.setCurrentDraftId(this.enabled.get() && hasSessionDraftContent(composer.input) ? composer.id : undefined);
		}
	}

	clearLegacyInput(composer: SessionDraftComposer): void {
		if (this.current?.composer === composer) {
			writeNewChatDraftState(this.storageService, { inputText: '', attachments: [] });
		}
	}

	trackSend(options: ISendRequestOptions, draft: ISavedSessionDraft, sessionId: string): void {
		this.sends.set(options, { draft, sessionId });
	}

	acceptSend(draft: ISavedSessionDraft): void {
		this.model.remove(draft.id, draft.revision);
	}

	async open(id: string, options?: { removeFromDrafts?: boolean }): Promise<void> {
		await this.openDraft(id, CancellationToken.None, options?.removeFromDrafts);
	}

	private openDraft(id: string, token: CancellationToken, removeFromDrafts = false): Promise<boolean> {
		return this.queueRestore(() => this.doOpenDraft(id, token, removeFromDrafts));
	}

	private queueRestore<T>(restore: () => Promise<T>): Promise<T> {
		return this.openQueue.queue(async () => {
			this.opening = true;
			try {
				return await restore();
			} finally {
				this.opening = false;
				if (this.current) {
					this.updateNavigation(this.current.composer);
				}
			}
		});
	}

	private async doOpenDraft(id: string, token: CancellationToken, removeFromDrafts: boolean): Promise<boolean> {
		if (token.isCancellationRequested) {
			return false;
		}
		if (!this.enabled.get()) {
			throw new Error(localize('drafts.disabled', "Saved drafts are disabled."));
		}
		let draft = this.model.drafts.get().find(candidate => candidate.id === id);
		if (!draft) {
			return false;
		}
		if (this.current?.composer.isSending || this.current?.composer.isScheduling) {
			throw new Error(localize('draft.busy', "Wait for the current request to start or finish scheduling before opening a draft."));
		}
		if (this.current) {
			const currentDraft = this.stow(this.current.composer, { notifyCreated: this.current.composer.id !== id });
			if (currentDraft?.id === id) {
				draft = currentDraft;
			}
		}
		await this.sessionsService.openNewSession({ preserveNavigation: true }, token);
		if (token.isCancellationRequested) {
			return false;
		}
		const current = this.current;
		if (!current) {
			throw new Error(localize('draft.noComposer', "Could not open the new-session composer."));
		}
		await current.restore(draft, token);
		if (token.isCancellationRequested || current.composer.disposed || this.current !== current) {
			return false;
		}
		this.groupsService.setPendingNewSessionGroup(draft.target.groupId);
		this.updateNavigation(current.composer);
		if (removeFromDrafts) {
			this.model.remove(draft.id, draft.revision);
		} else {
			this._onDidOpenDraft.fire(draft.id);
		}
		return true;
	}

	private async delete(id: string): Promise<void> {
		if (!this.enabled.get()) {
			return;
		}
		if ((await this.dialogService.confirm({ message: localize('draft.deleteConfirm', "Delete this unsent draft?"), primaryButton: localize('draft.delete', "Delete Draft") })).confirmed) {
			this.model.remove(id);
			if (this.current?.composer.id === id) {
				const composer = this.current.composer;
				composer.id = generateUuid();
				composer.updateInput({ inputText: '', attachments: [] });
				this.current.clear();
			}
		}
	}
}
