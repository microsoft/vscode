/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { toAction } from '../../../../base/common/actions.js';
import { RunOnceScheduler, Sequencer } from '../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { isCancellationError } from '../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { createCommandUri } from '../../../../base/common/htmlContent.js';
import { Disposable, IDisposable, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, derived, IObservable, observableFromEvent, observableValue } from '../../../../base/common/observable.js';
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
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IChatEntitlementService } from '../../../services/chat/common/chatEntitlementService.js';
import { ILifecycleService } from '../../../services/lifecycle/common/lifecycle.js';
import { IChatDraft } from '../../chat/common/attachments/chatDraft.js';
import { IChatScheduledRequest } from '../../chat/common/model/chatViewModel.js';
import { ISession } from '../../../services/sessions/common/session.js';
import { equals } from '../../../../base/common/objects.js';
import { readNewChatDraftState, writeNewChatDraftState } from '../common/newChatDraftState.js';
import { hasSessionDraftContent, ISavedSessionDraft, ISavedSessionDraftTarget, SavedSessionDrafts } from '../common/savedSessionDrafts.js';
import { SESSIONS_DRAFTS_ENABLED_SETTING } from '../common/sessionConfig.js';
import { ISessionsManagementService } from '../common/sessionsManagement.js';
import { ISendRequestOptions } from '../common/sessionsProvider.js';
import { ISessionsService } from './sessionsService.js';
import { ISessionGroupsService } from './sessionGroupsService.js';
import { IPendingSessionSection } from './views/pendingSessions.js';

const openDraftCommandId = 'sessions.drafts.open';
const draftCreationNotificationShownKey = 'sessions.drafts.creationNotificationShown';

export const ISessionDraftsService = createDecorator<ISessionDraftsService>('sessionDraftsService');

export interface IScheduledSessionDraft {
	readonly request: IObservable<IChatScheduledRequest | undefined>;
	save(input: IChatDraft, target: ISavedSessionDraftTarget, session: ISession): Promise<void>;
	sendNow(): Promise<void>;
	reschedule(anchor?: HTMLElement, onSendNow?: () => Promise<void>): Promise<void>;
}

export interface ISessionDraftsService {
	readonly _serviceBrand: undefined;
	readonly enabled: IObservable<boolean>;
	readonly sections: IObservable<readonly IPendingSessionSection[]>;
	readonly onDidOpenDraft: Event<string>;
	createComposer(): SessionDraftComposer;
	registerComposer(composer: SessionDraftComposer, restore: (draft: ISavedSessionDraft, token?: CancellationToken, preserveFocus?: boolean) => Promise<void>, clear: () => void, focus?: () => void): IDisposable;
	stowAndClear(composer?: SessionDraftComposer): ISavedSessionDraft | undefined;
	open(id: string, options?: { removeFromDrafts?: boolean }): Promise<void>;
	save(input: IChatDraft, target: ISavedSessionDraftTarget, id?: string): ISavedSessionDraft;
	restoreRecovery(input: IChatDraft, target: ISavedSessionDraftTarget): Promise<void>;
	preview(input: IChatDraft, target: ISavedSessionDraftTarget, scheduled: IScheduledSessionDraft): Promise<void>;
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
	readonly preview = observableValue<IScheduledSessionDraft | undefined>(this, undefined);
	readonly hasScheduledChanges = observableValue(this, false);
	private scheduledSnapshot: { input: IChatDraft; target: ISavedSessionDraftTarget } | undefined;
	recoveredDraft: ISavedSessionDraft | undefined;
	disposed = false;
	private sendTracked = false;

	constructor(private readonly service: SessionDraftsService) {
		this.id = generateUuid();
	}

	updateInput(input: IChatDraft): void {
		this.input = input;
		this.updateScheduledChanges();
		this.service.updateNavigation(this);
		this.service.updateSavedDraft(this);
	}

	updateTarget(target: ISavedSessionDraftTarget): void {
		this.target = target;
		this.updateScheduledChanges();
		this.service.updateSavedDraft(this);
	}

	cancelRecovery(): void {
		this.service.cancelRecovery(this);
	}

	markScheduledSaved(input = this.input, target = this.target): void {
		this.scheduledSnapshot = { input: { ...input, references: input.references ?? [] }, target };
		this.updateScheduledChanges();
	}

