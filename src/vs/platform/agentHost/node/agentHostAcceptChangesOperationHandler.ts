/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../base/common/cancellation.js';
import { basename, extUriBiasedIgnorePathCase } from '../../../base/common/resources.js';
import { URI } from '../../../base/common/uri.js';
import { localize } from '../../../nls.js';
import { ILogService } from '../../log/common/log.js';
import { AGENT_HOST_ACCEPT_CHANGES_OPERATION_ID, type IChangesetOperationHandler } from '../common/agentHostChangesetOperationService.js';
import { IAgentHostChangesetService, type ITrackedEditSource } from '../common/agentHostChangesetService.js';
import { ChangesetKind, parseChangesetUri } from '../common/changesetUri.js';
import { IDiffComputeService } from '../common/diffComputeService.js';
import type { IFileEditContent, IFileEditRecord, ISessionDatabase } from '../common/sessionDataService.js';
import { ChangesetOperationTargetKind, type InvokeChangesetOperationParams, type InvokeChangesetOperationResult } from '../common/state/protocol/channels-changeset/commands.js';
import { AHP_SESSION_NOT_FOUND, JsonRpcErrorCodes, ProtocolError } from '../common/state/sessionProtocol.js';
import { FileEditKind, type TextRange, type URI as ProtocolURI } from '../common/state/sessionState.js';
import { AgentHostStateManager, IAgentHostStateManager } from './agentHostStateManager.js';
import { createFileEditAcceptRecord, createPartialFileEditAcceptRecord, fileEditContentEquals, getWorkingSetFileEditRecords, isFileEditAcceptRecord, readFileEditAcceptedContent, readFileEditEndContent } from './fileEditAccept.js';
import { getWorkingSetFileNonce, isPathWithinFolderScope } from './sessionDiffAggregator.js';
import { createChangedSinceShownError } from './workingSetNonce.js';
import { computeWorkingSetFileContents, computeWorkingSetRangeChanges } from './workingSetFileContents.js';

function isFilePath(path: string | undefined, resource: URI): boolean {
	return path !== undefined && extUriBiasedIgnorePathCase.isEqual(URI.file(path), resource);
}

/** Identifies an edit row across databases, as the Working Set does. */
function getFileEditKey(record: IFileEditRecord): string {
	return `${record.toolCallId}\0${record.filePath}`;
}

/**
 * Accepts changes to a file in a Working Set changeset: every change, or the
 * hunks that a range touches. Accepting records the content the file's
 * Working Set then compares its changes with: the content of the file's last
 * tracked edit, or the baseline with the accepted hunks. The file on disk is
 * unchanged.
 */
export class AgentHostAcceptChangesOperationHandler implements IChangesetOperationHandler {

	public static readonly OPERATION_ACCEPT_CHANGES = AGENT_HOST_ACCEPT_CHANGES_OPERATION_ID;

	constructor(
		@ILogService private readonly _logService: ILogService,
		@IAgentHostStateManager private readonly _stateManager: AgentHostStateManager,
		@IAgentHostChangesetService private readonly _changesets: IAgentHostChangesetService,
		@IDiffComputeService private readonly _diffComputeService: IDiffComputeService,
	) { }

