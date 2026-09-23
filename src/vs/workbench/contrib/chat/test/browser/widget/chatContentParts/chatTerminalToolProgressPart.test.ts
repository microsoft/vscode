/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as sinon from 'sinon';
import type { Terminal } from '@xterm/xterm';
import { importAMDNodeModule } from '../../../../../../../amdX.js';
import { scheduleAtNextAnimationFrame } from '../../../../../../../base/browser/dom.js';
import { renderAsPlaintext } from '../../../../../../../base/browser/markdownRenderer.js';
import { mainWindow } from '../../../../../../../base/browser/window.js';
import { toAction, type IAction } from '../../../../../../../base/common/actions.js';
import { DeferredPromise, timeout } from '../../../../../../../base/common/async.js';
import { Emitter, Event } from '../../../../../../../base/common/event.js';
import { hash } from '../../../../../../../base/common/hash.js';
import { observableValue } from '../../../../../../../base/common/observable.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { DisposableStore, toDisposable } from '../../../../../../../base/common/lifecycle.js';
import { mock } from '../../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../../../../base/test/common/timeTravelScheduler.js';
import { TerminalClaimKind, TerminalLifecycleStatus } from '../../../../../../../platform/agentHost/common/state/protocol/state.js';
import { IConfigurationService } from '../../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../../platform/configuration/test/common/testConfigurationService.js';
import type { IResourceEditorInput } from '../../../../../../../platform/editor/common/editor.js';
import { TestInstantiationService } from '../../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ITelemetryService } from '../../../../../../../platform/telemetry/common/telemetry.js';
import { NullTelemetryServiceShape } from '../../../../../../../platform/telemetry/common/telemetryUtils.js';
import { IAccessibleViewService } from '../../../../../../../platform/accessibility/browser/accessibleView.js';
import { IContextKeyService } from '../../../../../../../platform/contextkey/common/contextkey.js';
import { IMarkdownRenderer } from '../../../../../../../platform/markdown/browser/markdownRenderer.js';
import { TerminalCapabilityStore } from '../../../../../../../platform/terminal/common/capabilities/terminalCapabilityStore.js';
import type { ITerminalCommand } from '../../../../../../../platform/terminal/common/capabilities/capabilities.js';
import { IThemeService } from '../../../../../../../platform/theme/common/themeService.js';
import { TestThemeService } from '../../../../../../../platform/theme/test/common/testThemeService.js';
import { isResourceEditorInput } from '../../../../../../common/editor.js';
import { IEditorService } from '../../../../../../services/editor/common/editorService.js';
import { workbenchInstantiationService } from '../../../../../../test/browser/workbenchTestServices.js';
import { IAiEditTelemetryService } from '../../../../../editTelemetry/browser/telemetry/aiEditTelemetry/aiEditTelemetryService.js';
import { IChatOutputRendererService } from '../../../../browser/chatOutputItemRenderer.js';
import { IChatMarkdownAnchorService } from '../../../../browser/widget/chatContentParts/chatMarkdownAnchorService.js';
import { IChatContentPartRenderContext, InlineTextModelCollection } from '../../../../browser/widget/chatContentParts/chatContentParts.js';
import { DiffEditorPool, EditorPool } from '../../../../browser/widget/chatContentParts/chatContentCodePools.js';
import { ChatTerminalThinkingCollapsibleWrapper, ChatTerminalToolOutputSection, ChatTerminalToolProgressPart } from '../../../../browser/widget/chatContentParts/toolInvocationParts/chatTerminalToolProgressPart.js';
import { ChatContextKeys } from '../../../../common/actions/chatContextKeys.js';
import { IChatSessionsService } from '../../../../common/chatSessionsService.js';
import { IChatTerminalToolInvocationData, IChatToolInvocationSerialized, ToolConfirmKind } from '../../../../common/chatService/chatService.js';
import { ChatConfiguration } from '../../../../common/constants.js';
import { ChatResponseResource } from '../../../../common/model/chatModel.js';
import { IChatResponseViewModel } from '../../../../common/model/chatViewModel.js';
import { TerminalToolAutoExpand, TerminalToolAutoExpandTimeout } from '../../../../browser/widget/chatContentParts/toolInvocationParts/terminalToolAutoExpand.js';
import { IChatTerminalToolProgressPart, ITerminalChatService, ITerminalConfigurationService, ITerminalInstance, ITerminalService, type IChatTerminalOutputSource, type IDetachedXTermOptions } from '../../../../../terminal/browser/terminal.js';
import type { ITerminalFont } from '../../../../../terminal/common/terminal.js';
import { createFakeDetachedTerminal } from '../../../../../terminal/test/browser/chatTerminalMirrorTestUtils.js';
import { createTerminalOutputTestFixture } from '../../../common/widget/terminalFullOutputTestUtils.js';

function listenerCount<T>(emitter: Emitter<T>): number {
	return (emitter as unknown as { _size: number })._size ?? 0;
}

function terminalOutputLabel(toolCallId: string): string {
	const runId = (hash(toolCallId) >>> 0).toString(36).padStart(5, '0').slice(-5);
	return `Terminal Output · ${runId}`;
}

function terminalOutputName(toolCallId: string): string {
	const runId = (hash(toolCallId) >>> 0).toString(36).padStart(5, '0').slice(-5);
	return `terminal-output-${runId}.txt`;
}

class TestTerminalChatService extends mock<ITerminalChatService>() {
	override readonly onDidRegisterTerminalInstanceWithToolSession = Event.None;
	override readonly onDidContinueInBackground: Event<string>;

	private readonly progressParts = new Set<IChatTerminalToolProgressPart>();

	constructor(
		private readonly continueInBackgroundEmitter: Emitter<string>,
		private readonly terminalInstance: ITerminalInstance,
	) {
		super();
		this.onDidContinueInBackground = continueInBackgroundEmitter.event;
	}

	override async getTerminalInstanceByToolSessionId(_terminalToolSessionId: string): Promise<ITerminalInstance | undefined> {
		return this.terminalInstance;
	}

	override registerProgressPart(part: IChatTerminalToolProgressPart) {
		this.progressParts.add(part);
		return toDisposable(() => this.progressParts.delete(part));
	}

