/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../../../base/common/async.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { McpAuthRequiredReason, McpServerStatus } from '../../../../../../../platform/agentHost/common/state/protocol/state.js';
import { IAgentHostMcpServer } from '../../../../../../../sessions/common/agentHostSessionsProvider.js';
import { workbenchInstantiationService } from '../../../../../../test/browser/workbenchTestServices.js';
import { IAgentHostCustomizationService, NullAgentHostCustomizationService } from '../../../../browser/agentSessions/agentHost/agentHostCustomizationService.js';
import { IChatWidget, IChatWidgetService } from '../../../../browser/chat.js';
import { IChatContentPartRenderContext } from '../../../../browser/widget/chatContentParts/chatContentParts.js';
import { ChatToolAuthenticationSubPart } from '../../../../browser/widget/chatContentParts/toolInvocationParts/chatToolAuthenticationSubPart.js';
import { IChatResponseViewModel } from '../../../../common/model/chatViewModel.js';
import { ChatToolInvocation } from '../../../../common/model/chatProgressTypes/chatToolInvocation.js';
import { ToolDataSource } from '../../../../common/tools/languageModelToolsService.js';

suite('ChatToolAuthenticationSubPart', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('uses the presentation name while actions target the MCP server id', async () => {
		const sessionResource = URI.parse('chat-session://local/session');
		const enabledChanges: boolean[] = [];
		const authenticationTargets: string[] = [];
		const server = upcastPartial<IAgentHostMcpServer>({
			id: 'local/github-copilot-connector-94d26095770df60673dd',
			name: 'github-copilot-connector-94d26095770df60673dd',
			displayName: 'GitHub [Enterprise]',
			enabled: true,
			status: McpServerStatus.AuthRequired,
			state: {
				kind: McpServerStatus.AuthRequired,
				reason: McpAuthRequiredReason.Required,
				resource: {
					resource: 'https://docs.example.com',
					authorization_servers: ['https://login.example.com'],
				},
			},
			setEnabled: enabled => enabledChanges.push(enabled),
		});
		class TestAgentHostCustomizationService extends NullAgentHostCustomizationService {
			override getMcpServers(resource: URI): readonly IAgentHostMcpServer[] {
				assert.strictEqual(resource, sessionResource);
				return [server];
			}
			override authenticateMcpServer(resource: URI, serverId: string): Promise<boolean> {
				assert.strictEqual(resource, sessionResource);
				authenticationTargets.push(serverId);
				return Promise.resolve(true);
			}
		}
		let focused = false;
		const instantiationService = workbenchInstantiationService(undefined, store);
		instantiationService.stub(IAgentHostCustomizationService, new TestAgentHostCustomizationService());
		instantiationService.stub(IChatWidgetService, upcastPartial<IChatWidgetService>({
			getWidgetBySessionResource: resource => {
				assert.strictEqual(resource, sessionResource);
				return upcastPartial<IChatWidget>({ focusInput: () => { focused = true; } });
			},
		}));
		const invocation = new ChatToolInvocation(
			{ invocationMessage: 'Query documentation' },
			{ id: 'mcp_docs', displayName: 'Documentation', modelDescription: 'Documentation', source: ToolDataSource.Internal },
			'auth',
			undefined,
			{},
		);
		let cancelled = false;
		invocation.setAuthenticationRequired({ id: server.id, name: server.name, resource: 'https://docs.example.com' }, () => cancelled = true);
		const context = upcastPartial<IChatContentPartRenderContext>({
			content: [],
			contentIndex: -1,
			element: upcastPartial<IChatResponseViewModel>({ sessionResource }),
		});
		const part = store.add(instantiationService.createInstance(ChatToolAuthenticationSubPart, invocation, context));

		const buttons = [...part.domNode.querySelectorAll<HTMLElement>('.monaco-button')];
		const presentation = {
			title: part.domNode.querySelector('.chat-query-title-part')?.textContent?.trim().replace(/\u00a0/g, ' '),
			message: part.domNode.querySelector('.chat-confirmation-widget-message')?.textContent?.replace(/\u00a0/g, ' '),
			messageLinks: part.domNode.querySelectorAll('.chat-confirmation-widget-message a').length,
			buttons: buttons.map(button => button.textContent),
		};
		buttons[0].click();
		await timeout(0);
		buttons[2].click();
		await timeout(0);

		assert.deepStrictEqual({
			presentation,
			authenticationTargets,
			enabledChanges,
			focused,
			cancelled,
		}, {
			presentation: {
				title: 'MCP authentication requiredGitHub [Enterprise] (Connector)',
				message: 'The MCP server GitHub [Enterprise] (Connector) requires authentication to continue this tool call.',
				messageLinks: 0,
				buttons: ['Authenticate', 'Cancel', 'Disable for This Session'],
			},
			authenticationTargets: [server.id],
			enabledChanges: [false],
			focused: true,
			cancelled: true,
		});
	});
});
