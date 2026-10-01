/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../../../../../base/browser/window.js';
import { timeout } from '../../../../../../../base/common/async.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { McpServerStatus } from '../../../../../../../platform/agentHost/common/state/protocol/state.js';
import { IAgentHostMcpServer } from '../../../../../../../sessions/common/agentHostSessionsProvider.js';
import { workbenchInstantiationService } from '../../../../../../test/browser/workbenchTestServices.js';
import { IAgentHostCustomizationService, NullAgentHostCustomizationService } from '../../../../browser/agentSessions/agentHost/agentHostCustomizationService.js';
import { IChatWidgetService } from '../../../../browser/chat.js';
import { IChatContentPartRenderContext } from '../../../../browser/widget/chatContentParts/chatContentParts.js';
import { ChatToolAuthenticationSubPart } from '../../../../browser/widget/chatContentParts/toolInvocationParts/chatToolAuthenticationSubPart.js';
import { IChatResponseViewModel } from '../../../../common/model/chatViewModel.js';
import { ChatToolInvocation } from '../../../../common/model/chatProgressTypes/chatToolInvocation.js';
import { ToolDataSource } from '../../../../common/tools/languageModelToolsService.js';

suite('ChatToolAuthenticationSubPart', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('can disable the MCP server for the session', async () => {
		const sessionResource = URI.parse('chat-session://local/session');
		const enabledChanges: boolean[] = [];
		const server = upcastPartial<IAgentHostMcpServer>({
			id: 'local/docs',
			name: 'Documentation',
			enabled: true,
			status: McpServerStatus.AuthRequired,
			state: { kind: McpServerStatus.AuthRequired },
			setEnabled: enabled => enabledChanges.push(enabled),
		});
		class TestAgentHostCustomizationService extends NullAgentHostCustomizationService {
			override getMcpServers(resource: URI): readonly IAgentHostMcpServer[] {
				assert.strictEqual(resource, sessionResource);
				return [server];
			}
		}
		let focused = false;
		const instantiationService = workbenchInstantiationService(undefined, store);
		instantiationService.stub(IAgentHostCustomizationService, new TestAgentHostCustomizationService());
		instantiationService.stub(IChatWidgetService, upcastPartial<IChatWidgetService>({
			getWidgetBySessionResource: resource => {
				assert.strictEqual(resource, sessionResource);
				return upcastPartial({ focusInput: () => focused = true });
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
		invocation.setAuthenticationRequired({ id: server.id, name: server.name }, () => cancelled = true);
		const context = upcastPartial<IChatContentPartRenderContext>({
			content: [],
			contentIndex: -1,
			element: upcastPartial<IChatResponseViewModel>({ sessionResource, content: [] }),
		});
		const part = store.add(instantiationService.createInstance(ChatToolAuthenticationSubPart, invocation, context));

		const buttons = [...part.domNode.querySelectorAll<HTMLElement>('.monaco-button')];
		assert.deepStrictEqual(buttons.map(button => button.textContent), ['Authenticate', 'Cancel', 'Disable for This Session']);
		buttons[2].click();
		await timeout(0);

		assert.deepStrictEqual({
			enabledChanges,
			focused,
			cancelled,
		}, {
			enabledChanges: [false],
			focused: true,
			cancelled: true,
		});
	});
});
