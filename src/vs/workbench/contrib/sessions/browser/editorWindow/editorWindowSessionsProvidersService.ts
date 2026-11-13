/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable } from '../../../../../base/common/lifecycle.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILifecycleService } from '../../../../services/lifecycle/common/lifecycle.js';
import { ISessionsListingScope, ISessionsProvider } from '../../common/sessionsProvider.js';
import { SessionsProvidersService } from '../sessionsProvidersService.js';
import { WorkspaceFolderRepositories } from '../workspaceFolderRepositories.js';

/**
 * The sessions providers of an editor window: every provider and session backend that registers lists only the sessions
 * of the window's folders and of their repositories (see {@link WorkspaceFolderRepositories}), whoever registers it, such
 * as the local agent host's or Copilot Cloud's. Lookups still find every session. A provider without a listing scope
 * lists every session.
 */
export class EditorWindowSessionsProvidersService extends SessionsProvidersService {

	private _listingScope: WorkspaceFolderRepositories | undefined;

	constructor(
		@ILifecycleService lifecycleService: ILifecycleService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) {
		super(lifecycleService);
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
		provider.setListingScope?.(this._getListingScope());
	}

	private _getListingScope(): ISessionsListingScope {
		this._listingScope ??= this._register(this._instantiationService.createInstance(WorkspaceFolderRepositories));
		return this._listingScope;
	}
}
