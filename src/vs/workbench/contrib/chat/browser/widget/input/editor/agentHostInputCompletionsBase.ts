/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../../../base/common/cancellation.js';
import { Disposable, IDisposable } from '../../../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { Position } from '../../../../../../../editor/common/core/position.js';
import { Range } from '../../../../../../../editor/common/core/range.js';
import { CompletionItem, CompletionList } from '../../../../../../../editor/common/languages.js';
import { ITextModel } from '../../../../../../../editor/common/model.js';
import { LanguageFilter } from '../../../../../../../editor/common/languageSelector.js';
import { ILanguageFeaturesService } from '../../../../../../../editor/common/services/languageFeatures.js';
import { IChatInputCompletionItem, IChatSessionsService } from '../../../../common/chatSessionsService.js';
import { isAtTriggerCharacterToken } from './chatInputCompletionUtils.js';

/**
 * Shared plumbing for Monaco completion providers that delegate to an
 * agent host's `provideChatInputCompletions` RPC.
 *
 * Subclasses own the registration lifecycle (per-scheme, per-active-
 * session, etc.) and supply two pieces of behaviour:
 *
 *   - {@link _resolveContext}: how to find the session resource for a
 *     given input model, plus any subclass-specific data ({@link TContext})
 *     that needs to flow into the accept command. Receives the per-
 *     registration data ({@link TRegData}) the subclass passed to
 *     {@link _registerProvider} so it can short-circuit when the model
 *     does not belong to *this* registration (e.g. a different scheme).
 *   - {@link _buildItem}: how to produce the final Monaco
 *     {@link CompletionItem} including the command that runs when the
 *     user accepts a suggestion.
 *
 * The base handles the cross-cutting concerns: gating on trigger
 * characters, performing the host RPC, cancellation, and registering
 * the Monaco provider with the host-announced trigger characters.
 */
export abstract class AgentHostInputCompletionsBase<TContext, TRegData = void> extends Disposable {

	constructor(
		protected readonly _languageFeaturesService: ILanguageFeaturesService,
		protected readonly _chatSessionsService: IChatSessionsService,
	) {
		super();
	}

	/**
	 * Resolve the session resource whose host should answer completions
	 * for `model`, along with any subclass-specific context that should
	 * flow into {@link _buildItem}. Return `undefined` to skip.
	 */
	protected abstract _resolveContext(model: ITextModel, regData: TRegData): { sessionResource: URI; context: TContext } | undefined;

	/**
	 * Build the Monaco completion item — including the accept command —
	 * for one item returned by the host.
	 */
	protected abstract _buildItem(position: Position, item: IChatInputCompletionItem, context: TContext): CompletionItem;

	/**
	 * Register a Monaco completion provider that delegates to this
	 * instance. Subclasses call this once their lifecycle decides a
	 * registration should exist (e.g. once a content provider becomes
	 * available, or once the active session changes to an AHP-backed
	 * one). The opaque {@link regData} is forwarded to
	 * {@link _resolveContext} so the subclass can identify which
	 * registration is firing (e.g. its scheme) and ignore models that
	 * don't belong to it.
	 */
	protected _registerProvider(filter: LanguageFilter, debugName: string, triggerCharacters: readonly string[], regData: TRegData): IDisposable {
		return this._languageFeaturesService.completionProvider.register(filter, {
			_debugDisplayName: debugName,
			triggerCharacters: [...triggerCharacters],
			provideCompletionItems: (model, position, _context, token) => this._provide(model, position, token, triggerCharacters, regData),
		});
	}

	private async _provide(model: ITextModel, position: Position, token: CancellationToken, triggerCharacters: readonly string[], regData: TRegData): Promise<CompletionList | null> {
		// Only consult the agent host when the cursor sits inside a token
		// led by one of the host-announced trigger characters. Without
		// this gate Monaco re-invokes the provider on every keystroke
		// (for filtering / incomplete-result refresh), which would
		// produce an RPC round-trip per character.
		if (!isAtTriggerCharacterToken(model, position, triggerCharacters)) {
			return null;
		}

		const ctx = this._resolveContext(model, regData);
		if (!ctx) {
			return null;
		}

		const text = model.getValue();
		const offset = model.getOffsetAt(position);
		const result = await this._chatSessionsService.provideChatInputCompletions(ctx.sessionResource, { text, offset }, token);
		if (token.isCancellationRequested || !result) {
			return null;
		}

		const suggestions: CompletionItem[] = [];
		for (const item of result.items) {
			suggestions.push(this._buildItem(position, item, ctx.context));
		}
		return { suggestions };
	}

	/**
	 * Compute the insert/replace ranges for an item. Positions returned
	 * by the host are already 1-based Monaco positions, so they can be
	 * used directly. When omitted, the ranges default to a zero-length
	 * span at the cursor (Monaco then inserts without replacing).
	 */
	protected static computeRange(position: Position, item: IChatInputCompletionItem): { insert: Range; replace: Range } {
		const start = item.start ?? position;
		const end = item.end ?? position;
		const replace = new Range(start.lineNumber, start.column, end.lineNumber, end.column);
		const insert = new Range(start.lineNumber, start.column, position.lineNumber, position.column);
		return { insert, replace };
	}
}
