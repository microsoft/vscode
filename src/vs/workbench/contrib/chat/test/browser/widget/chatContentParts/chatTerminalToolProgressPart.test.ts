/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import type { Terminal } from '@xterm/xterm';
import { importAMDNodeModule } from '../../../../../../../amdX.js';
import { renderAsPlaintext } from '../../../../../../../base/browser/markdownRenderer.js';
import { mainWindow } from '../../../../../../../base/browser/window.js';
import { Emitter, Event } from '../../../../../../../base/common/event.js';
import { observableValue } from '../../../../../../../base/common/observable.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { toDisposable } from '../../../../../../../base/common/lifecycle.js';
import { mock } from '../../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../../../../base/test/common/timeTravelScheduler.js';
import { timeout } from '../../../../../../../base/common/async.js';
import { TestInstantiationService } from '../../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IAccessibleViewService } from '../../../../../../../platform/accessibility/browser/accessibleView.js';
import { IContextKeyService } from '../../../../../../../platform/contextkey/common/contextkey.js';
import { IMarkdownRenderer } from '../../../../../../../platform/markdown/browser/markdownRenderer.js';
import { TerminalCapabilityStore } from '../../../../../../../platform/terminal/common/capabilities/terminalCapabilityStore.js';
import { IThemeService } from '../../../../../../../platform/theme/common/themeService.js';
import { TestThemeService } from '../../../../../../../platform/theme/test/common/testThemeService.js';
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
import { IChatResponseViewModel } from '../../../../common/model/chatViewModel.js';
import { TerminalToolAutoExpand, TerminalToolAutoExpandTimeout } from '../../../../browser/widget/chatContentParts/toolInvocationParts/terminalToolAutoExpand.js';
import { IChatTerminalToolProgressPart, ITerminalChatService, ITerminalConfigurationService, ITerminalInstance, ITerminalService, type IDetachedXTermOptions } from '../../../../../terminal/browser/terminal.js';
import type { ITerminalFont } from '../../../../../terminal/common/terminal.js';
import { createFakeDetachedTerminal } from '../../../../../terminal/test/browser/chatTerminalMirrorTestUtils.js';

