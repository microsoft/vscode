/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../../base/common/event.js';
import { Disposable, MutableDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun, derived, IObservable, observableSignal, observableSignalFromEvent, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { observableConfigValue, observableContextKey } from '../../../../../platform/observable/common/platformObservableUtils.js';
import { IUriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentity.js';
import { WorkbenchMode, WorkbenchState } from '../../../../../platform/workspace/common/workspace.js';
import { IAgentsModeService } from '../../../../services/agentsMode/common/agentsMode.js';
import { IChatEntitlementService } from '../../../../services/chat/common/chatEntitlementService.js';
import { IWorkbenchWorkspaceContextService } from '../../../../services/workspaces/common/workbenchWorkspaceContextService.js';
import { ChatContextKeys } from '../../../chat/common/actions/chatContextKeys.js';
import { SESSIONS_LIST_WORKSPACES_FILTER_SETTING } from '../../common/chatConstants.js';
import { IInboxWorkspaceFilter, SessionsListFilters } from './sessionsListFilters.js';

/**
 * Decides whether the Sessions view shows its workspace and environment bar, and scopes the window to the workspace picked in
 * it while the bar shows and while a window with folders of its own is in Agents mode: All Workspaces scopes it to no
 * workspace. A window has one Sessions view, which creates this. On dispose, or once the pick no longer scopes the window,
 * it scopes the window back, unless something else changed the scope since. When the window enters Agents mode, it starts
 * the pick on the window's own folder.
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

	/**
	 * Whether the bar's workspace pick scopes the window and the view's lists in every grouping: while {@link barShown}, and
	 * while a window with folders of its own is in Agents mode, which starts it on its folder, also with the bar hidden.
	 */
	readonly scopesWindow: IObservable<boolean>;

	/**
	 * Whether the pick is fixed: it {@link scopesWindow scopes the window} while the bar is not {@link barShown shown}, so
	 * the user cannot change it. The Inbox bar shows it read-only and Reset Filters keeps it.
	 */
	readonly scopePickFixed: IObservable<boolean>;

	/**
	 * The window's own folders while the pick {@link scopesWindow scopes the window}, which the bar offers also before they
	 * have sessions; empty otherwise.
	 */
	readonly windowWorkspaces: IObservable<readonly IInboxWorkspaceFilter[]>;

	private readonly scopeBarFilters = observableValue<SessionsListFilters | undefined>(this, undefined);
	private readonly scopeBarPickChanged = observableSignal(this);
	private readonly scopeBarFiltersListener = this._register(new MutableDisposable());

	constructor(
		@IWorkbenchWorkspaceContextService workspaceContextService: IWorkbenchWorkspaceContextService,
		@IConfigurationService configurationService: IConfigurationService,
		@IUriIdentityService uriIdentityService: IUriIdentityService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IChatEntitlementService chatEntitlementService: IChatEntitlementService,
		@IAgentsModeService private readonly agentsModeService: IAgentsModeService,
	) {
		super();
		const enabled = observableConfigValue<boolean>(SESSIONS_LIST_WORKSPACES_FILTER_SETTING, false, configurationService);
		const chatEnabled = observableContextKey<boolean>(ChatContextKeys.enabled.key, contextKeyService);
		// One signal for every switch of the window, so its state is read live and consistently: switching delegates fires
		// several events, and state derived from each of them separately would be stale while the others are delivered.
		const windowChanged = observableSignalFromEvent(this, Event.any<unknown>(workspaceContextService.onDidChangeWorkbenchState, workspaceContextService.onDidChangeWorkbenchMode, agentsModeService.onDidChange));
		this.isScopeBarWindow = derived(this, reader => {
			windowChanged.read(reader);
			return workspaceContextService.getWorkbenchMode() === WorkbenchMode.Agents || workspaceContextService.getWorkbenchState() === WorkbenchState.EMPTY;
		});
		const aiAvailable = derived(this, reader => !!chatEnabled.read(reader) && !chatEntitlementService.sentimentObs.read(reader).hidden);
		this.barShown = derived(this, reader => enabled.read(reader) && this.isScopeBarWindow.read(reader) && aiAvailable.read(reader));
		const inFolderAgentsMode = derived(this, reader => {
			windowChanged.read(reader);
			return agentsModeService.isActive && agentsModeService.windowFolders.length > 0;
		});
		this.scopesWindow = derived(this, reader => this.barShown.read(reader) || (inFolderAgentsMode.read(reader) && aiAvailable.read(reader)));
		this.scopePickFixed = derived(this, reader => this.scopesWindow.read(reader) && !this.barShown.read(reader));
		this.windowWorkspaces = derived(this, reader => this.scopesWindow.read(reader) ? agentsModeService.windowFolders.map(folder => SessionsListFilters.toLocalInboxWorkspace(folder)) : []);

		// Agents mode starts the bar on the window's own folder, or an empty window on all sessions. The pick is seeded as the
		// window is about to enter the mode: switching fires the events the scope below follows, so seeding after it would scope
		// the window to the stale pick first. Where the bar won't show, the fixed pick below is set instead: it is registered
		// before the scope, so it runs first in the same update.
		this._register(agentsModeService.onWillChange(active => {
			const filters = this.scopeBarFilters.get();
			// Only where the bar will show: a fixed pick is set below and is not the user's, so it must not replace theirs
			const willShowBar = aiAvailable.get() && enabled.get();
			if (active && filters && willShowBar) {
				filters.pickInboxWorkspace(this.getAgentsModeStartWorkspace());
			}
		}));

		// A fixed pick stays on the window's own folder: also after a restore in the mode or the setting turning off, as the pick
		// may have been widened while the bar showed. Runs before the scope below, so the window is not scoped to a stale pick first.
		// Not unfixed on dispose: the filters' list goes away with the view, and unfixing would update a list whose context key
		// service is already disposed. Replacing the filters unfixes the old ones, which then read their stored pick again
		let previousFilters: SessionsListFilters | undefined;
		let wasFixed = false;
		this._register(autorun(reader => {
			const filters = this.scopeBarFilters.read(reader);
			const sameFilters = previousFilters === filters;
			if (previousFilters && !sameFilters) {
				previousFilters.setInboxScopeFixed(false);
			}
			previousFilters = filters;
			if (!filters) {
				wasFixed = false;
				return;
			}
			const fixed = this.scopePickFixed.read(reader);
			filters.setInboxScopeFixed(fixed);
			if (fixed) {
				filters.pickInboxWorkspace(this.getAgentsModeStartWorkspace());
			} else if (sameFilters && wasFixed && this.barShown.read(reader)) {
				// The bar shows in the mode, as the setting turned on: it starts on the window's own folder, as when the
				// window enters the mode with the setting on, rather than on the pick from before the mode
				filters.pickInboxWorkspace(this.getAgentsModeStartWorkspace());
			}
			wasFixed = fixed;
		}));

		let owned = false;
		let lastScope: URI | undefined;
		let written: { readonly mode: WorkbenchMode; readonly scope: URI | undefined } | undefined;
		const reset = () => {
			if (owned) {
				owned = false;
				written = undefined;
				if (uriIdentityService.extUri.isEqual(workspaceContextService.getWorkbenchScope(), lastScope)) {
					workspaceContextService.resetWorkbenchScope();
				}
			}
		};
		this._register(autorun(reader => {
			const filters = this.scopeBarFilters.read(reader);
			if (!filters || !this.scopesWindow.read(reader)) {
				reset();
				return;
			}
			this.scopeBarPickChanged.read(reader);
			// Each mode has its own scope, so the pick applies again to the mode the window switched to
			windowChanged.read(reader);
			const workspace = filters.inboxScope.workspace;
			lastScope = workspace && workspace !== 'none' ? URI.parse(workspace.resource) : undefined;
			const mode = workspaceContextService.getWorkbenchMode();
			// Skips only a write this controller already made in this mode: a pick equal to the mode's default scope is still set explicitly
			const unchanged = owned && written?.mode === mode && uriIdentityService.extUri.isEqual(written.scope, lastScope)
				&& uriIdentityService.extUri.isEqual(workspaceContextService.getWorkbenchScope(), lastScope);
			owned = true;
			if (!unchanged) {
				written = { mode, scope: lastScope };
				workspaceContextService.setWorkbenchScope(lastScope);
			}
		}));
		this._register(toDisposable(reset));
	}

	/**
	 * Where the bar starts when the window enters Agents mode: the first folder of the window's own workspace, also of a
	 * multi-root workspace, or All Workspaces in an empty window.
	 */
	private getAgentsModeStartWorkspace(): IInboxWorkspaceFilter | undefined {
		// TEMPORARY: a multi-root workspace starts on its first folder, as the Agents window has no multi-root workspaces
		// to pick yet. Revisit once it has them; starting on All Workspaces for more than one folder is the alternative.
		const folder = this.agentsModeService.windowFolders.at(0);
		return folder && SessionsListFilters.toLocalInboxWorkspace(folder);
	}

	/** Sets the filters of the view's bar, whose workspace pick scopes the window while {@link scopesWindow}. */
	setScopeBarFilters(filters: SessionsListFilters): void {
		this.scopeBarFiltersListener.value = filters.onDidChange(() => this.scopeBarPickChanged.trigger(undefined));
		this.scopeBarFilters.set(filters, undefined);
	}
}
