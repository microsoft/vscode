/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { combinedDisposable, Disposable, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { IRange } from '../../../../editor/common/core/range.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export const IAgentEditorCommentsBridge = createDecorator<IAgentEditorCommentsBridge>('agentEditorCommentsBridge');

/** A comment to render on top of an editor for a session-scoped resource. */
export interface IAgentEditorComment {
	readonly id: string;
	readonly range: IRange;
	readonly body: string;
}

export interface IAgentEditorReview {
	readonly activeFeedbackId?: string;
	readonly activeFeedbackRequestId: number;
}

export interface IAgentEditorCommentRevealEvent {
	readonly resource: URI;
	readonly id: string;
}

/**
 * Supplies agent comments for a resource, such as session feedback or plan review comments.
 */
export interface IAgentEditorCommentsProvider {
	readonly onDidChangeComments: Event<void>;
	readonly onDidRevealComment: Event<IAgentEditorCommentRevealEvent>;
	/** Whether new comments can be added for the resource (i.e. it is in scope for a session). */
	acceptsComments(resource: URI): boolean;
	getComments(resource: URI): readonly IAgentEditorComment[];
	addComment(resource: URI, range: IRange, body: string): void;
	updateCommentRange?(resource: URI, id: string, range: IRange): void;
	deleteComment(resource: URI, id: string): void;
	getReview?(resource: URI): IAgentEditorReview | undefined;
}

/**
 * Workbench-layer seam that lets the extension host read and contribute agent comments
 * without depending on their feature-specific stores.
 */
export interface IAgentEditorCommentsBridge {
	readonly _serviceBrand: undefined;

	/** Fired when comments change, or when a provider is registered/unregistered. */
	readonly onDidChangeComments: Event<void>;
	readonly onDidRevealComment: Event<IAgentEditorCommentRevealEvent>;

	/** Whether new comments can be added for the resource. */
	acceptsComments(resource: URI): boolean;
	getComments(resource: URI): readonly IAgentEditorComment[];
	addComment(resource: URI, range: IRange, body: string): void;
	updateCommentRange(resource: URI, id: string, range: IRange): void;
	deleteComment(resource: URI, id: string): void;
	getReview(resource: URI): IAgentEditorReview | undefined;

	/** Register a provider. The most recently registered provider that accepts a resource handles it. */
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
				provider.onDidRevealComment(event => this._onDidRevealComment.fire(event)),
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

	getComments(resource: URI): readonly IAgentEditorComment[] {
		return this._getProvider(resource)?.getComments(resource) ?? [];
	}

	addComment(resource: URI, range: IRange, body: string): void {
		this._getProvider(resource)?.addComment(resource, range, body);
	}

	updateCommentRange(resource: URI, id: string, range: IRange): void {
		this._getProvider(resource)?.updateCommentRange?.(resource, id, range);
	}

	deleteComment(resource: URI, id: string): void {
		this._getProvider(resource)?.deleteComment(resource, id);
	}

	getReview(resource: URI): IAgentEditorReview | undefined {
		return this._getProvider(resource)?.getReview?.(resource);
	}

	private _getProvider(resource: URI): IAgentEditorCommentsProvider | undefined {
		for (let index = this._providers.length - 1; index >= 0; index--) {
			const provider = this._providers[index].provider;
			if (provider.acceptsComments(resource)) {
				return provider;
			}
		}
		return undefined;
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
