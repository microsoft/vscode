/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// eslint-disable-next-line local/code-import-patterns, local/code-amd-node-module -- Fixtures use Vite, not the workbench AMD loader.
import { Terminal as XTermBaseCtor } from '@xterm/xterm';
import '../../../../contrib/terminal/browser/media/xterm.css';
import * as dom from '../../../../../base/browser/dom.js';
import { renderAsPlaintext } from '../../../../../base/browser/markdownRenderer.js';
import { Event } from '../../../../../base/common/event.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { IAccessibleViewService } from '../../../../../platform/accessibility/browser/accessibleView.js';
import { toAgentHostContentUri } from '../../../../../platform/agentHost/common/agentHostUri.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IMarkdownRenderer, IMarkdownRendererService } from '../../../../../platform/markdown/browser/markdownRenderer.js';
import { IAiEditTelemetryService } from '../../../../contrib/editTelemetry/browser/telemetry/aiEditTelemetry/aiEditTelemetryService.js';
import { IChatOutputRendererService } from '../../../../contrib/chat/browser/chatOutputItemRenderer.js';
import { IChatWidgetService } from '../../../../contrib/chat/browser/chat.js';
import { ISessionSummaryHoverService, SessionSummaryHoverService } from '../../../../contrib/chat/browser/agentSessions/sessionSummaryHoverService.js';
import { IChatMarkdownAnchorService } from '../../../../contrib/chat/browser/widget/chatContentParts/chatMarkdownAnchorService.js';
import { IChatContentPartRenderContext, InlineTextModelCollection } from '../../../../contrib/chat/browser/widget/chatContentParts/chatContentParts.js';
import { DiffEditorPool, EditorPool } from '../../../../contrib/chat/browser/widget/chatContentParts/chatContentCodePools.js';
import { ChatTerminalToolProgressPart } from '../../../../contrib/chat/browser/widget/chatContentParts/toolInvocationParts/chatTerminalToolProgressPart.js';
import { IChatSessionsService } from '../../../../contrib/chat/common/chatSessionsService.js';
import { IChatTerminalToolInvocationData, IChatToolInvocationSerialized, ToolConfirmKind } from '../../../../contrib/chat/common/chatService/chatService.js';
import { ChatConfiguration } from '../../../../contrib/chat/common/constants.js';
import { IChatResponseViewModel } from '../../../../contrib/chat/common/model/chatViewModel.js';
import { IChatTerminalToolProgressPart, ITerminalChatService, ITerminalConfigurationService, ITerminalEditorService, ITerminalGroupService, ITerminalService, type IDetachedXTermOptions } from '../../../../contrib/terminal/browser/terminal.js';
import type { ITerminalFont } from '../../../../contrib/terminal/common/terminal.js';
import { createFakeDetachedTerminal } from '../../../../contrib/terminal/test/browser/chatTerminalMirrorTestUtils.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup } from '../fixtureUtils.js';
import { registerChatFixtureServices } from './chatFixtureUtils.js';

interface ITerminalFullOutputFixtureOptions {
	readonly width: number;
	readonly preview: string;
	readonly hasFullOutput: boolean;
	readonly expanded: boolean;
	readonly collapsible?: boolean;
	readonly fullOutputPath?: string;
	readonly intention?: string;
}

