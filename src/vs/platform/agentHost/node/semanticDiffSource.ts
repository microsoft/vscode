/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from '../../../base/common/buffer.js';
import { extUriBiasedIgnorePathCase } from '../../../base/common/resources.js';
import { URI } from '../../../base/common/uri.js';
import { localize } from '../../../nls.js';
import { IAgentHostGitService } from '../common/agentHostGitService.js';
import { ISemanticDiffFileSourceResult, ISemanticDiffRepositoryResult, SEMANTIC_DIFF_FILE_BYTE_LIMIT, SemanticDiffSourceRequest } from '../common/semanticDiffSource.js';
import { resolveSessionRepositories } from './agentHostSessionRepositories.js';

/** Reads only pinned source in repositories belonging to the invoking session. */
export async function readSemanticDiffSource(request: SemanticDiffSourceRequest, workingDirectories: readonly URI[], git: IAgentHostGitService): Promise<ISemanticDiffRepositoryResult | ISemanticDiffFileSourceResult> {
	const { gitRepositories } = await resolveSessionRepositories(workingDirectories, git);
	if (request.kind === 'repositories') {
		return { kind: 'repositories', repositories: gitRepositories.map(repository => repository.toString()) };
	}
	const selected = URI.parse(request.repositoryUri);
	const repository = gitRepositories.find(root => extUriBiasedIgnorePathCase.isEqual(root, selected));
	if (!repository) {
		throw new Error(localize('semanticDiff.repositoryUnavailable', "The selected repository does not belong to this agent session."));
	}
	const revisions = await Promise.all([request.baseRevision, request.targetRevision].map(revision => git.revParse(repository, `${revision}^{commit}`, { allowLazyFetch: false })));
	if (revisions[0] !== request.baseRevision || revisions[1] !== request.targetRevision) {
		throw new Error(localize('semanticDiff.revisionUnavailable', "The classified commits could not be resolved locally. Ensure the required revisions are present and Git supports --no-lazy-fetch."));
	}
	const { file } = request;
	const originalPath = file.oldPath ?? file.path;
	const [original, modified, diff] = await Promise.all([
		file.status === 'added' ? undefined : git.showBlob(repository, request.baseRevision, originalPath, { allowLazyFetch: false }),
		file.status === 'deleted' ? undefined : git.showBlob(repository, request.targetRevision, file.path, { allowLazyFetch: false }),
		git.getDiffPatchBetweenRefs(repository, {
			fromRef: request.baseRevision,
			toRef: request.targetRevision,
			paths: [...new Set([originalPath, file.path])].map(path => `:(literal)${path}`),
			maxBuffer: SEMANTIC_DIFF_FILE_BYTE_LIMIT,
			canonical: true,
			allowLazyFetch: false,
		}),
	]);
	if ((file.status !== 'added' && original === undefined) || (file.status !== 'deleted' && modified === undefined) || !diff || diff.patch === undefined) {
		if (diff?.tooLarge) {
			throw new Error(localize('semanticDiff.sourceTooLarge', "This file exceeds the semantic diff editor's source-size limit."));
		}
		throw new Error(localize('semanticDiff.fileUnavailable', "The classified file versions could not be read from the selected commits."));
	}
	if (diff.tooLarge || VSBuffer.fromString(diff.patch).byteLength > SEMANTIC_DIFF_FILE_BYTE_LIMIT) {
		throw new Error(localize('semanticDiff.sourceTooLarge', "This file exceeds the semantic diff editor's source-size limit."));
	}
	return { kind: 'file', original: decodeText(original), modified: decodeText(modified), patch: diff.patch };
}

function decodeText(buffer: VSBuffer | undefined): string | undefined {
	if (buffer === undefined) {
		return undefined;
	}
	if (buffer.byteLength > SEMANTIC_DIFF_FILE_BYTE_LIMIT) {
		throw new Error(localize('semanticDiff.sourceTooLarge', "This file exceeds the semantic diff editor's source-size limit."));
	}
	if (buffer.buffer.includes(0)) {
		throw new Error(localize('semanticDiff.binarySource', "Binary file content cannot be shown as classified text hunks."));
	}
	try {
		return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(buffer.buffer);
	} catch {
		throw new Error(localize('semanticDiff.unsupportedEncoding', "The semantic diff editor currently supports UTF-8 file content only."));
	}
}
