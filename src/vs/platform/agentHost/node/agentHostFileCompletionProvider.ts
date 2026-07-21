/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../base/common/cancellation.js';
import { isCancellationError } from '../../../base/common/errors.js';
import { compareItemsByFuzzyScore, FuzzyScorerCache, IItemAccessor, prepareQuery, scoreItemFuzzy } from '../../../base/common/fuzzyScorer.js';
import { Schemas } from '../../../base/common/network.js';
import { basename, relativePath } from '../../../base/common/resources.js';
import { URI } from '../../../base/common/uri.js';
import { CompletionItem, CompletionItemKind, CompletionsParams } from '../common/state/protocol/commands.js';
import { MessageAttachmentKind } from '../common/state/protocol/state.js';
import { CompletionTriggerCharacter, IAgentHostCompletionItemProvider } from './agentHostCompletions.js';
import { extractAtToken, isSessionReferenceToken } from './agentHostCompletionTokens.js';
import { AgentHostStateManager } from './agentHostStateManager.js';
import { AgentHostWorkspaceFiles } from './agentHostWorkspaceFiles.js';

/** Maximum number of completion items returned per call. */
const MAX_RESULTS = 50;

/**
 * Item-accessor that exposes a {@link URI} as basename / parent-directory /
 * relative path for the {@link scoreItemFuzzy} family.
 */
class UriAccessor implements IItemAccessor<URI> {
	constructor(private readonly _workingDirectory: URI) { }

	getItemLabel(item: URI): string {
		return basename(item);
	}

	getItemDescription(item: URI): string | undefined {
		const rel = relativePath(this._workingDirectory, item);
		if (!rel) {
			return undefined;
		}
		const idx = rel.lastIndexOf('/');
		return idx > 0 ? rel.slice(0, idx) : undefined;
	}

	getItemPath(item: URI): string | undefined {
		const rel = relativePath(this._workingDirectory, item);
		return rel ?? item.fsPath;
	}
}

/**
 * Generic completion provider that contributes workspace file references
 * for a {@link CompletionItemKind.UserMessage} input — typically used for
 * `@`-mentions in the user message composer.
 *
 * When the user has typed an `@`-prefixed token at the cursor position,
 * this provider enumerates files under the session's working directory
 * (via {@link AgentHostWorkspaceFiles}, which uses ripgrep and respects
 * `.gitignore`), ranks them with the same fuzzy scorer used by the
 * VS Code Quick Open file picker, and returns up to {@link MAX_RESULTS}
 * matches.
 */
export class AgentHostFileCompletionProvider implements IAgentHostCompletionItemProvider {

	readonly kinds: ReadonlySet<CompletionItemKind> = new Set([CompletionItemKind.UserMessage]);

	readonly triggerCharacters: readonly string[] = [CompletionTriggerCharacter.File, CompletionTriggerCharacter.Hash];

	constructor(
		private readonly _stateManager: AgentHostStateManager,
		private readonly _workspaceFiles: AgentHostWorkspaceFiles,
	) { }

	async provideCompletionItems(params: CompletionsParams, token: CancellationToken): Promise<readonly CompletionItem[]> {
		const workingDirectoryStr = this._stateManager.getSessionState(params.channel)?.workingDirectory;
		if (!workingDirectoryStr) {
			return [];
		}
		const workingDirectory = URI.parse(workingDirectoryStr);
		if (workingDirectory.scheme !== Schemas.file) {
			return [];
		}

		const at = extractAtToken(params.text, params.offset);
		if (!at) {
			return [];
		}
		// Cede `#session…` tokens to the session-reference provider so file
		// matches don't get mixed into the session list.
		if (at.triggerChar === CompletionTriggerCharacter.Hash && isSessionReferenceToken(at.token)) {
			return [];
		}

		let files: readonly URI[];
		try {
			files = await this._workspaceFiles.getFiles(workingDirectory, token);
		} catch (err) {
			// Cancellation is expected on every keystroke as Monaco cancels
			// the previous request. Don't let it surface as a provider failure
			// in {@link AgentHostCompletions} — it would log noisy errors on
			// normal typing.
			if (isCancellationError(err)) {
				return [];
			}
			throw err;
		}
		if (token.isCancellationRequested || files.length === 0) {
			return [];
		}

		const accessor = new UriAccessor(workingDirectory);
		const query = prepareQuery(at.token);
		const cache: FuzzyScorerCache = Object.create(null);

		let candidates: URI[];
		if (!query.normalized) {
			// Empty token: return the first MAX_RESULTS files in enumeration order.
			candidates = files.slice(0, MAX_RESULTS);
		} else {
			// Filter out non-matches first to avoid sorting tens of thousands of zeros.
			const matching = files.filter(f => scoreItemFuzzy(f, query, true, accessor, cache).score > 0);
			matching.sort((a, b) => compareItemsByFuzzyScore(a, b, query, true, accessor, cache));
			candidates = matching.slice(0, MAX_RESULTS);
		}

		return candidates.map((uri): CompletionItem => {
			const name = basename(uri);
			return {
				insertText: at.triggerChar + name,
				rangeStart: at.rangeStart,
				rangeEnd: at.rangeEnd,
				attachment: {
					type: MessageAttachmentKind.Resource,
					uri: uri.toString(),
					label: name,
					displayKind: 'document',
				},
			};
		});
	}
}
