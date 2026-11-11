/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../../base/common/codicons.js';
import { Event } from '../../../../../base/common/event.js';
import { combinedDisposable, IDisposable } from '../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../base/common/network.js';
import { derived, derivedOpts, IObservable, IReader, observableSignalFromEvent } from '../../../../../base/common/observable.js';
import { basename, extUriBiasedIgnorePathCase, isEqual } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize, localize2 } from '../../../../../nls.js';
import { Action2, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { getSessionPresentationWorkspace, ISession } from '../../../../services/sessions/common/session.js';
import { ChatContextKeys } from '../../../chat/common/actions/chatContextKeys.js';
import { ISessionsManagementService } from '../../common/sessionsManagement.js';
import { getSessionsInScopeFolders } from '../sessionScope.js';
import { ISessionReadOnlyBannerContent } from './sessionReadOnlyBanner.js';

export const SWITCH_TO_SESSION_FOLDER_COMMAND_ID = 'workbench.action.agentsView.switchToSessionFolder';
export const SWITCH_TO_SESSION_WORKTREE_COMMAND_ID = 'workbench.action.agentsView.switchToSessionWorktree';

/** The local folder a session works in, outside the folders of a window's workspace. */
export interface ISessionFolderOutsideScope {
	/** The session's working directory: its git worktree, or else its folder. */
	readonly folder: URI;
	/** Whether {@link folder} is a git worktree of another checkout. */
	readonly isWorktree: boolean;
}

/**
 * The local folder `session` works in when it is outside `scopeFolders`, as the Sessions list of the same window scopes
 * its sessions (see {@link getSessionsInScopeFolders}, which `sessions`, the sessions the list knows, feed). `undefined`
 * without scope folders, for a session without a local folder, such as a cloud or remote one, and for one in scope.
 */
export function getSessionFolderOutsideScope(session: ISession, scopeFolders: readonly URI[], sessions: readonly ISession[], reader: IReader | undefined): ISessionFolderOutsideScope | undefined {
	if (scopeFolders.length === 0) {
		return undefined;
	}
	const folder = getSessionPresentationWorkspace(session, reader)?.folders[0];
	if (!folder || folder.workingDirectory.scheme !== Schemas.file) {
		return undefined;
	}
	if (getSessionsInScopeFolders(sessions.includes(session) ? sessions : [...sessions, session], scopeFolders, reader).includes(session)) {
		return undefined;
	}
	const repository = folder.gitRepository;
	const worktree = repository?.workTreeUri;
	return worktree && !extUriBiasedIgnorePathCase.isEqual(worktree, repository.uri)
		? { folder: worktree, isWorktree: true }
		: { folder: folder.workingDirectory, isWorktree: false };
}

/**
 * The banner of a chat whose session works in a local folder outside the folders of the window's workspace, offering to
 * switch to that folder or worktree.
 */
export class SessionFolderBanner {

	/**
	 * The sessions the Sessions list knows, renewed only as sessions are added or removed: the frequent updates of a
	 * session's state do not change which sessions are in scope.
	 */
	private readonly _catalog: IObservable<readonly ISession[]>;

	constructor(
		private readonly _scopeFolders: IObservable<readonly URI[]>,
		@ISessionsManagementService sessionsManagementService: ISessionsManagementService,
		@ICommandService private readonly _commandService: ICommandService,
		@ILabelService private readonly _labelService: ILabelService,
	) {
		const membershipChanged = observableSignalFromEvent(this, Event.filter(sessionsManagementService.onDidChangeSessions, e => e.added.length > 0 || e.removed.length > 0));
		this._catalog = derived(this, reader => {
			membershipChanged.read(reader);
			return sessionsManagementService.getSessions();
		});
	}

	/**
	 * The banner for `session` while `visible`, or `undefined` when it needs none. Where the session works is computed again
	 * only as the window's folders, the sessions or their workspaces change, and not at all while hidden.
	 */
	getContent(session: ISession, visible: IObservable<boolean>): IObservable<ISessionReadOnlyBannerContent | undefined> {
		const outside = derivedOpts<ISessionFolderOutsideScope | undefined>({ owner: this, equalsFn: (a, b) => a === b || (!!a && !!b && a.isWorktree === b.isWorktree && isEqual(a.folder, b.folder)) }, reader => visible.read(reader)
			? getSessionFolderOutsideScope(session, this._scopeFolders.read(reader), this._catalog.read(reader), reader)
			: undefined);
		return derived(this, reader => {
			const folder = outside.read(reader);
			return folder && this._toContent(session, folder);
		});
	}

	private _toContent(session: ISession, outside: ISessionFolderOutsideScope): ISessionReadOnlyBannerContent {
		const path = this._labelService.getUriLabel(outside.folder);
		return {
			icon: Codicon.info,
			message: localize('sessionFolderBanner.message', "This session is in {0}.", basename(outside.folder)),
			ariaLabel: localize('sessionFolderBanner.ariaLabel', "This session is in {0}.", path),
			hover: path,
			action: {
				label: outside.isWorktree
					? localize('sessionFolderBanner.switchToWorktree', "Switch to Worktree")
					: localize('sessionFolderBanner.switchToFolder', "Switch to Folder"),
				run: () => this._commandService.executeCommand<void>(outside.isWorktree ? SWITCH_TO_SESSION_WORKTREE_COMMAND_ID : SWITCH_TO_SESSION_FOLDER_COMMAND_ID, session.resource),
			},
		};
	}
}

class SwitchToSessionFolderAction extends Action2 {
	constructor() {
		super({
			id: SWITCH_TO_SESSION_FOLDER_COMMAND_ID,
			title: localize2('switchToSessionFolder', "Switch to Folder"),
			precondition: ChatContextKeys.enabled,
		});
	}

	run(): void { }
}

class SwitchToSessionWorktreeAction extends Action2 {
	constructor() {
		super({
			id: SWITCH_TO_SESSION_WORKTREE_COMMAND_ID,
			title: localize2('switchToSessionWorktree', "Switch to Worktree"),
			precondition: ChatContextKeys.enabled,
		});
	}

	run(): void { }
}

/** Registers the actions of the {@link SessionFolderBanner}. */
export function registerSessionFolderBannerActions(): IDisposable {
	return combinedDisposable(
		registerAction2(SwitchToSessionFolderAction),
		registerAction2(SwitchToSessionWorktreeAction),
	);
}