function listenerCount<T>(emitter: Emitter<T>): number {
	return (emitter as unknown as { _size: number })._size ?? 0;
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
	});

	test('fast command without data should not auto-expand (finishes before timeout)', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		setupAutoExpandLogic();

		// Command executes
		onCommandExecuted.fire(undefined);

		// Command finishes quickly (before timeout)
		onCommandFinished.fire(undefined);

		// Wait past all timeouts (faked timers advance instantly)
		await timeout(TerminalToolAutoExpandTimeout.NoData + 100);

		assert.strictEqual(isExpanded, false, 'Should NOT expand for fast command without data');
	}));

	test('fast command with quick data should not auto-expand (data + finish before timeout)', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		setupAutoExpandLogic();

		// Command executes
		onCommandExecuted.fire(undefined);

		// Data arrives
		onWillData.fire('output');

		// Command finishes quickly (before timeout)
		onCommandFinished.fire(undefined);

		// Wait past all timeouts (faked timers advance instantly)
		await timeout(TerminalToolAutoExpandTimeout.DataEvent + 100);

		assert.strictEqual(isExpanded, false, 'Should NOT expand when command finishes within timeout of first data');
	}));

	test('long-running command with data should auto-expand (data received, command still running after timeout)', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		hasRealOutputValue = true; // Has real output
		setupAutoExpandLogic();

		// Command executes
		onCommandExecuted.fire(undefined);

		// Data arrives
		onWillData.fire('output');

		// Wait for timeout to fire (faked timers advance instantly)
		await timeout(TerminalToolAutoExpandTimeout.DataEvent + 100);

		assert.strictEqual(isExpanded, true, 'Should expand when command still running after first data timeout');

		onCommandFinished.fire(undefined);
	}));

	test('long-running command with data but no real output should NOT auto-expand (like sleep with shell sequences)', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		hasRealOutputValue = false; // Shell integration sequences, not real output
		setupAutoExpandLogic();

		// Command executes
		onCommandExecuted.fire(undefined);

		// Shell integration data arrives (not real output)
		onWillData.fire('shell-sequence');

		// Wait for timeout to fire (faked timers advance instantly)
		await timeout(TerminalToolAutoExpandTimeout.DataEvent + 100);

		assert.strictEqual(isExpanded, false, 'Should NOT expand when data is shell sequences, not real output');

		onCommandFinished.fire(undefined);
	}));

	test('long-running command without data should NOT auto-expand if no real output (like sleep)', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		hasRealOutputValue = false; // No real output like `sleep 1`
		setupAutoExpandLogic();

		// Command executes
		onCommandExecuted.fire(undefined);

		// Wait for timeout to fire (faked timers advance instantly)
		await timeout(TerminalToolAutoExpandTimeout.NoData + 100);

		assert.strictEqual(isExpanded, false, 'Should NOT expand when no real output even after timeout');

		onCommandFinished.fire(undefined);
	}));

	test('long-running command without data SHOULD auto-expand if real output exists', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		hasRealOutputValue = true; // Has real output in buffer
		setupAutoExpandLogic();

		// Command executes
		onCommandExecuted.fire(undefined);

		// Wait for timeout to fire (faked timers advance instantly)
		await timeout(TerminalToolAutoExpandTimeout.NoData + 100);

		assert.strictEqual(isExpanded, true, 'Should expand when real output exists after timeout');

		onCommandFinished.fire(undefined);
	}));

	test('data arriving after command finish should not trigger expand', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		setupAutoExpandLogic();

		// Command executes and finishes immediately
		onCommandExecuted.fire(undefined);
		onCommandFinished.fire(undefined);

		// Data arrives after command finished
		onWillData.fire('late output');

		// Wait past all timeouts (faked timers advance instantly)
		await timeout(TerminalToolAutoExpandTimeout.NoData + 100);

		assert.strictEqual(isExpanded, false, 'Should NOT expand when data arrives after command finished');
	}));

	test('user toggled output prevents auto-expand', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		userToggledOutput = true;
		setupAutoExpandLogic();

		// Command executes
		onCommandExecuted.fire(undefined);

		// Data arrives
		onWillData.fire('output');

		// Wait past all timeouts (faked timers advance instantly)
		await timeout(TerminalToolAutoExpandTimeout.NoData + 100);

		assert.strictEqual(isExpanded, false, 'Should NOT expand when user has manually toggled output');
		onCommandFinished.fire(undefined);
	}));

	test('already expanded output prevents additional auto-expand', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		isExpanded = true;

		// Track if event was fired
		let eventFired = false;
		const autoExpand = store.add(new TerminalToolAutoExpand({
			onCommandExecuted: onCommandExecuted.event,
			onCommandFinished: onCommandFinished.event,
			onWillData: onWillData.event,
			shouldAutoExpand: () => !isExpanded && !userToggledOutput,
			hasRealOutput: () => hasRealOutputValue,
		}));
		store.add(autoExpand.onDidRequestExpand(() => {
			eventFired = true;
		}));

		// Command executes
		onCommandExecuted.fire(undefined);

		// Data arrives
		onWillData.fire('output');

		// Wait past all timeouts (faked timers advance instantly)
		await timeout(TerminalToolAutoExpandTimeout.NoData + 100);

		assert.strictEqual(eventFired, false, 'Should NOT fire expand event when already expanded');
		onCommandFinished.fire(undefined);
	}));

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

	test('multiple data events only trigger one timeout', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		hasRealOutputValue = true; // Has real output
		setupAutoExpandLogic();

		// Command executes
		onCommandExecuted.fire(undefined);

		// Multiple data events
		onWillData.fire('output 1');
		onWillData.fire('output 2');
		onWillData.fire('output 3');

		// Wait for timeout to fire (faked timers advance instantly)
		await timeout(TerminalToolAutoExpandTimeout.DataEvent + 100);

		assert.strictEqual(isExpanded, true, 'Should expand exactly once after first data');
		onCommandFinished.fire(undefined);
	}));
});

suite('ChatTerminalToolOutputSection layout', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

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

	function createSection(output: { text: string } | undefined): ChatTerminalToolOutputSection {
		const section = store.add(instantiationService.createInstance(
			ChatTerminalToolOutputSection,
			async () => undefined,
			() => undefined,
			() => undefined,
			() => output,
			() => 'echo test',
			() => undefined,
			() => false,
			false,
		));
		container.appendChild(section.domNode);
		return section;
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

	test('falls back to the config-font estimate while mirror metrics are unavailable', async () => {
		mirrorFont = { ...mirrorFont, charHeight: 0 };
		const section = createSection({ text: 'l1\r\nl2\r\nl3' });
		await section.toggle(true);
		assert.strictEqual(boxHeight(section), expectedHeight(section, 3, 10));
	});

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

		assert.strictEqual(boxHeight(section), expectedHeight(section, 3, 30));
	});
});
