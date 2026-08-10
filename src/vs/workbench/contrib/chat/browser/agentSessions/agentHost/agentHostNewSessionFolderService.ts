/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../../../base/common/event.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../../../base/common/map.js';
import { extUriBiasedIgnorePathCase, type IExtUri } from '../../../../../../base/common/resources.js';
import { URI } from '../../../../../../base/common/uri.js';
import { createDecorator } from '../../../../../../platform/instantiation/common/instantiation.js';
import { InstantiationType, registerSingleton } from '../../../../../../platform/instantiation/common/extensions.js';
import { IWorkspaceContextService } from '../../../../../../platform/workspace/common/workspace.js';
import { RootState } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { IChatService } from '../../../common/chatService/chatService.js';

export const IAgentHostNewSessionFolderService = createDecorator<IAgentHostNewSessionFolderService>('agentHostNewSessionFolderService');

/**
 * Computes the ordered working-directory set for a new agent-host session:
 * `[primary, …otherWorkspaceFolders]`, with the primary at index 0. The other
 * workspace folders are included only when the primary is itself a workspace
 * folder and `provider` advertises the `multipleWorkingDirectories` capability
 * in `rootState`; otherwise (single-folder workspace, a standalone primary,
 * unadvertised capability, or an unavailable root state) just `[primary]` is
 * returned. Support is opt-in per the {@link AgentCapabilities} convention, and
 * the node-side guard remains the authoritative backstop. Returns `undefined`
 * when no primary was chosen.
 */
export function computeWorkingDirectories(primary: URI | undefined, workspaceFolders: readonly URI[], rootState: RootState | Error | undefined, provider: string): readonly URI[] | undefined {
	if (!primary) {
		return undefined;
	}
	const supportsMultiple = supportsMultipleWorkingDirectories(rootState, provider);
	if (!supportsMultiple || !workspaceFolders.some(folder => extUriBiasedIgnorePathCase.isEqual(folder, primary))) {
		return [primary];
	}
	return computeDesiredWorkingDirectories(primary, [primary], workspaceFolders);
}

export function supportsMultipleWorkingDirectories(rootState: RootState | Error | undefined, provider: string): boolean {
	const agent = (rootState && !(rootState instanceof Error)) ? rootState.agents.find(a => a.provider === provider) : undefined;
	return !!agent?.capabilities?.multipleWorkingDirectories;
}

/**
 * Whether `provider` pins its first working directory as a fixed process root
 * (`multipleWorkingDirectories.immutablePrimary`). Agents without it treat every
 * working directory as an equal peer.
 */
export function hasImmutablePrimaryWorkingDirectory(rootState: RootState | Error | undefined, provider: string): boolean {
	const agent = (rootState && !(rootState instanceof Error)) ? rootState.agents.find(a => a.provider === provider) : undefined;
	return agent?.capabilities?.multipleWorkingDirectories?.immutablePrimary === true;
}

/**
 * Computes the working-directory set a session should have for the current
 * workspace, as `[primary, ...secondaries]`.
 *
 * A secondary is kept only while it remains a workspace folder, so folders the
 * user removed drop out. Folders the user added are appended. The primary is
 * never dropped, even when it is no longer a workspace folder — an agent's
 * process root is fixed once the session starts.
 *
 * Ordering is stable rather than meaningful: retained secondaries keep their
 * existing order and newly added folders follow workspace order, so an
 * unchanged workspace always recomputes an identical set.
 */
export function computeDesiredWorkingDirectories(
	primary: URI,
	currentWorkingDirectories: readonly URI[],
	workspaceFolders: readonly URI[],
	extUri: IExtUri = extUriBiasedIgnorePathCase,
): readonly URI[] {
	const desired: URI[] = [primary];
	const addIfWorkspaceSecondary = (candidate: URI) => {
		const alreadyIncluded = desired.some(existing => extUri.isEqual(existing, candidate));
		if (alreadyIncluded || !workspaceFolders.some(folder => extUri.isEqual(folder, candidate))) {
			return;
		}
		desired.push(candidate);
	};

	// Retained secondaries first so their existing order survives, then any
	// folder the workspace gained since the set was last computed.
	for (const currentSecondary of currentWorkingDirectories.slice(1)) {
		addIfWorkspaceSecondary(currentSecondary);
	}
	for (const folder of workspaceFolders) {
		addIfWorkspaceSecondary(folder);
	}
	return desired;
}

