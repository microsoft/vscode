/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from '../../../base/common/buffer.js';
import { CancellationToken } from '../../../base/common/cancellation.js';
import { basename, extUriBiasedIgnorePathCase } from '../../../base/common/resources.js';
import { URI } from '../../../base/common/uri.js';
import { localize } from '../../../nls.js';
import { ILogService } from '../../log/common/log.js';
import { AGENT_HOST_ACCEPT_CHANGES_OPERATION_ID, type IChangesetOperationHandler } from '../common/agentHostChangesetOperationService.js';
import { IAgentHostChangesetService, type ITrackedEditSource } from '../common/agentHostChangesetService.js';
import { ChangesetKind, parseChangesetUri } from '../common/changesetUri.js';
import type { IFileEditRecord, ISessionDatabase } from '../common/sessionDataService.js';
import { ChangesetOperationTargetKind, type InvokeChangesetOperationParams, type InvokeChangesetOperationResult } from '../common/state/protocol/channels-changeset/commands.js';
import { AHP_SESSION_NOT_FOUND, JsonRpcErrorCodes, ProtocolError } from '../common/state/sessionProtocol.js';
import { FileEditKind, type URI as ProtocolURI } from '../common/state/sessionState.js';
import { resolveChangesetOwnerScope } from './agentHostBranchChangesetScope.js';
import { AgentHostStateManager, IAgentHostStateManager } from './agentHostStateManager.js';
import { createFileEditAcceptRecord, isFileEditAcceptRecord, readFileEditEndContent } from './fileEditAccept.js';
import { isPathWithinFolderScope } from './sessionDiffAggregator.js';

function isFilePath(path: string | undefined, resource: URI): boolean {
	return path !== undefined && extUriBiasedIgnorePathCase.isEqual(URI.file(path), resource);
}

/** Identifies an edit row across databases, as the Working Set does. */
function getFileEditKey(record: IFileEditRecord): string {
	return `${record.toolCallId}\0${record.filePath}`;
}

/**
 * Accepts every change to a file in a Working Set changeset: records the
 * content of the file's last tracked edit as accepted, after which the Working
 * Set compares the file's later edits with it. The file on disk is unchanged.
 */
export class AgentHostAcceptChangesOperationHandler implements IChangesetOperationHandler {

	public static readonly OPERATION_ACCEPT_CHANGES = AGENT_HOST_ACCEPT_CHANGES_OPERATION_ID;

	constructor(
		@ILogService private readonly _logService: ILogService,
		@IAgentHostStateManager private readonly _stateManager: AgentHostStateManager,
		@IAgentHostChangesetService private readonly _changesets: IAgentHostChangesetService,
	) { }

