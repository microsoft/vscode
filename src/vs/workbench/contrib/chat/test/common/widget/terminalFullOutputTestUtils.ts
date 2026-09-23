/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { encodeBase64, VSBuffer } from '../../../../../../base/common/buffer.js';
import { Event } from '../../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { isEqual } from '../../../../../../base/common/resources.js';
import { hasKey } from '../../../../../../base/common/types.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { IAgentHostConnectionsService } from '../../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import type { IAgentConnection } from '../../../../../../platform/agentHost/common/agentService.js';
import { ContentEncoding, ResourceType, type ResourceResolveParams, type ResourceResolveResult } from '../../../../../../platform/agentHost/common/state/protocol/commands.js';
import { FileService } from '../../../../../../platform/files/common/fileService.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { IChatService, IChatToolInvocation, IChatToolInvocationSerialized } from '../../../common/chatService/chatService.js';
import { ChatResponseResource, IChatRequestModel, IChatResponseModel, Response } from '../../../common/model/chatModel.js';
import { ChatResponseResourceFileSystemProvider } from '../../../common/widget/chatResponseResourceFileSystemProvider.js';
import { MockChatModel } from '../model/mockChatModel.js';

export function createTerminalOutputTestFixture(
	store: Pick<DisposableStore, 'add'>,
	sessionResource: URI,
	invocation: IChatToolInvocation | IChatToolInvocationSerialized,
	authority: string,
	read: (uri: URI) => Promise<string>,
	options?: {
		readonly loadSessionOnDemand?: boolean;
		readonly size?: number;
		readonly resolve?: (uri: URI) => Promise<ResourceResolveResult>;
		readonly encoding?: ContentEncoding;
	},
) {
	const data = invocation.toolSpecificData;
	assert.ok(data?.kind === 'terminal' && hasKey(data, { commandLine: true }));
	const terminal = URI.revive(data.terminalCommandUri);
	assert.ok(terminal);
	const resource = ChatResponseResource.createTerminalOutputUri(sessionResource, invocation.toolCallId, terminal, `terminal-output-${invocation.toolCallId}.txt`);
	const response = store.add(new Response(invocation.kind === 'toolInvocationSerialized' ? [invocation] : []));
	if (invocation.kind === 'toolInvocation') {
		response.updateContent(invocation);
	}
	const request = new class extends mock<IChatRequestModel>() {
		override readonly response = new class extends mock<IChatResponseModel>() {
			override readonly entireResponse = response;
		}();
	}();
	const model = store.add(new class extends MockChatModel {
		override getRequests(): IChatRequestModel[] {
			return [request];
		}
	}(sessionResource));
	let loaded = !options?.loadSessionOnDemand;
	let acquisitions = 0;
	let releases = 0;
	const chatService = new class extends mock<IChatService>() {
		override readonly onDidDisposeSession = Event.None;
		override getSession(resource: URI) {
			return loaded && !model.isDisposed && isEqual(resource, sessionResource) ? model : undefined;
		}
		override async acquireOrLoadSession(resource: URI) {
			if (model.isDisposed || !isEqual(resource, sessionResource)) {
				return undefined;
			}
			acquisitions++;
			loaded = true;
			return {
				object: model,
				dispose: () => {
					releases++;
					loaded = false;
				},
			};
		}
	}();
	const resolves: URI[] = [];
	const reads: URI[] = [];
	const connection = new class extends mock<IAgentConnection>() {
		override async resourceResolve(params: ResourceResolveParams): Promise<ResourceResolveResult> {
			const uri = URI.parse(params.uri.toString());
			resolves.push(uri);
			return options?.resolve?.(uri) ?? {
				uri: params.uri,
				type: ResourceType.File,
				size: options?.size ?? 0,
			};
		}
		override async resourceRead(uri: URI) {
			reads.push(uri);
			const data = await read(uri);
			const encoding = options?.encoding ?? ContentEncoding.Utf8;
			return {
				data: encoding === ContentEncoding.Base64 ? encodeBase64(VSBuffer.fromString(data)) : data,
				encoding,
				contentType: 'text/plain',
			};
		}
	}();
	const connectionsService = new class extends mock<IAgentHostConnectionsService>() {
		override resolveSessionResource(resource: URI) {
			return isEqual(resource, sessionResource) ? { connectionAuthority: authority, backendSession: sessionResource, connection } : undefined;
		}
	}();
	const fileService = store.add(new FileService(new NullLogService()));
	const provider = store.add(new ChatResponseResourceFileSystemProvider(chatService, fileService, connectionsService));
	store.add(fileService.registerProvider(ChatResponseResource.scheme, provider));
	return {
		resource,
		provider,
		fileService,
		model,
		resolves,
		reads,
		get acquisitions() { return acquisitions; },
		get releases() { return releases; },
	};
}
