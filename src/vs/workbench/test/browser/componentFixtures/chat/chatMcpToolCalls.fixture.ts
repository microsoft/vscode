/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ToolCallConfirmationReason, ToolCallContributorKind, ToolCallStatus, ToolResultContentType, type ToolCallRunningState } from '../../../../../platform/agentHost/common/state/sessionState.js';
import { completedToolCallToSerialized, toolCallStateToInvocation, toolCallStateToStreamingInvocation } from '../../../../contrib/chat/browser/agentSessions/agentHost/stateToProgressAdapter.js';
import { ChatProgressAnimation, ThinkingDisplayMode } from '../../../../contrib/chat/common/constants.js';
import { ComponentFixtureContext, defineComponentFixture, defineThemedFixtureGroup } from '../fixtureUtils.js';
import { renderChatWidget } from './chatWidget.fixture.js';

const githubCalls = [
	{
		serverName: 'GitHub',
		toolName: 'issue_read',
		title: 'Read issue',
		input: { method: 'get', owner: 'microsoft', repo: 'vscode', issue_number: 123 },
		output: 'Issue details retrieved.',
	},
	{
		serverName: 'GitHub',
		toolName: 'search_code',
		title: 'Search code',
		input: { query: 'repo:microsoft/vscode mcpServerName' },
		output: 'Found matching code references.',
	},
	{
		serverName: 'GitHub',
		toolName: 'pull_request_read',
		title: 'Read pull request',
		input: { method: 'get', owner: 'microsoft', repo: 'vscode', pullNumber: 456 },
		output: 'Pull request details retrieved.',
	},
];

const mixedCalls = [
	...githubCalls,
	{
		serverName: 'Context7',
		toolName: 'query_docs',
		title: 'Query documentation',
		input: { libraryId: '/modelcontextprotocol/sdk', query: 'Tool display titles' },
		output: 'Tools can provide a human-readable title alongside their identifier.',
	},
	{
		serverName: 'Playwright',
		toolName: 'browser_take_screenshot',
		title: 'Take screenshot',
		input: { filename: 'tool-calls.png' },
		output: 'Screenshot captured.',
	},
];

function render(context: ComponentFixtureContext, calls: typeof mixedCalls, progress?: 'running' | 'streaming'): Promise<void> {
	return renderChatWidget(context, {
		width: 640,
		height: 540,
		listHeight: 540,
		inputVisible: false,
		agentHostSession: true,
		collapseCompletedResponses: false,
		persistentProgress: progress ? ChatProgressAnimation.Weave : undefined,
		thinkingStyle: ThinkingDisplayMode.Collapsed,
		messages: [{ user: 'Investigate the issue and check the related tools and documentation.', responseComplete: false }],
		onRendered: ({ model }) => {
			const request = model.getRequests()[0];
			for (const [index, call] of calls.entries()) {
				const toolCall: ToolCallRunningState = {
					status: ToolCallStatus.Running,
					toolCallId: `mcp-tool-call-${index}`,
					toolName: `${call.serverName}-${call.toolName}`,
					displayName: call.title,
					invocationMessage: call.title,
					toolInput: JSON.stringify(call.input, undefined, 2),
					confirmed: ToolCallConfirmationReason.NotNeeded,
					contributor: { kind: ToolCallContributorKind.MCP, customizationId: call.serverName },
					_meta: { mcpServerName: call.serverName, mcpToolName: call.toolName },
				};
				if (progress && index === calls.length - 1) {
					const invocation = progress === 'streaming'
						? toolCallStateToStreamingInvocation({
							...toolCall,
							status: ToolCallStatus.Streaming,
							partialInput: JSON.stringify(call.input),
						}, undefined, model.sessionResource, 'local')
						: toolCallStateToInvocation(toolCall, undefined, model.sessionResource, 'local');
					model.acceptResponseProgress(request, invocation);
				} else {
					model.acceptResponseProgress(request, completedToolCallToSerialized({
						...toolCall,
						status: ToolCallStatus.Completed,
						pastTenseMessage: call.title,
						success: true,
						content: [{ type: ToolResultContentType.Text, text: call.output }],
					}, undefined, model.sessionResource, 'local'));
				}
			}
			if (!progress) {
				request.response?.complete();
			}
		},
	});
}

export default defineThemedFixtureGroup({ path: 'chat/' }, {
	SameServer: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => render(context, githubCalls),
	}),
	MixedServers: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => render(context, mixedCalls),
	}),
	PersistentProgress: defineComponentFixture({
		labels: { kind: 'animated' },
		render: context => render(context, mixedCalls, 'running'),
	}),
	StreamingProgress: defineComponentFixture({
		labels: { kind: 'animated' },
		render: context => render(context, mixedCalls, 'streaming'),
	}),
});
