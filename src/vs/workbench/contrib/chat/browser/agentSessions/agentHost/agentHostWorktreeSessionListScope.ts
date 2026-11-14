/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler } from '../../../../../../base/common/async.js';
import { CancellationTokenSource } from '../../../../../../base/common/cancellation.js';
import { onUnexpectedError } from '../../../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { Disposable, MutableDisposable, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../../base/common/network.js';
import { extUriBiasedIgnorePathCase } from '../../../../../../base/common/resources.js';
import { URI } from '../../../../../../base/common/uri.js';
import { getRepositoryRootFromWorktree } from '../../../../../../platform/agentHost/common/worktreePaths.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IWorkspaceFolderLocationService } from '../../../../../../platform/workspace/common/folderLocations.js';
import { IWorkspaceContextService } from '../../../../../../platform/workspace/common/workspace.js';
import { ChatConfiguration } from '../../../common/constants.js';
import { IAgentHostSessionListScope } from './agentHostSessionListStore.js';
import { IAgentHostWorktreeSessionSources } from './agentHostWorktreeSessionSources.js';

/**
 * While worktree support (`chat.editorWindow.enableWorktree`) is on, the Chat view's sessions list also lists the sessions
 * of the git repositories of the window's folders, as the Sessions list does: those of the repository a session reports,
 * and those working in a worktree of one, by the `<repository>.worktrees/<name>` path that VS Code gives its worktrees, or
 * as a location of the window's folder that git proves one, such as a worktree elsewhere. Also sessions another window's
 * agent host owns, which report only their worktree. Off, it lists no more than the sessions working in the folders.
 */
export class AgentHostWorktreeSessionListScope extends Disposable implements IAgentHostSessionListScope {

	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange: Event<void> = this._onDidChange.event;

	private _enabled: boolean;
	/** The locations of the window's folder, such as its worktrees: kept until a read of them completes, so nothing drops out meanwhile. */
	private _locations: readonly URI[] = [];
	private readonly _read = this._register(new MutableDisposable());
	private readonly _readSoon = this._register(new RunOnceScheduler(() => this._readLocations(), 500));

	constructor(
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
		@IWorkspaceFolderLocationService private readonly _folderLocationService: IWorkspaceFolderLocationService,
		@IAgentHostWorktreeSessionSources sessionSources: IAgentHostWorktreeSessionSources,
	) {
		super();
		this._enabled = this._isEnabled();
		this._register(_configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(ChatConfiguration.EditorWindowEnableWorktree) && this._isEnabled() !== this._enabled) {
				this._enabled = !this._enabled;
				this._locations = [];
				this._onDidChange.fire();
				this._readLocations();
			}
		}));
		this._register(_folderLocationService.onDidChangeProviders(() => this._readLocations()));
		this._register(_folderLocationService.onDidChangeLocation(() => this._readLocations()));
		this._register(_workspaceContextService.onDidChangeWorkspaceFolders(() => this._readLocations()));
		// A session can come to work in a new worktree meanwhile: read once as the sessions settle
		this._register(sessionSources.onDidChange(() => {
			if (this._enabled) {
				this._readSoon.schedule();
			}
		}));
		this._readLocations();
	}

	includes(workingDirectories: readonly URI[], project: URI | undefined): boolean {
		if (!this._enabled) {
			return false;
		}
		const repositories = this._repositories();
		if (!repositories.length) {
			return false;
		}
		const isRepository = (uri: URI | undefined) => !!uri && repositories.some(repository => extUriBiasedIgnorePathCase.isEqual(repository, uri));
		const repositoryOf = (uri: URI) => uri.scheme === Schemas.file ? getRepositoryRootFromWorktree(uri) : undefined;
		// Its repository, or, as a session that another window's agent host owns reports, its worktree as its project
		if (project && (isRepository(project) || isRepository(repositoryOf(project)))) {
			return true;
		}
		return workingDirectories.some(directory => isRepository(repositoryOf(directory))
			|| this._locations.some(location => extUriBiasedIgnorePathCase.isEqualOrParent(directory, location)));
	}

	private _isEnabled(): boolean {
		return this._configurationService.getValue<boolean>(ChatConfiguration.EditorWindowEnableWorktree) === true;
	}

	/** The repositories of the window's folders: each folder, the folder's own location, and the repository of a worktree. */
	private _repositories(): URI[] {
		const workspace = this._workspaceContextService.getWorkspace();
		const repositories: URI[] = [];
		const add = (uri: URI | undefined) => {
			if (uri && !repositories.some(known => extUriBiasedIgnorePathCase.isEqual(known, uri))) {
				repositories.push(uri);
			}
		};
		for (const folder of workspace.folders) {
			add(folder.uri);
			add(folder.uri.scheme === Schemas.file ? getRepositoryRootFromWorktree(folder.uri) : undefined);
		}
		if (!workspace.configuration) {
			add(workspace.uri);
		}
		return repositories;
	}

	/** Reads the locations of the window's folder again, once per change, not per session. */
	private _readLocations(): void {
		this._readSoon.cancel();
		const workspace = this._workspaceContextService.getWorkspace();
		const folder = workspace.folders[0];
		const primary = workspace.uri;
		if (!this._enabled || !folder || !primary || !this._folderLocationService.canSetLocation(folder)) {
			this._read.clear();
			this._setLocations([]);
			return;
		}
		const source = new CancellationTokenSource();
		this._read.value = toDisposable(() => source.dispose(true));
		this._folderLocationService.getLocations(primary, source.token).then(locations => {
			if (!source.token.isCancellationRequested) {
				this._setLocations(locations.map(location => location.uri));
			}
		}, onUnexpectedError);
	}

	private _setLocations(locations: readonly URI[]): void {
		const same = locations.length === this._locations.length && locations.every(location => this._locations.some(known => extUriBiasedIgnorePathCase.isEqual(known, location)));
		if (!same) {
			this._locations = locations;
			this._onDidChange.fire();
		}
	}
}
