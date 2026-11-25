/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../../../base/common/event.js';
import { Disposable, IDisposable, MutableDisposable, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { IObservable } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { InstantiationType, registerSingleton } from '../../../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../../../platform/instantiation/common/instantiation.js';

/** A chat of the editor window's session layer, of the local agent host, as the folder follow reads it. */
export interface IAgentHostWorktreeChat {
	/**
	 * Where it works; `undefined` while not known, such as before its first request. It changes also where nothing else of its
	 * session does, such as once only this chat of its session moved to a worktree.
	 */
	readonly workingDirectory: IObservable<URI | undefined>;
	readonly isArchived: boolean;
}

/**
 * Resolves the chats of the editor window's session layer, such as those the chat part shows (`ahp-chat:`), which the Chat
 * view's sessions list does not list, for the folder follow only: not an inventory of sessions, nor a trust decision. The
 * sessions layer registers it.
 */
export interface IAgentHostWorktreeChatResolver {
	/** Fires as which chats it resolves, or whether they are archived, may have changed. */
	readonly onDidChange: Event<void>;
	/** The local agent host chat of `resource`; `undefined` for a chat that is not one of the session layer's. */
	resolve(resource: URI): IAgentHostWorktreeChat | undefined;
}

export const IAgentHostWorktreeChatResolverService = createDecorator<IAgentHostWorktreeChatResolverService>('agentHostWorktreeChatResolverService');

/** Where the session layer registers its {@link IAgentHostWorktreeChatResolver}, which the folder follow reads. */
export interface IAgentHostWorktreeChatResolverService extends IAgentHostWorktreeChatResolver {
	readonly _serviceBrand: undefined;
	/** Registers the resolver until disposed: the last one registered wins; disposing an earlier one leaves it in place. */
	registerResolver(resolver: IAgentHostWorktreeChatResolver): IDisposable;
}

export class AgentHostWorktreeChatResolverService extends Disposable implements IAgentHostWorktreeChatResolverService {

	declare readonly _serviceBrand: undefined;

	private _resolver: IAgentHostWorktreeChatResolver | undefined;
	private readonly _resolverListener = this._register(new MutableDisposable());

	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange = this._onDidChange.event;

	registerResolver(resolver: IAgentHostWorktreeChatResolver): IDisposable {
		this._set(resolver);
		return toDisposable(() => {
			if (this._resolver === resolver) {
				this._set(undefined);
			}
		});
	}

	resolve(resource: URI): IAgentHostWorktreeChat | undefined {
		return this._resolver?.resolve(resource);
	}

	private _set(resolver: IAgentHostWorktreeChatResolver | undefined): void {
		this._resolver = resolver;
		this._resolverListener.value = resolver?.onDidChange(() => this._onDidChange.fire());
		this._onDidChange.fire();
	}
}

registerSingleton(IAgentHostWorktreeChatResolverService, AgentHostWorktreeChatResolverService, InstantiationType.Delayed);
