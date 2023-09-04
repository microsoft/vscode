/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableMap } from 'vs/base/common/lifecycle';
import { IInlineChatBulkEditResponse, IInlineChatResponse, IInlineChatService } from 'vs/workbench/contrib/inlineChat/common/inlineChat';
import { IUriIdentityService } from 'vs/platform/uriIdentity/common/uriIdentity';
import { reviveWorkspaceEditDto } from 'vs/workbench/api/browser/mainThreadBulkEdits';
import { ExtHostContext, ExtHostInlineChatShape, MainContext, MainThreadInlineChatShape as MainThreadInlineChatShape } from 'vs/workbench/api/common/extHost.protocol';
import { IExtHostContext, extHostNamedCustomer } from 'vs/workbench/services/extensions/common/extHostCustomers';
import { TextEdit } from 'vs/editor/common/languages';
import { IProgress } from 'vs/platform/progress/common/progress';

@extHostNamedCustomer(MainContext.MainThreadInlineChat)
export class MainThreadInlineChat implements MainThreadInlineChatShape {

	private readonly _registrations = new DisposableMap<number>();
	private readonly _proxy: ExtHostInlineChatShape;

	private readonly _progresses = new Map<string, IProgress<any>>();

	constructor(
		extHostContext: IExtHostContext,
		@IInlineChatService private readonly _inlineChatService: IInlineChatService,
		@IUriIdentityService private readonly _uriIdentService: IUriIdentityService,
	) {
		this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostInlineChat);
	}

	dispose(): void {
		this._registrations.dispose();
	}

	async $registerInteractiveEditorProvider(handle: number, label: string, debugName: string, supportsFeedback: boolean): Promise<void> {
		const unreg = this._inlineChatService.addProvider({
			debugName,
			label,
			prepareInlineChatSession: async (model, range, token) => {
				const session = await this._proxy.$prepareSession(handle, model.uri, range, token);
				if (!session) {
					return undefined;
				}
				return {
					...session,
					dispose: () => {
						this._proxy.$releaseSession(handle, session.id);
					}
				};
			},
			provideResponse: async (item, request, progress, token) => {
				this._progresses.set(request.requestId, progress);
				try {
					const result = await this._proxy.$provideResponse(handle, item, request, token);
					if (result?.type === 'bulkEdit') {
						(<IInlineChatBulkEditResponse>result).edits = reviveWorkspaceEditDto(result.edits, this._uriIdentService);
					}
					return <IInlineChatResponse | undefined>result;
				} finally {
					this._progresses.delete(request.requestId);
				}
			},
			handleInlineChatResponseFeedback: !supportsFeedback ? undefined : async (session, response, kind) => {
				this._proxy.$handleFeedback(handle, session.id, response.id, kind);
			}
		});

		this._registrations.set(handle, unreg);
	}

	async $handleProgressChunk(requestId: string, chunk: { message?: string | undefined; edits?: TextEdit[] | undefined }): Promise<void> {
		this._progresses.get(requestId)?.report(chunk);
	}

	async $unregisterInteractiveEditorProvider(handle: number): Promise<void> {
		this._registrations.deleteAndDispose(handle);
	}
}
