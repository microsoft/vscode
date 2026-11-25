/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { toSlashes } from '../../../../../base/common/extpath.js';
import { appendEscapedMarkdownInlineCode, escapeUntrustedMarkdown } from '../../../../../base/common/htmlContent.js';
import { extUri } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { getSessionPathDisplay } from '../../../../../platform/agentHost/common/sessionPathDisplay.js';
import { ConfirmationOptionKind, ToolCallStatus } from '../../../../../platform/agentHost/common/state/protocol/state.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IMarkerService } from '../../../../../platform/markers/common/markers.js';
import { MarkerService } from '../../../../../platform/markers/common/markerService.js';
import { toolCallStateToInvocation } from '../../../../contrib/chat/browser/agentSessions/agentHost/stateToProgressAdapter.js';
import { ILanguageModelToolsConfirmationService } from '../../../../contrib/chat/common/tools/languageModelToolsConfirmationService.js';
import { ILanguageModelToolsService } from '../../../../contrib/chat/common/tools/languageModelToolsService.js';
import { MockLanguageModelToolsConfirmationService } from '../../../../contrib/chat/test/common/tools/mockLanguageModelToolsConfirmationService.js';
import { MockLanguageModelToolsService } from '../../../../contrib/chat/test/common/tools/mockLanguageModelToolsService.js';
import { ComponentFixtureContext, defineComponentFixture, defineThemedFixtureGroup, waitForFixtureCondition } from '../fixtureUtils.js';
import { renderChatWidget } from './chatWidget.fixture.js';

type Scenario = 'current' | 'sibling' | 'other' | 'movedSource' | 'movedDestination' | 'unknown' | 'terminal' | 'parent' | 'child' | 'otherChild';

