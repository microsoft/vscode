/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, IDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun, derived, IObservable, observableFromEvent, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { InstantiationType, registerSingleton } from '../../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { IEditableWorkspaceContextService } from '../../../../services/configuration/common/configuration.js';
import { createWorkspaceScopeBarEnabled, IInboxWorkspaceFilter, LOCAL_SESSIONS_ENVIRONMENT, SessionsListFilters } from './sessionsListFilters.js';
import { basename, getComparisonKey } from '../../../../../base/common/resources.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { IAgenticModeService } from '../../../../services/agenticMode/common/agenticMode.js';
import { SESSIONS_LIST_WORKSPACES_FILTER_SETTING } from '../../common/sessionConfig.js';

/** The workspace of a local folder of the window, as the scope bar lists and picks it. */
function toWindowInboxWorkspace(folder: URI): IInboxWorkspaceFilter {
	return { environment: LOCAL_SESSIONS_ENVIRONMENT, resource: getComparisonKey(folder), label: basename(folder), description: folder.path };
}

export const ISessionsWorkbenchScopeService = createDecorator<ISessionsWorkbenchScopeService>('sessionsWorkbenchScopeService');

/**
 * Scopes the window to the workspace picked in the scope bar of its Sessions lists, as the single owner of that scope
 * while the pick scopes the window, however many lists show it.
 */
export interface ISessionsWorkbenchScopeService {
	readonly _serviceBrand: undefined;

	/**
	 * Whether the workspace picked in the scope bar of Sessions lists scopes the window and the lists in every grouping:
	 * while they show the bar in every grouping ({@link showsScopeBar}), and always while a window with a folder or
	 * workspace is in Agentic Mode, which starts on its own folder (see {@link AgenticModeSessionsScopeContribution}).
	 */
	readonly enabled: IObservable<boolean>;

	/**
	 * Whether Sessions lists show their workspace scope bar in every grouping, where the user can change the pick: see
	 * {@link createWorkspaceScopeBarEnabled}. While {@link enabled} without it, the pick stays where Agentic Mode started it.
	 */
	readonly showsScopeBar: IObservable<boolean>;

	/**
	 * Scopes the window to the workspace picked in the scope bar of `filters` while {@link enabled}, until disposed, also
	 * while the bar is hidden. The window
	 * follows the bar registered or changed last, and is scoped to no workspace again once no bar is registered or
	 * {@link enabled} turns off. "All Workspaces" and "No Workspace" scope it to no workspace, which lists all sessions.
	 * A view registers its bar again whenever it re-renders it for an unrelated reason, which makes that bar current: that
	 * is harmless only because every list of a window shows the same pick, so keep no per-bar state that depends on order.
	 */
	registerScopeBar(filters: SessionsListFilters): IDisposable;

	/**
	 * The window's own folders while {@link enabled}, which the scope bar offers also before they have sessions: the
	 * window starts scoped to one of them on entering Agentic Mode, and new sessions start there. Empty otherwise.
	 */
	readonly windowWorkspaces: IObservable<readonly IInboxWorkspaceFilter[]>;
}

export class SessionsWorkbenchScopeService extends Disposable implements ISessionsWorkbenchScopeService {

	declare readonly _serviceBrand: undefined;

	readonly enabled: IObservable<boolean>;
	readonly showsScopeBar: IObservable<boolean>;
	readonly windowWorkspaces: IObservable<readonly IInboxWorkspaceFilter[]>;

	private readonly bars: SessionsListFilters[] = [];
	/** The bar the window follows, in a new object on each of its changes. */
	private readonly current = observableValue<{ readonly filters: SessionsListFilters } | undefined>(this, undefined);