	override continueInBackground(terminalToolSessionId: string): void {
		this.continueInBackgroundEmitter.fire(terminalToolSessionId);
		for (const part of this.progressParts) {
			if (part.terminalToolSessionId === terminalToolSessionId) {
				part.markContinuedInBackground();
			}
		}
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
}

suite('ChatTerminalToolProgressPart listener ownership', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('rendered parts do not accumulate continue listeners and duplicate rows update', async () => {
		const instantiationService = workbenchInstantiationService(undefined, store);
		const continueInBackgroundEmitter = store.add(new Emitter<string>());
		const capabilities = store.add(new TerminalCapabilityStore());
		const terminalInstance = new class extends mock<ITerminalInstance>() {
			override readonly isDisposed = false;
			override readonly onDisposed = Event.None;
			override readonly onWillData = Event.None;
			override readonly capabilities = capabilities;
		}();
		const terminalChatService = new TestTerminalChatService(continueInBackgroundEmitter, terminalInstance);
		instantiationService.stub(ITerminalChatService, terminalChatService);
		instantiationService.stub(ITerminalService, new class extends mock<ITerminalService>() {
			override readonly whenConnected = Promise.resolve();
		}());
		instantiationService.stub(IAccessibleViewService, new class extends mock<IAccessibleViewService>() { }());
		instantiationService.stub(IChatMarkdownAnchorService, {
			_serviceBrand: undefined,
			register: () => toDisposable(() => { }),
			lastFocusedAnchor: undefined,
		});
		instantiationService.stub(IAiEditTelemetryService, new class extends mock<IAiEditTelemetryService>() { }());
		instantiationService.stub(IChatOutputRendererService, new class extends mock<IChatOutputRendererService>() {
			override hasCodeBlockRenderer(): boolean {
				return false;
			}
		}());
		instantiationService.stub(IChatSessionsService, new class extends mock<IChatSessionsService>() { }());

		const markdownRenderer: IMarkdownRenderer = {
			render: (markdown, _options, outElement) => {
				const element = outElement ?? mainWindow.document.createElement('div');
				element.textContent = renderAsPlaintext(markdown);
				return { element, dispose() { } };
			}
		};
		const editorPool = Object.create(EditorPool.prototype) as EditorPool;
		const host = mainWindow.document.createElement('div');
		mainWindow.document.body.appendChild(host);
		store.add(toDisposable(() => host.remove()));
		const eventSessionIds: string[] = [];
		store.add(continueInBackgroundEmitter.event(sessionId => eventSessionIds.push(sessionId)));
		const listenerCountBeforeRender = listenerCount(continueInBackgroundEmitter);

		const targetSessionId = 'terminal-session-target';
		const terminalData: IChatTerminalToolInvocationData[] = [];
		const parts: ChatTerminalToolProgressPart[] = [];
		for (let index = 0; index < 50; index++) {
			const data: IChatTerminalToolInvocationData = {
				kind: 'terminal',
				commandLine: { original: `echo ${index}` },
				language: 'shellscript',
				terminalToolSessionId: index === 24 || index === 25 ? targetSessionId : `terminal-session-${index}`,
			};
			const invocation: IChatToolInvocationSerialized = {
				presentation: undefined,
				toolSpecificData: data,
				invocationMessage: 'Running command',
				originMessage: undefined,
				pastTenseMessage: 'Ran command',
				isConfirmed: { type: ToolConfirmKind.ConfirmationNotNeeded },
				isComplete: true,
				toolCallId: `tool-call-${index}`,
				toolId: 'run_in_terminal',
				source: undefined,
				kind: 'toolInvocationSerialized',
			};
			const element = Object.assign(Object.create(null) as IChatResponseViewModel, {
				id: `response-${index}`,
				isComplete: true,
				sessionResource: URI.parse('chat-session://test/session'),
				setVote() { },
				get model() { return {} as IChatResponseViewModel['model']; },
			});
			const context: IChatContentPartRenderContext = {
				element,
				elementIndex: index,
				container: host,
				content: [invocation],
				contentIndex: 0,
				inlineTextModels: Object.create(InlineTextModelCollection.prototype) as InlineTextModelCollection,
				editorPool,
				codeBlockStartIndex: 0,
				treeStartIndex: 0,
				diffEditorPool: Object.create(DiffEditorPool.prototype) as DiffEditorPool,
				currentWidth: observableValue('testWidth', 500),
				onDidChangeVisibility: Event.None,
			};
			const part = store.add(instantiationService.createInstance(
				ChatTerminalToolProgressPart,
				invocation,
				data,
				context,
				markdownRenderer,
				editorPool,
				() => 500,
				0,
			));
			host.appendChild(part.domNode);
			terminalData.push(data);
			parts.push(part);
		}
		await timeout(0);

		const listenerCountAfterRender = listenerCount(continueInBackgroundEmitter);
		const actionCountsBefore = parts.map(part => part.domNode.querySelectorAll('.action-item').length);
		parts[24].continueInBackground();
		const actionCountsAfter = parts.map(part => part.domNode.querySelectorAll('.action-item').length);

		assert.deepStrictEqual({
			renderedRows: parts.filter(part => part.domNode.isConnected).length,
			listenerCounts: [listenerCountBeforeRender, listenerCountAfterRender],
			actionCountsBefore: [...new Set(actionCountsBefore)],
			continuedRows: terminalData.flatMap((data, index) => data.didContinueInBackground ? [index] : []),
			matchingActionCountsAfter: [actionCountsAfter[24], actionCountsAfter[25]],
			unmatchedActionCountAfter: actionCountsAfter[0],
			eventSessionIds,
		}, {
			renderedRows: 50,
			listenerCounts: [1, 1],
			actionCountsBefore: [2],
			continuedRows: [24, 25],
			matchingActionCountsAfter: [1, 1],
			unmatchedActionCountAfter: 2,
			eventSessionIds: [targetSessionId],
		});
	});
});

type TerminalFullOutputRenderingMode = 'thinking' | 'simple' | 'plain';

interface ITerminalFullOutputPartOptions {
	readonly mode: TerminalFullOutputRenderingMode;
	readonly sessionResource?: URI;
	readonly toolCallId?: string;
	readonly terminalUri?: URI;
	readonly command?: string;
	readonly intention?: string;
	readonly preview?: string;
	readonly hasReference?: boolean;
	readonly truncated?: boolean;
}

async function createTerminalFullOutputHarness(store: Pick<DisposableStore, 'add'>) {
	const instantiationService = workbenchInstantiationService(undefined, store);
	const configurationService = instantiationService.get(IConfigurationService);
	if (!(configurationService instanceof TestConfigurationService)) {
		throw new Error('Expected TestConfigurationService');
	}
	const testConfigurationService = configurationService;

	const XTermBaseCtor = (await importAMDNodeModule<typeof import('@xterm/xterm')>('@xterm/xterm', 'lib/xterm.js')).Terminal;
	const terminalFont: ITerminalFont = { fontFamily: 'monospace', fontSize: 12, letterSpacing: 0, lineHeight: 1, charWidth: 8, charHeight: 16 };
	let terminalActivationCount = 0;
	const outputTerminals = new Map<HTMLElement, ReturnType<typeof createFakeDetachedTerminal>>();
	const terminalService = new class extends mock<ITerminalService>() {
		override readonly whenConnected = Promise.resolve();
		override async createDetachedTerminal(options: IDetachedXTermOptions) {
			const fake = createFakeDetachedTerminal(XTermBaseCtor, options, terminalFont);
			return { ...fake.instance, attachToElement: (container: HTMLElement) => { outputTerminals.set(container, fake); } };
		}
		override setActiveInstance(): void {
			terminalActivationCount++;
		}
	}();
	instantiationService.stub(ITerminalService, terminalService);
	instantiationService.stub(ITerminalConfigurationService, {
		getFont: () => terminalFont,
	} as Partial<ITerminalConfigurationService>);

	const capabilities = store.add(new TerminalCapabilityStore());
	const terminalInstance = new class extends mock<ITerminalInstance>() {
		override readonly isDisposed = false;
		override readonly onDisposed = Event.None;
		override readonly onWillData = Event.None;
		override readonly capabilities = capabilities;
	}();
	const continueInBackgroundEmitter = store.add(new Emitter<string>());
	instantiationService.stub(ITerminalChatService, new TestTerminalChatService(continueInBackgroundEmitter, terminalInstance));
	instantiationService.stub(IAccessibleViewService, new class extends mock<IAccessibleViewService>() {
		override getOpenAriaHint(): null {
			return null;
		}
	}());
	instantiationService.stub(IChatMarkdownAnchorService, {
		_serviceBrand: undefined,
		register: () => toDisposable(() => { }),
		lastFocusedAnchor: undefined,
	});
	instantiationService.stub(IAiEditTelemetryService, new class extends mock<IAiEditTelemetryService>() { }());
	instantiationService.stub(IChatOutputRendererService, new class extends mock<IChatOutputRendererService>() {
		override hasCodeBlockRenderer(): boolean {
			return false;
		}
	}());
	instantiationService.stub(IChatSessionsService, new class extends mock<IChatSessionsService>() { }());

	const openedEditors: IResourceEditorInput[] = [];
	const editorOpenHandlers: ((input: IResourceEditorInput) => Promise<void>)[] = [];
	const editorOpenOperations: Promise<void>[] = [];
	instantiationService.stub(IEditorService, new class extends mock<IEditorService>() {
		override async openEditor(...args: unknown[]): Promise<undefined> {
			const input = args[0];
			if (!isResourceEditorInput(input)) {
				throw new Error('Expected a resource editor input');
			}
			openedEditors.push(input);
			const operation = Promise.all(editorOpenHandlers.map(handler => handler(input))).then(() => undefined);
			editorOpenOperations.push(operation);
			await operation;
			return undefined;
		}
	}());

	const markdownRenderer: IMarkdownRenderer = {
		render: (markdown, _options, outElement) => {
			const element = outElement ?? mainWindow.document.createElement('div');
			element.textContent = renderAsPlaintext(markdown);
			return { element, dispose() { } };
		}
	};
	const editorPool = Object.create(EditorPool.prototype) as EditorPool;
	const host = mainWindow.document.createElement('div');
	host.style.width = '800px';
	mainWindow.document.body.appendChild(host);
	store.add(toDisposable(() => host.remove()));

	function createPart(options: ITerminalFullOutputPartOptions): {
		readonly part: ChatTerminalToolProgressPart;
		readonly mode: TerminalFullOutputRenderingMode;
		readonly sessionResource: URI;
		readonly toolCallId: string;
		readonly terminal: URI | undefined;
		readonly invocation: IChatToolInvocationSerialized;
	} {
		testConfigurationService.setUserConfiguration(ChatConfiguration.TerminalToolsInThinking, options.mode === 'thinking');
		testConfigurationService.setUserConfiguration(ChatConfiguration.SimpleTerminalCollapsible, options.mode === 'simple');

		const sessionResource = options.sessionResource ?? URI.parse('chat-session://test/full-output');
		const toolCallId = options.toolCallId ?? 'terminal-tool-call';
		const terminal = options.hasReference === false ? undefined : options.terminalUri ?? URI.parse('agenthost-terminal://shell/session/full-output');
		const data: IChatTerminalToolInvocationData = {
			kind: 'terminal',
			commandLine: { original: options.command ?? 'printf output' },
			intention: options.intention,
			language: 'shellscript',
			terminalCommandUri: terminal,
			terminalCommandOutput: {
				text: options.preview ?? 'preview output',
				truncated: options.truncated ?? !!terminal,
			},
		};
		const invocation: IChatToolInvocationSerialized = {
			presentation: undefined,
			toolSpecificData: data,
			invocationMessage: 'Running command',
			originMessage: undefined,
			pastTenseMessage: 'Ran command',
			isConfirmed: { type: ToolConfirmKind.ConfirmationNotNeeded },
			isComplete: true,
			toolCallId,
			toolId: 'run_in_terminal',
			source: undefined,
			kind: 'toolInvocationSerialized',
		};
		const element = Object.assign(Object.create(null) as IChatResponseViewModel, {
			id: `response-${toolCallId}`,
			isComplete: true,
			sessionResource,
			setVote() { },
			get model() { return {} as IChatResponseViewModel['model']; },
		});
		const context: IChatContentPartRenderContext = {
			element,
			elementIndex: 0,
			container: host,
			content: [invocation],
			contentIndex: 0,
			inlineTextModels: Object.create(InlineTextModelCollection.prototype) as InlineTextModelCollection,
			editorPool,
			codeBlockStartIndex: 0,
			treeStartIndex: 0,
			diffEditorPool: Object.create(DiffEditorPool.prototype) as DiffEditorPool,
			currentWidth: observableValue('terminalFullOutputWidth', 800),
			onDidChangeVisibility: Event.None,
		};
		const part = store.add(instantiationService.createInstance(
			ChatTerminalToolProgressPart,
			invocation,
			data,
			context,
			markdownRenderer,
			editorPool,
			() => 800,
			0,
		));
		host.appendChild(part.domNode);
		return { part, mode: options.mode, sessionResource, toolCallId, terminal, invocation };
	}

	async function expand(part: ChatTerminalToolProgressPart, mode: TerminalFullOutputRenderingMode): Promise<void> {
		if (mode !== 'plain') {
			part.expandCollapsibleWrapper();
		}
		const output = part.domNode.querySelector<HTMLElement>('.chat-terminal-output-container');
		assert.ok(output, `Expected output for ${mode} rendering`);
		if (!output.classList.contains('expanded')) {
			if (mode === 'plain') {
				await part.toggleOutputFromAction();
			} else {
				await new Promise<void>(resolve => {
					const observer = new mainWindow.MutationObserver(() => {
						if (output.classList.contains('expanded')) {
							observer.disconnect();
							resolve();
						}
					});
					store.add(toDisposable(() => observer.disconnect()));
					observer.observe(output, { attributes: true, attributeFilter: ['class'] });
				});
			}
		}
	}

	async function collapse(part: ChatTerminalToolProgressPart, mode: TerminalFullOutputRenderingMode): Promise<void> {
		if (mode === 'plain') {
			const output = part.domNode.querySelector<HTMLElement>('.chat-terminal-output-container');
			assert.ok(output);
			if (output.classList.contains('expanded')) {
				await part.toggleOutputFromAction();
			}
			return;
		}
		const collapseButton = part.domNode.querySelector<HTMLElement>('.chat-terminal-thinking-collapsible > .chat-used-context-label .monaco-button');
		assert.ok(collapseButton);
		collapseButton.click();
		await timeout(0);
	}

	return {
		createPart,
		expand,
		collapse,
		openedEditors,
		editorOpenOperations,
		container: host,
		terminal: (part: ChatTerminalToolProgressPart) => {
			const container = part.domNode.querySelector<HTMLElement>('.chat-terminal-output-terminal');
			const terminal = container && outputTerminals.get(container);
			assert.ok(terminal);
			return terminal;
		},
		raw: (part: ChatTerminalToolProgressPart) => {
			const container = part.domNode.querySelector<HTMLElement>('.chat-terminal-output-terminal');
			const terminal = container && outputTerminals.get(container);
			assert.ok(terminal);
			return terminal.raw;
		},
		addEditorOpenHandler: (handler: (input: IResourceEditorInput) => Promise<void>) => {
			editorOpenHandlers.push(handler);
		},
		get terminalActivationCount() { return terminalActivationCount; },
	};
}

