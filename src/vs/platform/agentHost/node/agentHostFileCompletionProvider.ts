/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../base/common/cancellation.js';
import { URI } from '../../../base/common/uri.js';
import { CompletionItem, CompletionItemKind, CompletionsParams } from '../common/state/protocol/commands.js';
import { IAgentHostCompletionItemProvider } from './agentHostCompletions.js';
import { AgentHostStateManager } from './agentHostStateManager.js';

/**
 * Generic completion provider that contributes workspace file references
 * for a {@link CompletionItemKind.UserMessage} input — typically used for
 * `@`-mentions in the user message composer.
 *
 * NOTE: This is currently a stub. The intended behaviour is:
 *   1. Use {@link CompletionsParams.text} and {@link CompletionsParams.offset}
 *      to extract the `@`-prefixed token the user is typing.
 *   2. List files under the session's workspace folder (resolved via the
 *      state manager) that match the token, respecting `.gitignore` and
 *      reasonable result limits.
 *   3. Build {@link CompletionItem}s carrying a
 *      {@link MessageAttachmentKind.Resource} attachment pointing at the
 *      matched file URI.
 */
export class AgentHostFileCompletionProvider implements IAgentHostCompletionItemProvider {

	readonly kinds: ReadonlySet<CompletionItemKind> = new Set([CompletionItemKind.UserMessage]);

	constructor(
		private readonly _stateManager: AgentHostStateManager,
	) { }

	async provideCompletionItems(params: CompletionsParams, _token: CancellationToken): Promise<readonly CompletionItem[]> {
		const workingDirectoryStr = this._stateManager.getSessionState(params.session)?.summary.workingDirectory;
		if (!workingDirectoryStr) {
			return [];
		}
		const workingDirectory = URI.parse(workingDirectoryStr);
		// TODO: extract the `@`-token at params.offset, list files under
		// `workingDirectory`, build CompletionItems with
		// MessageAttachmentKind.Resource attachments.
		void workingDirectory;
		return [];
	}
}
