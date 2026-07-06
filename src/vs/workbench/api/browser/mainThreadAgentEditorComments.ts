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
 * Bridges the {@link IAgentEditorCommentsBridge} (backed, in the Agents window,
 * by the same store the code editor renders its session comments from) to the
 * extension host, so custom editors (e.g. the Markdown editor) can render and
 * contribute the same comments. Registered in every extension host; when no
 * provider is installed (e.g. the regular workbench window) the bridge is a
 * no-op and this customer simply reports no comments.
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
		this._proxy.$acceptAgentEditorComments(handle, comments);
	}

	dispose(): void {
		this._disposables.dispose();
		this._resources.clear();
	}
}