async function renderTerminalFullOutput(context: ComponentFixtureContext, options: ITerminalFullOutputFixtureOptions): Promise<void> {
	const terminalFont: ITerminalFont = { fontFamily: 'monospace', fontSize: 12, letterSpacing: 0, lineHeight: 1, charWidth: 8, charHeight: 16 };
	const markdownRenderer: IMarkdownRenderer = {
		render: (markdown, _renderOptions, outElement) => {
			const element = outElement ?? dom.$('div');
			element.textContent = renderAsPlaintext(markdown);
			return { element, dispose() { } };
		},
	};

	const instantiationService = createEditorServices(context.disposableStore, {
		colorTheme: context.theme,
		additionalServices: registration => {
			registerChatFixtureServices(registration);
			registration.define(ISessionSummaryHoverService, SessionSummaryHoverService);
			registration.defineInstance(ITerminalService, new class extends mock<ITerminalService>() {
				override readonly whenConnected = Promise.resolve();
				override async createDetachedTerminal(detachedOptions: IDetachedXTermOptions) {
					const fake = createFakeDetachedTerminal(XTermBaseCtor, detachedOptions, terminalFont);
					fake.raw.options.fontFamily = terminalFont.fontFamily;
					fake.raw.options.fontSize = terminalFont.fontSize;
					fake.raw.options.letterSpacing = terminalFont.letterSpacing;
					fake.raw.options.lineHeight = terminalFont.lineHeight;
					fake.raw.options.theme = {
						background: (context.theme.getColor('terminal.background') ?? context.theme.getColor('panel.background'))?.toString(),
						foreground: (context.theme.getColor('terminal.foreground') ?? context.theme.getColor('foreground'))?.toString(),
						...fake.raw.options.theme,
					};
					return {
						...fake.instance,
						attachToElement: (element: HTMLElement) => fake.raw.open(element),
					};
				}
			}());
			registration.defineInstance(ITerminalConfigurationService, new class extends mock<ITerminalConfigurationService>() {
				override getFont(): ITerminalFont {
					return terminalFont;
				}
			}());
			registration.defineInstance(ITerminalChatService, new class extends mock<ITerminalChatService>() {
				override readonly onDidRegisterTerminalInstanceWithToolSession = Event.None;
				override readonly onDidContinueInBackground = Event.None;
				override registerProgressPart(_part: IChatTerminalToolProgressPart) {
					return toDisposable(() => { });
				}
				override async getTerminalInstanceByToolSessionId() {
					return undefined;
				}
				override isBackgroundTerminal(): boolean {
					return false;
				}
				override getOutputSource() {
					return undefined;
				}
				override getAhpCommandSource() {
					return undefined;
				}
				override setFocusedProgressPart(): void { }
				override clearFocusedProgressPart(): void { }
			}());
			registration.defineInstance(ITerminalEditorService, new class extends mock<ITerminalEditorService>() { }());
			registration.defineInstance(ITerminalGroupService, new class extends mock<ITerminalGroupService>() { }());
			registration.defineInstance(IEditorService, new class extends mock<IEditorService>() { }());
			registration.defineInstance(IChatWidgetService, new class extends mock<IChatWidgetService>() { }());
			registration.defineInstance(IAccessibleViewService, new class extends mock<IAccessibleViewService>() {
				override getOpenAriaHint(): null {
					return null;
				}
			}());
			registration.defineInstance(IChatMarkdownAnchorService, {
				_serviceBrand: undefined,
				register: () => toDisposable(() => { }),
				lastFocusedAnchor: undefined,
			});
			registration.defineInstance(IMarkdownRendererService, new class extends mock<IMarkdownRendererService>() {
				override render = markdownRenderer.render;
			}());
			registration.defineInstance(IAiEditTelemetryService, new class extends mock<IAiEditTelemetryService>() { }());
			registration.defineInstance(IChatOutputRendererService, new class extends mock<IChatOutputRendererService>() {
				override hasCodeBlockRenderer(): boolean {
					return false;
				}
			}());
			registration.defineInstance(IChatSessionsService, new class extends mock<IChatSessionsService>() { }());
		},
	});
	const configurationService = instantiationService.get(IConfigurationService);
	if (!(configurationService instanceof TestConfigurationService)) {
		throw new Error('Expected TestConfigurationService');
	}
	configurationService.setUserConfiguration(ChatConfiguration.TerminalToolsInThinking, false);
	configurationService.setUserConfiguration(ChatConfiguration.SimpleTerminalCollapsible, options.collapsible ?? false);

	context.container.style.width = `${options.width}px`;
	context.container.style.padding = '8px';
	context.container.style.backgroundColor = 'var(--vscode-panel-background)';
	context.container.classList.add('monaco-workbench', 'interactive-session');
	const itemContainer = dom.append(context.container, dom.$('.interactive-item-container'));

	const sessionResource = URI.parse('chat-session://fixture/terminal-full-output');
	const fullOutput = options.hasFullOutput ? {
		uri: toAgentHostContentUri(URI.file(options.fullOutputPath ?? '/tmp/terminal-output.txt'), 'local', { alwaysWrap: true }),
		nonce: 'fixture-version',
	} : undefined;
	const terminalData: IChatTerminalToolInvocationData = {
		kind: 'terminal',
		commandLine: { original: 'find src -name "*.ts" | sort' },
		language: 'shellscript',
		intention: options.intention,
		isPty: false,
		terminalCommandState: { exitCode: 0 },
		terminalCommandOutput: {
			text: options.preview.replace(/\r?\n/g, '\r\n'),
			truncated: options.hasFullOutput,
			fullOutput,
		},
	};
	const invocation: IChatToolInvocationSerialized = {
		presentation: undefined,
		toolSpecificData: terminalData,
		invocationMessage: 'Running command',
		originMessage: undefined,
		pastTenseMessage: 'Ran command',
		isConfirmed: { type: ToolConfirmKind.ConfirmationNotNeeded },
		isComplete: true,
		toolCallId: 'fixture-terminal-tool-call',
		toolId: 'run_in_terminal',
		source: undefined,
		kind: 'toolInvocationSerialized',
	};
	const model = new class extends mock<IChatResponseViewModel['model']>() { }();
	const element = new class extends mock<IChatResponseViewModel>() {
		override readonly id = 'fixture-terminal-response';
		override readonly isComplete = true;
		override readonly sessionResource = sessionResource;
		override readonly model = model;
		override setVote(): void { }
	}();
	const editorPool = Object.create(EditorPool.prototype) as EditorPool;
	const renderContext: IChatContentPartRenderContext = {
		element,
		elementIndex: 0,
		container: itemContainer,
		content: [invocation],
		contentIndex: 0,
		inlineTextModels: Object.create(InlineTextModelCollection.prototype) as InlineTextModelCollection,
		editorPool,
		codeBlockStartIndex: 0,
		treeStartIndex: 0,
		diffEditorPool: Object.create(DiffEditorPool.prototype) as DiffEditorPool,
		currentWidth: observableValue('terminalFullOutputFixtureWidth', options.width),
		onDidChangeVisibility: Event.None,
	};
	const part = context.disposableStore.add(instantiationService.createInstance(
		ChatTerminalToolProgressPart,
		invocation,
		terminalData,
		renderContext,
		markdownRenderer,
		editorPool,
		() => options.width,
		0,
	));
	itemContainer.appendChild(part.domNode);
	if (options.expanded) {
		if (options.collapsible) {
			part.expandCollapsibleWrapper();
			const output = part.domNode.querySelector<HTMLElement>('.chat-terminal-output-container');
			if (!output) {
				throw new Error('Expected terminal output after expansion');
			}
			if (!output.classList.contains('expanded')) {
				await new Promise<void>(resolve => {
					const observer = new MutationObserver(() => {
						if (output.classList.contains('expanded')) {
							observer.disconnect();
							resolve();
						}
					});
					context.disposableStore.add(toDisposable(() => observer.disconnect()));
					observer.observe(output, { attributes: true, attributeFilter: ['class'] });
				});
			}
		} else {
			await part.toggleOutputFromAction();
		}
	}
}

