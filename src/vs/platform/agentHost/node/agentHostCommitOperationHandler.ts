/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { basename } from '../../../base/common/resources.js';
import { CancellationToken } from '../../../base/common/cancellation.js';
import { URI } from '../../../base/common/uri.js';
import { localize } from '../../../nls.js';
import { GITHUB_COPILOT_PROTECTED_RESOURCE, IAgentService } from '../common/agentService.js';
import { parseChangesetUri } from '../common/changesetUri.js';
import { type IChangesetOperationHandler } from '../common/agentHostChangesetOperationService.js';
import type { InvokeChangesetOperationParams, InvokeChangesetOperationResult } from '../common/state/protocol/channels-changeset/commands.js';
import { AHP_AUTH_REQUIRED, AHP_SESSION_NOT_FOUND, JsonRpcErrorCodes, ProtocolError } from '../common/state/sessionProtocol.js';
import { readSessionGitState, type ISessionFileDiff, type SessionState } from '../common/state/sessionState.js';
import { ILogService } from '../../log/common/log.js';
import { IAgentHostGitService } from '../common/agentHostGitService.js';
import { CopilotApiError, ICopilotApiService } from './shared/copilotApiService.js';

const MAX_CHANGE_SUMMARY_PROMPT_CHARS = 20_000;

export class AgentHostCommitOperationHandler implements IChangesetOperationHandler {

	public static readonly OPERATION_COMMIT = 'commit';

	constructor(
		private readonly _getSessionState: (sessionKey: string) => SessionState | undefined,
		private readonly _onCommitted: (sessionKey: string) => Promise<void>,
		@IAgentService private readonly _agentService: IAgentService,
		@IAgentHostGitService private readonly _gitService: IAgentHostGitService,
		@ICopilotApiService private readonly _copilotApiService: ICopilotApiService,
		@ILogService private readonly _logService: ILogService,
	) { }

	async invoke(params: InvokeChangesetOperationParams, token: CancellationToken): Promise<InvokeChangesetOperationResult> {
		const abortController = new AbortController();
		if (token.isCancellationRequested) {
			abortController.abort();
		}
		const cancellationListener = token.onCancellationRequested(() => abortController.abort());
		try {
			return await this._invoke(params, token, abortController.signal);
		} finally {
			cancellationListener.dispose();
		}
	}

	private async _invoke(params: InvokeChangesetOperationParams, token: CancellationToken, signal: AbortSignal): Promise<InvokeChangesetOperationResult> {
		const parsed = parseChangesetUri(params.channel);
		if (!parsed) {
			throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, `Not an uncommitted changeset URI: ${params.channel}`);
		}
		this._throwIfCancelled(token);

		const sessionUri = parsed.sessionUri;
		const sessionState = this._getSessionState(sessionUri);
		if (!sessionState) {
			throw new ProtocolError(AHP_SESSION_NOT_FOUND, `Session not found: ${sessionUri}`);
		}

		const workingDirectoryStr = sessionState.workingDirectory;
		if (!workingDirectoryStr) {
			throw new ProtocolError(JsonRpcErrorCodes.InternalError, `Session has no working directory: ${sessionUri}`);
		}
		const workingDirectory = URI.parse(workingDirectoryStr);

		const gitState = readSessionGitState(sessionState._meta);
		if (!gitState) {
			throw new ProtocolError(JsonRpcErrorCodes.InternalError, `Session's working directory is not a git repo: ${sessionUri}`);
		}

		const hasUncommitted = await this._gitService.hasUncommittedChanges(workingDirectory);
		if (!hasUncommitted) {
			return { message: { markdown: localize('agentHost.changeset.commit.noChanges', "No uncommitted changes to commit.") } };
		}
		this._throwIfCancelled(token);

		const authToken = this._agentService.getAuthToken({
			resource: GITHUB_COPILOT_PROTECTED_RESOURCE.resource,
			scopes: GITHUB_COPILOT_PROTECTED_RESOURCE.scopes_supported,
		});
		if (!authToken) {
			throw new ProtocolError(
				AHP_AUTH_REQUIRED,
				localize('agentHost.changeset.commit.authRequired', "Sign in to GitHub Copilot to generate a commit message."),
				[GITHUB_COPILOT_PROTECTED_RESOURCE],
			);
		}

		const diffs = await this._gitService.computeSessionFileDiffs(workingDirectory, { sessionUri });
		if (!diffs || diffs.length === 0) {
			throw new ProtocolError(JsonRpcErrorCodes.InternalError, localize('agentHost.changeset.commit.diffFailed', "Could not compute uncommitted changes to generate a commit message."));
		}
		this._throwIfCancelled(token);

