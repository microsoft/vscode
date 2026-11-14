/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { RunOnceScheduler } from '../../../../../base/common/async.js';
import { onUnexpectedError } from '../../../../../base/common/errors.js';
import { Emitter } from '../../../../../base/common/event.js';
import { Disposable, MutableDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun, derived, IObservable, observableSignalFromEvent, observableValue } from '../../../../../base/common/observable.js';
import { extUriBiasedIgnorePathCase } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { observableConfigValue, observableContextKey } from '../../../../../platform/observable/common/platformObservableUtils.js';
import { IFolderLocation, IWorkspaceFolderLocationService } from '../../../../../platform/workspace/common/folderLocations.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../common/contributions.js';
import { IWorkbenchEnvironmentService } from '../../../../services/environment/common/environmentService.js';
import { ChatContextKeys } from '../../../chat/common/actions/chatContextKeys.js';
import { ChatConfiguration } from '../../../chat/common/constants.js';
import { IAllowedFolderPresentation } from '../chat/sessionWorkspacePicker.js';
import { IEditorWindowComposerFoldersService } from '../editorWindow/editorWindowComposerFolders.js';
import { IAgentHostWorktreeSessionSource, IAgentHostWorktreeSessionSources } from '../../../chat/browser/agentSessions/agentHost/agentHostWorktreeSessionSources.js';
import { ISession } from '../../../../services/sessions/common/session.js';
import { LOCAL_AGENT_HOST_PROVIDER_ID } from '../../common/agentHostSessionsProvider.js';
import { ISessionsManagementService } from '../../common/sessionsManagement.js';

/**
 * The folders the chat part's new-session composers create their sessions in: the window's folders and, for the one local
 * folder of a window that can move, its other locations, such as its own location and the worktrees sessions work in.
 */
export class AgentHostWorktreeComposerFolders extends Disposable {

	private readonly _locations = observableValue<readonly IFolderLocation[]>(this, []);
	private readonly _folders = observableValue<readonly URI[]>(this, []);
	readonly folders: IObservable<readonly URI[]> = this._folders;

	/** Cancels the read of the locations under way, as another starts or this is disposed. */
	private readonly _refresh = this._register(new MutableDisposable());

	private readonly _onDidMoveFolder = this._register(new Emitter<{ readonly from: URI; readonly to: URI }>());
	/** Fires as the window's folder moves from one of its locations to another, such as into a worktree. */
	readonly onDidMoveFolder = this._onDidMoveFolder.event;
	/** Where the window's movable folder was, and its own location. */
	private _at: { readonly location: URI; readonly primary: URI } | undefined;

	constructor(
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
		@IWorkspaceFolderLocationService private readonly _folderLocationService: IWorkspaceFolderLocationService,
		@IAgentHostWorktreeSessionSources sessionSources: IAgentHostWorktreeSessionSources,
	) {
		super();
		this._register(_folderLocationService.onDidChangeProviders(() => this.refresh()));
		// A session can come to work in a new worktree meanwhile, such as one in the background: read once as that settles
		const refreshForSessions = this._register(new RunOnceScheduler(() => this.refresh(), 500));
		this._register(sessionSources.onDidChange(() => {
			if (this._movableFolder()) {
				refreshForSessions.schedule();
			}
		}));
		// The location the folder is at shows as one also before or without its provider's list
		this._register(_folderLocationService.onDidChangeLocation(() => this._update(this._locations.get())));
		// Also as the window's folders change, such as as the folder moves: the service tells whether it can move again then
		this._register(_folderLocationService.onDidChangeCanSetLocation(() => this._onDidChangeFolders()));
		this._at = this._location();
		this._update([]);
	}

	private _onDidChangeFolders(): void {
		const from = this._at;
		const to = this._at = this._location();
		const samePrimary = !!from && !!to && extUriBiasedIgnorePathCase.isEqual(from.primary, to.primary);
		// The location it moved to is offered at once, with the known locations, as they are read again
		this._update(samePrimary ? this._locations.get() : []);
		this.refresh();
		if (from && to && samePrimary && !extUriBiasedIgnorePathCase.isEqual(from.location, to.location)) {
			this._onDidMoveFolder.fire({ from: from.location, to: to.location });
		}
	}