export default defineThemedFixtureGroup({ path: 'chat/terminalFullOutput/' }, {
	'Expanded full output': defineComponentFixture({
		additionalThemes: ['darkHighContrast'],
		expectedVisualDescriptions: ['The nested executed-command block contains the preview and a plain Output truncated message with /tmp/terminal-output.txt. Its command header has the same square open-in-product icon used by local terminal cards, with the accessible label Show Full Output; no text button appears beside the outer Generate row.'],
		render: context => renderTerminalFullOutput(context, { width: 560, preview: 'src/main.ts\nsrc/terminal.ts\n…', hasFullOutput: true, expanded: true }),
	}),
	'Expanded no full output': defineComponentFixture({
		expectedVisualDescriptions: ['A completed terminal command shows its expanded terminal preview without an Open Full Output footer.'],
		render: context => renderTerminalFullOutput(context, { width: 560, preview: 'src/main.ts\nsrc/terminal.ts', hasFullOutput: false, expanded: true }),
	}),
	'Expanded empty preview': defineComponentFixture({
		additionalThemes: ['darkHighContrast'],
		expectedVisualDescriptions: ['With no preview text, the nested executed-command block contains a plain truncation and saved-location message for /tmp/terminal-output.txt. Its header shows the local-terminal open-in-product icon for Show Full Output; no text button, underline, footer, or cursor appears.'],
		render: context => renderTerminalFullOutput(context, { width: 560, preview: '', hasFullOutput: true, expanded: true }),
	}),
	'Narrow expanded full output': defineComponentFixture({
		additionalThemes: ['darkHighContrast'],
		expectedVisualDescriptions: ['In a narrow terminal card, the truncation message and saved path wrap as plain terminal text. The square open-in-product icon stays inside the nested executed-command header without overlapping its command label or appearing beside the outer row.'],
		render: context => renderTerminalFullOutput(context, { width: 280, preview: 'src/main.ts\nsrc/terminal.ts\n…', hasFullOutput: true, expanded: true, collapsible: true, intention: 'List source files', fullOutputPath: '/var/tmp/agent-session-1234567890/1788891000000-copilot-tool-output-12345-11111111-1111-4111-8111-111111111111.txt' }),
	}),
	'Collapsed full output': defineComponentFixture({
		expectedVisualDescriptions: ['The command output is collapsed while the bordered executed-command block remains visible. The same square open-in-product icon used by local terminal cards stays in that block’s command header.'],
		render: context => renderTerminalFullOutput(context, { width: 560, preview: 'src/main.ts\nsrc/terminal.ts\n…', hasFullOutput: true, expanded: false }),
	}),
	'Expanded collapsible full output': defineComponentFixture({
		additionalThemes: ['darkHighContrast'],
		expectedVisualDescriptions: ['The expanded collapsible terminal shows the square open-in-product icon inside the nested executed-command header. The outer row has no action; the terminal contains a plain truncation/saved-path message without a dotted underline or cursor.'],
		render: context => renderTerminalFullOutput(context, { width: 560, preview: 'src/main.ts\nsrc/terminal.ts\n…', hasFullOutput: true, expanded: true, collapsible: true }),
	}),
	'Long truncated preview': defineComponentFixture({
		additionalThemes: ['darkHighContrast'],
		expectedVisualDescriptions: ['A long run of x characters wraps in the nested executed-command block, followed by a plain truncation/saved-path message with no dotted underline or cursor. The local-terminal open-in-product icon appears in that same bordered block, not beside the outer row.'],
		render: context => renderTerminalFullOutput(context, { width: 800, preview: `FULL_OUTPUT_BEGIN\n${'x'.repeat(501)}`, hasFullOutput: true, expanded: true, collapsible: true, intention: 'Generate large stdout for display test' }),
	}),
});
