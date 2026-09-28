/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getWindow } from '../../../../../base/browser/dom.js';
import { assert } from '../../../../../base/common/assert.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { constObservable } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { AgentChatInputState } from '../../../../../platform/agentHost/common/meta/agentHostChatInputState.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { AgentHostChatInputState, RETRY_CHAT_PREPARATION_COMMAND } from '../../../../../workbench/contrib/chat/browser/agentSessions/agentHost/agentHostChatInputState.js';
import { IChatInputNotification, IChatInputNotificationService } from '../../../../../workbench/contrib/chat/browser/widget/input/chatInputNotificationService.js';
import { SessionType } from '../../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { renderChatInput } from '../../../../../workbench/test/browser/componentFixtures/chat/renderChatInput.js';
import { ComponentFixtureContext, defineComponentFixture, defineThemedFixtureGroup } from '../../../../../workbench/test/browser/componentFixtures/fixtureUtils.js';
import { ExtensionIdentifier } from '../../../../../platform/extensions/common/extensions.js';
import { ChatAgentLocation } from '../../../../../workbench/contrib/chat/common/constants.js';
import { ILanguageModelChatMetadataAndIdentifier } from '../../../../../workbench/contrib/chat/common/languageModels.js';

// Loaded here (rather than in the workbench-layer fixture) so the
// `.interactive-input-part` padding (32px each side) that the `isSessionsWindow`
// layout path accounts for is available without a layering violation.
import '../../browser/media/chatView.css';

/**
 * Wraps the fixture context in `.agent-sessions-workbench > .part.sessionspart`, returning the sessions part as the input container by default.
 * With a background, adds `.has-chat-background` and returns a nested `.chat-view` as the input container.
 */
function sessionsWindowContext(context: ComponentFixtureContext, withBackground = false): ComponentFixtureContext {
	context.container.classList.add('agent-sessions-workbench');
	const sessionsPart = document.createElement('div');
	sessionsPart.classList.add('part', 'sessionspart');
	context.container.appendChild(sessionsPart);
	if (!withBackground) {
		return { ...context, container: sessionsPart };
	}

	sessionsPart.classList.add('has-chat-background');
	sessionsPart.style.backgroundImage = 'linear-gradient(135deg, var(--vscode-editor-background), var(--vscode-textLink-foreground))';
	const chatView = document.createElement('div');
	chatView.classList.add('chat-view');
	sessionsPart.appendChild(chatView);
	return { ...context, container: chatView };
}

/** Drives the real input-state controller and notification widget without a provider process. */
async function renderCodexWriterLock(context: ComponentFixtureContext, width: number, checking = false): Promise<void> {
	const resource = URI.parse('agent-host-codex:/writer-lock-fixture');
	const changed = context.disposableStore.add(new Emitter<void>());
	let notification: IChatInputNotification | undefined;
	const notifications = new class extends mock<IChatInputNotificationService>() {
		override readonly onDidChange = changed.event;
		override setNotification(value: IChatInputNotification): void { notification = value; changed.fire(); }
		override deleteNotification(): void { notification = undefined; changed.fire(); }
		override getActiveNotification(filter?: (value: IChatInputNotification) => boolean): IChatInputNotification | undefined {
			return notification && (!filter || filter(notification)) ? notification : undefined;
		}
		override announceRendered(): void { }
	}();
	const state: AgentChatInputState = checking ? { kind: 'checking' } : {
		kind: 'blocked',
		error: { errorType: 'CodexThreadInUse', message: 'thread fixture already has an active writer' },
	};
	// Retrying leaves this fixture locked, so it is safe to explore repeatedly.
	const inputState = context.disposableStore.add(new AgentHostChatInputState(resource, constObservable(state), async () => { }, notifications));
	await renderChatInput(sessionsWindowContext(context), {
		isSessionsWindow: true,
		sessionResource: resource,
		width,
		value: 'Continue working on this conversation.',
		models: [{
			identifier: 'agent-host-codex:gpt-5.3-codex',
			metadata: {
				...responsiveModel.metadata,
				id: 'gpt-5.3-codex',
				name: 'GPT-5.3-Codex',
				targetChatSessionType: SessionType.AgentHostCodex,
				configurationSchema: undefined,
			},
		}],
		sendEnabled: !inputState.isInputBlocked.get(),
		additionalServices: registration => {
			registration.defineInstance(IChatInputNotificationService, notifications);
			registration.defineInstance(ICommandService, new class extends mock<ICommandService>() {
				override readonly onWillExecuteCommand = Event.None;
				override readonly onDidExecuteCommand = Event.None;
				override async executeCommand<T>(id: string): Promise<T> {
					if (id === RETRY_CHAT_PREPARATION_COMMAND) {
						await inputState.retry();
					}
					return undefined as T;
				}
			}());
		},
	});
	const input = context.container.querySelector<HTMLElement>('.chat-input-container');
	const editor = input?.querySelector<HTMLElement>('.monaco-editor-background');
	assert(!!input && !!editor, 'The chat input and editor must be visible.');
	const targetWindow = getWindow(input);
	assert(targetWindow.getComputedStyle(input).backgroundColor === targetWindow.getComputedStyle(editor).backgroundColor,
		'The editor and composer must use the same input background.');
}