function snapshotText(raw: Terminal): string {
	let text = '';
	for (let y = 0; y < raw.buffer.active.length; y++) {
		const line = raw.buffer.active.getLine(y);
		if (y && !line?.isWrapped) {
			text += '\n';
		}
		text += line?.translateToString(true) ?? '';
	}
	return text.trimEnd();
}

function showFullOutputElement(part: ChatTerminalToolProgressPart): HTMLElement {
	const commandHeader = part.domNode.querySelector<HTMLElement>('.chat-terminal-content-title');
	const element = Array.from(commandHeader?.querySelectorAll<HTMLElement>('.action-label') ?? []).find(element => element.getAttribute('aria-label') === 'Open Full Output (Read-Only)');
	assert.ok(element);
	assert.ok(commandHeader?.contains(element));
	assert.ok(element.classList.contains('codicon-open-in-product'));
	return element;
}

suite('ChatTerminalToolProgressPart full output', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const fullOutputClickWait = 350;

	for (const mode of ['thinking', 'simple', 'plain'] as const) {
		test(`opens full output from the completed preview area in ${mode} mode`, async () => {
			const harness = await createTerminalFullOutputHarness(store);
			const entry = harness.createPart({ mode });
			await harness.expand(entry.part, mode);
			const terminal = entry.terminal;
			assert.ok(terminal);
			const selectors = [
				'.chat-terminal-output-container',
				'.chat-terminal-output-body',
				'.chat-terminal-output-content',
				'.chat-terminal-output-terminal',
				'.chat-terminal-output-container > .monaco-scrollable-element',
			];
			for (const selector of selectors) {
				const target = entry.part.domNode.querySelector<HTMLElement>(selector);
				assert.ok(target, selector);
				target.click();
				await timeout(fullOutputClickWait);
			}
			const output = entry.part.domNode.querySelector<HTMLElement>('.chat-terminal-output-container');
			assert.ok(output);
			const xterm = mainWindow.document.createElement('div');
			xterm.className = 'xterm';
			const screen = mainWindow.document.createElement('div');
			screen.className = 'xterm-screen';
			const widgetContainer = mainWindow.document.createElement('div');
			widgetContainer.className = 'terminal-widget-container';
			screen.appendChild(widgetContainer);
			xterm.appendChild(screen);
			output.appendChild(xterm);

			assert.deepStrictEqual({
				resources: harness.openedEditors.map(input => input.resource.toString()),
				clickable: output.classList.contains('chat-terminal-output-clickable'),
				cursors: [output, xterm, screen, widgetContainer].map(element => mainWindow.getComputedStyle(element).cursor),
				terminalActivations: harness.terminalActivationCount,
			}, {
				resources: selectors.map(() => ChatResponseResource.createTerminalOutputUri(entry.sessionResource, entry.toolCallId, terminal, terminalOutputName(entry.toolCallId)).toString()),
				clickable: true,
				cursors: ['pointer', 'pointer', 'pointer', 'pointer'],
				terminalActivations: 0,
			});
		});
	}

	test('does not open a full-output editor from previews without an artifact or from the command header', async () => {
		const harness = await createTerminalFullOutputHarness(store);
		const withoutReference = harness.createPart({ mode: 'plain', hasReference: false });
		const withReference = harness.createPart({ mode: 'plain' });
		await harness.expand(withoutReference.part, 'plain');
		await harness.expand(withReference.part, 'plain');
		const preview = withoutReference.part.domNode.querySelector<HTMLElement>('.chat-terminal-output-container');
		const header = withReference.part.domNode.querySelector<HTMLElement>('.chat-terminal-command-block');
		assert.ok(preview);
		assert.ok(header);
		preview.click();
		header.click();
		await timeout(0);

		assert.deepStrictEqual({
			opens: harness.openedEditors.length,
			clickable: preview.classList.contains('chat-terminal-output-clickable'),
		}, {
			opens: 0,
			clickable: false,
		});
	});

	test('preserves drags and scrolling without suppressing the next ordinary preview click', async () => {
		const harness = await createTerminalFullOutputHarness(store);
		const { part } = harness.createPart({ mode: 'plain' });
		await harness.expand(part, 'plain');
		const body = part.domNode.querySelector<HTMLElement>('.chat-terminal-output-body');
		const output = part.domNode.querySelector<HTMLElement>('.chat-terminal-output-container');
		assert.ok(body);
		assert.ok(output);
		const mouse = (type: string, x: number, buttons = 0) => body.dispatchEvent(new mainWindow.MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: 10, buttons, detail: 1 }));
		for (const gesture of ['drag', 'leave', 'wheel']) {
			mouse('mousedown', 10, 1);
			if (gesture === 'drag') {
				mouse('mousemove', 80, 1);
				mouse('mousemove', 10, 1);
			} else if (gesture === 'leave') {
				output.dispatchEvent(new mainWindow.MouseEvent('mouseleave', { buttons: 1 }));
			} else {
				body.dispatchEvent(new mainWindow.WheelEvent('wheel', { bubbles: true, deltaY: 20 }));
			}
			mouse('mouseup', 10);
			mouse('click', 10);
		}
		await timeout(0);
		const opensAfterGestures = harness.openedEditors.length;
		mouse('mousedown', 10, 1);
		mouse('mouseup', 10);
		mouse('click', 10);
		await timeout(fullOutputClickWait);

		assert.deepStrictEqual({
			opensAfterGestures,
			opensAfterClick: harness.openedEditors.length,
		}, {
			opensAfterGestures: 0,
			opensAfterClick: 1,
		});
	});

	test('preserves xterm selection and a click that only clears an existing selection', async () => {
		const harness = await createTerminalFullOutputHarness(store);
		const { part } = harness.createPart({ mode: 'plain' });
		await harness.expand(part, 'plain');
		const terminal = part.domNode.querySelector<HTMLElement>('.chat-terminal-output-terminal');
		assert.ok(terminal);
		const raw = harness.raw(part);
		raw.open(terminal);
		raw.select(0, 0, 7);
		assert.strictEqual(raw.hasSelection(), true);
		terminal.click();
		terminal.dispatchEvent(new mainWindow.MouseEvent('mousedown', { bubbles: true, buttons: 1 }));
		raw.clearSelection();
		terminal.dispatchEvent(new mainWindow.MouseEvent('click', { bubbles: true }));
		await timeout(0);
		assert.strictEqual(harness.openedEditors.length, 0);

		terminal.click();
		await timeout(fullOutputClickWait);
		assert.strictEqual(harness.openedEditors.length, 1);
	});

	test('does not open the editor for a real double-click sequence', async () => {
		const harness = await createTerminalFullOutputHarness(store);
		const { part } = harness.createPart({ mode: 'plain' });
		await harness.expand(part, 'plain');
		const body = part.domNode.querySelector<HTMLElement>('.chat-terminal-output-body');
		assert.ok(body);

		body.dispatchEvent(new mainWindow.MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }));
		body.dispatchEvent(new mainWindow.MouseEvent('click', { bubbles: true, cancelable: true, detail: 2 }));
		body.dispatchEvent(new mainWindow.MouseEvent('dblclick', { bubbles: true, cancelable: true, detail: 2 }));
		await timeout(fullOutputClickWait);

		assert.strictEqual(harness.openedEditors.length, 0);
	});

	test('leaves existing links, nested controls, scrollbars, and modified clicks alone', async () => {
		const harness = await createTerminalFullOutputHarness(store);
		const { part } = harness.createPart({ mode: 'plain' });
		await harness.expand(part, 'plain');
		const body = part.domNode.querySelector<HTMLElement>('.chat-terminal-output-body');
		assert.ok(body);
		for (const [tag, attribute, value] of [
			['a', 'tabindex', '0'],
			['button', 'type', 'button'],
			['input', 'type', 'text'],
			['span', 'role', 'button'],
			['span', 'role', 'link'],
			['div', 'contenteditable', 'true'],
			['div', 'class', 'slider'],
			['div', 'class', 'xterm-scrollbar'],
			['div', 'class', 'xterm-cursor-pointer'],
		]) {
			const control = mainWindow.document.createElement(tag);
			control.setAttribute(attribute, value);
			body.appendChild(control);
			control.click();
		}
		for (const options of [{ button: 1 }, { button: 2 }, { ctrlKey: true }, { metaKey: true }, { altKey: true }, { shiftKey: true }, { detail: 2 }]) {
			body.dispatchEvent(new mainWindow.MouseEvent('click', { bubbles: true, ...options }));
		}
		const cancelled = new mainWindow.MouseEvent('click', { bubbles: true, cancelable: true });
		cancelled.preventDefault();
		body.dispatchEvent(cancelled);
		await timeout(0);
		assert.strictEqual(harness.openedEditors.length, 0);
	});

	test('does not reopen output after an xterm link handled the same mouse gesture', async () => {
		const harness = await createTerminalFullOutputHarness(store);
		const { part } = harness.createPart({ mode: 'plain' });
		await harness.expand(part, 'plain');
		const terminal = part.domNode.querySelector<HTMLElement>('.chat-terminal-output-terminal');
		assert.ok(terminal);
		terminal.classList.add('xterm-cursor-pointer');
		terminal.dispatchEvent(new mainWindow.MouseEvent('mousedown', { bubbles: true, buttons: 1 }));
		showFullOutputElement(part).click();
		terminal.classList.remove('xterm-cursor-pointer');
		terminal.dispatchEvent(new mainWindow.MouseEvent('click', { bubbles: true }));
		await timeout(0);
		assert.strictEqual(harness.openedEditors.length, 1);
	});

	test('opens from Enter on the output region without taking keyboard input from nested controls', async () => {
		const harness = await createTerminalFullOutputHarness(store);
		const { part } = harness.createPart({ mode: 'plain' });
		await harness.expand(part, 'plain');
		const region = part.domNode.querySelector<HTMLElement>('.chat-terminal-output-container > .monaco-scrollable-element');
		assert.ok(region);
		const input = mainWindow.document.createElement('input');
		region.appendChild(input);
		input.dispatchEvent(new mainWindow.KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
		region.dispatchEvent(new mainWindow.KeyboardEvent('keydown', { key: ' ', keyCode: 32, bubbles: true }));
		await timeout(0);
		const opensFromOtherKeys = harness.openedEditors.length;
		region.dispatchEvent(new mainWindow.KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true, cancelable: true }));
		await timeout(0);

		assert.deepStrictEqual({
			opensFromOtherKeys,
			opensFromEnter: harness.openedEditors.length,
			ariaHint: region.getAttribute('aria-label')?.includes('Press Enter to open the full output in a read-only editor.'),
		}, {
			opensFromOtherKeys: 0,
			opensFromEnter: 1,
			ariaHint: true,
		});
	});

	test('Open Full Output (Read-Only) fits the command header at narrow widths', async () => {
		const harness = await createTerminalFullOutputHarness(store);
		harness.container.style.width = '280px';
		for (const mode of ['thinking', 'simple', 'plain'] as const) {
			const { part } = harness.createPart({ mode });
			await harness.expand(part, mode);
			const action = showFullOutputElement(part);
			const bounds = part.domNode.getBoundingClientRect();
			const actionBounds = action.getBoundingClientRect();
			assert.ok(actionBounds.width > 0 && actionBounds.left >= bounds.left && actionBounds.right <= bounds.right, mode);
		}
	});

	test('renders a plain inline notice and a header action in every rendering mode', async () => {
		const harness = await createTerminalFullOutputHarness(store);

		for (const mode of ['thinking', 'simple', 'plain'] as const) {
			const { part } = harness.createPart({ mode, toolCallId: `reference-${mode}`, truncated: true });
			await harness.expand(part, mode);
			const showFullOutput = showFullOutputElement(part);
			assert.strictEqual(showFullOutput.getAttribute('aria-label'), 'Open Full Output (Read-Only)');
			assert.strictEqual(part.domNode.querySelector('.chat-terminal-thinking-collapsible > .chat-used-context-label .chat-terminal-show-link'), null);
			const text = snapshotText(harness.raw(part));
			assert.strictEqual(text, 'preview output\n\nShowing a preview. Click to open full output (read-only)');
			assert.strictEqual(part.domNode.querySelector('.chat-terminal-full-output-footer'), null);

			await harness.collapse(part, mode);
			const collapsedOutput = part.domNode.querySelector<HTMLElement>('.chat-terminal-output-container');
			const animationContent = part.domNode.querySelector<HTMLElement>('.chat-collapsible-content-animation-inner');
			assert.ok(collapsedOutput);
			assert.strictEqual(mode === 'plain' ? collapsedOutput.classList.contains('collapsed') : animationContent?.inert, true);

			const noReference = harness.createPart({ mode, toolCallId: `no-reference-${mode}`, hasReference: false, truncated: true });
			await harness.expand(noReference.part, mode);
			assert.strictEqual(noReference.part.fullOutputAction, undefined);
			assert.strictEqual(noReference.part.domNode.querySelector('.chat-terminal-full-output-footer'), null);
			assert.strictEqual(noReference.part.domNode.querySelector('.chat-terminal-full-output-note'), null);
			assert.strictEqual(snapshotText(harness.raw(noReference.part)), 'preview output');
		}

		assert.strictEqual(harness.openedEditors.length, 0);
	});

	test('keeps an empty preview actionable without claiming the command produced no output', async () => {
		const harness = await createTerminalFullOutputHarness(store);
		const { part } = harness.createPart({ mode: 'plain', preview: '', terminalUri: URI.parse('agenthost-terminal://shell/empty-preview/output') });
		await harness.expand(part, 'plain');

		const emptyMessage = part.domNode.querySelector<HTMLElement>('.chat-terminal-output-empty')?.textContent;
		const accessibleText = part.getCommandAndOutputAsText();
		assert.deepStrictEqual({
			hasAction: !!part.fullOutputAction,
			emptyMessage,
			accessibleText,
			claimsNoOutput: `${emptyMessage}\n${accessibleText}`.includes('No output was produced'),
		}, {
			hasAction: true,
			emptyMessage: '',
			accessibleText: 'Command: printf output\nA preview is not available.\nClick to open full output (read-only)\nOpen Full Output (Read-Only) opens the captured output if it is still available.',
			claimsNoOutput: false,
		});
	});

	for (const { name, uri } of [
		{ name: 'standard URI', uri: URI.parse('agenthost-terminal://shell/session/output') },
		{ name: 'URI with reserved characters', uri: URI.parse('agenthost-terminal://shell/session/output%20one?version=1#result') },
	]) {
		test(`offers retained output from a ${name} without exposing its location`, async () => {
			const harness = await createTerminalFullOutputHarness(store);
			const { part } = harness.createPart({ mode: 'plain', truncated: true, terminalUri: uri });
			await harness.expand(part, 'plain');
			const message = 'Showing a preview. Click to open full output (read-only)';
			assert.deepStrictEqual({
				rendered: snapshotText(harness.raw(part)),
				cursor: harness.raw(part).modes.showCursor,
				accessible: part.getCommandAndOutputAsText(),
				opens: harness.openedEditors.length,
			}, {
				rendered: `preview output\n\n${message}`,
				cursor: false,
				accessible: `Command: printf output\npreview output\n${message}\nOpen Full Output (Read-Only) opens the captured output if it is still available.`,
				opens: 0,
			});
		});
	}

	test('uses a concise run-specific editor title instead of repeating the command in every rendering mode', async () => {
		const harness = await createTerminalFullOutputHarness(store);
		const message = 'Showing a preview. Click to open full output (read-only)';

		for (const mode of ['thinking', 'simple', 'plain'] as const) {
			const { part } = harness.createPart({ mode, command: 'node large-output.cjs', intention: `Different model description for ${mode}` });
			await harness.expand(part, mode);
			showFullOutputElement(part).click();

			assert.deepStrictEqual({
				rendered: snapshotText(harness.raw(part)),
				accessible: part.getCommandAndOutputAsText(),
				editorLabel: harness.openedEditors.at(-1)?.label,
			}, {
				rendered: `preview output\n\n${message}`,
				accessible: `Command: node large-output.cjs\npreview output\n${message}\nOpen Full Output (Read-Only) opens the captured output if it is still available.`,
				editorLabel: terminalOutputLabel('terminal-tool-call'),
			});
		}
	});

	for (const command of [
		'node large-output.cjs',
		'  \x1b[31mnode\x1b[0m\n\tlarge-output.cjs  ',
		'Get-Content "C:\\Temp\\output.log"',
		'printf "<output>"',
		' ',
		`node /${'x'.repeat(80)}/large-output.cjs`,
	]) {
		test(`keeps the output label concise for ${JSON.stringify(command)}`, async () => {
			const harness = await createTerminalFullOutputHarness(store);
			const { part } = harness.createPart({ mode: 'plain', command });
			await harness.expand(part, 'plain');
			showFullOutputElement(part).click();

			assert.deepStrictEqual({
				editorLabel: harness.openedEditors[0].label,
				notice: snapshotText(harness.raw(part)).split('\n\n').at(-1),
			}, {
				editorLabel: terminalOutputLabel('terminal-tool-call'),
				notice: 'Showing a preview. Click to open full output (read-only)',
			});
		});
	}

	test('Open Full Output opens the originating editor by mouse or keyboard without activating terminal chrome', async () => {
		const harness = await createTerminalFullOutputHarness(store);
		const entries = [
			harness.createPart({
				mode: 'simple',
				sessionResource: URI.parse('chat-session://test/session-one'),
				toolCallId: 'tool-one',
				terminalUri: URI.parse('agenthost-terminal://shell/session-one/output'),
			}),
			harness.createPart({
				mode: 'thinking',
				sessionResource: URI.parse('chat-session://test/session-two'),
				toolCallId: 'tool-two',
				terminalUri: URI.parse('agenthost-terminal://shell/session-two/output'),
			}),
			harness.createPart({
				mode: 'plain',
				sessionResource: URI.parse('chat-session://test/session-three'),
				toolCallId: 'tool-three',
				terminalUri: URI.parse('agenthost-terminal://shell/session-three/output'),
			}),
		];
		for (const entry of entries) {
			await harness.expand(entry.part, entry.mode);
		}

		const firstBody = entries[0].part.domNode.querySelector<HTMLElement>('.chat-terminal-output-body');
		const firstScrollable = entries[0].part.domNode.querySelector<HTMLElement>('.monaco-scrollable-element');
		assert.ok(firstBody);
		assert.ok(firstScrollable);
		firstScrollable.dispatchEvent(new mainWindow.WheelEvent('wheel', { bubbles: true, deltaY: 20 }));
		const selectableText = mainWindow.document.createElement('span');
		selectableText.textContent = 'selectable preview';
		firstBody.appendChild(selectableText);
		const range = mainWindow.document.createRange();
		range.selectNodeContents(selectableText);
		const selection = mainWindow.getSelection();
		selection?.removeAllRanges();
		selection?.addRange(range);
		selectableText.click();
		const nestedControl = mainWindow.document.createElement('button');
		nestedControl.textContent = 'Nested control';
		firstBody.appendChild(nestedControl);
		nestedControl.click();
		selection?.removeAllRanges();
		await timeout(0);
		assert.strictEqual(harness.openedEditors.length, 0);

		const wrapperStates = entries.slice(0, 2).map(entry => entry.part.domNode.querySelector<HTMLElement>('.chat-terminal-thinking-collapsible > .chat-used-context-label .monaco-button')?.getAttribute('aria-expanded'));

		showFullOutputElement(entries[0].part).click();
		const activationKeys: readonly (readonly [string, number])[] = [['Enter', 13], [' ', 32]];
		for (const [index, [key, keyCode]] of activationKeys.entries()) {
			const element = showFullOutputElement(entries[index + 1].part);
			element.focus();
			assert.strictEqual(mainWindow.document.activeElement, element);
			element.dispatchEvent(new mainWindow.KeyboardEvent('keyup', { key: 'Tab', keyCode: 9, bubbles: true }));
			element.dispatchEvent(new mainWindow.KeyboardEvent('keydown', { key, keyCode, bubbles: true, cancelable: true }));
			element.dispatchEvent(new mainWindow.KeyboardEvent('keyup', { key, keyCode, bubbles: true, cancelable: true }));
		}
		await timeout(0);

		const expectedResources = entries.map(entry => {
			const terminal = entry.terminal;
			assert.ok(terminal);
			return ChatResponseResource.createTerminalOutputUri(entry.sessionResource, entry.toolCallId, terminal, terminalOutputName(entry.toolCallId)).toString();
		});
		assert.deepStrictEqual({
			resources: harness.openedEditors.map(input => input.resource.toString()),
			distinctRunLabels: new Set(harness.openedEditors.map(input => input.label)).size,
			conciseRunLabels: harness.openedEditors.every(input => /^Terminal Output · [a-z0-9]{5}$/.test(input.label ?? '')),
			readonlyDescriptions: harness.openedEditors.map(input => input.description),
			revealIfOpened: harness.openedEditors.map(input => input.options?.revealIfOpened),
			terminalActivationCount: harness.terminalActivationCount,
			wrapperStatesBefore: wrapperStates,
			wrapperStatesAfter: entries.slice(0, 2).map(entry => entry.part.domNode.querySelector<HTMLElement>('.chat-terminal-thinking-collapsible > .chat-used-context-label .monaco-button')?.getAttribute('aria-expanded')),
		}, {
			resources: expectedResources,
			distinctRunLabels: 3,
			conciseRunLabels: true,
			readonlyDescriptions: ['Read-only', 'Read-only', 'Read-only'],
			revealIfOpened: [true, true, true],
			terminalActivationCount: 0,
			wrapperStatesBefore: ['true', 'true'],
			wrapperStatesAfter: ['true', 'true'],
		});
	});

	test('the explicit full-output link keeps its exact range and unchanged readonly resource and bytes', async () => {
		const harness = await createTerminalFullOutputHarness(store);
		const authority = 'local';
		const terminalResource = URI.parse('agenthost-terminal://shell/provider-backed/output');
		const sessionResource = URI.parse('chat-session://test/provider-backed-output');
		const entry = harness.createPart({
			mode: 'plain',
			sessionResource,
			toolCallId: 'provider-backed-tool',
			terminalUri: terminalResource,
			preview: 'preview only',
		});
		const completeOutput = `complete output\n${'x'.repeat(4096)}\nend`;
		const fixture = createTerminalOutputTestFixture(store, sessionResource, entry.invocation, authority, async resource => {
			assert.strictEqual(resource.toString(), terminalResource.toString());
			return {
				title: 'printf output',
				content: [{ type: 'unclassified', value: completeOutput }],
				lifecycle: { status: TerminalLifecycleStatus.Exited, exitCode: 0 },
				claim: { kind: TerminalClaimKind.Session, session: sessionResource.toString(), chat: sessionResource.toString(), toolCallId: 'provider-backed-tool' },
				isPty: false,
			};
		});
		let openedText: string | undefined;
		harness.addEditorOpenHandler(async input => {
			const content = await fixture.fileService.readFile(input.resource);
			openedText = content.value.toString();
		});
		await harness.expand(entry.part, entry.mode);
		assert.deepStrictEqual({
			subscriptionsBeforeActivation: fixture.subscriptions.length,
			openedEditorsBeforeActivation: harness.openedEditors.length,
		}, {
			subscriptionsBeforeActivation: 0,
			openedEditorsBeforeActivation: 0,
		});

		showFullOutputElement(entry.part).click();
		const openOperation = harness.editorOpenOperations[0];
		assert.ok(openOperation);
		await openOperation;
		const provider = harness.terminal(entry.part).linkProvider;
		assert.ok(provider);
		const links = await new Promise<import('@xterm/xterm').ILink[]>(resolve => {
			for (let line = 1; line <= harness.raw(entry.part).buffer.active.length; line++) {
				provider.provideLinks(line, value => {
					if (value?.length) {
						resolve(value);
					}
				});
			}
		});
		assert.strictEqual(links.length, 1);
		assert.deepStrictEqual({
			text: links[0].text,
			columns: links[0].range.end.x - links[0].range.start.x + 1,
			wrapped: links[0].range.start.y !== links[0].range.end.y,
			decorations: links[0].decorations,
		}, {
			text: 'Click to open full output',
			columns: 'Click to open full output'.length,
			wrapped: false,
			decorations: { pointerCursor: true, underline: false },
		});
		links[0].activate(new mainWindow.MouseEvent('click'), links[0].text);
		const linkOpenOperation = harness.editorOpenOperations[1];
		assert.ok(linkOpenOperation);
		await linkOpenOperation;
		const expectedResource = ChatResponseResource.createTerminalOutputUri(sessionResource, 'provider-backed-tool', terminalResource, terminalOutputName('provider-backed-tool'));

		assert.deepStrictEqual({
			openedResources: harness.openedEditors.map(input => input.resource.toString()),
			expectedResource: expectedResource.toString(),
			openedText,
			editorName: harness.openedEditors[0].resource.path.split('/').at(-1),
			editorLabels: harness.openedEditors.map(input => input.label),
			preview: entry.invocation.toolSpecificData?.kind === 'terminal' ? entry.invocation.toolSpecificData.terminalCommandOutput?.text : undefined,
			subscriptions: fixture.subscriptions.map(resource => resource.toString()),
		}, {
			openedResources: [expectedResource.toString(), expectedResource.toString()],
			expectedResource: expectedResource.toString(),
			openedText: completeOutput,
			editorName: terminalOutputName('provider-backed-tool'),
			editorLabels: [terminalOutputLabel('provider-backed-tool'), terminalOutputLabel('provider-backed-tool')],
			preview: 'preview only',
			subscriptions: [terminalResource.toString(), terminalResource.toString()],
		});
	});
});

