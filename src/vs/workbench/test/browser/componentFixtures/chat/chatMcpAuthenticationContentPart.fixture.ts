/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { Event } from '../../../../../base/common/event.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { McpServerStatus } from '../../../../../platform/agentHost/common/state/protocol/state.js';
import { IMarkdownRendererService, MarkdownRendererService } from '../../../../../platform/markdown/browser/markdownRenderer.js';
import { IAgentHostCustomizationService } from '../../../../contrib/chat/browser/agentSessions/agentHost/agentHostCustomizationService.js';
import { ChatMcpAuthenticationContentPart } from '../../../../contrib/chat/browser/widget/chatContentParts/chatMcpAuthenticationContentPart.js';
import { IChatMcpAuthenticationRequired } from '../../../../contrib/chat/common/chatService/chatService.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup } from '../fixtureUtils.js';

import '../../../../contrib/chat/browser/widget/media/chat.css';

const sessionResource = URI.parse('chat-session://fixture/connector-authentication');
const runtimeServerId = 'github-copilot-connector-94d26095770df60673dd';

function renderAuthenticationPart(context: ComponentFixtureContext): void {
	type McpServer = ReturnType<IAgentHostCustomizationService['getMcpServers']>[number];

	const server = new class extends mock<McpServer>() {
		override readonly id = runtimeServerId;
		override readonly name = runtimeServerId;
		override readonly displayName = 'GitHub';
		override readonly enabled = true;
		override readonly status = McpServerStatus.AuthRequired;
	}();
	const customizationService = new class extends mock<IAgentHostCustomizationService>() {
		override readonly onDidChangeCustomizations = Event.None;
		override getMcpServers(): readonly McpServer[] {
			return [server];
		}
	}();
	const instantiationService = createEditorServices(context.disposableStore, {
		colorTheme: context.theme,
		additionalServices: registration => {
			registration.define(IMarkdownRendererService, MarkdownRendererService);
			registration.defineInstance(IAgentHostCustomizationService, customizationService);
		},
	});
	const data: IChatMcpAuthenticationRequired = {
		kind: 'mcpAuthenticationRequired',
		sessionResource,
		servers: observableValue('mcpAuthenticationServers', [{
			id: runtimeServerId,
			name: runtimeServerId,
			resource: 'https://api.github.com',
		}]),
		isUsed: false,
	};
	const part = context.disposableStore.add(instantiationService.createInstance(ChatMcpAuthenticationContentPart, data, {}));

	context.container.style.width = '720px';
	context.container.style.padding = '16px';
	context.container.classList.add('interactive-session');
	const response = dom.$('.interactive-item-container.interactive-response');
	const value = dom.$('.value');
	value.appendChild(part.domNode);
	response.appendChild(value);
	context.container.appendChild(response);
}

export default defineThemedFixtureGroup({ path: 'chat/' }, {
	ConnectorAuthentication: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: renderAuthenticationPart,
	}),
});
