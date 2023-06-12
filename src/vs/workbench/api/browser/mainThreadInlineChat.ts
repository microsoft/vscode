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

@extHostNamedCustomer(MainContext.MainThreadInlineChat)
export class MainThreadInlineChat implements MainThreadInlineChatShape {

	private readonly _registrations = new DisposableMap<number>();
	private readonly _proxy: ExtHostInlineChatShape;

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

	async $registerInteractiveEditorProvider(handle: number, debugName: string, supportsFeedback: boolean): Promise<void> {
		const unreg = this._inlineChatService.addProvider({
			debugName,
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
			provideResponse: async (item, request, token) => {
				const result = await this._proxy.$provideResponse(handle, item, request, token);
				if (result?.type === 'bulkEdit') {
					(<IInlineChatBulkEditResponse>result).edits = reviveWorkspaceEditDto(result.edits, this._uriIdentService);
				}
				return <IInlineChatResponse | undefined>result;
			},
			handleInlineChatResponseFeedback: !supportsFeedback ? undefined : async (session, response, kind) => {
				this._proxy.$handleFeedback(handle, session.id, response.id, kind);
			}
		});

		this._registrations.set(handle, unreg);
	}

	async $unregisterInteractiveEditorProvider(handle: number): Promise<void> {
		this._registrations.deleteAndDispose(handle);
	}
}
