/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import '../media/sessionWorkIntake.css';
import { $, DisposableResizeObserver, getWindow, isAncestorOfActiveElement } from '../../../../../base/browser/dom.js';
import { status } from '../../../../../base/browser/ui/aria/aria.js';
import { Action } from '../../../../../base/common/actions.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Emitter } from '../../../../../base/common/event.js';
import { toErrorMessage } from '../../../../../base/common/errorMessage.js';
import { Disposable, MutableDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../base/common/network.js';
import { autorun, constObservable, derived, observableValue, transaction } from '../../../../../base/common/observable.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { WorkbenchToolBar } from '../../../../../platform/actions/browser/toolbar.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { AccessibilityVerbositySettingId } from '../../../../../workbench/contrib/accessibility/browser/accessibilityConfiguration.js';
import { ISessionContext, SessionContext } from '../../../../services/sessions/browser/sessionContext.js';
import { ISessionGroupsService } from '../../../../services/sessions/browser/sessionGroupsService.js';
import { ISessionInputDraftService } from '../../../../services/sessions/browser/sessionInputDraftService.js';
import { VisibleSession } from '../../../../services/sessions/browser/visibleSessions.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { ISession, SessionStatus } from '../../../../services/sessions/common/session.js';
import { SessionReviewSection } from '../../../../services/sessions/common/sessionReview.js';
import { ISessionChangesStatsCache } from '../../../../services/sessions/common/sessionChangesStatsCache.js';
import { setActiveSessionContextKeys } from '../../../../services/sessions/common/sessionContextKeys.js';
import { ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { INewChatInputSendRequest, isNewChatInputDraftUnchanged, NewChatInputWidget } from '../../../chat/browser/newChatInput.js';
import { IDashboardWorkService } from '../../../intent/common/dashboardWork.js';
import { layoutSessionCards, SESSION_CARD_GAP } from '../../common/sessionCardLayout.js';

const draftResource = URI.from({ scheme: Schemas.vscodeChatInput, path: '/sessions/dashboard-agent-input' });
const draftCollectionKey = 'sessions.dashboard.agentInput.collection';

/** A dashboard-owned draft; accepted work opens in the shared conversation/review view. */
export class DashboardChatInput extends Disposable {
	readonly element = $('.session-work-intake', { role: 'region' });
	private readonly current = observableValue<ISession | undefined>(this, undefined);
	readonly session = this.current;
	private readonly opened = observableValue(this, false);
	readonly isOpen = this.opened;
	private readonly busy = observableValue(this, false);
	private readonly suspended = observableValue(this, false);
	private readonly wrapper = this._register(new MutableDisposable<VisibleSession>());
	private readonly contextSession = observableValue<VisibleSession | undefined>(this, undefined);
	private readonly title = $('.session-work-intake-title');
	private readonly error = $('.session-work-intake-error', { role: 'alert' });
	private readonly composer = $('.session-work-intake-composer');
	private readonly input: NewChatInputWidget;
	private readonly _onDidChangeHeight = this._register(new Emitter<void>());
	readonly onDidChangeHeight = this._onDidChangeHeight.event;
	private readonly _onDidClose = this._register(new Emitter<void>());
	readonly onDidClose = this._onDidClose.event;
	private width = 0;
	private collectionId: string | undefined;

	get isVisible(): boolean { return this.opened.get(); }
	get hasFocus(): boolean { return isAncestorOfActiveElement(this.element); }

	constructor(
		@IInstantiationService instantiation: IInstantiationService,
		@IContextKeyService contextKeys: IContextKeyService,
		@IDashboardWorkService private readonly work: IDashboardWorkService,
		@ISessionsManagementService management: ISessionsManagementService,
		@ISessionsService private readonly sessions: ISessionsService,
		@ISessionInputDraftService private readonly drafts: ISessionInputDraftService,
		@ISessionGroupsService private readonly groups: ISessionGroupsService,
		@ISessionChangesStatsCache changes: ISessionChangesStatsCache,
		@INotificationService private readonly notifications: INotificationService,
		@IStorageService private readonly storage: IStorageService,
	) {
		super();
		this.element.hidden = true;
		this.error.hidden = true;
		this.element.setAttribute('aria-label', localize('dashboardInput.label', "New dashboard work"));
		const header = $('.session-work-intake-header');
		const actions = $('.session-work-intake-actions');
		header.append(this.title, actions);
		this.title.textContent = localize('dashboardInput.new', "New work");
		const close = this._register(new Action('sessions.work.closeDraft', localize('dashboardInput.close', "Close New Work"), ThemeIcon.asClassName(Codicon.close), true, () => this.close()));
		const toolbar = this._register(instantiation.createInstance(WorkbenchToolBar, actions, { ariaLabel: localize('dashboardInput.actions', "New Work Actions") }));
		toolbar.setActions([close]);
		this.element.append(header, this.error, this.composer);
		const context = this._register(contextKeys.createScoped(this.element));
		const scoped = this._register(instantiation.createChild(new ServiceCollection(
			[IContextKeyService, context], [ISessionContext, new SessionContext(this.contextSession)],
		)));
		this._register(autorun(reader => setActiveSessionContextKeys(this.contextSession.read(reader), context, reader, changes)));
		const input = scoped.createInstance(NewChatInputWidget, {
			session: this.contextSession, layoutMode: 'embedded', getContextFolderUri: () => this.current.get()?.workspace.get()?.folders[0]?.workingDirectory,
			loading: this.busy, renderRepositoryControls: false, sessionTypePickerOptions: { persistSelection: false },
			minEditorHeight: 60, maxEditorHeight: constObservable(160), voiceRoutesWhileSessionActive: true,
			canSendRequest: derived(this, reader => this.opened.read(reader) && !this.busy.read(reader) && !this.suspended.read(reader)
				&& !!this.current.read(reader) && this.current.read(reader)?.status.read(reader) !== SessionStatus.NeedsInput),
			placeholder: localize('dashboardInput.placeholder', "What would you like to work on?"),
			historyKey: constObservable('sessions.dashboard.agentInput'),
			draft: { state: drafts.getDraft(draftResource), save: value => drafts.setDraft(draftResource, value) },
			accessibilityVerbositySetting: AccessibilityVerbositySettingId.SessionsBoard,
			sendRequest: request => this.send(request),
		});
		this._register(toDisposable(() => input.saveState()));
		this.input = this._register(input);
		input.render(this.composer, this.element);
		this._register(management.onDidReplaceSession(({ from, to }) => {
			if (isEqual(this.current.get()?.resource, from.resource)) { this.bind(to); }
		}));
		this._register(autorun(reader => {
			const session = this.current.read(reader);
			const chat = session?.mainChat.read(reader);
			if (chat) { this.wrapper.value?.setActiveChat(chat); }
			this.element.hidden = !this.opened.read(reader);
		}));
		const resize = this._register(new DisposableResizeObserver('DashboardChatInput', () => this._onDidChangeHeight.fire(), getWindow(this.element)));
		this._register(resize.observe(this.element));
	}

	async open(collectionId?: string): Promise<void> {
		this.opened.set(true, undefined);
		if (this.busy.get()) { this.focus(); return; }
		this.error.hidden = true;
		this.busy.set(true, undefined);
		try {
			const draft = this.input.getInputDraft();
			const existing = this.work.draft.get();
			const created = await this.work.start();
			this.collectionId = collectionId ?? this.storage.get(draftCollectionKey, StorageScope.WORKSPACE);
			if (this.collectionId) { this.storage.store(draftCollectionKey, this.collectionId, StorageScope.WORKSPACE, StorageTarget.MACHINE); }
			if (!existing) {
				if (!this.current.get()) { this.drafts.setDraft(draftResource, draft); }
			}
			this.bind(created);
			this.focus();
		} catch (error) { this.report(error); }
		finally { this.busy.set(false, undefined); }
	}

	private bind(session: ISession): void {
		if (this.current.get() === session) { return; }
		transaction(tx => {
			this.wrapper.value = new VisibleSession(session, session.mainChat.get());
			this.contextSession.set(this.wrapper.value, tx);
			this.current.set(session, tx);
		});
	}

	private async send(request: INewChatInputSendRequest): Promise<boolean> {
		const session = this.current.get();
		if (!session || this.busy.get()) { return false; }
		this.busy.set(true, undefined);
		this.error.hidden = true;
		const submittedDraft = this.input.getInputDraft();
		const collectionId = this.collectionId;
		try {
			if (!await this.sessions.canOpenSession(session)) { return false; }
			const committed = await this.work.send(session, request.query, request.attachments ?? []);
			if (collectionId && this.groups.getGroup(collectionId)) { this.groups.addToGroup(committed.sessionId, collectionId); }
			if (isNewChatInputDraftUnchanged(this.drafts.getDraft(draftResource).get(), submittedDraft)) {
				this.drafts.setDraft(draftResource, { inputText: '', attachments: [] });
			}
			if (this.storage.get(draftCollectionKey, StorageScope.WORKSPACE) === collectionId) {
				this.storage.remove(draftCollectionKey, StorageScope.WORKSPACE);
			}
			this.collectionId = undefined;
			status(localize('dashboardInput.sent', "Work sent. The agent will resolve the workspace and execution plan in this conversation."));
			if (!this._store.isDisposed && this.opened.get()) {
				this.bind(committed);
				this.opened.set(false, undefined);
				this._onDidClose.fire();
				try {
					await this.sessions.openSessionReview(committed, SessionReviewSection.Conversation);
				} catch (error) {
					this.notifications.error(error);
				}
			}
			return true;
		} catch (error) { this.report(error); return false; }
		finally { if (!this._store.isDisposed) { this.busy.set(false, undefined); } }
	}

	private report(error: unknown): void {
		if (!this._store.isDisposed) {
			this.error.hidden = false;
			this.error.textContent = toErrorMessage(error);
		}
		this.notifications.error(error instanceof Error ? error : toErrorMessage(error));
	}

	close(): void {
		if (!this.opened.get()) { return; }
		if (!this.busy.get()) { this.input.saveState(); }
		this.opened.set(false, undefined);
		this._onDidClose.fire();
	}
	focus(): void { this.input.focus(); }
	setSuspended(value: boolean): void { this.suspended.set(value, undefined); }
	layout(width: number): void {
		const grid = layoutSessionCards([], width);
		this.width = grid.columns >= 3 ? grid.columnWidth * 2 + SESSION_CARD_GAP : width;
		this.element.style.width = `${this.width}px`;
		this.input.layout(0, Math.max(0, this.width - 24));
	}
	getAccessibleContent(): string {
		return [this.title.textContent, this.error.hidden ? '' : this.error.textContent, this.input.getInputDraft().inputText].filter(Boolean).join('\n\n');
	}
}