	private updateScheduledChanges(): void {
		this.hasScheduledChanges.set(!!this.preview.get() && !!this.scheduledSnapshot && !equals(this.scheduledSnapshot, { input: { ...this.input, references: this.input.references ?? [] }, target: this.target }), undefined);
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
	private current: { composer: SessionDraftComposer; restore: (draft: ISavedSessionDraft, token?: CancellationToken) => Promise<void>; clear: () => void; focus?: () => void; restoredId?: string } | undefined;
	private readonly sends = new Map<ISendRequestOptions, { draft: ISavedSessionDraft; sessionId: string }>();
	private readonly openQueue = new Sequencer();
	private readonly pendingOpen = this._register(new MutableDisposable<IDisposable>());
	private readonly pendingRecovery = this._register(new MutableDisposable<CancellationTokenSource>());
	private readonly liveDraft = observableValue<Pick<ISavedSessionDraft, 'id' | 'input' | 'target'> | undefined>(this, undefined);
	private readonly saveScheduler = this._register(new RunOnceScheduler(() => this.persistSavedDraft(), 300));
	private opening: CancellationToken | undefined;
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
		this._register(storageService.onWillSaveState(() => this.persistSavedDraft()));
		this._register(lifecycleService.onBeforeShutdown(event => {
			if (this.hasUnsavedScheduledChanges()) {
				event.veto((async () => !(await this.dialogService.confirm({
					message: localize('scheduledDraft.discardOnClose', "Discard unsaved changes to this scheduled request?"),
					detail: this.current?.composer.preview.get()?.request.get()?.runAt
						? localize('scheduledDraft.originalStillScheduled', "The last saved version will still be sent at its scheduled time.")
						: localize('scheduledDraft.unavailableDiscard', "Your unsaved changes will be lost. Check Automations for the request's current status."),
					primaryButton: localize('scheduledDraft.discard', "Discard Changes"),
				})).confirmed)(), 'veto.scheduledDraft');
			}
		}));
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
			const liveDraft = this.liveDraft.read(reader);
			const items = this.model.drafts.read(reader).map(saved => {
				const draft = liveDraft?.id === saved.id ? liveDraft : saved;
				return {
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
				};
			});
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
		try {
			const backup = readNewChatDraftState(this.storageService);
			const id = backup?.savedDraftId;
			const draft = id && this.model.drafts.get().find(draft => draft.id === id);
			if (draft && backup) {
				composer.id = draft.id;
				composer.target = draft.target;
				composer.input = backup;
				composer.recoveredDraft = draft;
				composer.isRestoring = true;
			}
		} catch (error) {
			this.logService.warn('[SessionDrafts] Could not restore the composer identity', error);
		}
		return composer;
	}

	registerComposer(composer: SessionDraftComposer, restore: (draft: ISavedSessionDraft, token?: CancellationToken, preserveFocus?: boolean) => Promise<void>, clear: () => void, focus?: () => void): IDisposable {
		const restoreComposer = async (draft: ISavedSessionDraft, token?: CancellationToken, preserveFocus?: boolean) => {
			const current = this.current;
			if (current) {
				current.restoredId = undefined;
			}
			composer.isRestoring = true;
			try {
				await restore(draft, token, preserveFocus);
				if (!token?.isCancellationRequested && !composer.disposed) {
					composer.id = draft.id;
					if (!composer.preview.get()) {
						composer.target = draft.target;
					}
					if (current && current === this.current) {
						current.restoredId = draft.id;
					}
				}
			} finally {
				composer.isRestoring = false;
			}
		};
		this.current = { composer, restore: restoreComposer, clear, focus };
		const recoveredDraft = composer.recoveredDraft;
		composer.recoveredDraft = undefined;
		if (recoveredDraft) {
			const recovery = new CancellationTokenSource();
			this.pendingRecovery.value = recovery;
			// Restore only the backed-up composer, not other saved entries, before startup can capture picker defaults.
			void this.queueCancellableRestore(async token => {
				try {
					if (token.isCancellationRequested || composer.disposed || this.current?.composer !== composer) {
						return;
					}
					await restoreComposer({ ...recoveredDraft, input: composer.input }, token, true);
				} finally {
					composer.isRestoring = false;
					if (this.pendingRecovery.value === recovery) {
						this.pendingRecovery.clear();
					}
				}
			}, recovery.token).catch(error => {
				if (isCancellationError(error)) {
					return;
				}
				this.logService.error('[SessionDrafts] Could not restore the backed-up composer', error);
				this.notificationService.error(error);
			});
		}
		this.updateNavigation(composer);
		return toDisposable(() => {
			this.persistSavedDraft();
			this.cancelRecovery(composer);
			composer.dispose();
			if (this.current?.composer === composer) {
				this.current = undefined;
			}
		});
	}

	cancelRecovery(composer: SessionDraftComposer): void {
		if (this.current?.composer === composer && this.pendingRecovery.value) {
			this.pendingRecovery.value.cancel();
			this.pendingRecovery.clear();
			composer.isRestoring = false;
		}
	}

