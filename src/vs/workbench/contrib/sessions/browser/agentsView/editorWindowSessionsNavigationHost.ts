/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { constObservable, IObservable } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { ISessionGridPane } from '../../../../services/sessions/browser/sessionGridPane.js';
import { ISessionHost } from '../../../../services/sessions/browser/sessionHost.js';
import { IChat, ISession } from '../../../../services/sessions/common/session.js';
import { ISessionsManagementService } from '../../common/sessionsManagement.js';
import { ISessionsNavigationService } from '../sessionsNavigationService.js';
import type { IOpenChatOptions, IOpenSessionOptions } from '../sessionsService.js';
import { IEditorWindowSessionsPresenterService } from '../editorWindow/editorWindowSessionsPresenter.js';
import { IAgentsViewProvidersService } from './agentsViewProviders.js';
import { LatestSessionOpen, prepareSessionForOpen, resolveSessionForOpen } from '../sessionOpen.js';
import { ISessionsProvidersService } from '../sessionsProvidersService.js';
import { IWorkspaceTrustManagementService, IWorkspaceTrustRequestService } from '../../../../../platform/workspace/common/workspaceTrust.js';
import { requestSessionWorkspaceTrust } from '../../../../services/sessions/browser/worktreeTrust.js';

/**
 * The navigation of an editor window: sessions and chats open where its presenter shows them (see
 * `IEditorWindowSessionsPresenterService`), such as tabs of the chat part. The window has no grid of sessions: the
 * presenter's active chat is its active session.
 */
export class EditorWindowSessionsNavigationHost extends Disposable implements ISessionsNavigationService {

	declare readonly _serviceBrand: undefined;

	readonly slotPanes: IObservable<readonly ISessionGridPane[]> = constObservable([]);

	constructor(
		@IEditorWindowSessionsPresenterService private readonly _presenterService: IEditorWindowSessionsPresenterService,
		@ISessionHost private readonly _mainWindowHost: ISessionHost,
		@ISessionsManagementService private readonly _sessionsManagementService: ISessionsManagementService,
		@IAgentsViewProvidersService private readonly _providers: IAgentsViewProvidersService,
		@IWorkspaceTrustManagementService private readonly _workspaceTrustManagementService: IWorkspaceTrustManagementService,
		@IWorkspaceTrustRequestService private readonly _workspaceTrustRequestService: IWorkspaceTrustRequestService,
		@ISessionsProvidersService private readonly _sessionsProvidersService: ISessionsProvidersService,
	) {
		super();
	}

	/** What shows the chats of sessions: the chat part, while a feature shows them there, or the Chat view. */
	private get _presenter() {
		return this._presenterService.presenter.get();
	}

	get mainWindowHost(): ISessionHost {
		return this._mainWindowHost;
	}

	/** The latest open, which a later one cancels, as disposing this does: an open shows its session only while it is the latest. */
	private readonly _open = this._register(new LatestSessionOpen());

	async openSession(sessionResource: URI, options?: IOpenSessionOptions): Promise<void> {
		// A later open supersedes this one while it resolves, waits for or prepares its session: the user's latest pick shows
		const token = this._open.start();
		// Its session is known only while the providers are held: until it shows, such as in the chat part, which holds them then
		const hold = this._providers.acquire();
		try {
			const session = await resolveSessionForOpen(this._sessionsManagementService, this._sessionsProvidersService, sessionResource, token);
			if (session) {
				await this._presenter.openChat(session, undefined, { preserveFocus: options?.preserveFocus });
			}
		} finally {
			hold.dispose();
		}
	}

	async openSessionToSide(session: ISession, options?: IOpenSessionOptions): Promise<void> {
		await prepareSessionForOpen(this._sessionsProvidersService, session);
		await this._presenter.openChat(session, undefined, { preserveFocus: options?.preserveFocus, sideBySide: true });
	}

	async openChat(session: ISession, chatUri: URI, options?: IOpenChatOptions): Promise<void> {
		// A later open, also of a session, supersedes this one while its session prepares, so that the user's latest pick shows
		const token = this._open.start();
		await prepareSessionForOpen(this._sessionsProvidersService, session);
		if (!token.isCancellationRequested) {
			await this._presenter.openChat(session, chatUri, { preserveFocus: options?.preserveFocus });
		}
	}

	async openChatToSide(session: ISession, chatResource: URI, options?: { readonly preserveFocus?: boolean }): Promise<void> {
		await prepareSessionForOpen(this._sessionsProvidersService, session);
		await this._presenter.openChat(session, chatResource, { preserveFocus: options?.preserveFocus, sideBySide: true });
	}

	/** Whether the user trusts every folder the session works in, as the Agents window asks before it opens a session. */
	async canOpenSession(session: ISession): Promise<boolean> {
		const workspace = session.workspace.get();
		return requestSessionWorkspaceTrust(workspace, () => workspace && this._sessionsManagementService.getRemoteHostLabel(workspace, session.providerId), this._workspaceTrustManagementService, this._workspaceTrustRequestService);
	}

	focusActiveSession(): void {
		this._presenter.focus();
	}

	async closeArchivedChat(_session: ISession, chat: IChat): Promise<void> {
		await this._presenter.closeChat(chat.resource);
	}
}
