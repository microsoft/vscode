/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../../../base/common/event.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../../../base/common/map.js';
import { extUriBiasedIgnorePathCase } from '../../../../../../base/common/resources.js';
import { URI } from '../../../../../../base/common/uri.js';
import { createDecorator } from '../../../../../../platform/instantiation/common/instantiation.js';
import { InstantiationType, registerSingleton } from '../../../../../../platform/instantiation/common/extensions.js';
import { IWorkspaceContextService } from '../../../../../../platform/workspace/common/workspace.js';
import { IChatService } from '../../../common/chatService/chatService.js';

export const IAgentHostNewSessionFolderService = createDecorator<IAgentHostNewSessionFolderService>('agentHostNewSessionFolderService');

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