	private _location(): { readonly location: URI; readonly primary: URI } | undefined {
		const folder = this._movableFolder();
		const primary = this._workspaceContextService.getWorkspace().uri;
		return folder && primary ? { location: folder.uri, primary } : undefined;
	}

	/**
	 * How a composer shows `folderUri`: a location of the window's folder by its name and branch, and, for a window whose
	 * folder can move, whether it is the folder's own location or a worktree of it, and whether the folder is there now.
	 */
	getPresentation(folderUri: URI): IAllowedFolderPresentation | undefined {
		const location = this._locations.get().find(candidate => extUriBiasedIgnorePathCase.isEqual(candidate.uri, folderUri));
		const folder = this._movableFolder();
		const workspace = this._workspaceContextService.getWorkspace();
		if (!folder || !workspace.uri) {
			return location;
		}
		// The folder's own location, and any other folder of the window, show as folders; its other locations as worktrees
		const isFolder = extUriBiasedIgnorePathCase.isEqual(folderUri, workspace.uri)
			|| workspace.folders.slice(1).some(windowFolder => extUriBiasedIgnorePathCase.isEqual(windowFolder.uri, folderUri));
		return {
			...location,
			kind: isFolder ? 'folder' : 'worktree',
			current: extUriBiasedIgnorePathCase.isEqual(folderUri, folder.uri),
		};
	}

	/** Reads the locations of the window's folder again, such as a worktree an agent created since. */
	refresh(): void {
		this._refresh.clear();
		const primary = this._movableFolder() && this._workspaceContextService.getWorkspace().uri;
		if (!primary) {
			this._update([]);
			return;
		}
		const source = new CancellationTokenSource();
		this._refresh.value = toDisposable(() => source.dispose(true));
		this._folderLocationService.getLocations(primary, source.token).then(locations => {
			if (!source.token.isCancellationRequested) {
				this._update(locations);
			}
		}, onUnexpectedError);
	}

	private _update(provided: readonly IFolderLocation[]): void {
		const workspace = this._workspaceContextService.getWorkspace();
		const folder = this._movableFolder();
		const atAlternate = !!folder && this._folderLocationService.isAtAlternateLocation(folder);
		const current = folder && atAlternate ? this._folderLocationService.getLocation(folder) : undefined;
		const locations = current && !provided.some(location => extUriBiasedIgnorePathCase.isEqual(location.uri, current.uri))
			? [current, ...provided]
			: provided;
		const folders: URI[] = workspace.folders.map(windowFolder => windowFolder.uri);
		const add = (uri: URI) => {
			if (!folders.some(candidate => extUriBiasedIgnorePathCase.isEqual(candidate, uri))) {
				folders.push(uri);
			}
		};
		// The folder's own location while it is at another, then its other locations
		if (atAlternate && workspace.uri) {
			add(workspace.uri);
		}
		for (const location of locations) {
			add(location.uri);
		}
		this._locations.set(locations, undefined);
		this._folders.set(folders, undefined);
	}

	/** The window's folder, when it can move between its locations (see `IWorkspaceFolderLocationService.canSetLocation`). */
	private _movableFolder() {
		const folder = this._workspaceContextService.getWorkspace().folders[0];
		return folder && this._folderLocationService.canSetLocation(folder) ? folder : undefined;
	}
}

/**
 * Where the local agent host sessions of the editor window's session layer (`ISessionsManagementService`) and their chats
 * work, for worktree support, which the Chat view's sessions list does not have: a session created in the chat part or
 * a Sessions view. It only nominates them; the worktree location provider decides which are locations of the folder.
 */
export class AgentHostWorktreeSessionLayerSource extends Disposable implements IAgentHostWorktreeSessionSource {

	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange = this._onDidChange.event;

