/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { decodeBase64, encodeBase64, VSBuffer } from '../../../../base/common/buffer.js';
import { isEqual } from '../../../../base/common/resources.js';
import { hasKey } from '../../../../base/common/types.js';
import { URI } from '../../../../base/common/uri.js';
import type { MCP } from '../../../mcp/common/modelContextProtocol.js';
import { resolveAgentHostSession } from '../../common/agentHostSubscriptionService.js';
import { parseMcpResourceUri } from '../../common/mcpResourceUri.js';
import { AhpErrorCodes, ContentEncoding, ProtocolError, type ResourceReadResult } from '../../common/state/sessionProtocol.js';
import { IAgentHostChatOwnershipService } from '../agentHostChatOwnershipService.js';
import { IAgentHostProviderService } from '../agentHostProviderService.js';
import type { IAgentHostResourceProvider } from '../agentHostResourceProviders.js';
import { parseMcpChannelUri } from '../shared/mcpCustomizationController.js';

/** Reads linked MCP content through the owning agent provider. */
export class McpResourceLinkProvider implements IAgentHostResourceProvider {
	constructor(
		private readonly _restoreSessionChat: (session: URI, chat: URI) => Promise<void>,
		@IAgentHostProviderService private readonly _providerService: IAgentHostProviderService,
		@IAgentHostChatOwnershipService private readonly _chatOwnership: IAgentHostChatOwnershipService,
	) { }

	async read(uri: URI, encoding: ContentEncoding): Promise<ResourceReadResult> {
		const mcpResource = parseMcpResourceUri(uri);
		if (!mcpResource) {
			throw new ProtocolError(AhpErrorCodes.NotFound, `Content not found: ${uri.toString()}`);
		}
		const route = parseMcpChannelUri(mcpResource.channel);
		if (route) {
			const recordedOwner = await this._chatOwnership.createRecordedOwnerLookup()(route.chatUri.toString());
			const owningSession = resolveAgentHostSession(route.chatUri, () => recordedOwner);
			if (owningSession) {
				await this._restoreSessionChat(owningSession, route.chatUri);
			}
		}
		const result = await this._providerService.handleMcpRequest(mcpResource.channel, 'resources/read', { uri: mcpResource.uri }) as MCP.ReadResourceResult;
		const requested = URI.parse(mcpResource.uri);
		const resource = result.contents.find(content => isEqual(URI.parse(content.uri), requested));
		if (!resource) {
			throw new ProtocolError(AhpErrorCodes.NotFound, `Content not found: ${mcpResource.uri}`);
		}
		const isText = hasKey(resource, { text: true });
		const bytes = hasKey(resource, { text: true }) ? VSBuffer.fromString(resource.text) : decodeBase64(resource.blob);
		return {
			data: encoding === ContentEncoding.Base64 ? encodeBase64(bytes) : bytes.toString(),
			encoding,
			contentType: resource.mimeType ?? (isText ? 'text/plain' : 'application/octet-stream'),
		};
	}
}
