/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable } from '../../../../../base/common/lifecycle.js';
import { derived } from '../../../../../base/common/observable.js';
import { ILifecycleService } from '../../../../services/lifecycle/common/lifecycle.js';
import { ISessionsListingScope, ISessionsProvider } from '../../common/sessionsProvider.js';
import { SessionsProvidersService } from '../sessionsProvidersService.js';
import { IWorkspaceFolderRepositories, WorkspaceFolderRepositories } from '../workspaceFolderRepositories.js';
import { IChatViewSessionsListService } from '../../../chat/common/chatViewSessionsListService.js';

/**
 * The sessions providers of an editor window: every provider and session backend that registers lists only the sessions
 * of the window's folders and of their repositories (see {@link WorkspaceFolderRepositories}), whoever registers it, such
 * as the local agent host's or Copilot Cloud's. Lookups still find every session. A provider without a listing scope
 * lists every session. While the window's new Sessions list scopes the sessions itself, the providers list every session.
 */
export class EditorWindowSessionsProvidersService extends SessionsProvidersService {

	private readonly _listingScope: ISessionsListingScope;

	constructor(
		@ILifecycleService lifecycleService: ILifecycleService,
		@IWorkspaceFolderRepositories repositories: IWorkspaceFolderRepositories,
		@IChatViewSessionsListService chatViewSessionsListService: IChatViewSessionsListService,
	) {
		super(lifecycleService);
		const listsAll = chatViewSessionsListService.listsAllSessions;
		this._listingScope = {
			folders: derived(this, reader => listsAll.read(reader) ? [] : repositories.folders.read(reader)),
			gitHubRepositories: derived(this, reader => listsAll.read(reader) ? [] : repositories.gitHubRepositories.read(reader)),
		};
	}

	override registerProvider(provider: ISessionsProvider): IDisposable {
		this._applyListingScope(provider);
		return super.registerProvider(provider);
	}

	override registerSessionBackend(ownerProviderId: string, backend: ISessionsProvider): IDisposable {
		this._applyListingScope(backend);
		return super.registerSessionBackend(ownerProviderId, backend);
	}

	/** Scopes the listing of `provider` before it registers, so that no consumer sees it list another session. */
	private _applyListingScope(provider: ISessionsProvider): void {
		provider.setListingScope?.(this._listingScope);
	}
}