	constructor(
		@ISessionsManagementService private readonly _sessionsManagementService: ISessionsManagementService,
	) {
		super();
		// As any session it knows is added, removed or changes, also one outside the listed ones (getAllSessions), and as a
		// session comes to work elsewhere, such as in the worktree its first request created
		const sessionsChanged = observableSignalFromEvent(this, _sessionsManagementService.onDidChangeSession);
		// Only as where they work changes, not as they change otherwise, such as their status, which reads no folders again
		let known: string | undefined;
		this._register(autorun(reader => {
			sessionsChanged.read(reader);
			const working: string[] = [];
			for (const session of _sessionsManagementService.getAllSessions()) {
				const local = session.providerId === LOCAL_AGENT_HOST_PROVIDER_ID && !session.isArchived.read(reader);
				const sessionDirectory = session.workspace.read(reader)?.folders[0]?.workingDirectory;
				for (const chat of session.chats.read(reader)) {
					const chatWorkspace = chat.workspace.read(reader);
					if (local) {
						working.push(`${chat.resource.toString()}=${(chatWorkspace?.folders[0]?.workingDirectory ?? sessionDirectory)?.toString()}`);
					}
				}
				if (local) {
					working.push(`*=${sessionDirectory?.toString()}`);
				}
			}
			const key = working.join('\n');
			if (known !== undefined && key !== known) {
				this._onDidChange.fire();
			}
			known = key;
		}));
	}

	getWorkingDirectory(chatResource: URI): URI | undefined {
		const found = this._sessionsManagementService.getSessionForChatResource(chatResource);
		if (!found || !isLocalAgentHostSession(found.session)) {
			return undefined;
		}
		return (found.chat.workspace.get() ?? found.session.workspace.get())?.folders[0]?.workingDirectory;
	}

	getWorkingDirectories(): readonly URI[] {
		return this._sessionsManagementService.getAllSessions()
			.filter(isLocalAgentHostSession)
			.flatMap(session => [session.workspace.get(), ...session.chats.get().map(chat => chat.workspace.get())])
			.flatMap(workspace => workspace?.folders.map(folder => folder.workingDirectory) ?? []);
	}
}

/** Whether `session` is a non-archived session of the local agent host. */
function isLocalAgentHostSession(session: ISession): boolean {
	return session.providerId === LOCAL_AGENT_HOST_PROVIDER_ID && !session.isArchived.get();
}

/**
 * While worktree support (`chat.editorWindow.enableWorktree`) and AI features are on, the editor window's new-session
 * composers, such as the chat part's and the Chat view's, also offer the locations of the window's folder, and follow the
 * folder as it moves. Neither needs nor creates the chat part.
 */
export class AgentHostWorktreeComposerFoldersContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.agentHostWorktreeComposerFolders';

	constructor(
		@IEditorWindowComposerFoldersService composerFoldersService: IEditorWindowComposerFoldersService,
		@IAgentHostWorktreeSessionSources sessionSources: IAgentHostWorktreeSessionSources,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IWorkbenchEnvironmentService environmentService: IWorkbenchEnvironmentService,
	) {
		super();
		if (environmentService.isSessionsWindow) {
			return;
		}
		const settingEnabled = observableConfigValue<boolean>(ChatConfiguration.EditorWindowEnableWorktree, false, configurationService);
		const aiEnabled = observableContextKey<boolean>(ChatContextKeys.enabled.key, contextKeyService);
		const active = derived(reader => !!settingEnabled.read(reader) && !!aiEnabled.read(reader));
		this._register(autorun(reader => {
			if (!active.read(reader)) {
				return;
			}
			// Where the sessions of the editor window's session layer work count as the folder's worktrees, and chats there follow
			reader.store.add(sessionSources.registerSource(reader.store.add(instantiationService.createInstance(AgentHostWorktreeSessionLayerSource))));
			const folders = reader.store.add(instantiationService.createInstance(AgentHostWorktreeComposerFolders));
			reader.store.add(composerFoldersService.setComposerFolderOptions(() => {
				folders.refresh();
				return { allowedFolders: folders.folders, getFolderPresentation: folderUri => folders.getPresentation(folderUri) };
			}));
			// The composers aimed at where the folder was aim at where it is now
			reader.store.add(folders.onDidMoveFolder(({ from, to }) => composerFoldersService.retargetComposerFolders(to, from)));
			folders.refresh();
		}));
	}
}

registerWorkbenchContribution2(AgentHostWorktreeComposerFoldersContribution.ID, AgentHostWorktreeComposerFoldersContribution, WorkbenchPhase.AfterRestored);
