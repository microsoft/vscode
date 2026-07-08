/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, IDisposable, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
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

/**
 * Supplies the session comments for a resource. Implemented by the sessions
 * layer (backed by the agent feedback store) and registered into the bridge.
 */
export interface IAgentEditorCommentsProvider {
	readonly onDidChangeComments: Event<void>;
	getComments(resource: URI): readonly IAgentEditorComment[];
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

	getComments(resource: URI): readonly IAgentEditorComment[];
	addComment(resource: URI, range: IRange, body: string): void;
	deleteComment(resource: URI, id: string): void;

	/** Install the provider that backs this bridge. Only one provider is active at a time. */
	registerProvider(provider: IAgentEditorCommentsProvider): IDisposable;
}

export class AgentEditorCommentsBridge extends Disposable implements IAgentEditorCommentsBridge {

	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeComments = this._register(new Emitter<void>());
	readonly onDidChangeComments = this._onDidChangeComments.event;

	private _provider: IAgentEditorCommentsProvider | undefined;
	private readonly _providerListener = this._register(new MutableDisposable());

	registerProvider(provider: IAgentEditorCommentsProvider): IDisposable {
		this._provider = provider;
		this._providerListener.value = provider.onDidChangeComments(() => this._onDidChangeComments.fire());
		this._onDidChangeComments.fire();
		return toDisposable(() => {
			if (this._provider === provider) {
				this._provider = undefined;
				this._providerListener.clear();
				this._onDidChangeComments.fire();
			}
		});
	}

	getComments(resource: URI): readonly IAgentEditorComment[] {
		return this._provider?.getComments(resource) ?? [];
	}

	addComment(resource: URI, range: IRange, body: string): void {
		this._provider?.addComment(resource, range, body);
	}

	deleteComment(resource: URI, id: string): void {
		this._provider?.deleteComment(resource, id);
	}
}

registerSingleton(IAgentEditorCommentsBridge, AgentEditorCommentsBridge, InstantiationType.Delayed);