async function renderConfirmation(context: ComponentFixtureContext, scenario: Scenario, width = 620): Promise<void> {
	const source = URI.parse('copilot:/source');
	const destination = URI.parse('copilot:/destination');
	const isOther = !['current', 'unknown', 'terminal'].includes(scenario);
	const current = source;
	const sdkId = scenario === 'sibling' ? 'peer-chat-sdk' : isOther ? 'moved-chat-sdk' : 'current-chat-sdk';
	const rootPath = `C:\\Users\\example\\.copilot\\session-state\\${sdkId}`;
	const path = `${rootPath}\\files\\notes.txt`;
	const root = URI.file(toSlashes(rootPath));
	const display = getSessionPathDisplay(path, URI.joinPath(root, 'files', 'notes.txt'), current, scenario === 'unknown' ? [] : [
		{
			root, session: isOther ? destination : source, title: 'Review authentication',
			parentSession: scenario === 'child' ? source : scenario === 'otherChild' ? URI.parse('copilot:/other-parent') : undefined,
			parentTitle: scenario === 'otherChild' ? 'Fix login' : undefined,
		},
		...(isOther ? [{ root: URI.file('C:/Users/example/.copilot/session-state/requester-sdk'), session: source, parentSession: scenario === 'parent' ? destination : undefined }] : []),
	], extUri);
	const sessionLabel = display.relationship === 'parent'
		? `parent session "${escapeUntrustedMarkdown(display.sessionTitle ?? '')}"`
		: display.relationship === 'child'
			? `child session "${escapeUntrustedMarkdown(display.sessionTitle ?? '')}"${display.parentSessionTitle ? ` of session "${escapeUntrustedMarkdown(display.parentSessionTitle)}"` : ''}`
			: `session "${escapeUntrustedMarkdown(display.sessionTitle ?? '')}"`;
	const description = display.isCurrentSession
		? `Allow reading \`${display.relativePath}\` from this session.`
		: display.sessionTitle
			? `Allow reading ${appendEscapedMarkdownInlineCode(display.relativePath ?? '')} from ${sessionLabel} and retry inside the sandbox.`
			: `Allow read access to ${appendEscapedMarkdownInlineCode(display.label)} and retry inside the sandbox.`;
	const invocation = toolCallStateToInvocation({
		toolCallId: 'session-grant', toolName: scenario === 'terminal' ? 'shell' : 'read_file',
		displayName: scenario === 'terminal' ? 'Shell' : 'Read file', status: ToolCallStatus.PendingConfirmation,
		confirmationTitle: 'Allow sandbox path access and retry?',
		invocationMessage: {
			markdown: `${description}\n\nSession access is shared by chats in this session and saved when you resume it. User access is saved to your user sandbox settings and shared with connected agent hosts across workspaces and sessions. Your organization's restrictions still apply.`,
		},
		toolInput: scenario === 'terminal' ? 'Get-Content notes.txt' : JSON.stringify({ path }),
		options: [
			{ id: 'save-session-sandbox-path', label: 'Allow for This Session', kind: ConfirmationOptionKind.Approve, group: 1 },
			{ id: 'save-sandbox-path', label: 'Allow for This User', kind: ConfirmationOptionKind.Approve, group: 1 },
			{ id: 'skip', label: 'Skip', kind: ConfirmationOptionKind.Deny, group: 2 },
		],
		_meta: {
			'vscode.sandboxPathGrant': { path, access: 'read' },
			...(scenario === 'terminal' ? { toolKind: 'terminal', language: 'powershell' } : {}),
		},
	}, undefined, current, '');
	await renderChatWidget(context, {
		width, height: 440, listHeight: 440, inputVisible: false,
		messages: [{ user: 'Read the session notes', assistant: [], responseComplete: false }],
		additionalServices: reg => {
			reg.define(IMarkerService, MarkerService);
			reg.defineInstance(ILanguageModelToolsConfirmationService, new MockLanguageModelToolsConfirmationService());
			reg.defineInstance(ILanguageModelToolsService, context.disposableStore.add(new MockLanguageModelToolsService()));
		},
		onRendered: ({ model, instantiationService }) => {
			const commandService = instantiationService.get(ICommandService);
			instantiationService.stub(ICommandService, {
				onWillExecuteCommand: commandService.onWillExecuteCommand,
				onDidExecuteCommand: commandService.onDidExecuteCommand,
				async executeCommand<R>(id: string, ...args: unknown[]): Promise<R | undefined> {
					// The JSON extension is not loaded in component fixtures.
					return id === 'json.validate' ? undefined : commandService.executeCommand<R>(id, ...args);
				},
			});
			model.acceptResponseProgress(model.getRequests()[0], invocation);
		},
	});
	const cardSelector = '.chat-tool-confirmation-carousel .chat-confirmation-widget2';
	await waitForFixtureCondition(() => (context.container.querySelector(cardSelector)?.getBoundingClientRect().height ?? 0) > 0, 'Confirmation did not render');
}

export default defineThemedFixtureGroup({ path: 'chat/SessionPathConfirmation/' }, {
	Current: defineComponentFixture({ render: context => renderConfirmation(context, 'current') }),
	SiblingChat: defineComponentFixture({ render: context => renderConfirmation(context, 'sibling') }),
	OtherSession: defineComponentFixture({ render: context => renderConfirmation(context, 'other') }),
	ParentSession: defineComponentFixture({ render: context => renderConfirmation(context, 'parent') }),
	ChildSession: defineComponentFixture({ render: context => renderConfirmation(context, 'child') }),
	OtherSessionsChild: defineComponentFixture({ render: context => renderConfirmation(context, 'otherChild') }),
	MovedFromSource: defineComponentFixture({ render: context => renderConfirmation(context, 'movedSource') }),
	MovedToDestination: defineComponentFixture({ render: context => renderConfirmation(context, 'movedDestination') }),
	Unknown: defineComponentFixture({ render: context => renderConfirmation(context, 'unknown') }),
	Terminal: defineComponentFixture({ render: context => renderConfirmation(context, 'terminal') }),
	Narrow: defineComponentFixture({
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		render: context => renderConfirmation(context, 'otherChild', 320),
	}),
});