const responsiveModel: ILanguageModelChatMetadataAndIdentifier = {
	identifier: 'openai-gpt-5.6-luna-responsive',
	metadata: {
		extension: new ExtensionIdentifier('fixture.extension'),
		id: 'gpt-5.6-luna-responsive',
		name: 'GPT-5.6 Luna Responsive Preview',
		vendor: 'openai',
		family: 'gpt',
		version: '1',
		maxInputTokens: 128000,
		maxOutputTokens: 4096,
		isDefaultForLocation: { [ChatAgentLocation.Chat]: true },
		configurationSchema: {
			properties: {
				effort: {
					type: 'string',
					group: 'navigation',
					enum: ['low', 'medium', 'high'],
					enumItemLabels: ['Low', 'Medium', 'Max 1M'],
					default: 'high',
				},
			},
		},
	},
};

const responsiveCollapseWidths = [560, 500, 440, 380, 320, 260, 220, 180];
const responsiveResizeCycles = [
	...responsiveCollapseWidths,
	...[...responsiveCollapseWidths].reverse(),
	...responsiveCollapseWidths,
	...[...responsiveCollapseWidths].reverse(),
	...responsiveCollapseWidths,
	...[...responsiveCollapseWidths].reverse(),
];

export default defineThemedFixtureGroup({ path: 'sessions/chat/input/' }, {
	CodexWriterLock: defineComponentFixture({
		labels: { kind: 'screenshot' },
		expectedVisualDescriptions: ['A lock icon precedes the title This chat is open in another app above the Agents chat input. The body first explains that the other app has locked the chat and must release it before continuing here. On a separate line it reads Quit the other app (e.g. ChatGPT, Codex CLI), then retry. There is one Retry button, no dismiss action, an editable draft, and a disabled Send button. The text area and the rest of the composer have the same background color.'],
		render: context => renderCodexWriterLock(context, 680),
	}),
	CodexWriterLockNarrow: defineComponentFixture({
		labels: { kind: 'screenshot' },
		expectedVisualDescriptions: ['In a narrow chat input, the lock icon and This chat is open in another app title fit within the banner. The lock explanation wraps without clipping, with the quit instructions starting on their own line. Retry remains visible and Send is disabled while the draft remains visible. The text area and the rest of the composer have the same background color.'],
		render: context => renderCodexWriterLock(context, 360),
	}),
	CodexWriterLockChecking: defineComponentFixture({
		labels: { kind: 'screenshot' },
		expectedVisualDescriptions: ['A Checking Conversation banner with a lock icon above the input explains that availability is being checked. Retry and dismiss actions are absent, the draft is retained, and Send is disabled.'],
		render: context => renderCodexWriterLock(context, 680, true),
	}),
	SessionsWindow: defineComponentFixture({
		render: context => renderChatInput(sessionsWindowContext(context), {
			isSessionsWindow: true,
			value: 'word word word word word word word word word word word word word word word word word word word word word word word word',
		})
	}),
	SessionsWindowBackgroundControls: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => renderChatInput(sessionsWindowContext(context, true), {
			isSessionsWindow: true,
			value: 'Implement the approved plan',
			secondaryPickerLabels: ['Plan', 'Allow All'],
		})
	}),
	// Partial multi-line selection so the reverse-rounded selection corners are
	// rendered. These cut-out pieces use `.monaco-editor-background`, which must
	// remain opaque so the selection corners render correctly.
	SessionsWindowSelection: defineComponentFixture({
		render: context => renderChatInput(sessionsWindowContext(context), {
			isSessionsWindow: true,
			value: 'asdasd asdasd asdasd\nasd\nasdasd asdasd asdasd asdasd',
			selection: { startLineNumber: 1, startColumn: 3, endLineNumber: 3, endColumn: 8 },
		})
	}),
	ResponsiveModelResizeCycleExpanded: defineComponentFixture({
		virtualTime: { enabled: false },
		render: context => renderChatInput(sessionsWindowContext(context), {
			isSessionsWindow: true,
			models: [responsiveModel],
			width: 600,
			resizeWidths: [...responsiveResizeCycles, 600],
		})
	}),
	ResponsiveModelResizeCycleEllipsized: defineComponentFixture({
		virtualTime: { enabled: false },
		render: context => renderChatInput(sessionsWindowContext(context), {
			isSessionsWindow: true,
			models: [responsiveModel],
			width: 600,
			resizeWidths: [...responsiveResizeCycles, 380],
		})
	}),
	ResponsiveModelResizeCycleCompact: defineComponentFixture({
		labels: { kind: 'screenshot' },
		expectedVisualDescriptions: ['The Agents active-session chat input shows its compact model codicon centered with equal padding inside a 22-pixel square control while the model configuration remains visible.'],
		virtualTime: { enabled: false },
		render: context => renderChatInput(sessionsWindowContext(context), {
			isSessionsWindow: true,
			models: [responsiveModel],
			width: 600,
			resizeWidths: [...responsiveResizeCycles, 320],
		})
	}),
	ResponsiveModelResizeCycleMinimal: defineComponentFixture({
		labels: { kind: 'screenshot' },
		expectedVisualDescriptions: ['The Agents active-session chat input shows compact model and permission codicons centered with equal padding inside matching 22-pixel square controls, aligned with the expanded toolbar height.'],
		virtualTime: { enabled: false },
		render: context => renderChatInput(sessionsWindowContext(context), {
			isSessionsWindow: true,
			models: [responsiveModel],
			voiceControl: 'voiceListening',
			width: 600,
			resizeWidths: [...responsiveResizeCycles, 260],
		})
	}),
});