/**
 * Per-window store of the working directory a user picked for a not-yet-started
 * agent-host session, keyed by the chat session resource it was picked against
 * (including the untitled compose resource). An agent-host session's working
 * directory is an argument to session creation and is immutable afterwards, so
 * in a multi-root window the Folder picker chip records the choice here and the
 * working-directory resolution sites consult it before falling back to the
 * first workspace folder. Keying by the compose resource lets the choice
 * survive the untitled-to-real rebind that happens when the session is created.
 */
export interface IAgentHostNewSessionFolderService {
	readonly _serviceBrand: undefined;

	/**
	 * Fires with the session resource whose chosen folder changed.
	 */
	readonly onDidChangeFolder: Event<URI>;

	/**
	 * The folder chosen for the given session resource, or `undefined` if the
	 * user has not made an explicit choice.
	 */
	getFolder(sessionResource: URI): URI | undefined;

	/**
	 * Record the folder chosen for the given session resource. Fires
	 * {@link onDidChangeFolder} when the value actually changes.
	 */
	setFolder(sessionResource: URI, folder: URI): void;

	/**
	 * Forget any choice recorded for the given session resource.
	 */
	clear(sessionResource: URI): void;

	/**
	 * The most recently chosen folder in this window (across all sessions),
	 * provided it is still a current workspace folder, or `undefined` if the
	 * user has never made an explicit choice (or it is no longer in the
	 * workspace). Unlike {@link getFolder} this is a window-level "sticky"
	 * default that survives session disposal, so a new chat defaults to the
	 * folder the user last picked instead of resetting to the first folder.
	 */
	getDefaultFolder(): URI | undefined;
}

export class AgentHostNewSessionFolderService extends Disposable implements IAgentHostNewSessionFolderService {
	declare readonly _serviceBrand: undefined;

	private readonly _folders = new ResourceMap<URI>();

	/**
	 * The most recently chosen folder in this window. Window-level "sticky"
	 * default that, unlike {@link _folders}, is not cleared on session
	 * disposal so a new chat can default to the user's last folder choice.
	 */
	private _defaultFolder: URI | undefined;

	private readonly _onDidChangeFolder = this._register(new Emitter<URI>());
	readonly onDidChangeFolder = this._onDidChangeFolder.event;

	constructor(
		@IChatService chatService: IChatService,
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
	) {
		super();

		// Forget a session's chosen folder once the session is disposed. This
		// bounds the store to live sessions while keeping the choice available
		// for the session's whole lifetime (so the Folder chip keeps showing
		// the right folder after the session has started). The window-level
		// default ({@link _defaultFolder}) is intentionally left untouched.
		this._register(chatService.onDidDisposeSession(e => {
			for (const sessionResource of e.sessionResources) {
				this.clear(sessionResource);
			}
		}));
	}

	getFolder(sessionResource: URI): URI | undefined {
		return this._folders.get(sessionResource);
	}

	setFolder(sessionResource: URI, folder: URI): void {
		this._defaultFolder = folder;
		const existing = this._folders.get(sessionResource);
		if (existing?.toString() === folder.toString()) {
			return;
		}
		this._folders.set(sessionResource, folder);
		this._onDidChangeFolder.fire(sessionResource);
	}

	clear(sessionResource: URI): void {
		if (this._folders.delete(sessionResource)) {
			this._onDidChangeFolder.fire(sessionResource);
		}
	}

	getDefaultFolder(): URI | undefined {
		const stored = this._defaultFolder;
		if (stored && this._workspaceContextService.getWorkspace().folders.some(folder => extUriBiasedIgnorePathCase.isEqual(folder.uri, stored))) {
			return stored;
		}
		return undefined;
	}
}

registerSingleton(IAgentHostNewSessionFolderService, AgentHostNewSessionFolderService, InstantiationType.Delayed);