	async invoke(params: InvokeChangesetOperationParams, token: CancellationToken): Promise<InvokeChangesetOperationResult> {
		const parsed = parseChangesetUri(params.channel);
		if (parsed?.kind !== ChangesetKind.WorkingSet) {
			throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, `Not a working set changeset URI: ${params.channel}`);
		}
		const target = params.target;
		if (target?.kind !== ChangesetOperationTargetKind.Resource && target?.kind !== ChangesetOperationTargetKind.Range) {
			throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, `Operation '${AgentHostAcceptChangesOperationHandler.OPERATION_ACCEPT_CHANGES}' requires a resource or range target.`);
		}
		const owner = parsed.ownerUri;
		if (!this._stateManager.getSessionState(owner)) {
			throw new ProtocolError(AHP_SESSION_NOT_FOUND, `Session not found: ${owner}`);
		}
		const resource = URI.parse(target.resource);
		const shownNonce = target.nonce;
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
			if (shownNonce !== undefined && shownNonce !== getWorkingSetFileNonce(last)) {
				throw createChangedSinceShownError(resource);
			}
			const current = await readFileEditEndContent(source.db, last);
			const row = target.kind === ChangesetOperationTargetKind.Range
				? await this._createRangeAcceptRecord(source.db, records, target, resource, current)
				: await this._createFileAcceptRecord(source.db, last, current);
			if (!row) {
				return this._createResult(resource);
			}
			this._throwIfCancelled(token);

			this._logService.info(`[AgentHostAcceptChangesOperationHandler] Accepting ${target.kind === ChangesetOperationTargetKind.Range ? 'a range of the ' : ''}changes to '${resource.fsPath}' for ${owner}`);
			await source.db.storeFileEdits([row], async readContent => {
				// Accepting must not cover an edit recorded since the file's rows were read, as one of a turn that runs.
				const rows = (await source.db.getAllFileEdits()).filter(record => isFilePath(record.filePath, resource));
				const previous = rows.at(-2);
				if (shownNonce !== undefined && previous && shownNonce !== getWorkingSetFileNonce(previous)) {
					throw createChangedSinceShownError(resource);
				}
				const content = previous && await readFileEditEndContent({ readFileEditContent: readContent }, previous);
				if (previous?.toolCallId !== last.toolCallId || !fileEditContentEquals(content, current)) {
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

	/**
	 * Builds the row that accepts every change to the file, whose last record
	 * leaves it with `current` content, or returns `undefined` when its changes
	 * were all accepted already.
	 */
	private async _createFileAcceptRecord(db: ISessionDatabase, last: IFileEditRecord, current: Uint8Array | undefined): Promise<(IFileEditRecord & IFileEditContent) | undefined> {
		if (isFileEditAcceptRecord(last) && fileEditContentEquals(await readFileEditAcceptedContent(db, last), current)) {
			return undefined;
		}
		return createFileEditAcceptRecord(last.turnId, last.filePath, current);
	}

	/**
	 * Builds the row that accepts the hunks of the file's Working Set that
	 * `target` touches, given the file's `records` in `db`, the last of which
	 * leaves it with `current` content. A range that touches every hunk accepts
	 * every change. Returns `undefined` when the file has no changes to accept.
	 */
	private async _createRangeAcceptRecord(db: ISessionDatabase, records: readonly IFileEditRecord[], target: { readonly side?: 'before' | 'after'; readonly range: TextRange }, resource: URI, current: Uint8Array | undefined): Promise<(IFileEditRecord & IFileEditContent) | undefined> {
		const last = records[records.length - 1];
		const contents = await computeWorkingSetFileContents(db, getWorkingSetFileEditRecords(records), this._diffComputeService);
		if (fileEditContentEquals(contents.baseline, contents.current)) {
			return undefined;
		}
		const changes = await computeWorkingSetRangeChanges(contents, target.side, target.range, this._diffComputeService);
		if (!changes || !current) {
			throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, localize('agentHost.changeset.acceptChanges.wholeFileOnly', "Changes to '{0}' can only be accepted for the whole file.", basename(resource)));
		}
		if (changes.selected === 0) {
			throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, localize('agentHost.changeset.acceptChanges.notInRange', "'{0}' has no changes to accept in the given range.", basename(resource)));
		}
		return changes.selected === changes.total
			? createFileEditAcceptRecord(last.turnId, last.filePath, current)
			: createPartialFileEditAcceptRecord(last.turnId, last.filePath, changes.baselineWithRange, current);
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

	private _throwIfCancelled(token: CancellationToken): void {
		if (token.isCancellationRequested) {
			throw new ProtocolError(JsonRpcErrorCodes.InternalError, localize('agentHost.changeset.acceptChanges.cancelled', "Accept changes operation was cancelled."));
		}
	}
}
