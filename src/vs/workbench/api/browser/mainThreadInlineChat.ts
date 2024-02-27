/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableMap, IDisposable } from 'vs/base/common/lifecycle';
import { IInlineChatBulkEditResponse, IInlineChatProgressItem, IInlineChatResponse, IInlineChatService } from 'vs/workbench/contrib/inlineChat/common/inlineChat';
import { IUriIdentityService } from 'vs/platform/uriIdentity/common/uriIdentity';
import { reviveWorkspaceEditDto } from 'vs/workbench/api/browser/mainThreadBulkEdits';
import { ExtHostContext, ExtHostInlineChatShape, MainContext, MainThreadInlineChatShape as MainThreadInlineChatShape } from 'vs/workbench/api/common/extHost.protocol';
import { IExtHostContext, extHostNamedCustomer } from 'vs/workbench/services/extensions/common/extHostCustomers';
import { IProgress } from 'vs/platform/progress/common/progress';
import { Emitter } from 'vs/base/common/event';

interface IInlineChatRegistrationEntry extends IDisposable {
	disablementChangeEmitter: Emitter<void>;
}

@extHostNamedCustomer(MainContext.MainThreadInlineChat)
export class MainThreadInlineChat implements MainThreadInlineChatShape {

	private readonly _registrations = new DisposableMap<number, IInlineChatRegistrationEntry>();
	private readonly _proxy: ExtHostInlineChatShape;

	private readonly _progresses = new Map<string, IProgress<IInlineChatProgressItem>>();

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

	$onDidChangeDisablement(handle: number): void {
		const entry = this._registrations.get(handle);
		if (entry) {
			entry.disablementChangeEmitter.fire();
		}
	}

	async $registerInteractiveEditorProvider(handle: number, label: string, debugName: string, supportsFeedback: boolean, supportsFollowups: boolean, supportIssueReporting: boolean): Promise<void> {
		const onDidChangeDisablement: Emitter<void> = new Emitter<void>();
		const unreg = this._inlineChatService.addProvider({
			debugName,
			label,
			supportIssueReporting,
			onDidChangeDisablementStatus: onDidChangeDisablement.event,
			provideDisablementStatus: async (resource, token) => {
				return this._proxy.$provideDisablementStatus(handle, resource, token);
			},
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
			provideFollowups: !supportsFollowups ? undefined : async (session, response, token) => {
				return this._proxy.$provideFollowups(handle, session.id, response.id, token);
			},
			handleInlineChatResponseFeedback: !supportsFeedback ? undefined : async (session, response, kind) => {
				this._proxy.$handleFeedback(handle, session.id, response.id, kind);
			}
		});

		this._registrations.set(handle, {
			disablementChangeEmitter: onDidChangeDisablement,
			dispose: () => {
				unreg.dispose();
				onDidChangeDisablement.dispose();
			}
		});
	}

	async $handleProgressChunk(requestId: string, chunk: IInlineChatProgressItem): Promise<void> {
		await Promise.resolve(this._progresses.get(requestId)?.report(chunk));
	}

	async $unregisterInteractiveEditorProvider(handle: number): Promise<void> {
		this._registrations.deleteAndDispose(handle);
	}
}
