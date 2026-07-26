/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableMap, DisposableStore } from '../../../base/common/lifecycle.js';
import { URI, UriComponents } from '../../../base/common/uri.js';
import { IRange } from '../../../editor/common/core/range.js';
import { IAgentEditorCommentsBridge } from '../../services/agentEditorComments/common/agentEditorComments.js';
import { extHostNamedCustomer, IExtHostContext } from '../../services/extensions/common/extHostCustomers.js';
import { ExtHostAgentEditorCommentsShape, ExtHostContext, IAgentEditorCommentDto, MainContext, MainThreadAgentEditorCommentsShape } from '../common/extHost.protocol.js';

/**
 * Bridges {@link IAgentEditorCommentsBridge} to the extension host so custom editors
 * can render and contribute the same comments as code editors.
 */
@extHostNamedCustomer(MainContext.MainThreadAgentEditorComments)
export class MainThreadAgentEditorComments implements MainThreadAgentEditorCommentsShape {

	private readonly _proxy: ExtHostAgentEditorCommentsShape;
	private readonly _resources = new Map<number, URI>();
	private readonly _disposables = new DisposableMap<number>();

	constructor(
		extHostContext: IExtHostContext,
		@IAgentEditorCommentsBridge private readonly _bridge: IAgentEditorCommentsBridge,
	) {
		this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostAgentEditorComments);
	}

	async $createAgentEditorComments(handle: number, uri: UriComponents): Promise<void> {
		const resource = URI.revive(uri);
		this._resources.set(handle, resource);

		const store = new DisposableStore();
		store.add(this._bridge.onDidChangeComments(() => this._sendComments(handle)));
		this._disposables.set(handle, store);

		this._sendComments(handle);
	}

	async $addComment(handle: number, range: IRange, body: string): Promise<void> {
		const resource = this._resources.get(handle);
		if (!resource) {
			return;
		}
		this._bridge.addComment(resource, range, body);
	}

	async $updateCommentRange(handle: number, id: string, range: IRange): Promise<void> {
		const resource = this._resources.get(handle);
		if (resource) {
			this._bridge.updateCommentRange(resource, id, range);
		}
	}

	async $deleteComment(handle: number, id: string): Promise<void> {
		const resource = this._resources.get(handle);
		if (!resource) {
			return;
		}
		this._bridge.deleteComment(resource, id);
	}

	async $submitAgentEditorFeedback(handle: number, overallFeedback: string | undefined): Promise<void> {
		const resource = this._resources.get(handle);
		if (resource) {
			await this._bridge.submitFeedback(resource, overallFeedback);
		}
	}

	async $submitAgentEditorAction(handle: number, actionId: string): Promise<void> {
		const resource = this._resources.get(handle);
		if (resource) {
			await this._bridge.submitAction(resource, actionId);
		}
	}

	async $rejectAgentEditorReview(handle: number): Promise<void> {
		const resource = this._resources.get(handle);
		if (resource) {
			await this._bridge.reject(resource);
		}
	}

	async $disposeAgentEditorComments(handle: number): Promise<void> {
		this._resources.delete(handle);
		this._disposables.deleteAndDispose(handle);
	}

	private _sendComments(handle: number): void {
		const resource = this._resources.get(handle);
		if (!resource) {
			return;
		}
		const comments: IAgentEditorCommentDto[] = this._bridge.getComments(resource).map(comment => ({ id: comment.id, range: comment.range, body: comment.body }));
		this._proxy.$acceptAgentEditorComments(handle, comments, this._bridge.acceptsComments(resource), this._bridge.getReview(resource));
	}

	dispose(): void {
		this._disposables.dispose();
		this._resources.clear();
	}
}
