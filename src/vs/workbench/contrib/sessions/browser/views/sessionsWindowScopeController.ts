/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../../base/common/event.js';
import { Disposable, MutableDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun, derived, IObservable, observableFromEvent, observableSignal, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { observableConfigValue, observableContextKey } from '../../../../../platform/observable/common/platformObservableUtils.js';
import { IUriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentity.js';
import { WorkbenchMode, WorkbenchState } from '../../../../../platform/workspace/common/workspace.js';
import { IChatEntitlementService } from '../../../../services/chat/common/chatEntitlementService.js';
import { IWorkbenchWorkspaceContextService } from '../../../../services/workspaces/common/workbenchWorkspaceContextService.js';
import { ChatContextKeys } from '../../../chat/common/actions/chatContextKeys.js';
import { SESSIONS_LIST_WORKSPACES_FILTER_SETTING } from '../../common/chatConstants.js';
import { SessionsListFilters } from './sessionsListFilters.js';

/**
 * Decides whether the Sessions view shows its workspace and environment bar, and scopes the window to the workspace picked in
 * it while it shows: All Workspaces scopes it to no workspace. A window has one Sessions view, which creates this. On dispose,
 * or once the bar no longer shows, it scopes the window back, unless something else changed the scope since.
 */
export class SessionsWindowScopeController extends Disposable {

	/**
	 * Whether this window is one that shows the bar: the Agents window and empty editor windows. Folder and multi-root editor
	 * windows keep their own folders as their scope, so they show no bar. The Inbox grouping shows the bar in these windows
	 * even while {@link SESSIONS_LIST_WORKSPACES_FILTER_SETTING} is off.
	 */
	readonly isScopeBarWindow: IObservable<boolean>;

	/**
	 * Whether the view shows the bar in every grouping: {@link SESSIONS_LIST_WORKSPACES_FILTER_SETTING} is on,
	 * {@link isScopeBarWindow} holds and AI features are neither hidden nor disabled. Only then does the bar scope the window.
	 */
	readonly barShown: IObservable<boolean>;

	private readonly scopeBarFilters = observableValue<SessionsListFilters | undefined>(this, undefined);
	private readonly scopeBarPickChanged = observableSignal(this);
	private readonly scopeBarFiltersListener = this._register(new MutableDisposable());

	constructor(
		@IWorkbenchWorkspaceContextService workspaceContextService: IWorkbenchWorkspaceContextService,
		@IConfigurationService configurationService: IConfigurationService,
		@IUriIdentityService uriIdentityService: IUriIdentityService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IChatEntitlementService chatEntitlementService: IChatEntitlementService,
	) {
		super();
		const enabled = observableConfigValue<boolean>(SESSIONS_LIST_WORKSPACES_FILTER_SETTING, false, configurationService);
		const chatEnabled = observableContextKey<boolean>(ChatContextKeys.enabled.key, contextKeyService);
		this.isScopeBarWindow = observableFromEvent(this, Event.any<unknown>(workspaceContextService.onDidChangeWorkbenchState, workspaceContextService.onDidChangeWorkbenchMode),
			() => workspaceContextService.getWorkbenchMode() === WorkbenchMode.Agents || workspaceContextService.getWorkbenchState() === WorkbenchState.EMPTY);
		this.barShown = derived(this, reader => enabled.read(reader) && this.isScopeBarWindow.read(reader) && !!chatEnabled.read(reader) && !chatEntitlementService.sentimentObs.read(reader).hidden);

		let owned = false;
		let lastScope: URI | undefined;
		const reset = () => {
			if (owned) {
				owned = false;
				if (uriIdentityService.extUri.isEqual(workspaceContextService.getWorkbenchScope(), lastScope)) {
					workspaceContextService.resetWorkbenchScope();
				}
			}
		};
		this._register(autorun(reader => {
			const filters = this.scopeBarFilters.read(reader);
			if (!filters || !this.barShown.read(reader)) {
				reset();
				return;
			}
			this.scopeBarPickChanged.read(reader);
			const workspace = filters.inboxScope.workspace;
			lastScope = workspace && workspace !== 'none' ? URI.parse(workspace.resource) : undefined;
			owned = true;
			workspaceContextService.setWorkbenchScope(lastScope);
		}));
		this._register(toDisposable(reset));
	}

	/** Sets the filters of the view's bar, whose workspace pick scopes the window while {@link barShown}. */
	setScopeBarFilters(filters: SessionsListFilters): void {
		this.scopeBarFiltersListener.value = filters.onDidChange(() => this.scopeBarPickChanged.trigger(undefined));
		this.scopeBarFilters.set(filters, undefined);
	}
}