	constructor(
		@IWorkspaceContextService workspaceContextService: IWorkspaceContextService & Partial<Pick<IEditableWorkspaceContextService, 'setWorkbenchScope'>>,
		@IConfigurationService configurationService: IConfigurationService,
		@IAgenticModeService agenticModeService: IAgenticModeService,
	) {
		super();
		this.showsScopeBar = createWorkspaceScopeBarEnabled(this, workspaceContextService, configurationService);
		const inFolderAgenticMode = observableFromEvent(this, agenticModeService.onDidChange, () => isInFolderAgenticMode(agenticModeService));
		this.enabled = derived(this, reader => this.showsScopeBar.read(reader) || inFolderAgenticMode.read(reader));
		this.windowWorkspaces = derived(this, reader => this.enabled.read(reader) ? agenticModeService.windowFolders.map(toWindowInboxWorkspace) : []);
		// Whether this service set the scope, so that it never touches a scope it did not set
		let scoped = false;
		const unscope = () => {
			if (scoped) {
				scoped = false;
				workspaceContextService.setWorkbenchScope?.(undefined);
			}
		};
		this._register(autorun(reader => {
			const current = this.current.read(reader);
			if (!this.enabled.read(reader) || !current) {
				unscope();
				return;
			}
			scoped = true;
			const workspace = current.filters.inboxScope.workspace;
			workspaceContextService.setWorkbenchScope?.(workspace && workspace !== 'none' ? URI.parse(workspace.resource) : undefined);
		}));
		this._register(toDisposable(unscope));
	}

	registerScopeBar(filters: SessionsListFilters): IDisposable {
		this.bars.push(filters);
		this.current.set({ filters }, undefined);
		const listener = filters.onDidChange(() => this.current.set({ filters }, undefined));
		return toDisposable(() => {
			listener.dispose();
			const index = this.bars.indexOf(filters);
			if (index < 0) {
				return;
			}
			this.bars.splice(index, 1);
			if (this.current.get()?.filters === filters) {
				const last = this.bars.at(-1);
				this.current.set(last ? { filters: last } : undefined, undefined);
			}
		});
	}
}

/** Whether the window is in Agentic Mode with a folder or workspace of its own, which scopes it to that workspace. */
function isInFolderAgenticMode(agenticModeService: IAgenticModeService): boolean {
	return agenticModeService.isActive && agenticModeService.windowFolders.length > 0;
}

/**
 * Where the Sessions list of a window starts when the window enters Agentic Mode: the first folder of its own workspace,
 * also of a multi-root workspace, or all sessions in an empty window.
 */
export function getAgenticModeStartFolder(windowFolders: readonly URI[]): URI | undefined {
	// TEMPORARY: a multi-root workspace starts on its first folder, as the Agents window has no multi-root workspaces
	// to pick yet. Revisit once it has them; returning `undefined` for more than one folder would start on All Workspaces.
	return windowFolders[0];
}

/**
 * Starts the Sessions lists of a window that enters Agentic Mode on the sessions of its own workspace: it picks
 * {@link getAgenticModeStartFolder} in their workspace scope bar, which scopes the window to it, whether or not
 * {@link SESSIONS_LIST_WORKSPACES_FILTER_SETTING} shows the bar. With the setting on, the user can pick All Workspaces
 * there; with it off, the pick stays on the folder until the window leaves the mode, so a window that restores in the
 * mode starts on its folder again. An empty window starts on All Workspaces.
 */
export class AgenticModeSessionsScopeContribution extends Disposable {

	static readonly ID = 'workbench.contrib.agenticModeSessionsScope';

	constructor(
		@IAgenticModeService agenticModeService: IAgenticModeService,
		@IConfigurationService configurationService: IConfigurationService,
		@IStorageService storageService: IStorageService,
		@ILogService logService: ILogService,
	) {
		super();
		const start = () => {
			const folder = getAgenticModeStartFolder(agenticModeService.windowFolders);
			SessionsListFilters.storeInboxWorkspace(storageService, logService, folder && toWindowInboxWorkspace(folder));
		};
		// Restored in the mode without the bar: the window's pick may have been widened while the setting was on, and the bar can no longer change it
		if (isInFolderAgenticMode(agenticModeService) && configurationService.getValue(SESSIONS_LIST_WORKSPACES_FILTER_SETTING) !== true) {
			start();
		}
		this._register(agenticModeService.onDidChange(active => {
			if (active && (agenticModeService.windowFolders.length > 0 || configurationService.getValue(SESSIONS_LIST_WORKSPACES_FILTER_SETTING) === true)) {
				start();
			}
		}));
	}
}

registerSingleton(ISessionsWorkbenchScopeService, SessionsWorkbenchScopeService, InstantiationType.Delayed);
