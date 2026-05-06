/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../base/common/cancellation.js';
import { Disposable, IDisposable, toDisposable } from '../../../base/common/lifecycle.js';
import { ILogService } from '../../log/common/log.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import type { CompletionItem, CompletionItemKind, CompletionsParams, CompletionsResult } from '../common/state/protocol/commands.js';

export const IAgentHostCompletions = createDecorator<IAgentHostCompletions>('agentHostCompletions');

/**
 * Pluggable provider that contributes {@link CompletionItem}s for one or
 * more {@link CompletionItemKind}s.
 *
 * Providers are registered via {@link IAgentHostCompletions.registerProvider}
 * and may be agent-specific (e.g. registered alongside an `IAgent`) or
 * generic (e.g. the built-in workspace file completion provider).
 */
export interface IAgentHostCompletionItemProvider {
	/** Completion kinds this provider handles. Providers are skipped for any other kind. */
	readonly kinds: ReadonlySet<CompletionItemKind>;

	/**
	 * Compute completion items for the given input.
	 *
	 * Implementations SHOULD respect `token` and return promptly.
	 * Throwing or rejecting fails this provider only; other providers'
	 * results are still returned by {@link IAgentHostCompletions.completions}.
	 */
	provideCompletionItems(params: CompletionsParams, token: CancellationToken): Promise<readonly CompletionItem[]>;
}

/**
 * Server-side completions service. Owns a set of pluggable providers and
 * fans out a single `completions` request to every provider whose
 * {@link IAgentHostCompletionItemProvider.kinds} includes the requested kind.
 *
 * Provider results are concatenated in registration order; a single failing
 * provider does not prevent other providers' results from being returned.
 */
export interface IAgentHostCompletions {
	readonly _serviceBrand: undefined;

	/**
	 * Register a completion provider. The returned {@link IDisposable} unregisters
	 * the provider when disposed.
	 */
	registerProvider(provider: IAgentHostCompletionItemProvider): IDisposable;

	/**
	 * Compute completion items by fanning out to all matching providers.
	 */
	completions(params: CompletionsParams, token?: CancellationToken): Promise<CompletionsResult>;
}

export class AgentHostCompletions extends Disposable implements IAgentHostCompletions {
	declare readonly _serviceBrand: undefined;

	private readonly _providers = new Set<IAgentHostCompletionItemProvider>();

	constructor(
		@ILogService private readonly _logService: ILogService,
	) {
		super();
	}

	registerProvider(provider: IAgentHostCompletionItemProvider): IDisposable {
		this._providers.add(provider);
		return toDisposable(() => this._providers.delete(provider));
	}

	async completions(params: CompletionsParams, token: CancellationToken = CancellationToken.None): Promise<CompletionsResult> {
		const matching = [...this._providers].filter(p => p.kinds.has(params.kind));
		if (matching.length === 0) {
			return { items: [] };
		}
		const settled = await Promise.allSettled(
			matching.map(p => p.provideCompletionItems(params, token)),
		);
		const items: CompletionItem[] = [];
		for (let i = 0; i < settled.length; i++) {
			const result = settled[i];
			if (result.status === 'fulfilled') {
				items.push(...result.value);
			} else {
				this._logService.error(result.reason, `[AgentHostCompletions] Provider failed for kind=${params.kind}`);
			}
		}
		return { items };
	}
}