		let message: string;
		try {
			message = this._cleanCommitMessage(await this._copilotApiService.utilityChatCompletion(authToken, {
				messages: this._buildCommitMessagePrompt(workingDirectory, gitState.branchName, diffs),
			}, { signal }));
		} catch (err) {
			this._throwIfCancelled(token);
			if (this._isAuthFailure(err)) {
				throw new ProtocolError(
					AHP_AUTH_REQUIRED,
					localize('agentHost.changeset.commit.authExpired', "Authentication is required to generate a commit message. Please sign in to GitHub Copilot and try again."),
					[GITHUB_COPILOT_PROTECTED_RESOURCE],
				);
			}
			throw err;
		}
		if (!message) {
			throw new ProtocolError(JsonRpcErrorCodes.InternalError, localize('agentHost.changeset.commit.emptyMessage', "Generated commit message was empty."));
		}
		this._throwIfCancelled(token);

		this._logService.info(`[AgentHostCommitOperationHandler] Committing uncommitted changes for session ${sessionUri}`);
		try {
			await this._gitService.commitAll(workingDirectory, message);
		} catch (err) {
			this._throwIfCancelled(token);
			throw new ProtocolError(JsonRpcErrorCodes.InternalError, `Failed to commit changes: ${err instanceof Error ? err.message : String(err)}`);
		}

		try {
			await this._onCommitted(sessionUri);
		} catch (err) {
			this._logService.warn(`[AgentHostCommitOperationHandler] Post-commit refresh failed for session ${sessionUri}: ${err instanceof Error ? err.message : String(err)}`);
		}

		return { message: { markdown: localize('agentHost.changeset.commit.committed', "Committed changes with message: `{0}`", message.split('\n')[0]) } };
	}

	private _buildCommitMessagePrompt(workingDirectory: URI, branchName: string | undefined, diffs: readonly ISessionFileDiff[]): { role: 'system' | 'user'; content: string }[] {
		const changeSummary = this._summarizeDiffsForPrompt(diffs);
		return [
			{
				role: 'system',
				content: [
					'You generate concise Git commit messages.',
					'Return only the commit message text, with no markdown or code fences.',
					'Use imperative mood. Keep the subject line under 72 characters.',
					'Add a body only when it helps explain multiple related changes.',
				].join(' '),
			},
			{
				role: 'user',
				content: [
					`Repository: ${basename(workingDirectory)}`,
					`Branch: ${branchName ?? 'unknown'}`,
					'Changed files:',
					changeSummary,
				].join('\n'),
			},
		];
	}

	private _summarizeDiffsForPrompt(diffs: readonly ISessionFileDiff[]): string {
		const lines: string[] = [];
		for (const diff of diffs) {
			const before = diff.before?.uri;
			const after = diff.after?.uri;
			const path = after ?? before ?? '(unknown)';
			let kind = 'Edit';
			if (!before && after) {
				kind = 'Create';
			} else if (before && !after) {
				kind = 'Delete';
			} else if (before && after && before !== after) {
				kind = 'Rename';
			}
			lines.push(`- ${kind}: ${this._displayUri(path)} (+${diff.diff?.added ?? 0} -${diff.diff?.removed ?? 0})`);
			if (lines.join('\n').length > MAX_CHANGE_SUMMARY_PROMPT_CHARS) {
				lines.push('[file list truncated]');
				break;
			}
		}
		return lines.join('\n');
	}

	private _displayUri(uri: string): string {
		try {
			const parsed = URI.parse(uri);
			return parsed.scheme === 'file' ? parsed.fsPath : parsed.path || uri;
		} catch {
			return uri;
		}
	}

	private _cleanCommitMessage(raw: string): string {
		let text = raw.trim().replace(/\r\n/g, '\n');
		const fenced = /^```(?:text|gitcommit)?\s*([\s\S]*?)\s*```$/i.exec(text);
		if (fenced) {
			text = fenced[1].trim();
		}
		return text;
	}

	private _isAuthFailure(err: unknown): boolean {
		if (err instanceof CopilotApiError) {
			return err.status === 401 || err.status === 403;
		}
		const message = err instanceof Error ? err.message : String(err);
		return /\b(401|403)\b/.test(message)
			&& /\b(auth|authorization|unauthorized|forbidden|token|copilot endpoint discovery|copilot session token mint)\b/i.test(message);
	}

	private _throwIfCancelled(token: CancellationToken): void {
		if (token.isCancellationRequested) {
			throw new ProtocolError(JsonRpcErrorCodes.InternalError, localize('agentHost.changeset.commit.cancelled', "Commit operation was cancelled."));
		}
	}
}