	stowAndClear(composer = this.current?.composer): ISavedSessionDraft | undefined {
		const current = this.current;
		if (current && current.composer === composer) {
			this.cancelRecovery(composer);
			if ((this.opening && !this.opening.isCancellationRequested) || composer.isRestoring || composer.isScheduling) {
				throw new Error(localize('draft.newSessionBusy', "Wait for the draft to finish opening or scheduling before starting a new session."));
			}
		}
		if (current && current.composer === composer && composer.preview.get()) {
			this.prepareToReplaceScheduledDraft();
			current.clear();
			composer.id = generateUuid();
			composer.updateInput({ inputText: '', attachments: [] });
			composer.preview.set(undefined, undefined);
			this.clearLegacyInput(composer);
			this.updateNavigation(composer);
			return undefined;
		}
		if (!this.enabled.get() || !current || current.composer !== composer || current.composer.isSending) {
			return undefined;
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
		if (!this.enabled.get() || this.lifecycleService.willShutdown || composer.isScheduling || composer.isRestoring || composer.preview.get()) {
			return undefined;
		}
		if (!hasSessionDraftContent(composer.input)) {
			if (this.model.drafts.get().some(draft => draft.id === composer.id)) {
				this.model.remove(composer.id);
			}
			this.clearPendingSave(composer);
			return undefined;
		}
		const isNew = !this.model.drafts.get().some(draft => draft.id === composer.id);
		const saved = this.model.save(composer.input, composer.target, composer.id);
		this.clearPendingSave(composer);
		if (isNew && options?.notifyCreated && !this.storageService.getBoolean(draftCreationNotificationShownKey, StorageScope.PROFILE, false)) {
			this.notificationService.info(NotificationText.format(
				localize('draft.created', "Created draft. {0}"),
				NotificationText.link(localize('draft.open', "Open Draft"), createCommandUri(openDraftCommandId, saved.id).toString()),
			));
			this.storageService.store(draftCreationNotificationShownKey, true, StorageScope.PROFILE, StorageTarget.USER);
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

	updateSavedDraft(composer: SessionDraftComposer): void {
		if (!this.enabled.get() || composer.isSending || composer.isScheduling || composer.isRestoring || composer.preview.get() || this.current?.composer !== composer || !hasSessionDraftContent(composer.input) || !this.getDraftRevision(composer)) {
			return;
		}
		this.liveDraft.set({ id: composer.id, input: composer.input, target: composer.target }, undefined);
		this.saveScheduler.schedule();
	}

	private persistSavedDraft(): void {
		const composer = this.current?.composer;
		if (!composer || this.liveDraft.get()?.id !== composer.id || !this.enabled.get() || composer.isSending || composer.isScheduling || composer.isRestoring || composer.preview.get() || !hasSessionDraftContent(composer.input) || !this.getDraftRevision(composer)) {
			return;
		}
		try {
			this.model.save(composer.input, composer.target, composer.id);
			this.clearPendingSave(composer);
		} catch (error) {
			this.reportSaveError(error);
		}
	}

	private clearPendingSave(composer: SessionDraftComposer): void {
		if (this.liveDraft.get()?.id === composer.id) {
			this.saveScheduler.cancel();
			this.liveDraft.set(undefined, undefined);
		}
	}

	finishScheduledComposer(composer: SessionDraftComposer, revision: string | undefined): void {
		this.clearPendingSave(composer);
		if (revision) {
			this.model.remove(composer.id, revision);
		}
		composer.id = generateUuid();
	}

	async restoreRecovery(input: IChatDraft, target: ISavedSessionDraftTarget): Promise<void> {
		if (this.current?.composer.preview.get()) {
			this.stowAndClear();
		}
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

	preview(input: IChatDraft, target: ISavedSessionDraftTarget, scheduled: IScheduledSessionDraft): Promise<void> {
		return this.queueRestore(async () => {
			this.prepareToReplaceScheduledDraft();
			if (this.current?.composer.isSending || this.current?.composer.isScheduling) {
				throw new Error(localize('draft.busy', "Wait for the current request to start or finish scheduling before opening a draft."));
			}
			if (this.current) {
				if (!this.enabled.get() && !this.current.composer.preview.get() && hasSessionDraftContent(this.current.composer.input)) {
					throw new Error(localize('draft.previewOccupied', "Open an empty New Session before previewing this scheduled request."));
				}
				this.stow(this.current.composer);
				this.clearLegacyInput(this.current.composer);
			}
			await this.sessionsService.openNewSession({ preserveNavigation: true });
			const current = this.current;
			if (!current) {
				throw new Error(localize('draft.noComposer', "Could not open the new-session composer."));
			}
			current.composer.preview.set(scheduled, undefined);
			current.composer.target = target;
			current.composer.markScheduledSaved(input, target);
			const now = Date.now();
			await current.restore({ id: generateUuid(), revision: generateUuid(), createdAt: now, updatedAt: now, input, target });
			current.composer.markScheduledSaved();
		});
	}

	retain(draft: ISavedSessionDraft): void {
		if (!this.model.drafts.get().some(candidate => candidate.id === draft.id)) {
			this.model.save(draft.input, draft.target, draft.id);
		}
	}

	updateNavigation(composer: SessionDraftComposer): void {
		if ((!this.opening || this.opening.isCancellationRequested) && !this.stowing && this.current?.composer === composer) {
			this.sessionsService.setCurrentDraftId(this.enabled.get() && !composer.preview.get() && hasSessionDraftContent(composer.input) ? composer.id : undefined);
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
		return this.queueCancellableRestore(token => this.doOpenDraft(id, token, removeFromDrafts), token);
	}

	private queueCancellableRestore<T>(restore: (token: CancellationToken) => Promise<T>, token: CancellationToken = CancellationToken.None): Promise<T> {
		const cancellation = new CancellationTokenSource(token);
		const pending = toDisposable(() => cancellation.dispose(true));
		this.pendingOpen.value = pending;
		return this.queueRestore(async () => {
			try {
				return await restore(cancellation.token);
			} finally {
				if (this.pendingOpen.value === pending) {
					this.pendingOpen.clear();
				}
			}
		}, cancellation.token);
	}

	private queueRestore<T>(restore: () => Promise<T>, token: CancellationToken = CancellationToken.None): Promise<T> {
		return this.openQueue.queue(async () => {
			this.opening = token;
			try {
				return await restore();
			} finally {
				this.opening = undefined;
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
		this.prepareToReplaceScheduledDraft();
		if (this.current?.composer.isSending || this.current?.composer.isScheduling) {
			throw new Error(localize('draft.busy', "Wait for the current request to start or finish scheduling before opening a draft."));
		}
		if (this.current) {
			const currentDraft = this.stow(this.current.composer, { notifyCreated: this.current.composer.id !== id });
			if (currentDraft?.id === id) {
				draft = currentDraft;
			}
		}
		const alreadyRestored = this.current?.composer.id === id && this.current.restoredId === id;
		if (!this.current) {
			await this.sessionsService.openNewSession({ preserveNavigation: true }, token);
		}
		if (token.isCancellationRequested) {
			return false;
		}
		const current = this.current;
		if (!current) {
			throw new Error(localize('draft.noComposer', "Could not open the new-session composer."));
		}
		current.composer.preview.set(undefined, undefined);
		if (alreadyRestored) {
			current.focus?.();
		} else {
			await current.restore(draft, token);
		}
		if (!token.isCancellationRequested) {
			// Reveal the restored destination, not an intermediate generic composer.
			await this.sessionsService.openNewSession({ preserveNavigation: true }, token);
		}
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

	private hasUnsavedScheduledChanges(): boolean {
		const composer = this.current?.composer;
		return !!composer?.preview.get() && composer.hasScheduledChanges.get() && hasSessionDraftContent(composer.input);
	}

	private prepareToReplaceScheduledDraft(): void {
		const composer = this.current?.composer;
		if (composer?.preview.get() && composer.isScheduling) {
			throw new Error(localize('scheduledDraft.saving', "Wait for the scheduled request to finish saving."));
		}
		if (this.hasUnsavedScheduledChanges()) {
			if (composer && !composer.preview.get()?.request.get()?.runAt) {
				if (!this.enabled.get()) {
					composer.preview.set(undefined, undefined);
					composer.updateInput(composer.input);
					throw new Error(localize('scheduledDraft.keptAsInput', "This scheduled request is no longer editable here. Your changes have been kept in New Session and can be sent as a separate request. Check Automations before sending again."));
				}
				this.save(composer.input, composer.target);
				composer.markScheduledSaved();
				return;
			}
			throw new Error(localize('scheduledDraft.unsaved', "Use the Send control to save your changes before replacing this scheduled draft, or clear its input to discard local edits. The last saved version remains scheduled."));
		}
	}

	private async delete(id: string): Promise<void> {
		if (!this.enabled.get()) {
			return;
		}
		if ((await this.dialogService.confirm({ message: localize('draft.deleteConfirm', "Delete this unsent draft?"), primaryButton: localize('draft.delete', "Delete Draft") })).confirmed) {
			this.model.remove(id);
			if (this.current?.composer.id === id) {
				const composer = this.current.composer;
				this.clearPendingSave(composer);
				composer.id = generateUuid();
				composer.updateInput({ inputText: '', attachments: [] });
				this.current.clear();
			}
		}
	}

	override dispose(): void {
		this.persistSavedDraft();
		super.dispose();
	}
}