suite('ChatTerminalToolProgressPart Auto-Expand Logic', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	// Mocked events
	let onCommandExecuted: Emitter<unknown>;
	let onCommandFinished: Emitter<unknown>;
	let onWillData: Emitter<string>;

	// State tracking
	let isExpanded: boolean;
	let userToggledOutput: boolean;
	let hasRealOutputValue: boolean;

	function shouldAutoExpand(): boolean {
		return !isExpanded && !userToggledOutput;
	}

	function hasRealOutput(): boolean {
		return hasRealOutputValue;
	}

	function setupAutoExpandLogic(): void {
		// Use the real TerminalToolAutoExpand class with event-based interface
		const autoExpand = store.add(new TerminalToolAutoExpand({
			onCommandExecuted: onCommandExecuted.event,
			onCommandFinished: onCommandFinished.event,
			onWillData: onWillData.event,
			shouldAutoExpand,
			hasRealOutput,
		}));
		store.add(autoExpand.onDidRequestExpand(() => {
			isExpanded = true;
		}));
	}

	setup(() => {
		onCommandExecuted = store.add(new Emitter<unknown>());
		onCommandFinished = store.add(new Emitter<unknown>());
		onWillData = store.add(new Emitter<string>());

		isExpanded = false;
		userToggledOutput = false;
		hasRealOutputValue = false;
	});

	suite('ChatTerminalThinkingCollapsibleWrapper', () => {
		test('keeps Show targeting the live terminal for local background commands', () => {
			const context = new class extends mock<IChatContentPartRenderContext>() {
				override readonly element = new class extends mock<IChatResponseViewModel>() { }();
				override readonly content = [];
				override readonly contentIndex = 0;
			}();
			let focusedTerminal = 0;
			const instantiationService = workbenchInstantiationService(undefined, store);
			const part = store.add(instantiationService.createInstance(
				ChatTerminalThinkingCollapsibleWrapper,
				'echo test', undefined, false, mainWindow.document.createElement('div'), context,
				false, false, false, true, () => focusedTerminal++, true,
			));
			const show = part.domNode.querySelector<HTMLElement>('.chat-terminal-show-link');
			assert.ok(show);
			const label = show.textContent;
			show.click();
			part.markComplete();
			assert.deepStrictEqual({
				label, focusedTerminal, remainingAction: part.domNode.querySelector('.chat-terminal-show-link'),
			}, { label: 'Show', focusedTerminal: 1, remainingAction: null });
		});

		test('animates terminal content and keeps collapsed content inert', () => {
			const context: IChatContentPartRenderContext = {
				element: Object.assign(Object.create(null) as IChatResponseViewModel, {
					id: 'response',
					sessionResource: URI.parse('chat-session://test/session'),
				}),
				elementIndex: 0,
				container: mainWindow.document.createElement('div'),
				content: [],
				contentIndex: 0,
				inlineTextModels: Object.create(InlineTextModelCollection.prototype) as InlineTextModelCollection,
				editorPool: Object.create(EditorPool.prototype) as EditorPool,
				codeBlockStartIndex: 0,
				treeStartIndex: 0,
				diffEditorPool: Object.create(DiffEditorPool.prototype) as DiffEditorPool,
				currentWidth: observableValue('testWidth', 500),
				onDidChangeVisibility: Event.None,
			};
			const terminalContent = mainWindow.document.createElement('div');
			terminalContent.textContent = 'terminal output';
			const instantiationService = workbenchInstantiationService(undefined, store);
			const part = store.add(instantiationService.createInstance(
				ChatTerminalThinkingCollapsibleWrapper,
				'echo test',
				undefined,
				false,
				terminalContent,
				context,
				false,
				false,
				false,
				true,
				undefined,
				true,
			));
			mainWindow.document.body.appendChild(part.domNode);
			store.add(toDisposable(() => part.domNode.remove()));

			const button = part.domNode.querySelector<HTMLElement>('.monaco-button');
			const animationContainer = part.domNode.querySelector<HTMLElement>('.chat-collapsible-content-animation');
			const animationContent = part.domNode.querySelector<HTMLElement>('.chat-collapsible-content-animation-inner');
			assert.ok(button);
			assert.ok(animationContainer);
			assert.ok(animationContent);
			const initiallyInert = animationContent.inert;
			button.click();

			assert.deepStrictEqual({
				hasAnimationClass: part.domNode.classList.contains('chat-collapsible-content-animated'),
				animationDisplay: mainWindow.getComputedStyle(animationContainer).display,
				initiallyInert,
				expandedInert: animationContent.inert,
				containsTerminal: animationContent.contains(terminalContent),
				hasShowLink: !!part.domNode.querySelector('.chat-terminal-show-link'),
			}, {
				hasAnimationClass: true,
				animationDisplay: 'grid',
				initiallyInert: true,
				expandedInert: false,
				containsTerminal: true,
				hasShowLink: false,
			});
		});

		test('logs telemetry when the user toggles the header', () => {
			const context: IChatContentPartRenderContext = {
				element: Object.assign(Object.create(null) as IChatResponseViewModel, {
					id: 'response',
					sessionResource: URI.parse('chat-session://test/session'),
				}),
				elementIndex: 0,
				container: mainWindow.document.createElement('div'),
				content: [],
				contentIndex: 0,
				inlineTextModels: Object.create(InlineTextModelCollection.prototype) as InlineTextModelCollection,
				editorPool: Object.create(EditorPool.prototype) as EditorPool,
				codeBlockStartIndex: 0,
				treeStartIndex: 0,
				diffEditorPool: Object.create(DiffEditorPool.prototype) as DiffEditorPool,
				currentWidth: observableValue('testWidth', 500),
				onDidChangeVisibility: Event.None,
			};
			const telemetryService = new class extends NullTelemetryServiceShape {
				readonly events: { readonly name: string; readonly data: unknown }[] = [];
				override publicLog2(eventName?: string, data?: unknown): void {
					if (eventName) {
						this.events.push({ name: eventName, data });
					}
				}
			}();
			const instantiationService = workbenchInstantiationService(undefined, store);
			instantiationService.stub(ITelemetryService, telemetryService);
			const thinkingStyle = instantiationService.get(IConfigurationService).getValue<string>(ChatConfiguration.ThinkingStyle) ?? 'unknown';
			const part = store.add(instantiationService.createInstance(
				ChatTerminalThinkingCollapsibleWrapper,
				'echo test',
				undefined,
				false,
				mainWindow.document.createElement('div'),
				context,
				false,
				false,
				false,
				false,
				undefined,
				true,
			));
			mainWindow.document.body.appendChild(part.domNode);
			store.add(toDisposable(() => part.domNode.remove()));

			const button = part.domNode.querySelector<HTMLElement>('.monaco-button');
			assert.ok(button);
			part.expand();
			button.click();
			button.click();

			assert.deepStrictEqual(telemetryService.events, [
				{ name: 'chat.collapsibleToggle', data: { kind: 'terminal', previousExpanded: true, thinkingStyle, inThinking: true } },
				{ name: 'terminal/chatThinkingBlockToggle', data: { previousExpanded: true, inThinking: true, thinkingStyle } },
				{ name: 'chat.collapsibleToggle', data: { kind: 'terminal', previousExpanded: false, thinkingStyle, inThinking: true } },
				{ name: 'terminal/chatThinkingBlockToggle', data: { previousExpanded: false, inThinking: true, thinkingStyle } },
			]);
		});
	});

	test('data arriving cancels no-data timeout', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		hasRealOutputValue = true; // Would have expanded if no-data timeout fired
		setupAutoExpandLogic();

		// Command executes
		onCommandExecuted.fire(undefined);

		// Data arrives (cancels no-data timeout)
		onWillData.fire('output');

		// Command finishes immediately after data (before data timeout would fire)
		onCommandFinished.fire(undefined);

		// Wait past all timeouts (faked timers advance instantly)
		await timeout(TerminalToolAutoExpandTimeout.NoData + 100);

		assert.strictEqual(isExpanded, false, 'No-data timeout should be cancelled when data arrives');
	}));
});

