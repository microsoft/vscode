/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../base/common/cancellation.js';
import { basename } from '../../../base/common/resources.js';
import { URI } from '../../../base/common/uri.js';
import { localize } from '../../../nls.js';
import { ILogService } from '../../log/common/log.js';
import { AGENT_HOST_ACCEPT_CHANGES_OPERATION_ID, type IChangesetOperationHandler } from '../common/agentHostChangesetOperationService.js';
import { IAgentHostChangesetService } from '../common/agentHostChangesetService.js';
import { ChangesetKind, parseChangesetUri } from '../common/changesetUri.js';
import { IDiffComputeService } from '../common/diffComputeService.js';
import type { IFileEditContent, IFileEditRecord } from '../common/sessionDataService.js';
import { ChangesetOperationTargetKind, type InvokeChangesetOperationParams, type InvokeChangesetOperationResult } from '../common/state/protocol/channels-changeset/commands.js';
import { AHP_SESSION_NOT_FOUND, JsonRpcErrorCodes, ProtocolError } from '../common/state/sessionProtocol.js';
import { FileEditKind, type TextRange, type URI as ProtocolURI } from '../common/state/sessionState.js';
import { AgentHostStateManager, IAgentHostStateManager } from './agentHostStateManager.js';
import { createFileEditAcceptRecord, createPartialFileEditAcceptRecord, storeFileEditAcceptRecord } from './fileEditAccept.js';
import { isFileEditPath } from './fileEditPath.js';
import { isPathWithinFolderScope } from './sessionDiffAggregator.js';
import { createChangedSinceShownError } from './workingSetNonce.js';
import { computeWorkingSetRangeChanges, type IWorkingSetFileContents } from './workingSetFileContents.js';
import { computeWorkingSetSources, getWorkingSetNonce } from './workingSetSources.js';

/**
 * Accepts changes to a file in a Working Set changeset: every change, or the
 * hunks that a range touches. Accepting records the content the file's
 * Working Set then compares its changes with: the content of the file's last
 * tracked edit, or the baseline with the accepted hunks. The file on disk is
 * unchanged. Every chat whose database has unaccepted records of the file
 * records its own, as records are only ordered within a database.
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
		const acceptedChats: ProtocolURI[] = [];
		try {
			const rowsPerSource: IFileEditRecord[][] = [];
			for (const source of tracked.sources) {
				rowsPerSource.push(this._getFileEditRecords(await source.db.getAllFileEdits(), resource, tracked.folderScope));
			}
			if (rowsPerSource.every(rows => rows.length === 0)) {
				throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, localize('agentHost.changeset.acceptChanges.notInWorkingSet', "'{0}' has no changes to accept.", basename(resource)));
			}
			const { pending, unchanged } = await computeWorkingSetSources(tracked.sources.map(source => source.db), rowsPerSource, this._diffComputeService);
			if (shownNonce !== undefined && shownNonce !== getWorkingSetNonce(pending)) {
				throw createChangedSinceShownError(resource);
			}
			if (target.kind === ChangesetOperationTargetKind.Range && pending.length > 1) {
				throw this._createWholeFileOnlyError(resource);
			}
			this._throwIfCancelled(token);

			for (const workingSet of pending.length > 0 ? [...pending, ...unchanged] : []) {
				const source = tracked.sources[workingSet.sourceIdx];
				const last = workingSet.rows[workingSet.rows.length - 1];
				// The content read with the rows, so a record rewritten since then fails the check in the transaction.
				const current = workingSet.contents.current;
				const row = target.kind === ChangesetOperationTargetKind.Range && pending.includes(workingSet)
					? await this._createRangeAcceptRecord(last, workingSet.contents, target, resource)
					: createFileEditAcceptRecord(last.turnId, last.filePath, current);

				this._logService.info(`[AgentHostAcceptChangesOperationHandler] Accepting ${target.kind === ChangesetOperationTargetKind.Range ? 'a range of the ' : ''}changes to '${resource.fsPath}' for ${source.chat}`);
				await storeFileEditAcceptRecord(source.db, row, resource, last, current, recordAdded => shownNonce !== undefined && recordAdded
					? createChangedSinceShownError(resource)
					: new ProtocolError(JsonRpcErrorCodes.InvalidParams, localize('agentHost.changeset.acceptChanges.changedDuringAccept', "'{0}' changed while its changes were being accepted. Try again.", basename(resource))));
				acceptedChats.push(source.chat);
			}
		} catch (err) {
			if (err instanceof ProtocolError) {
				throw err;
			}
			throw new ProtocolError(JsonRpcErrorCodes.InternalError, `Failed to accept changes: ${err instanceof Error ? err.message : String(err)}`);
		} finally {
			tracked.dispose();
			// A chat whose changes were accepted before another one's failed shows that too.
			for (const chat of acceptedChats) {
				this._changesets.onFileEditsAccepted(chat);
			}
		}

		return this._createResult(resource);
	}

	/**
	 * Builds the row that accepts the hunks that `target` touches of a file's unaccepted changes, `contents`,
	 * which its `last` record ends. A range that touches every hunk accepts every change.
	 */
	private async _createRangeAcceptRecord(last: IFileEditRecord, contents: IWorkingSetFileContents, target: { readonly side?: 'before' | 'after'; readonly range: TextRange }, resource: URI): Promise<IFileEditRecord & IFileEditContent> {
		const changes = await computeWorkingSetRangeChanges(contents, target.side, target.range, this._diffComputeService);
		const current = contents.current;
		if (!changes || !current) {
			throw this._createWholeFileOnlyError(resource);
		}
		if (changes.selected === 0) {
			throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, localize('agentHost.changeset.acceptChanges.notInRange', "'{0}' has no changes to accept in the given range.", basename(resource)));
		}
		return changes.selected === changes.total
			? createFileEditAcceptRecord(last.turnId, last.filePath, current)
			: createPartialFileEditAcceptRecord(last.turnId, last.filePath, changes.baselineWithRange, current);
	}

	private _createWholeFileOnlyError(resource: URI): ProtocolError {
		return new ProtocolError(JsonRpcErrorCodes.InvalidParams, localize('agentHost.changeset.acceptChanges.wholeFileOnly', "Changes to '{0}' can only be accepted for the whole file.", basename(resource)));
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
		if (records.some(record => record.kind === FileEditKind.Rename && (isFileEditPath(record.filePath, resource) || isFileEditPath(record.originalPath, resource)))) {
			throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, localize('agentHost.changeset.acceptChanges.renamed', "Changes to a renamed file can't be accepted."));
		}
		return records.filter(record => isFileEditPath(record.filePath, resource) && (!folderScope || isPathWithinFolderScope(record.filePath, folderScope)));
	}

	private _throwIfCancelled(token: CancellationToken): void {
		if (token.isCancellationRequested) {
			throw new ProtocolError(JsonRpcErrorCodes.InternalError, localize('agentHost.changeset.acceptChanges.cancelled', "Accept changes operation was cancelled."));
		}
	}
}
