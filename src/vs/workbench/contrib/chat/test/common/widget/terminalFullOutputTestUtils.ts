/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { isEqual } from '../../../../../../base/common/resources.js';
import { hasKey } from '../../../../../../base/common/types.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { AgentHostFileSystemProvider, IRemoteFilesystemConnection } from '../../../../../../platform/agentHost/common/agentHostFileSystemProvider.js';
import { AGENT_HOST_SCHEME } from '../../../../../../platform/agentHost/common/agentHostUri.js';
import { ResourceReadResult } from '../../../../../../platform/agentHost/common/state/protocol/commands.js';
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
	read: (uri: URI) => Promise<ResourceReadResult>,
) {
	const data = invocation.toolSpecificData;
	assert.ok(data?.kind === 'terminal' && hasKey(data, { commandLine: true }));
	const reference = data.terminalCommandOutput?.fullOutput;
	assert.ok(reference);
	const resource = ChatResponseResource.createTerminalOutputUri(sessionResource, invocation.toolCallId, reference);
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
	const chatService = new class extends mock<IChatService>() {
		override readonly onDidDisposeSession = Event.None;
		override getSession(resource: URI) {
			return !model.isDisposed && isEqual(resource, sessionResource) ? model : undefined;
		}
	}();
	const reads: URI[] = [];
	const connection = new class extends mock<IRemoteFilesystemConnection>() {
		override async resourceRead(uri: URI): Promise<ResourceReadResult> {
			reads.push(uri);
			return read(uri);
		}
	}();
	const fileService = store.add(new FileService(new NullLogService()));
	const hostProvider = store.add(new AgentHostFileSystemProvider());
	store.add(fileService.registerProvider(AGENT_HOST_SCHEME, hostProvider));
	store.add(hostProvider.registerAuthority(authority, connection));
	const provider = store.add(new ChatResponseResourceFileSystemProvider(chatService, fileService));
	store.add(fileService.registerProvider(ChatResponseResource.scheme, provider));
	return { resource, provider, fileService, model, reads };
}