suite('ChatTerminalToolOutputSection layout', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	teardown(() => sinon.restore());

	// Mounts the real section with the real snapshot mirror over a faked detached terminal,
	// so the asserted heights are what actually reaches the DOM. Regression coverage for the
	// sliced-last-row symptom of #328299: the box height must derive from the mirror's
	// painted cell height, not the configuration-font estimate.
	let instantiationService: TestInstantiationService;
	let XTermBaseCtor: typeof Terminal;
	let fakes: ReturnType<typeof createFakeDetachedTerminal>[];
	let mirrorFont: ITerminalFont;
	let container: HTMLElement;
	let themeService: TestThemeService;

	setup(async () => {
		instantiationService = workbenchInstantiationService(undefined, store);
		themeService = new TestThemeService();
		instantiationService.stub(IThemeService, themeService);
		XTermBaseCtor = (await importAMDNodeModule<typeof import('@xterm/xterm')>('@xterm/xterm', 'lib/xterm.js')).Terminal;
		fakes = [];
		// Mirror metrics deliberately differ from the config estimate below so the tests can
		// tell which source the layout used
		mirrorFont = { fontFamily: 'monospace', fontSize: 12, letterSpacing: 0, lineHeight: 1, charWidth: 10, charHeight: 20 };
		instantiationService.stub(ITerminalService, {
			createDetachedTerminal: async (options: IDetachedXTermOptions) => {
				const fake = createFakeDetachedTerminal(XTermBaseCtor, options, mirrorFont);
				fakes.push(fake);
				return fake.instance;
			}
		} as Partial<ITerminalService>);
		instantiationService.stub(ITerminalConfigurationService, {
			getFont: () => ({ fontFamily: 'monospace', fontSize: 10, letterSpacing: 0, lineHeight: 1, charWidth: 6, charHeight: 10 })
		} as Partial<ITerminalConfigurationService>);
		instantiationService.stub(IAccessibleViewService, {
			getOpenAriaHint: () => null
		} as Partial<IAccessibleViewService>);
		container = mainWindow.document.createElement('div');
		container.style.width = '800px';
		mainWindow.document.body.appendChild(container);
		store.add(toDisposable(() => container.remove()));
	});

	function createSection(output: IChatTerminalToolInvocationData['terminalCommandOutput'], fullOutputAction?: IAction, options?: { command?: ITerminalCommand; source?: IChatTerminalOutputSource; isRunning?: () => boolean }): ChatTerminalToolOutputSection {
		const section = store.add(instantiationService.createInstance(
			ChatTerminalToolOutputSection,
			async () => undefined,
			() => options?.command,
			() => options?.source,
			() => output,
			() => 'echo test',
			() => undefined,
			() => options?.isRunning?.() ?? false,
			fullOutputAction,
			false,
		));
		container.appendChild(section.domNode);
		return section;
	}

	test('only enables preview activation for completed output with an enabled action', async () => {
		let running = true;
		let opens = 0;
		const action = toAction({ id: 'test.openFullOutput', label: 'Open Full Output', run: () => { opens++; } });
		const section = createSection({ text: 'preview', truncated: true }, action, { isRunning: () => running });
		await section.toggle(true);
		section.domNode.click();
		await timeout(0);
		const runningState = { opens, clickable: section.domNode.classList.contains('chat-terminal-output-clickable') };

		running = false;
		await section.refresh();
		section.domNode.click();
		await timeout(350);
		const completedState = { opens, clickable: section.domNode.classList.contains('chat-terminal-output-clickable') };

		action.enabled = false;
		await section.refresh();
		section.domNode.click();
		await timeout(0);
		const disabledState = { opens, clickable: section.domNode.classList.contains('chat-terminal-output-clickable') };

		assert.deepStrictEqual({ runningState, completedState, disabledState }, {
			runningState: { opens: 0, clickable: false },
			completedState: { opens: 1, clickable: true },
			disabledState: { opens: 1, clickable: false },
		});
	});

	for (const hasReference of [false, true]) {
		for (const rawOutput of [undefined, '', 'live output']) {
			test(`accessible full output guidance for a command with ${hasReference ? 'a reference' : 'no reference'} and ${JSON.stringify(rawOutput)} output`, () => {
				const command = new class extends mock<ITerminalCommand>() {
					override readonly command = 'echo test';
					override getOutput(): string | undefined {
						return rawOutput;
					}
				}();
				const action = hasReference ? toAction({ id: 'test.openFullOutput', label: 'Open Full Output', run: () => { } }) : undefined;
				const section = createSection({
					text: 'stored preview',
					truncated: hasReference,
				}, action, { command });
				const outputText = rawOutput || (hasReference ? 'A preview is not available.' : 'No output was produced by the command.');
				const hint = hasReference
					? `\n${rawOutput ? 'Showing a preview. Click' : 'Click'} to open full output (read-only)\nOpen Full Output (Read-Only) opens the captured output if it is still available.`
					: '';
				assert.strictEqual(section.getCommandAndOutputAsText(), `Command: echo test\n${outputText}${hint}`);
			});
		}
	}

	test('accessible full output guidance preserves nonempty truncated snapshots', () => {
		const section = createSection({
			text: 'line one\nline two\n',
			truncated: true,
		}, toAction({ id: 'test.openFullOutput', label: 'Open Full Output', run: () => { } }));
		assert.strictEqual(section.getCommandAndOutputAsText(), 'Command: echo test\nline one\nline two\nShowing a preview. Click to open full output (read-only)\nOpen Full Output (Read-Only) opens the captured output if it is still available.');
	});

	for (const text of ['', 'streamed output']) {
		test(`full output remains available with ${text ? 'a populated' : 'an empty'} non-PTY source`, async () => {
			const source: IChatTerminalOutputSource = {
				onDidChange: Event.None,
				output: text,
				hasExited: true,
				exitCode: 0,
			};
			const section = createSection(
				{ text: '', truncated: true },
				toAction({ id: 'test.openFullOutput', label: 'Open Full Output', run: () => { } }),
				{ source },
			);
			await section.toggle(true);
			assert.deepStrictEqual({
				accessible: section.getCommandAndOutputAsText(),
				emptyMessage: text ? undefined : section.domNode.querySelector('.chat-terminal-output-empty')?.textContent,
			}, {
				accessible: `Command: echo test\n${text || 'A preview is not available.'}\n${text ? 'Showing a preview. Click' : 'Click'} to open full output (read-only)\nOpen Full Output (Read-Only) opens the captured output if it is still available.`,
				emptyMessage: text ? undefined : '',
			});
		});
	}

	function boxHeight(section: ChatTerminalToolOutputSection): string {
		const scrollable = section.domNode.querySelector('.monaco-scrollable-element') as HTMLElement | null;
		return scrollable?.style.height ?? '';
	}

	/** The expected box height for `rows` rows: rows × rowHeight plus the body's real padding. */
	function expectedHeight(section: ChatTerminalToolOutputSection, rows: number, rowHeight: number): string {
		const body = section.domNode.querySelector('.chat-terminal-output-body') as HTMLElement;
		const style = mainWindow.getComputedStyle(body);
		const padding = (Number.parseFloat(style.paddingTop) || 0) + (Number.parseFloat(style.paddingBottom) || 0);
		return `${rows * rowHeight + padding}px`;
	}

	test('uses theme variables without per-section theme listeners', () => {
		container.style.setProperty('--vscode-panel-background', '#010203');
		container.style.setProperty('--vscode-editor-background', '#040506');
		const listenerCountBefore = listenerCount(themeService._onThemeChange);
		const panelSection = createSection(undefined);
		const inChatEditor = ChatContextKeys.inChatEditor.bindTo(instantiationService.get(IContextKeyService));
		inChatEditor.set(true);
		const editorSection = createSection(undefined);
		for (let index = 2; index < 50; index++) {
			createSection(undefined);
		}
		inChatEditor.reset();
		const initialResolvedBackgrounds = [
			mainWindow.getComputedStyle(panelSection.domNode).backgroundColor,
			mainWindow.getComputedStyle(editorSection.domNode).backgroundColor,
		];
		container.style.setProperty('--vscode-panel-background', '#070809');
		container.style.setProperty('--vscode-editor-background', '#0a0b0c');

		assert.deepStrictEqual({
			listenerCounts: [listenerCountBefore, listenerCount(themeService._onThemeChange)],
			panelBackground: panelSection.domNode.style.backgroundColor,
			editorBackground: editorSection.domNode.style.backgroundColor,
			initialResolvedBackgrounds,
			updatedResolvedBackgrounds: [
				mainWindow.getComputedStyle(panelSection.domNode).backgroundColor,
				mainWindow.getComputedStyle(editorSection.domNode).backgroundColor,
			],
		}, {
			listenerCounts: [0, 0],
			panelBackground: 'var(--vscode-panel-background)',
			editorBackground: 'var(--vscode-editor-background)',
			initialResolvedBackgrounds: ['rgb(1, 2, 3)', 'rgb(4, 5, 6)'],
			updatedResolvedBackgrounds: ['rgb(7, 8, 9)', 'rgb(10, 11, 12)'],
		});
	});

	test('box height uses the mirror row height, not the config estimate', async () => {
		const section = createSection({ text: 'l1\r\nl2\r\nl3' });
		await section.toggle(true);
		assert.strictEqual(boxHeight(section), expectedHeight(section, 3, 20));
	});

	test('wraps the inline terminal notice inside the existing scrollable output box', async () => {
		container.style.width = '280px';
		const section = createSection(
			{
				text: Array.from({ length: 20 }, (_, index) => `line ${index}`).join('\r\n'),
				truncated: true,
			},
			toAction({ id: 'test.openFullOutput', label: 'Open Full Output', run: () => { } }),
		);
		await section.toggle(true);
		const scrollable = section.domNode.querySelector<HTMLElement>(':scope > .monaco-scrollable-element');
		assert.ok(scrollable);
		const maxHeight = Number.parseFloat(mainWindow.getComputedStyle(section.domNode).maxHeight);

		assert.deepStrictEqual({
			footer: section.domNode.querySelector('.chat-terminal-full-output-footer'),
			totalHeight: scrollable.offsetHeight <= maxHeight,
			hasNotice: snapshotText(fakes[0].raw).endsWith('Showing a preview. Click to open full output (read-only)'),
		}, {
			footer: null,
			totalHeight: true,
			hasNotice: true,
		});
	});

	test('falls back to the config-font estimate while mirror metrics are unavailable', async () => {
		mirrorFont = { ...mirrorFont, charHeight: 0 };
		const section = createSection({ text: 'l1\r\nl2\r\nl3' });
		await section.toggle(true);
		assert.strictEqual(boxHeight(section), expectedHeight(section, 3, 10));
	});

	/* eslint-disable local/code-no-bracket-notation-for-identifiers -- Keep private layout access type-checked without exposing test-only APIs. */
	test('scans output once after resizing and preserves native reflow', async () => {
		const text = 'x'.repeat(100);
		const section = createSection({ text });
		await section.toggle(true);
		const scrollable = section['_scrollableContainer'];
		assert.ok(scrollable);
		const scan = sinon.spy(scrollable, 'scanDomNode');
		const fake = fakes[0];
		const initialColumns = fake.raw.cols;
		const initialWriteCalls = fake.counters.writeCalls;
		const results = [];

		for (const width of [220, 800, 800]) {
			scan.resetHistory();
			container.style.width = `${width}px`;
			await section['_handleResize']();
			const rows = Math.min(10, Math.ceil(text.length / fake.raw.cols));
			results.push({
				scans: scan.callCount,
				narrower: fake.raw.cols < initialColumns,
				heightMatchesReflow: boxHeight(section) === expectedHeight(section, rows, 20),
				rewrites: fake.counters.writeCalls - initialWriteCalls,
			});
		}

		assert.deepStrictEqual(results, [
			{ scans: 1, narrower: true, heightMatchesReflow: true, rewrites: 0 },
			{ scans: 1, narrower: false, heightMatchesReflow: true, rewrites: 0 },
			{ scans: 1, narrower: false, heightMatchesReflow: true, rewrites: 0 },
		]);
	});

	test('scans output once without a mirror and while collapsed', async () => {
		const section = createSection(undefined);
		await section.toggle(true);
		const scrollable = section['_scrollableContainer'];
		assert.ok(scrollable);
		const scan = sinon.spy(scrollable, 'scanDomNode');

		await section['_handleResize']();
		const expandedScans = scan.callCount;
		await section.toggle(false);
		scan.resetHistory();
		await section['_handleResize']();

		assert.deepStrictEqual({ expandedScans, collapsedScans: scan.callCount }, { expandedScans: 1, collapsedScans: 1 });
	});

	test('keeps the output row cap when reflow does not change the columns', async () => {
		const section = createSection({ text: 'line\r\n'.repeat(20) });
		await section.toggle(true);
		const columns = fakes[0].raw.cols;
		section.domNode.style.maxHeight = expectedHeight(section, 2, 20);

		await section['_handleResize']();

		assert.deepStrictEqual({
			columns: fakes[0].raw.cols,
			height: boxHeight(section),
		}, {
			columns,
			height: expectedHeight(section, 2, 20),
		});
	});

	test('does not lay out or scroll after disposal during reflow', async () => {
		const section = createSection(undefined);
		await section.toggle(true);
		const reflow = new DeferredPromise<{ lineCount: number }>();
		let layouts = 0;
		let scrolls = 0;
		section['_layoutMirrorWidth'] = () => reflow.p;
		section['_layoutOutput'] = () => layouts++;
		section['_scrollOutputToBottom'] = () => scrolls++;

		const resize = section['_handleResize']();
		section.dispose();
		await reflow.complete({ lineCount: 3 });
		await resize;

		assert.deepStrictEqual({ layouts, scrolls }, { layouts: 0, scrolls: 0 });
	});

	test('coalesces scheduled output layouts', async () => {
		const section = createSection(undefined);
		let layouts = 0;
		let scrolls = 0;
		section['_layoutOutput'] = () => layouts++;
		section['_scrollOutputToBottom'] = () => scrolls++;

		section['_scheduleOutputRelayout']();
		section['_scheduleOutputRelayout']();
		await new Promise<void>(resolve => store.add(scheduleAtNextAnimationFrame(mainWindow, resolve)));

		assert.deepStrictEqual({ layouts, scrolls }, { layouts: 1, scrolls: 1 });
	});

	test('cancels scheduled output layout on disposal', async () => {
		const section = createSection(undefined);
		let layouts = 0;
		let scrolls = 0;
		section['_layoutOutput'] = () => layouts++;
		section['_scrollOutputToBottom'] = () => scrolls++;

		section['_scheduleOutputRelayout']();
		section.dispose();
		await new Promise<void>(resolve => store.add(scheduleAtNextAnimationFrame(mainWindow, resolve)));

		assert.deepStrictEqual({ layouts, scrolls }, { layouts: 0, scrolls: 0 });
	});
	/* eslint-enable local/code-no-bracket-notation-for-identifiers */

	test('relayouts when the mirror announces changed cell metrics', async () => {
		const section = createSection({ text: 'l1\r\nl2\r\nl3' });
		await section.toggle(true);
		assert.strictEqual(boxHeight(section), expectedHeight(section, 3, 20));

		// Simulate the renderer reporting different metrics (first render replacing the
		// estimate, or a DPR change): mutate the font the fake reports, then open the raw
		// terminal so xterm fires a real render event
		mirrorFont.charHeight = 30;
		const fake = fakes[0];
		const renderFired = new Promise<void>(resolve => {
			const listener = fake.raw.onRender(() => {
				listener.dispose();
				resolve();
			});
		});
		const host = mainWindow.document.createElement('div');
		container.appendChild(host);
		fake.raw.open(host);
		await renderFired;
		await timeout(0);

		assert.strictEqual(boxHeight(section), expectedHeight(section, 3, 30));
	});
});
