/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { equals } from '../../../../base/common/objects.js';
import { URI } from '../../../../base/common/uri.js';
import { IAgentHostGitService } from '../../common/agentHostGitService.js';
import { resolveAgentHostSession } from '../../common/agentHostSubscriptionService.js';
import { findDeepestContainingWorkingDirectory, isMultiRootSession } from '../../common/agentHostWorkingDirectories.js';
import { parseFolderChangesetOwnerUri } from '../../common/changesetUri.js';
import { AhpErrorCodes, ContentEncoding, ProtocolError, type ResourceReadResult } from '../../common/state/sessionProtocol.js';
import { isAhpChatChannel } from '../../common/state/sessionState.js';
import { getEffectiveWorkingDirectories } from '../agentConfigurationService.js';
import { resolveChangesetOwnerScope } from '../agentHostBranchChangesetScope.js';
import { IAgentHostChatOwnershipService } from '../agentHostChatOwnershipService.js';
import type { IAgentHostResourceProvider } from '../agentHostResourceProviders.js';
import { resolveSessionRepositories } from '../agentHostSessionRepositories.js';
import { AgentHostStateManager, IAgentHostStateManager } from '../agentHostStateManager.js';
import { type IGitBlobUriFields, parseGitBlobUri } from '../gitDiffContent.js';

/** Session lifecycle operations needed while reading a session's git content. */
interface IGitBlobResourceProviderHost {
	readSavedWorkingDirectories(session: URI, resource: URI): Promise<readonly string[] | undefined>;
	restoreSession(session: URI): Promise<void>;
	reconcileResidency(): void;
}

/** Reads git blobs using only the owning session's trusted repositories. */
export class GitBlobResourceProvider implements IAgentHostResourceProvider {
	constructor(
		private readonly _host: IGitBlobResourceProviderHost,
		@IAgentHostGitService private readonly _gitService: IAgentHostGitService,
		@IAgentHostStateManager private readonly _stateManager: AgentHostStateManager,
		@IAgentHostChatOwnershipService private readonly _chatOwnership: IAgentHostChatOwnershipService,
	) { }

	async read(uri: URI): Promise<ResourceReadResult> {
		const fields = parseGitBlobUri(uri.toString());
		if (!fields) {
			throw new ProtocolError(AhpErrorCodes.NotFound, `Content not found: ${uri.toString()}`);
		}
		if (!this._gitService) {
			throw new ProtocolError(AhpErrorCodes.NotFound, `git service unavailable for: ${fields.repoRelativePath}`);
		}
		const resource = URI.parse(fields.sessionUri);
		const recordedOwner = isAhpChatChannel(fields.sessionUri) ? await this._chatOwnership.createRecordedOwnerLookup()(fields.sessionUri) : undefined;
		const owningSession = resolveAgentHostSession(resource, chat => chat === fields.sessionUri ? recordedOwner : this._chatOwnership.getChatOwner(chat));
		if (!owningSession) {
			throw new ProtocolError(AhpErrorCodes.NotFound, `Session not found: ${fields.sessionUri}`);
		}
		const wasRestored = !!this._stateManager.getSessionState(owningSession.toString());
		try {
			const savedDirectories = wasRestored ? undefined : await this._host.readSavedWorkingDirectories(owningSession, resource);
			if (!wasRestored && savedDirectories === undefined) {
				await this._host.restoreSession(owningSession);
			}
			const workingDirectory = await this._resolveGitBlobWorkingDirectory(fields, owningSession, savedDirectories);
			if (!workingDirectory) {
				throw new ProtocolError(AhpErrorCodes.NotFound, `No session repository resolves git-blob path: ${fields.absolutePath || fields.repoRelativePath}`);
			}
			const blob = await this._gitService.showBlob(workingDirectory, fields.sha, fields.repoRelativePath);
			if (!blob) {
				throw new ProtocolError(AhpErrorCodes.NotFound, `git blob not found: ${fields.sha}:${fields.repoRelativePath}`);
			}
			if (savedDirectories !== undefined && !equals(savedDirectories, await this._host.readSavedWorkingDirectories(owningSession, resource))) {
				throw new ProtocolError(AhpErrorCodes.NotFound, 'Saved repository ownership changed while reading the file');
			}
			return {
				data: blob.toString(),
				encoding: ContentEncoding.Utf8,
				contentType: 'text/plain',
			};
		} finally {
			if (!wasRestored && this._stateManager.getSessionState(owningSession.toString())) {
				this._host.reconcileResidency();
			}
		}
	}

