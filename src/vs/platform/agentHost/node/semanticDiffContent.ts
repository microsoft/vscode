/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { extUriBiasedIgnorePathCase, joinPath } from '../../../base/common/resources.js';
import { toErrorMessage } from '../../../base/common/errorMessage.js';
import { URI } from '../../../base/common/uri.js';
import { IFileService } from '../../files/common/files.js';
import { ILogService } from '../../log/common/log.js';
import { IAgentHostGitService } from '../common/agentHostGitService.js';
import { resolveAgentHostSession } from '../common/agentHostSubscriptionService.js';
import { ISemanticDiffContentRequest, parseSemanticDiffContentUri, projectSemanticDiffContent } from '../common/semanticDiffContent.js';
import { AhpErrorCodes, ContentEncoding, ProtocolError, type ResourceReadResult } from '../common/state/sessionProtocol.js';
import { isAhpChatChannel } from '../common/state/sessionState.js';
import { getEffectiveWorkingDirectories } from './agentConfigurationService.js';
import { IAgentHostChatOwnershipService } from './agentHostChatOwnershipService.js';
import type { IAgentHostResourceProvider } from './agentHostResourceProviders.js';
import { resolveSessionRepositories } from './agentHostSessionRepositories.js';
import { AgentHostStateManager, IAgentHostStateManager } from './agentHostStateManager.js';

const SEMANTIC_DIFF_CONTENT_BYTE_LIMIT = 32 * 1024 * 1024;

/** Reads walkthrough content from the owning session's repositories. */
export class SemanticDiffResourceProvider implements IAgentHostResourceProvider {
	constructor(
		private readonly _host: { restoreSession(session: URI): Promise<void>; reconcileResidency(): void },
		@IAgentHostGitService private readonly _gitService: IAgentHostGitService,
		@IAgentHostStateManager private readonly _stateManager: AgentHostStateManager,
		@IAgentHostChatOwnershipService private readonly _chatOwnership: IAgentHostChatOwnershipService,
		@IFileService private readonly _fileService: IFileService,
		@ILogService private readonly _logService: ILogService,
	) { }

	async read(uri: URI): Promise<ResourceReadResult> {
		const request = parseSemanticDiffContentUri(uri);
		if (!request) {
			throw new ProtocolError(AhpErrorCodes.NotFound, `Content not found: ${uri.toString()}`);
		}
		const recordedOwner = isAhpChatChannel(request.sessionUri) ? await this._chatOwnership.createRecordedOwnerLookup()(request.sessionUri) : undefined;
		const owningSession = resolveAgentHostSession(URI.parse(request.sessionUri), chat => chat === request.sessionUri ? recordedOwner : this._chatOwnership.getChatOwner(chat));
		if (!owningSession) {
			throw new ProtocolError(AhpErrorCodes.NotFound, `Session not found: ${request.sessionUri}`);
		}
		const wasRestored = !!this._stateManager.getSessionState(owningSession.toString());
		try {
			if (!wasRestored) {
				await this._host.restoreSession(owningSession);
			}
			const workingDirectories = getEffectiveWorkingDirectories(this._stateManager, request.sessionUri)
				?? getEffectiveWorkingDirectories(this._stateManager, owningSession.toString()) ?? [];
			const data = await readSemanticDiffContent(request, workingDirectories.map(directory => URI.parse(directory)), this._gitService, async (repository, resource) => {
				try {
					return await readSemanticDiffWorkingTreeFile(repository, resource, this._fileService);
				} catch (error) {
					this._logService.warn(`[semanticDiffContent] Could not read semantic diff content ${resource.toString()}: ${toErrorMessage(error)}`);
					return undefined;
				}
			});
			return { data, encoding: ContentEncoding.Utf8, contentType: 'text/plain' };
		} finally {
			if (!wasRestored && this._stateManager.getSessionState(owningSession.toString())) {
				this._host.reconcileResidency();
			}
		}
	}
}

/** Reads a regular working-tree file only when its resolved path remains inside the repository. */
export async function readSemanticDiffWorkingTreeFile(repository: URI, resource: URI, fileService: IFileService): Promise<string | undefined> {
	const [resolvedRepository, resolvedResource] = await Promise.all([
		fileService.realpath(repository),
		fileService.realpath(resource),
	]);
	if (!resolvedRepository || !resolvedResource || !extUriBiasedIgnorePathCase.isEqualOrParent(resolvedResource, resolvedRepository)) {
		return undefined;
	}
	const stat = await fileService.stat(resource);
	if (!stat.isFile || stat.isSymbolicLink) {
		return undefined;
	}
	return (await fileService.readFile(resource, { limits: { size: SEMANTIC_DIFF_CONTENT_BYTE_LIMIT } })).value.toString();
}

/**
 * Computes one side of a file in a semantic group. The original side is the
 * file at the base revision. The modified side applies only the group's hunk
 * ranges, as the classifier reported them, to the original, taking the new
 * lines from the comparison's target: the target commit, the index, or the
 * working tree. Ranges are not re-checked against the repository, so a file
 * that changed after the walkthrough was created may not render as intended.
 *
 * Content is only read from repositories of the session's own working
 * directories, chosen by the base revision.
 *
 * @param readWorkingTreeFile Reads a working-tree file within its repository,
 *   or returns `undefined` when it is missing or unavailable.
 */
export async function readSemanticDiffContent(request: ISemanticDiffContentRequest, workingDirectories: readonly URI[], git: IAgentHostGitService, readWorkingTreeFile: (repository: URI, resource: URI) => Promise<string | undefined>): Promise<string> {
	const repository = await findRepository(workingDirectories, git, request.baseRevision);
	if (!repository) {
		throw new ProtocolError(AhpErrorCodes.NotFound, `No repository of this session contains revision ${request.baseRevision}.`);
	}
	const originalPath = request.oldPath ?? request.path;
	const original = request.status === 'added' ? '' : (await git.showBlob(repository, request.baseRevision, originalPath))?.toString();
	if (original === undefined) {
		throw new ProtocolError(AhpErrorCodes.NotFound, `${originalPath} does not exist at revision ${request.baseRevision}.`);
	}
	if (request.side === 'original') {
		return original;
	}

	let modified: string | undefined = '';
	if (request.status !== 'deleted') {
		switch (request.comparison) {
			case 'commitRange': modified = request.targetRevision ? (await git.showBlob(repository, request.targetRevision, request.path))?.toString() : undefined; break;
			// An empty revision makes `git show :<path>` read the staged entry.
			case 'staged': modified = (await git.showBlob(repository, '', request.path))?.toString(); break;
			case 'workingTree': modified = await readWorkingTreeFile(repository, joinPath(repository, request.path)); break;
		}
	}
	if (modified === undefined) {
		throw new ProtocolError(AhpErrorCodes.NotFound, `${request.path} could not be read.`);
	}
	try {
		return projectSemanticDiffContent(original, modified, request.hunks);
	} catch {
		throw new ProtocolError(AhpErrorCodes.NotFound, `The walkthrough's changes do not fit ${request.path}. The file may have changed after the walkthrough was created.`);
	}
}

async function findRepository(workingDirectories: readonly URI[], git: IAgentHostGitService, baseRevision: string): Promise<URI | undefined> {
	const { gitRepositories } = await resolveSessionRepositories(workingDirectories, git);
	for (const repository of gitRepositories) {
		if (await git.revParse(repository, `${baseRevision}^{commit}`) === baseRevision) {
			return repository;
		}
	}
	return undefined;
}
