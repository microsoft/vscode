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
		uri: URI.parse('ahp-content://fixture/terminal-output'),
		nonce: 'fixture-version',
	} : undefined;
	const terminalData: IChatTerminalToolInvocationData = {
		kind: 'terminal',
		commandLine: { original: 'find src -name "*.ts" | sort' },
		language: 'shellscript',
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
		expectedVisualDescriptions: ['A completed terminal command shows a short preview in an expanded terminal output box, with a labeled Open Full Output action in a separate footer below the preview.'],
		render: context => renderTerminalFullOutput(context, { width: 560, preview: 'src/main.ts\nsrc/terminal.ts\n…', hasFullOutput: true, expanded: true }),
	}),
	'Expanded no full output': defineComponentFixture({
		expectedVisualDescriptions: ['A completed terminal command shows its expanded terminal preview without an Open Full Output footer.'],
		render: context => renderTerminalFullOutput(context, { width: 560, preview: 'src/main.ts\nsrc/terminal.ts', hasFullOutput: false, expanded: true }),
	}),
	'Expanded empty preview': defineComponentFixture({
		additionalThemes: ['darkHighContrast'],
		expectedVisualDescriptions: ['An expanded terminal output box says that a preview is not available and shows a labeled Open Full Output action in a separate footer below the message.'],
		render: context => renderTerminalFullOutput(context, { width: 560, preview: '', hasFullOutput: true, expanded: true }),
	}),
	'Narrow expanded full output': defineComponentFixture({
		additionalThemes: ['darkHighContrast'],
		expectedVisualDescriptions: ['In a narrow terminal command card, the expanded preview stays inside the card and the Open Full Output footer action remains fully visible without overlapping terminal content.'],
		render: context => renderTerminalFullOutput(context, { width: 280, preview: 'src/main.ts\nsrc/terminal.ts\n…', hasFullOutput: true, expanded: true }),
	}),
	'Collapsed full output': defineComponentFixture({
		expectedVisualDescriptions: ['A completed terminal command is collapsed; no terminal preview or Open Full Output footer is visible.'],
		render: context => renderTerminalFullOutput(context, { width: 560, preview: 'src/main.ts\nsrc/terminal.ts\n…', hasFullOutput: true, expanded: false }),
	}),
	'Expanded collapsible full output': defineComponentFixture({
		additionalThemes: ['darkHighContrast'],
		expectedVisualDescriptions: ['An expanded completed terminal command has a collapsible header, aligned preview lines, and a labeled Open Full Output footer outside the scrollable preview.'],
		render: context => renderTerminalFullOutput(context, { width: 560, preview: 'src/main.ts\nsrc/terminal.ts\n…', hasFullOutput: true, expanded: true, collapsible: true }),
	}),
});