	/**
	 * Picks the working directory to run `git show` from for a `git-blob:` URI.
	 *
	 * The directory is chosen only from the session's own, server-trusted working
	 * directories — never from anything client-supplied — so opening a diff can
	 * never be steered into an arbitrary repository. `fields.absolutePath` (the
	 * file's absolute path, carried in the URI) is used only to *select* which
	 * repo to run in; it is never used as the cwd itself.
	 *
	 * Selection rules:
	 * - Single-folder session: return the one working directory directly, without
	 *   a containment check (preserves legacy behavior for relocated/remapped
	 *   worktrees whose stored path no longer sits under the current root).
	 * - Multi-root session: resolve each working directory to its repo root and
	 *   return the deepest root that contains `absolutePath`; if none contains it,
	 *   return `undefined` (→ NotFound) rather than reading from the wrong repo.
	 * - Legacy URI with no `absolutePath` (`''`): fall back to the primary
	 *   working directory, since there is no path to match.
	 *
	 * Examples (roots index 0 = primary):
	 *   [/work/app]                    + /work/app/src/a.ts   → /work/app
	 *   [/work/app]                    + /elsewhere/x.ts      → /work/app
	 *   [/work/app, /work/app/pkgs/ui] + /work/app/pkgs/ui/b  → /work/app/pkgs/ui
	 *   [/work/app, /work/lib]         + /outside/c.ts        → undefined (NotFound)
	 *   [/work/app, /work/lib]         + ''  (legacy)         → /work/app
	 */
	private async _resolveGitBlobWorkingDirectory(fields: IGitBlobUriFields, owningSession: URI, savedDirectories?: readonly string[]): Promise<URI | undefined> {
		const gitService = this._gitService;
		if (!gitService) {
			return undefined;
		}
		let workingDirectories = savedDirectories;
		if (workingDirectories === undefined) {
			const ownerScope = resolveChangesetOwnerScope(this._stateManager, fields.sessionUri);
			if (parseFolderChangesetOwnerUri(fields.sessionUri) && ownerScope.workingDirectories.length === 0) {
				return undefined;
			}
			workingDirectories = ownerScope.workingDirectories.length
				? ownerScope.workingDirectories
				: getEffectiveWorkingDirectories(this._stateManager, owningSession.toString());
		}
		// Backwards-compat: no resolvable absolute path means we cannot match a
		// repository root, so fall back to today's primary-directory behavior.
		if (!fields.absolutePath) {
			const primary = workingDirectories?.[0];
			return primary ? URI.parse(primary) : undefined;
		}
		if (!workingDirectories?.length) {
			return undefined;
		}
		// Single-folder sessions keep today's behavior EXACTLY: run against the
		// one working directory directly, without the multi-root path-containment
		// check. This preserves AC-1.1 (single-folder unchanged) — e.g. a
		// git-blob URI whose stored absolute path no longer sits under the
		// current root (a remapped/relocated worktree) still resolves against the
		// primary directory as it did before multi-root support.
		if (!isMultiRootSession(workingDirectories)) {
			return URI.parse(workingDirectories[0]);
		}
		const { gitRepositories } = await resolveSessionRepositories(workingDirectories.map(directory => URI.parse(directory)), gitService);
		if (!gitRepositories.length) {
			return undefined;
		}
		// The absolute path was stored as a bare path (its scheme/authority were
		// dropped when the URI was built); rebuild it against the session roots'
		// own scheme/authority so it lines up with the repository roots.
		const blobResource = gitRepositories[0].with({ path: fields.absolutePath });
		return findDeepestContainingWorkingDirectory(blobResource, gitRepositories);
	}
}
