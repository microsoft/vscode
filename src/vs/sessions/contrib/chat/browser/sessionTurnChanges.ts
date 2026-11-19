/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { constObservable, derived, derivedObservableWithCache, IObservable, IReader } from '../../../../base/common/observable.js';
import { extUriBiasedIgnorePathCase, isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { AbstractChatResponseFileChangesService, AUTHORITATIVE_EMPTY_CHAT_RESPONSE_FILE_CHANGES, IChatResponseFileChangesOpenContext, IChatResponseFileChangesStats } from '../../../../workbench/contrib/chat/browser/chatResponseFileChangesService.js';
import { IEditSessionEntryDiff } from '../../../../workbench/contrib/chat/common/editing/chatEditingService.js';
import { IEditorService } from '../../../../workbench/services/editor/common/editorService.js';
import { ISessionsHostLayoutService } from '../../../../workbench/services/sessions/browser/sessionsHostLayoutService.js';
import { isAgentHostProviderId } from '../../../../workbench/contrib/sessions/common/agentHostSessionsProvider.js';
import { ISessionsService } from '../../../../workbench/contrib/sessions/browser/sessionsService.js';
import { IFocusedSessionHostService, ISessionHostService } from '../../../../workbench/services/sessions/browser/sessionHost.js';
import { IChat, ISession, ISessionChangeset, ISessionFileChange, TURN_CHANGES_CHANGESET_ID } from '../../../../workbench/services/sessions/common/session.js';
import { ISessionsManagementService } from '../../../../workbench/contrib/sessions/common/sessionsManagement.js';
import { ISessionChangesEditorOptions, ISessionChangesService } from '../../../../workbench/contrib/sessionChanges/browser/sessionChangesService.js';
import { getEditorTarget, revealEditorTarget } from '../../../../workbench/contrib/sessions/browser/chatWindowEditorTarget.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IChatWindowService } from '../../../../workbench/contrib/chatWindow/browser/chatWindow.js';
import { IChangesViewService } from '../../../../workbench/contrib/sessions/common/changesViewService.js';

interface ISessionTransientTurnChanges {
	readonly id: string;
	readonly label: string;
	readonly description: string;
	readonly changes: IObservable<readonly ISessionFileChange[]>;
}

function changeStatsEqual(a: IChatResponseFileChangesStats, b: IChatResponseFileChangesStats): boolean {
	return a.files === b.files && a.insertions === b.insertions && a.deletions === b.deletions;
}

/** Opens response changes in the canonical Agents Changes editor. */
export class SessionsChatResponseFileChangesService extends AbstractChatResponseFileChangesService {
	constructor(
		@IEditorService private readonly _editorService: IEditorService,
		@ISessionsManagementService private readonly _sessionsManagementService: ISessionsManagementService,
		@ISessionsService private readonly _sessionsService: ISessionsService,
		@IFocusedSessionHostService private readonly _focusedSessionHostService: IFocusedSessionHostService,
		@ISessionChangesService private readonly _sessionChangesService: ISessionChangesService,
		@ISessionsHostLayoutService private readonly _layoutService: ISessionsHostLayoutService,
		@IChangesViewService private readonly _changesViewService: IChangesViewService,
		@ISessionHostService private readonly _sessionHostService: ISessionHostService,
		@IChatWindowService private readonly _chatWindowService: IChatWindowService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
	}

	override getChangeStatsForRequest(sessionResource: URI, requestId: string, context: IChatResponseFileChangesOpenContext): IObservable<IChatResponseFileChangesStats> | undefined {
		if (!context.isLastTurn) {
			return undefined;
		}
		const owner = this._sessionsManagementService.getSessionForChatResource(sessionResource);
		if (!owner
			|| !isEqual(this._changesViewService.activeSessionResourceObs.get(), owner.session.resource)) {
			return undefined;
		}
		const requestChanges = this.getChangesForRequest(sessionResource, requestId);

		return derivedObservableWithCache<IChatResponseFileChangesStats>(this, (reader, lastValue) => {
			const requestDiffs = requestChanges?.read(reader) ?? [];
			const readRequestStats = (): IChatResponseFileChangesStats => {
				let insertions = 0, deletions = 0;
				for (const change of requestDiffs) {
					insertions += change.added;
					deletions += change.removed;
				}
				return { files: requestDiffs.length, insertions, deletions };
			};
			let stats: IChatResponseFileChangesStats;
			if (requestDiffs === AUTHORITATIVE_EMPTY_CHAT_RESPONSE_FILE_CHANGES) {
				stats = readRequestStats();
			} else if (!isEqual(this._changesViewService.activeSessionResourceObs.read(reader), owner.session.resource)
				|| !this._isMostRecentChat(owner.session, owner.chat, reader)) {
				stats = readRequestStats();
			} else {
				const changeset = owner.chat.changesets.read(reader)
					?.find(candidate => candidate.id === TURN_CHANGES_CHANGESET_ID && candidate.isEnabled.read(reader));
				if (!changeset) {
					stats = readRequestStats();
				} else if (changeset.isLoadingChanges.read(reader)) {
					return lastValue ?? readRequestStats();
				} else {
					const changes = changeset.changes.read(reader);
					let insertions = 0, deletions = 0;
					for (const change of changes) {
						insertions += change.insertions;
						deletions += change.deletions;
					}
					stats = { files: changes.length, insertions, deletions };
				}
			}
			return lastValue && changeStatsEqual(lastValue, stats) ? lastValue : stats;
		});
	}

	override openChangesForRequest(chatResource: URI, requestId: string | undefined, context: IChatResponseFileChangesOpenContext): void {
		const owner = this._sessionsManagementService.getSessionForChatResource(chatResource);
		if (!owner) {
			this._openStandaloneChanges(chatResource, requestId);
			return;
		}
		if (context.isLastTurn) {
			if (requestId === undefined) {
				if (isAgentHostProviderId(owner.session.providerId)) {
					void this._openSessionTurnChanges(owner.session, owner.chat);
				} else {
					const changes = owner.chat.lastTurnChanges;
					if (changes) {
						this._openTransientLastTurnChanges(owner.session, owner.chat, changes);
					}
				}
				return;
			}

			void this._openSessionTurnChanges(owner.session, owner.chat);
			return;
		}

		if (requestId === undefined) {
			return;
		}
		const changes = this.getChangesForRequest(chatResource, requestId);
		if (!changes) {
			this._openStandaloneChanges(chatResource, requestId);
			return;
		}
		void this._openSessionTurnChanges(owner.session, owner.chat, {
			id: `${TURN_CHANGES_CHANGESET_ID}:${requestId}`,
			label: localize('historicalTurnChanges.label', "Turn Changes"),
			description: localize('historicalTurnChanges.description', "Changes from the selected chat turn."),
			changes: this._toSessionFileChanges(owner.session, changes),
		});
	}

	private _openStandaloneChanges(chatResource: URI, requestId: string | undefined): void {
		if (requestId === undefined) {
			return;
		}
		const diffs = this.getChangesForRequest(chatResource, requestId)?.get();
		if (!diffs?.length) {
			return;
		}
		const source = URI.parse(`multi-diff-editor:${Date.now().toString()}-${Math.random().toString(36).slice(2)}`);
		this._editorService.openEditor({
			multiDiffSource: source,
			label: localize('chatTurnPills.changes.title', "Turn File Changes"),
			resources: diffs.map(diff => ({
				original: { resource: diff.originalURI },
				modified: { resource: diff.modifiedURI },
			})),
		});
	}

	private _isMostRecentChat(session: ISession, chat: IChat, reader?: IReader): boolean {
		let mostRecentChat: IChat | undefined;
		let mostRecentTime = -Infinity;
		for (const candidate of session.chats.read(reader)) {
			const updatedAt = candidate.updatedAt.read(reader);
			if (!updatedAt) {
				return false;
			}
			if (updatedAt.getTime() > mostRecentTime) {
				mostRecentChat = candidate;
				mostRecentTime = updatedAt.getTime();
			}
		}
		return isEqual(mostRecentChat?.resource, chat.resource);
	}

	private _toSessionFileChanges(session: ISession, changes: IObservable<readonly IEditSessionEntryDiff[]>): IObservable<readonly ISessionFileChange[]> {
		return derived(reader => {
			const workspace = session.workspace?.read(reader);
			const workspaceFolders = workspace?.folders.flatMap(folder => [folder.root, folder.workingDirectory]) ?? [];
			return changes.read(reader)
				.filter(diff => workspaceFolders.some(folder =>
					extUriBiasedIgnorePathCase.isEqualOrParent(folder.with({ path: diff.modifiedURI.path }), folder)))
				.map((diff): ISessionFileChange => ({
					uri: diff.modifiedURI,
					originalUri: isEqual(diff.originalURI, diff.modifiedURI) ? undefined : diff.originalURI,
					modifiedUri: diff.isDeleted ? undefined : diff.modifiedSnapshotURI ?? diff.modifiedURI,
					insertions: diff.added,
					deletions: diff.removed,
				}));
		});
	}

	private _openTransientLastTurnChanges(session: ISession, chat: IChat, changes: IObservable<readonly ISessionFileChange[]>): void {
		void this._openSessionTurnChanges(session, chat, {
			id: `${TURN_CHANGES_CHANGESET_ID}:${chat.resource.toString()}`,
			label: localize('lastTurnChanges.label', "Turn Changes"),
			description: localize('lastTurnChanges.description', "Changes from the viewed chat's last turn."),
			changes,
		});
	}

	private async _openSessionTurnChanges(session: ISession, chat: IChat, transientTurn?: ISessionTransientTurnChanges): Promise<void> {
		const chatHost = this._sessionHostService.getHostOfChat(chat.resource);
		const target = getEditorTarget(this._chatWindowService, chatHost);
		if (!target) {
			this._logService.trace('[SessionsChatResponseFileChangesService] The chat window of the chat is not available, not opening its changes');
			return;
		}
		// A chat a chat window shows is already shown there; the main window, which may be the focused host, stays as it is.
		const inChatWindow = target !== 'main';
		const activeSession = this._focusedSessionHostService.focusedHost.get().session.get();
		if (inChatWindow) {
			// Nothing to activate.
		} else if (!transientTurn && (!activeSession || !isEqual(activeSession.resource, session.resource) || !isEqual(this._focusedSessionHostService.focusedHost.get().chat.get()?.resource, chat.resource))) {
			await this._sessionsService.openChat(session, chat.resource, { preserveFocus: true });
		} else if (!isEqual(activeSession?.resource, session.resource)) {
			this._sessionsService.showSession(session.resource, { preserveFocus: true });
		}
		revealEditorTarget(this._layoutService, target);
		const changesetSelection: ISessionChangesEditorOptions['changesetSelection'] = transientTurn
			? {
				kind: 'transient',
				changeset: {
					id: transientTurn.id,
					label: transientTurn.label,
					description: transientTurn.description,
					isEnabled: constObservable(true),
					isDefault: constObservable(false),
					isLoadingChanges: constObservable(false),
					changes: transientTurn.changes,
					operations: constObservable([]),
					originalCheckpointRef: constObservable(undefined),
					modifiedCheckpointRef: constObservable(undefined),
					async invokeOperation(operationId: string): Promise<void> {
						throw new Error(`Historical turn changes do not support operation '${operationId}'`);
					},
				} satisfies ISessionChangeset,
			}
			: { kind: 'id', id: TURN_CHANGES_CHANGESET_ID };
		await this._sessionChangesService.openChangesEditor(session.resource, {
			changesetSelection,
			chatResource: inChatWindow ? chat.resource : undefined,
		}, inChatWindow ? target.mainPart.activeGroup : undefined);
	}
}
