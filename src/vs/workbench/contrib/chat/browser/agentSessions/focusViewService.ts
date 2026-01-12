/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/focusView.css';

import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { IContextKey, IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IEditorGroupsService } from '../../../../services/editor/common/editorGroupsService.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { IAgentSession } from './agentSessionsModel.js';
import { ChatViewPaneTarget, IChatWidgetService } from '../chat.js';
import { IChatSessionsService } from '../../common/chatSessionsService.js';
import { IWorkbenchLayoutService } from '../../../../services/layout/browser/layoutService.js';

//#region Focus View Service Interface

export interface IFocusViewService {
	readonly _serviceBrand: undefined;

	/**
	 * Whether focus view mode is active.
	 */
	readonly isActive: boolean;

	/**
	 * The currently active session in focus view, if any.
	 */
	readonly activeSession: IAgentSession | undefined;

	/**
	 * Event fired when focus view mode changes.
	 */
	readonly onDidChangeFocusViewMode: Event<boolean>;

	/**
	 * Enter focus view mode for the given session.
	 */
	enterFocusView(session: IAgentSession): Promise<void>;

	/**
	 * Exit focus view mode.
	 */
	exitFocusView(): Promise<void>;
}

export const IFocusViewService = createDecorator<IFocusViewService>('focusViewService');

//#endregion

//#region Focus View Service Implementation

export class FocusViewService extends Disposable implements IFocusViewService {

	declare readonly _serviceBrand: undefined;

	private _isActive = false;
	get isActive(): boolean { return this._isActive; }

	private _activeSession: IAgentSession | undefined;
	get activeSession(): IAgentSession | undefined { return this._activeSession; }

	private readonly _onDidChangeFocusViewMode = this._register(new Emitter<boolean>());
	readonly onDidChangeFocusViewMode = this._onDidChangeFocusViewMode.event;

	private readonly _inFocusViewModeContextKey: IContextKey<boolean>;
	private _backupWorkingSetId: string | undefined;

	constructor(
		@IContextKeyService contextKeyService: IContextKeyService,
		@IEditorGroupsService private readonly editorGroupsService: IEditorGroupsService,
		@ILogService private readonly logService: ILogService,
		@IChatWidgetService private readonly chatWidgetService: IChatWidgetService,
		@IChatSessionsService private readonly chatSessionsService: IChatSessionsService,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
	) {
		super();

		this._inFocusViewModeContextKey = ChatContextKeys.inFocusViewMode.bindTo(contextKeyService);
	}

	async enterFocusView(session: IAgentSession): Promise<void> {
		this.logService.trace('[FocusView] Entering focus view for session:', session.resource.toString());

		if (!this._isActive) {
			// Save current working set
			const workingSet = this.editorGroupsService.saveWorkingSet('focus-view-backup');
			this._backupWorkingSetId = workingSet.id;
		}

		// Clear editors
		await this.editorGroupsService.applyWorkingSet('empty', { preserveFocus: true });

		// Set active state
		this._isActive = true;
		this._activeSession = session;
		this._inFocusViewModeContextKey.set(true);
		this.layoutService.mainContainer.classList.add('focus-view-active');
		this._onDidChangeFocusViewMode.fire(true);

		// Open the session in the chat panel
		session.setRead(true);
		await this.chatSessionsService.activateChatSessionItemProvider(session.providerType);
		await this.chatWidgetService.openSession(session.resource, ChatViewPaneTarget, {
			title: { preferred: session.label },
			revealIfOpened: true
		});
	}

	async exitFocusView(): Promise<void> {
		if (!this._isActive) {
			return;
		}

		this.logService.trace('[FocusView] Exiting focus view');

		// Restore previous working set
		if (this._backupWorkingSetId) {
			const workingSets = this.editorGroupsService.getWorkingSets();
			const backup = workingSets.find(ws => ws.id === this._backupWorkingSetId);
			if (backup) {
				await this.editorGroupsService.applyWorkingSet(backup);
				this.editorGroupsService.deleteWorkingSet(backup);
			}
		}

		this._backupWorkingSetId = undefined;
		this._isActive = false;
		this._activeSession = undefined;
		this._inFocusViewModeContextKey.set(false);
		this.layoutService.mainContainer.classList.remove('focus-view-active');
		this._onDidChangeFocusViewMode.fire(false);
	}
}

//#endregion
