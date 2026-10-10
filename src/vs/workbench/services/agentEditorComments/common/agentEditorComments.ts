/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { combinedDisposable, Disposable, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { IRange } from '../../../../editor/common/core/range.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export const IAgentEditorCommentsBridge = createDecorator<IAgentEditorCommentsBridge>('agentEditorCommentsBridge');

/** A comment to render on top of an editor for a session-scoped resource. */
export interface IAgentEditorComment {
	readonly id: string;
	readonly resource: URI;
	readonly range: IRange;
	readonly body: string;
}

export interface IAgentEditorCommentRevealEvent {
	readonly resource: URI;
	readonly id: string;
}

/**
 * Supplies the session comments for a resource. Implemented by the sessions
 * layer (backed by the agent feedback store) and registered into the bridge.
 */
export interface IAgentEditorCommentsProvider {
	readonly priority?: number;
	readonly onDidChangeComments: Event<void>;
	readonly onDidRevealComment: Event<IAgentEditorCommentRevealEvent>;
	/** Whether new comments can be added for the resource (i.e. it is in scope for a session). */
	acceptsComments(resource: URI): boolean;
	getComments(resource: URI, includeRelated?: boolean): readonly IAgentEditorComment[];
	getCommentIds?(resource: URI, includeRelated?: boolean): readonly string[];
	addComment(resource: URI, range: IRange, body: string): void;
	deleteComment(resource: URI, id: string): void;
}

/**
 * Workbench-layer seam that lets the (globally registered) main-thread
 * extension host customer read and contribute session editor comments without
 * depending on the sessions layer directly. When no provider is registered
 * (e.g. the regular workbench window) the bridge is a no-op, so the customer
 * degrades gracefully.
 */
export interface IAgentEditorCommentsBridge {
	readonly _serviceBrand: undefined;

	/** Fired when comments change, or when a provider is registered/unregistered. */
	readonly onDidChangeComments: Event<void>;
	readonly onDidRevealComment: Event<IAgentEditorCommentRevealEvent>;

	/** Whether new comments can be added for the resource. `false` when no provider is registered. */
	acceptsComments(resource: URI): boolean;
	getComments(resource: URI, includeRelated?: boolean): readonly IAgentEditorComment[];
	getCommentIds(resource: URI, includeRelated?: boolean): readonly string[];
	addComment(resource: URI, range: IRange, body: string): void;
	deleteComment(resource: URI, id: string): void;
	revealComment(resource: URI, id: string): void;

	registerProvider(provider: IAgentEditorCommentsProvider): IDisposable;
}

export class AgentEditorCommentsBridge extends Disposable implements IAgentEditorCommentsBridge {

	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeComments = this._register(new Emitter<void>());
	readonly onDidChangeComments = this._onDidChangeComments.event;
	private readonly _onDidRevealComment = this._register(new Emitter<IAgentEditorCommentRevealEvent>());
	readonly onDidRevealComment = this._onDidRevealComment.event;

	private readonly _providers: { provider: IAgentEditorCommentsProvider; listener: IDisposable }[] = [];

	registerProvider(provider: IAgentEditorCommentsProvider): IDisposable {
		const entry = {
			provider,
			listener: combinedDisposable(
				provider.onDidChangeComments(() => this._onDidChangeComments.fire()),
				provider.onDidRevealComment(event => {
					if (this._getProvider(event.resource) === provider) {
						this._onDidRevealComment.fire(event);
					}
				}),
			),
		};
		this._providers.push(entry);
		this._onDidChangeComments.fire();
		return toDisposable(() => {
			const index = this._providers.indexOf(entry);
			if (index !== -1) {
				this._providers.splice(index, 1);
				entry.listener.dispose();
				this._onDidChangeComments.fire();
			}
		});
	}

	acceptsComments(resource: URI): boolean {
		return !!this._getProvider(resource);
	}

	getComments(resource: URI, includeRelated = false): readonly IAgentEditorComment[] {
		const comments = this._getProvider(resource)?.getComments(resource, includeRelated) ?? [];
		return includeRelated ? comments : comments.filter(comment => isEqual(comment.resource, resource));
	}

	getCommentIds(resource: URI, includeRelated = false): readonly string[] {
		const provider = this._getProvider(resource);
		return provider?.getCommentIds?.(resource, includeRelated)
			?? provider?.getComments(resource, includeRelated).map(comment => comment.id)
			?? [];
	}

	addComment(resource: URI, range: IRange, body: string): void {
		this._getProvider(resource)?.addComment(resource, range, body);
	}

	deleteComment(resource: URI, id: string): void {
		this._getProvider(resource)?.deleteComment(resource, id);
	}

	revealComment(resource: URI, id: string): void {
		this._onDidRevealComment.fire({ resource, id });
	}

	private _getProvider(resource: URI): IAgentEditorCommentsProvider | undefined {
		return this._providers
			.filter(entry => entry.provider.acceptsComments(resource))
			.sort((first, second) => (second.provider.priority ?? 0) - (first.provider.priority ?? 0))[0]?.provider;
	}

	override dispose(): void {
		for (const entry of this._providers) {
			entry.listener.dispose();
		}
		this._providers.length = 0;
		super.dispose();
	}
}

registerSingleton(IAgentEditorCommentsBridge, AgentEditorCommentsBridge, InstantiationType.Delayed);
