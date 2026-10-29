/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { raceCancellation } from '../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { isCancellationError } from '../../../../base/common/errors.js';
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, derived, IObservable, observableSignalFromEvent, observableValue, waitForState } from '../../../../base/common/observable.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { AgentsWindowOpenSource } from '../../../../platform/window/common/window.js';
import { AgentsWindowUsage } from '../../../../workbench/contrib/chat/common/agentsWindowUsage.js';
import { IChatEntitlementService } from '../../../../workbench/services/chat/common/chatEntitlementService.js';
import { ILifecycleService, LifecyclePhase } from '../../../../workbench/services/lifecycle/common/lifecycle.js';
import { Parts } from '../../../../workbench/services/layout/browser/layoutService.js';
import { isPhoneLayout } from '../../../browser/parts/mobile/mobileLayout.js';
import { IAgentWorkbenchLayoutService } from '../../../browser/workbench.js';
import { ISessionNavigationRequest, ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { SessionStatus } from '../../../services/sessions/common/session.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { groupByDate, SessionsSorting, sortSessions } from '../../sessions/browser/views/sessionsList.js';
import { INewSessionComposerService } from './newSessionComposerService.js';

export const INewSessionFirstLaunchService = createDecorator<INewSessionFirstLaunchService>('newSessionFirstLaunchService');
const FIRST_LAUNCH_PRESENTED_KEY = 'agents.firstLaunch.presented';

export interface INewSessionFirstLaunchService {
	readonly _serviceBrand: undefined;
	readonly sessionCount: IObservable<number>;
	readonly visible: IObservable<boolean>;
	start(source: AgentsWindowOpenSource, hasSessionOrDraft: boolean, token: CancellationToken, editorHasSessions?: boolean): Promise<void>;
	cancel(): void;
	markPresented(): void;
}

/** Presents the first Editor entry-point visit without changing subsequent launch or handoff behavior. */
export class NewSessionFirstLaunchService extends Disposable implements INewSessionFirstLaunchService {
	declare readonly _serviceBrand: undefined;
	private readonly _enabled = observableValue(this, false);
	private readonly _launch = this._register(new MutableDisposable<DisposableStore>());
	private _editorHasSessions: boolean | undefined;
	private _layoutCollapsed = false;
	private _presented = false;
	private _navigationRequest: ISessionNavigationRequest | undefined;
	private _draftInputVersion = 0;
	private _userNavigationVersion = 0;
	readonly sessionCount: IObservable<number>;
	readonly visible: IObservable<boolean>;

	constructor(
		@ISessionsManagementService private readonly sessionsManagementService: ISessionsManagementService,
		@ISessionsService private readonly sessionsService: ISessionsService,
		@IStorageService private readonly storageService: IStorageService,
		@INewSessionComposerService private readonly composerService: INewSessionComposerService,
		@ILifecycleService private readonly lifecycleService: ILifecycleService,
		@IAgentWorkbenchLayoutService private readonly layoutService: IAgentWorkbenchLayoutService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IChatEntitlementService private readonly chatEntitlementService: IChatEntitlementService,
	) {
		super();
		const sessionsChanged = observableSignalFromEvent(this, sessionsManagementService.onDidChangeSessions);
		const configurationChanged = observableSignalFromEvent(this, configurationService.onDidChangeConfiguration);
		const canPresent = derived(this, reader => {
			configurationChanged.read(reader);
			if (!this._enabled.read(reader)
				|| this.sessionsService.navigationRequest.read(reader) !== this._navigationRequest
				|| this.composerService.userNavigationVersion.read(reader) !== this._userNavigationVersion
				|| this.sessionsService.activeSession.read(reader)?.isCreated.read(reader)
				|| this.chatEntitlementService.sentimentObs.read(reader).hidden
				|| this.configurationService.getValue<boolean>('chat.disableAIFeatures') === true) {
				return false;
			}
			if (!this._presented) {
				// Composer mounting and rebinding also change inputVersion, without any user input.
				this.composerService.inputVersion.read(reader);
				if (this.composerService.draftInputVersion.read(reader) !== this._draftInputVersion || this.composerService.hasDraftInput === true) {
					return false;
				}
			}
			return true;
		});
		this.sessionCount = derived(this, reader => {
			if (!canPresent.read(reader)) {
				return 0;
			}
			sessionsChanged.read(reader);
			const sessions = this.sessionsManagementService.getSessions().filter(session =>
				session.application.read(reader).id === 'vscode'
				&& !session.isArchived.read(reader)
				&& !session.isAutomation?.read(reader)
				&& session.status.read(reader) !== SessionStatus.Untitled
			);
			for (const session of sessions) {
				session.updatedAt.read(reader);
			}
			return groupByDate(sortSessions(sessions, SessionsSorting.Updated), SessionsSorting.Updated)
				.find(section => section.id === 'recent')?.sessions.length ?? 0;
		});
		this.visible = derived(this, reader => canPresent.read(reader) && (this._editorHasSessions ?? this.sessionCount.read(reader) > 0));
		this._register(autorun(reader => {
			if (!this.visible.read(reader) || this._layoutCollapsed) {
				return;
			}
			this._layoutCollapsed = true;
			const suppression = this.layoutService.suppressEditorPartAutoVisibility();
			try {
				for (const part of [Parts.SIDEBAR_PART, Parts.AUXILIARYBAR_PART, Parts.EDITOR_PART, Parts.PANEL_PART]) {
					this.layoutService.setPartHidden(true, part);
				}
			} finally {
				suppression.dispose();
			}
		}));
	}

	markPresented(): void {
		if (!this._presented && this.visible.get()) {
			this._presented = true;
			this.storageService.store(FIRST_LAUNCH_PRESENTED_KEY, true, StorageScope.APPLICATION, StorageTarget.MACHINE);
		}
	}

	cancel(): void {
		this._launch.clear();
		this._enabled.set(false, undefined);
		if (!this._presented) {
			this._layoutCollapsed = false;
		}
	}

	async start(source: AgentsWindowOpenSource, hasSessionOrDraft: boolean, token: CancellationToken, editorHasSessions?: boolean): Promise<void> {
		if (token.isCancellationRequested || this._store.isDisposed) {
			return;
		}
		this.cancel();
		if (this.storageService.getBoolean(FIRST_LAUNCH_PRESENTED_KEY, StorageScope.APPLICATION, false) || new AgentsWindowUsage(this.storageService).createdSessionCount > 0
			|| hasSessionOrDraft || isPhoneLayout(this.layoutService)
			|| ![AgentsWindowOpenSource.TitleBar, AgentsWindowOpenSource.ChatTitleBar, AgentsWindowOpenSource.CommandPalette, AgentsWindowOpenSource.KeyboardShortcut].includes(source)) {
			return;
		}
		this._editorHasSessions = editorHasSessions;
		this._navigationRequest = this.sessionsService.navigationRequest.get();
		this._draftInputVersion = this.composerService.draftInputVersion.get();
		this._userNavigationVersion = this.composerService.userNavigationVersion.get();
		const store = new DisposableStore();
		this._launch.value = store;
		const cancellation = new CancellationTokenSource(token);
		store.add(toDisposable(() => cancellation.dispose(true)));
		store.add(cancellation.token.onCancellationRequested(() => this._enabled.set(false, undefined)));
		try {
			await raceCancellation(this.lifecycleService.when(LifecyclePhase.Restored), cancellation.token);
			if (cancellation.token.isCancellationRequested) {
				return;
			}
			await waitForState(this.sessionsService.initialRestoreComplete, complete => complete, undefined, cancellation.token);
			if (!cancellation.token.isCancellationRequested) {
				this._enabled.set(true, undefined);
			}
		} catch (error) {
			if (!isCancellationError(error)) {
				throw error;
			}
		}
	}
}

registerSingleton(INewSessionFirstLaunchService, NewSessionFirstLaunchService, InstantiationType.Delayed);
