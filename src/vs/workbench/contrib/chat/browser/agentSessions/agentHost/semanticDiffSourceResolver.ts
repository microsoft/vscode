/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Limiter, raceCancellationError } from '../../../../../../base/common/async.js';
import { VSBuffer } from '../../../../../../base/common/buffer.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../../base/common/cancellation.js';
import { CancellationError, isCancellationError } from '../../../../../../base/common/errors.js';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { basenameOrAuthority, isEqual } from '../../../../../../base/common/resources.js';
import { URI } from '../../../../../../base/common/uri.js';
import { localize } from '../../../../../../nls.js';
import { IAgentHostConnectionsService } from '../../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { IAgentConnection } from '../../../../../../platform/agentHost/common/agentService.js';
import { validateSemanticDiffReport } from '../../../../../../platform/agentHost/common/semanticDiff.js';
import { ISemanticDiffResolvedFile, resolveSemanticDiffFile } from '../../../../../../platform/agentHost/common/semanticDiffProjection.js';
import { parseSemanticDiffFileSourceResult, parseSemanticDiffRepositoryResult, SEMANTIC_DIFF_FILE_BYTE_LIMIT, SEMANTIC_DIFF_GROUP_BYTE_LIMIT, semanticDiffSourceUri, SemanticDiffSourceRequest } from '../../../../../../platform/agentHost/common/semanticDiffSource.js';
import { ContentEncoding } from '../../../../../../platform/agentHost/common/state/protocol/commands.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { IQuickInputService } from '../../../../../../platform/quickinput/common/quickInput.js';
import { ISemanticDiffEditorRequest, ISemanticDiffEditorSource, ISemanticDiffSourceResolverService } from '../../../common/semanticDiffEditor.js';

export class AgentHostSemanticDiffSourceResolver implements ISemanticDiffSourceResolverService {
	declare readonly _serviceBrand: undefined;

	constructor(
		@IAgentHostConnectionsService private readonly connectionsService: IAgentHostConnectionsService,
		@IQuickInputService private readonly quickInputService: IQuickInputService,
		@ILogService private readonly logService: ILogService,
	) { }

	async resolve(request: ISemanticDiffEditorRequest, token: CancellationToken): Promise<ISemanticDiffEditorSource> {
		const validated = validateSemanticDiffReport(request.report);
		if (!validated.ok) {
			throw new Error(validated.error.error.message);
		}
		const report = validated.report;
		if (report.analysis.source.comparison !== 'commitRange' || !report.analysis.source.targetRevision) {
			throw new Error(localize('semanticDiff.immutableSourceRequired', "This editor currently supports pinned commit-range comparisons. Staged and working-tree reports require snapshot support."));
		}
		if (!report.analysis.groups.some(group => group.id === request.groupId)) {
			throw new Error(localize('semanticDiff.groupUnavailable', "The requested semantic group is not present in this classification."));
		}
		const resolution = this.connectionsService.resolveSessionResource(request.sessionResource);
		if (!resolution) {
			throw new Error(localize('semanticDiff.hostUnavailable', "The agent host that owns this classification is unavailable."));
		}
		const groupHunks = report.analysis.hunks.filter(hunk => hunk.classification.groupId === request.groupId);
		const fileIds = new Set(groupHunks.map(hunk => hunk.fileId));
		if (report.analysis.limitations.some(limitation => limitation.code === 'excludedContent' && (limitation.fileId === null || fileIds.has(limitation.fileId)))) {
			throw new Error(localize('semanticDiff.excludedSource', "Source for this group was excluded from the classification and cannot be opened through this report."));
		}
		const sessionUri = resolution.backendSession.toString();
		const repositories = parseSemanticDiffRepositoryResult(await this.readJson(resolution.connection, { kind: 'repositories', sessionUri }, token))
			.repositories.map(value => URI.parse(value));
		let repository: URI | undefined;
		if (request.repositoryUri) {
			const selected = URI.parse(request.repositoryUri);
			repository = repositories.find(candidate => isEqual(candidate, selected));
			if (!repository) {
				throw new Error(localize('semanticDiff.boundRepositoryUnavailable', "The repository bound to this editor is no longer available in the owning session."));
			}
		} else if (repositories.length === 1) {
			repository = repositories[0];
		} else if (repositories.length > 1) {
			const selected = await this.quickInputService.pick(repositories.map(resource => ({
				label: basenameOrAuthority(resource),
				description: resource.path,
				resource,
			})), { placeHolder: localize('semanticDiff.selectRepository', "Select the repository containing the classified commits") }, token);
			if (!selected) {
				throw new CancellationError();
			}
			repository = selected.resource;
		}
		if (!repository) {
			throw new Error(localize('semanticDiff.noRepository', "The owning agent session has no Git repository available for this classification."));
		}

		const store = new DisposableStore();
		const cancellation = store.add(new CancellationTokenSource(token));
		const limiter = store.add(new Limiter<ISemanticDiffResolvedFile>(4));
		let sourceBytes = 0;
		const repositoryUri = repository.toString();
		const baseRevision = report.analysis.source.baseRevision;
		const targetRevision = report.analysis.source.targetRevision;
		try {
			const files = await Promise.all(report.analysis.files.filter(file => fileIds.has(file.id)).map(file => limiter.queue(async () => {
				const source = parseSemanticDiffFileSourceResult(await this.readJson(resolution.connection, {
					kind: 'file', sessionUri, repositoryUri, baseRevision, targetRevision, file,
				}, cancellation.token));
				sourceBytes += VSBuffer.fromString(source.original ?? '').byteLength
					+ VSBuffer.fromString(source.modified ?? '').byteLength + VSBuffer.fromString(source.patch).byteLength;
				if (sourceBytes > SEMANTIC_DIFF_GROUP_BYTE_LIMIT) {
					throw new Error(localize('semanticDiff.groupTooLarge', "This group's source exceeds the semantic diff editor's size limit."));
				}
				return resolveSemanticDiffFile(file, report.analysis.hunks.filter(hunk => hunk.fileId === file.id), source.original, source.modified, source.patch);
			})));
			return { repository, files };
		} catch (error) {
			cancellation.cancel();
			if (!isCancellationError(error)) {
				this.logService.warn('[SemanticDiffEditor] Source resolution failed', error);
			}
			throw error;
		} finally {
			store.dispose();
		}
	}

	private async readJson(connection: IAgentConnection, request: SemanticDiffSourceRequest, token: CancellationToken): Promise<unknown> {
		if (token.isCancellationRequested) {
			throw new CancellationError();
		}
		const result = await raceCancellationError(connection.resourceRead(semanticDiffSourceUri(request), ContentEncoding.Utf8), token);
		if (result.encoding !== ContentEncoding.Utf8 || VSBuffer.fromString(result.data).byteLength > SEMANTIC_DIFF_FILE_BYTE_LIMIT * 8) {
			throw new Error(localize('semanticDiff.invalidSourceResponse', "The semantic diff source response has an unsupported encoding or size."));
		}
		try {
			return JSON.parse(result.data);
		} catch {
			throw new Error(localize('semanticDiff.invalidSourceResponseJson', "The agent host does not provide a valid semantic diff source response. It may need to be updated."));
		}
	}
}