	async invoke(params: InvokeChangesetOperationParams, token: CancellationToken): Promise<InvokeChangesetOperationResult> {
		const parsed = parseChangesetUri(params.channel);
		if (parsed?.kind !== ChangesetKind.WorkingSet) {
			throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, `Not a working set changeset URI: ${params.channel}`);
		}
		if (params.target?.kind !== ChangesetOperationTargetKind.Resource) {
			throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, `Operation '${AgentHostAcceptChangesOperationHandler.OPERATION_ACCEPT_CHANGES}' requires a resource target.`);
		}
		const owner = parsed.ownerUri;
		if (!this._stateManager.getSessionState(owner)) {
			throw new ProtocolError(AHP_SESSION_NOT_FOUND, `Session not found: ${owner}`);
		}
		const resource = URI.parse(params.target.resource);
		const session = resolveChangesetOwnerScope(this._stateManager, owner).sessionUri;
		this._throwIfTurnActive(session);
		this._throwIfCancelled(token);

		const tracked = this._changesets.openTrackedSessionDatabases(owner);
		let acceptedChat: ProtocolURI;
		try {
			// A forked chat's database starts as a copy of its parent's rows. Like
			// the Working Set, count a row once, in the first database holding it.
			const seen = new Set<string>();
			const matches: { readonly source: ITrackedEditSource; readonly records: readonly IFileEditRecord[] }[] = [];
			for (const source of tracked.sources) {
				const records = this._getFileEditRecords(await source.db.getAllFileEdits(), resource, tracked.folderScope);
				if (records.some(record => !seen.has(getFileEditKey(record)))) {
					matches.push({ source, records });
				}
				for (const record of records) {
					seen.add(getFileEditKey(record));
				}
			}
			const [match, ...otherMatches] = matches;
			if (!match) {
				throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, localize('agentHost.changeset.acceptChanges.notInWorkingSet', "'{0}' has no changes to accept.", basename(resource)));
			}
			if (otherMatches.length > 0) {
				throw this._createEditedByOtherChatsError(resource);
			}
			await this._throwIfEditedByOtherChats(tracked.otherChatDatabases, resource, seen);

			const { source, records } = match;
			const last = records[records.length - 1];
			// The file is unchanged since its changes were last accepted.
			if (isFileEditAcceptRecord(last)) {
				return this._createResult(resource);
			}
			const accepted = await readFileEditEndContent(source.db, last);
			this._throwIfCancelled(token);

			this._logService.info(`[AgentHostAcceptChangesOperationHandler] Accepting changes to '${resource.fsPath}' for ${owner}`);
			await source.db.storeFileEdits([createFileEditAcceptRecord(last.turnId, last.filePath, accepted)], async readContent => {
				this._throwIfTurnActive(session);
				// Accepting must not cover an edit recorded since the file's rows were read.
				const rows = (await source.db.getAllFileEdits()).filter(record => isFilePath(record.filePath, resource));
				const current = rows.at(-2);
				const content = current && await readFileEditEndContent({ readFileEditContent: readContent }, current);
				const contentMatches = accepted === undefined
					? content === undefined
					: content !== undefined && VSBuffer.wrap(accepted).equals(VSBuffer.wrap(content));
				if (current?.toolCallId !== last.toolCallId || !contentMatches) {
					throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, localize('agentHost.changeset.acceptChanges.changedDuringAccept', "'{0}' changed while its changes were being accepted. Try again.", basename(resource)));
				}
			});
			acceptedChat = source.chat;
		} catch (err) {
			if (err instanceof ProtocolError) {
				throw err;
			}
			throw new ProtocolError(JsonRpcErrorCodes.InternalError, `Failed to accept changes: ${err instanceof Error ? err.message : String(err)}`);
		} finally {
			tracked.dispose();
		}

		this._changesets.onFileEditsAccepted(acceptedChat);
		return this._createResult(resource);
	}

	private _createResult(resource: URI): InvokeChangesetOperationResult {
		return { message: { markdown: localize('agentHost.changeset.acceptChanges.accepted', "Accepted the changes to `{0}`.", basename(resource)) } };
	}

	/**
	 * Returns the edit records of `resource` among `records`, including those
	 * that record accepting its changes, or none when it is outside
	 * `folderScope`. A renamed file's records span more than one path, so a
	 * rename that touches `resource` is rejected.
	 */
	private _getFileEditRecords(records: readonly IFileEditRecord[], resource: URI, folderScope: readonly URI[] | undefined): IFileEditRecord[] {
		if (records.some(record => record.kind === FileEditKind.Rename && (isFilePath(record.filePath, resource) || isFilePath(record.originalPath, resource)))) {
			throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, localize('agentHost.changeset.acceptChanges.renamed', "Changes to a renamed file can't be accepted."));
		}
		return records.filter(record => isFilePath(record.filePath, resource) && (!folderScope || isPathWithinFolderScope(record.filePath, folderScope)));
	}

	/**
	 * The Working Set of a session combines every chat's edits without ordering
	 * them by time, so accepting a file's changes in one chat's database could
	 * hide another chat's later changes to it. Rows in `copied`, which a forked
	 * chat's database shares with its parent's, are the same edits.
	 */
	private async _throwIfEditedByOtherChats(otherChatDatabases: readonly ISessionDatabase[], resource: URI, copied: ReadonlySet<string>): Promise<void> {
		for (const db of otherChatDatabases) {
			const records = await db.getAllFileEdits();
			if (records.some(record => (isFilePath(record.filePath, resource) || isFilePath(record.originalPath, resource)) && !copied.has(getFileEditKey(record)))) {
				throw this._createEditedByOtherChatsError(resource);
			}
		}
	}

	private _createEditedByOtherChatsError(resource: URI): ProtocolError {
		return new ProtocolError(JsonRpcErrorCodes.InvalidParams, localize('agentHost.changeset.acceptChanges.otherChat', "Changes to '{0}' can't be accepted because another chat in this session also changed it.", basename(resource)));
	}

	/** Throws while a turn runs in any chat of `session`: its edits could be accepted unseen. */
	private _throwIfTurnActive(session: ProtocolURI): void {
		if (this._stateManager.hasActiveTurn(session)) {
			throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, localize('agentHost.changeset.acceptChanges.turnInProgress', "Changes can't be accepted while a turn is running."));
		}
	}

	private _throwIfCancelled(token: CancellationToken): void {
		if (token.isCancellationRequested) {
			throw new ProtocolError(JsonRpcErrorCodes.InternalError, localize('agentHost.changeset.acceptChanges.cancelled', "Accept changes operation was cancelled."));
		}
	}
}
