/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { constObservable, derived, IObservable } from '../../../../base/common/observable.js';
import { extUriBiasedIgnorePathCase, isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { AbstractChatResponseFileChangesService, IChatResponseFileChangesOpenContext } from '../../../../workbench/contrib/chat/browser/chatResponseFileChangesService.js';
import { IEditSessionEntryDiff } from '../../../../workbench/contrib/chat/common/editing/chatEditingService.js';
import { IEditorService } from '../../../../workbench/services/editor/common/editorService.js';
import { IAgentWorkbenchLayoutService } from '../../../browser/workbench.js';
import { isAgentHostProviderId } from '../../../common/agentHostSessionsProvider.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { IChat, ISession, ISessionChangeset, ISessionFileChange, TURN_CHANGES_CHANGESET_ID } from '../../../services/sessions/common/session.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { ISessionChangesEditorOptions, ISessionChangesService } from '../../changes/browser/sessionChangesService.js';

interface ISessionTransientTurnChanges {
	readonly id: string;
	readonly label: string;
	readonly description: string;
	readonly changes: IObservable<readonly ISessionFileChange[]>;
}

/** Opens response changes in the canonical Agents Changes editor. */
export class SessionsChatResponseFileChangesService extends AbstractChatResponseFileChangesService {
	constructor(
		@IEditorService private readonly _editorService: IEditorService,
		@ISessionsManagementService private readonly _sessionsManagementService: ISessionsManagementService,
		@ISessionsService private readonly _sessionsService: ISessionsService,
		@ISessionChangesService private readonly _sessionChangesService: ISessionChangesService,
		@IAgentWorkbenchLayoutService private readonly _layoutService: IAgentWorkbenchLayoutService,
	) {
		super();
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
					void this._openSessionTurnChanges(owner.session);
				} else {
					const changes = owner.chat.lastTurnChanges;
					if (changes) {
						this._openTransientLastTurnChanges(owner.session, owner.chat.resource.toString(), changes);
					}
				}
				return;
			}

			if (this._isMostRecentChat(owner.session, owner.chat)) {
				void this._openSessionTurnChanges(owner.session);
				return;
			}

			const changes = this._getSessionFileChanges(owner.session, chatResource, requestId);
			if (changes) {
				this._openTransientLastTurnChanges(owner.session, requestId, changes);
			}
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
		void this._openSessionTurnChanges(owner.session, {
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

	private _isMostRecentChat(session: ISession, chat: IChat): boolean {
		const mostRecentChat = session.chats.get().reduce<IChat | undefined>(
			(latest, candidate) => !latest || candidate.updatedAt.get().getTime() > latest.updatedAt.get().getTime() ? candidate : latest,
			undefined,
		);
		return isEqual(mostRecentChat?.resource ?? session.mainChat.get().resource, chat.resource);
	}

	private _getSessionFileChanges(session: ISession, chatResource: URI, requestId: string): IObservable<readonly ISessionFileChange[]> | undefined {
		const changes = this.getChangesForRequest(chatResource, requestId);
		return changes ? this._toSessionFileChanges(session, changes) : undefined;
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

	private _openTransientLastTurnChanges(session: ISession, id: string, changes: IObservable<readonly ISessionFileChange[]>): void {
		void this._openSessionTurnChanges(session, {
			id: `${TURN_CHANGES_CHANGESET_ID}:${id}`,
			label: localize('lastTurnChanges.label', "Turn Changes"),
			description: localize('lastTurnChanges.description', "Changes from the viewed chat's last turn."),
			changes,
		});
	}

	private async _openSessionTurnChanges(session: ISession, transientTurn?: ISessionTransientTurnChanges): Promise<void> {
		if (!isEqual(this._sessionsService.activeSession.get()?.resource, session.resource)) {
			this._sessionsService.showSession(session.resource, { preserveFocus: true });
		}
		this._layoutService.revealEditorPartExplicitly();
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
		await this._sessionChangesService.openChangesEditor(session.resource, { changesetSelection });
	}
}
