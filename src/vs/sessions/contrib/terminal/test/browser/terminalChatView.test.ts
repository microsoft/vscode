/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../../../base/browser/window.js';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../../base/common/errors.js';
import { Emitter } from '../../../../../base/common/event.js';
import { DisposableStore, IDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { constObservable, derived, ISettableObservable, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { NullTelemetryServiceShape } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { ITerminalInstance, ITerminalService } from '../../../../../workbench/contrib/terminal/browser/terminal.js';
import { XtermTerminal } from '../../../../../workbench/contrib/terminal/browser/xterm/xtermTerminal.js';
import { IChat, ISession, SessionStatus } from '../../../../services/sessions/common/session.js';
import { ISessionTerminal, ISessionTerminalService, SessionTerminalService } from '../../../../services/terminal/browser/sessionTerminalService.js';
import { ISessionOpenTelemetryService, SessionOpenTelemetryService } from '../../../../services/sessions/browser/sessionOpenTelemetryService.js';
import { TerminalChatView } from '../../browser/terminalChatView.js';

class TestTerminal extends mock<ITerminalInstance>() {
	private readonly _store = new DisposableStore();
	private readonly _onRender = this._store.add(new Emitter<{ start: number; end: number }>());
	private readonly _onResize = this._store.add(new Emitter<{ cols: number; rows: number }>());
	private readonly _onWillDispose = this._store.add(new Emitter<ITerminalInstance>());
	private readonly _onExit = this._store.add(new Emitter<number>());
	readonly element = mainWindow.document.createElement('div');
	override readonly domElement = this.element;
	override readonly onWillDispose = this._onWillDispose.event;
	override readonly onExit = this._onExit.event;
	renderListener: ((event: { start: number; end: number }) => void) | undefined;
	override xterm: XtermTerminal | undefined;
	override xtermReadyPromise: Promise<XtermTerminal | undefined>;
	attached = 0;
	detached = 0;
	focused = 0;
	disposed = 0;
	layouts = 0;
	showCalls = 0;
	visible = false;
	override isDisposed = false;
	override readonly exitReason = undefined;

	constructor() {
		super();
		const terminal = this;
		const raw = new class extends mock<XtermTerminal['raw']>() {
			override onRender = (listener: (event: { start: number; end: number }) => void) => {
				terminal.renderListener = listener;
				return terminal._onRender.event(listener);
			};
			override readonly onResize = terminal._onResize.event;
		}();
		this.xterm = new class extends mock<XtermTerminal>() {
			override readonly raw = raw;
		}();
		this.xtermReadyPromise = Promise.resolve(this.xterm);
	}

	render(): void { this._onRender.fire({ start: 0, end: 23 }); }
	resize(): void { this._onResize.fire({ cols: 90, rows: 24 }); }
	exit(): void { this._onExit.fire(1); }
	get hasRenderListeners(): boolean { return this._onRender.hasListeners(); }
	get hasResizeListeners(): boolean { return this._onResize.hasListeners(); }

	override attachToElement(container: HTMLElement): void {
		this.attached++;
		container.appendChild(this.element);
	}
	override detachFromElement(): void {
		this.detached++;
		this.element.remove();
	}
	override layout(): void { this.layouts++; }
	override setVisible(visible: boolean): void { this.visible = visible; if (visible) { this.showCalls++; } }
	override async focusWhenReady(): Promise<void> { this.focused++; }
	override dispose(): void {
		if (!this.isDisposed) {
			this._onWillDispose.fire(this);
			this.isDisposed = true;
			this.disposed++;
			this._store.dispose();
		}
	}
}

class TestTerminalChatView extends TerminalChatView {
	readonly frames: { callback: () => void; cancelled: boolean }[] = [];

	protected override scheduleRenderFrame(callback: () => void): IDisposable {
		const frame = { callback, cancelled: false };
		this.frames.push(frame);
		return toDisposable(() => frame.cancelled = true);
	}

	flushFrames(): void {
		for (const frame of this.frames.splice(0)) {
			if (!frame.cancelled) {
				frame.callback();
			}
		}
	}
}

class TestTelemetryService extends NullTelemetryServiceShape {
	readonly events: Record<string, unknown>[] = [];

	override publicLog2(_eventName?: string, data?: unknown): void {
		if (data && typeof data === 'object') {
			this.events.push({ ...data });
		}
	}
}

suite('TerminalChatView', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	let telemetry: TestTelemetryService;
	let openTelemetry: SessionOpenTelemetryService;
	setup(() => {
		telemetry = new TestTelemetryService();
		openTelemetry = store.add(new SessionOpenTelemetryService(telemetry));
	});
	const chat = new class extends mock<IChat>() {
		override readonly resource = URI.parse('test:///chat');
	}();

	function createTerminal(): TestTerminal {
		return store.add(new TestTerminal());
	}

	function session(id: string): ISession {
		return new class extends mock<ISession>() {
			override readonly sessionId = id;
			override readonly resource = URI.parse(`test:///${id}`);
			override readonly isArchived = constObservable(false);
			override readonly status = constObservable(SessionStatus.InProgress);
		}();
	}

	function state(terminal: ITerminalInstance | undefined, start: () => Promise<void> = async () => { }) {
		const instance = observableValue<ITerminalInstance | undefined>('terminal', terminal);
		const hasExited = observableValue('hasExited', false);
		return {
			instance, hasExited,
			isRunning: derived(reader => !!instance.read(reader) && !hasExited.read(reader)),
			isStarting: constObservable(false), error: constObservable(undefined), start,
		} satisfies ISessionTerminal & { hasExited: ISettableObservable<boolean> };
	}

	function createView(registry: ISessionTerminalService): TestTerminalChatView {
		const instantiation = store.add(new TestInstantiationService());
		instantiation.stub(ISessionTerminalService, registry);
		instantiation.stub(ITerminalService, new class extends mock<ITerminalService>() {
			override setActiveInstance(): void { }
		}());
		instantiation.stub(INotificationService, new class extends mock<INotificationService>() {
			override error(): void { }
		}());
		instantiation.stub(ISessionOpenTelemetryService, openTelemetry);
		instantiation.stub(ILogService, new NullLogService());
		const view = store.add(instantiation.createInstance(TestTerminalChatView));
		mainWindow.document.body.appendChild(view.element);
		store.add(toDisposable(() => view.element.remove()));
		view.layout(500, 400, 0, 0);
		view.setActive(true);
		return view;
	}

	async function open(view: TerminalChatView, target: ISession, token = CancellationToken.None): Promise<void> {
		await openTelemetry.withOpenRequest('sessionsList', token, async attempt => {
			openTelemetry.sessionResolved(attempt, target.resource, 'local-agent-host', false, false, 'terminal');
			openTelemetry.sessionActivationStarted(attempt);
			view.setChat(chat, undefined, target);
			openTelemetry.sessionActivated(attempt, chat.resource);
			openTelemetry.sessionLoaded(attempt);
		});
	}

	test('switching or closing a view detaches terminals without terminating their processes', () => {
		const registry = new SessionTerminalService();
		const first = createTerminal();
		const second = createTerminal();
		store.add(registry.registerSessionTerminal('first', state(first)));
		store.add(registry.registerSessionTerminal('second', state(second)));
		const view = createView(registry);
		view.setChat(chat, undefined, session('first'));
		view.setVisible(false);
		const hidden = !first.visible;
		view.setVisible(true);
		view.setChat(chat, undefined, session('second'));
		view.dispose();
		assert.deepStrictEqual({
			hidden,
			first: { attached: first.attached, detached: first.detached, disposed: first.disposed },
			second: { attached: second.attached, detached: second.detached, disposed: second.disposed },
		}, { hidden: true, first: { attached: 1, detached: 1, disposed: 0 }, second: { attached: 1, detached: 1, disposed: 0 } });
	});

	test('warm switch work counts stay bounded per attachment', () => {
		const registry = new SessionTerminalService();
		const terminals = [createTerminal(), createTerminal()];
		const sessions = [session('first'), session('second')];
		for (const [index, current] of sessions.entries()) {
			store.add(registry.registerSessionTerminal(current.sessionId, state(terminals[index])));
		}
		const view = createView(registry);
		for (let index = 0; index < 20; index++) {
			view.setChat(chat, undefined, sessions[index % 2]);
		}
		assert.deepStrictEqual({
			attachments: terminals.reduce((total, terminal) => total + terminal.attached, 0),
			layouts: terminals.reduce((total, terminal) => total + terminal.layouts, 0),
			shows: terminals.reduce((total, terminal) => total + terminal.showCalls, 0),
			processesDisposed: terminals.reduce((total, terminal) => total + terminal.disposed, 0),
		}, { attachments: 20, layouts: 20, shows: 20, processesDisposed: 0 });
	});

	test('unchanged layout and visibility updates do not resize an already-visible CLI', () => {
		const registry = new SessionTerminalService();
		const terminal = createTerminal();
		store.add(registry.registerSessionTerminal('session', state(terminal)));
		const view = createView(registry);
		view.setChat(chat, undefined, session('session'));
		for (let index = 0; index < 20; index++) {
			view.layout(500, 400, 0, 0);
			view.setVisible(true);
		}
		const unchanged = { layouts: terminal.layouts, shows: terminal.showCalls };
		view.layout(600, 500, 0, 0);
		assert.deepStrictEqual({
			unchanged, resized: terminal.layouts, visible: terminal.visible,
		}, { unchanged: { layouts: 1, shows: 1 }, resized: 2, visible: true });
	});

	test('the session surface never reads or displays billing configuration', () => {
		const registry = new SessionTerminalService();
		const terminal = createTerminal();
		let accountReads = 0;
		store.add(registry.registerSessionTerminal('session', {
			...state(terminal),
			get authentication() {
				accountReads++;
				return undefined;
			},
		}));
		const view = createView(registry);
		view.setChat(chat, undefined, session('session'));
		view.setVisible(false);
		view.setVisible(true);
		assert.deepStrictEqual({
			accountReads,
			accountControls: view.element.querySelector('.terminal-session-authentication'),
			terminalAttached: view.element.contains(terminal.domElement),
		}, { accountReads: 0, accountControls: null, terminalAttached: true });
	});

	test('a late start for a previous session cannot steal focus from the current session', async () => {
		const registry = new SessionTerminalService();
		const pending = new DeferredPromise<void>();
		const terminal = createTerminal();
		store.add(registry.registerSessionTerminal('first', state(undefined, () => pending.p)));
		store.add(registry.registerSessionTerminal('second', state(terminal)));
		const view = createView(registry);
		view.setChat(chat, undefined, session('first'));
		view.setChat(chat, undefined, session('second'));
		await pending.complete();
		assert.strictEqual(terminal.focused, 0);
	});

	test('an outgoing view cannot hide or detach a terminal transferred to another view', () => {
		const registry = new SessionTerminalService();
		const terminal = createTerminal();
		store.add(registry.registerSessionTerminal('first', state(terminal)));
		store.add(registry.registerSessionTerminal('second', state(terminal)));
		const previous = createView(registry);
		const next = createView(registry);
		previous.setChat(chat, undefined, session('first'));
		next.setChat(chat, undefined, session('second'));
		previous.setVisible(false);
		previous.dispose();

		assert.deepStrictEqual({
			visible: terminal.visible,
			attachedToNext: next.element.contains(terminal.domElement),
			detached: terminal.detached,
			disposed: terminal.disposed,
		}, { visible: true, attachedToNext: true, detached: 0, disposed: 0 });
	});

	test('closing the CLI offers resume instead of automatically restarting the process', () => {
		const registry = new SessionTerminalService();
		let starts = 0;
		const terminal = state(createTerminal(), async () => { starts++; });
		store.add(registry.registerSessionTerminal('session', terminal));
		const view = createView(registry);
		view.setChat(chat, undefined, session('session'));
		terminal.instance.set(undefined, undefined);
		assert.deepStrictEqual({
			starts,
			resumeVisible: view.element.querySelector<HTMLElement>('.monaco-button')?.style.display,
		}, { starts: 0, resumeVisible: '' });
	});

	test('tracking warnings remain accessible without hiding or restarting the native terminal', () => {
		const registry = new SessionTerminalService();
		const terminal = createTerminal();
		const warning = observableValue<string | undefined>('warning', 'Session tracking is unavailable');
		store.add(registry.registerSessionTerminal('session', { ...state(terminal), warning }));
		const view = createView(registry);
		view.setChat(chat, undefined, session('session'));
		const message = view.element.querySelector('[role="status"]')?.textContent;
		warning.set(undefined, undefined);
		assert.deepStrictEqual({
			message, attached: terminal.attached, disposed: terminal.disposed,
			statusDisplay: view.element.querySelector<HTMLElement>('.session-terminal-status')?.style.display,
		}, { message: 'Session tracking is unavailable', attached: 1, disposed: 0, statusDisplay: 'none' });
	});

	test('a conversation open in the background of a shared CLI shows that terminal with guidance instead of a restart', () => {
		const registry = new SessionTerminalService();
		const terminal = createTerminal();
		let starts = 0;
		const displaysOtherSession = observableValue<string | undefined>('other', 'Resumed task');
		store.add(registry.registerSessionTerminal('session', { ...state(terminal, async () => { starts++; }), displaysOtherSession }));
		const view = createView(registry);
		view.setChat(chat, undefined, session('session'));
		const message = view.element.querySelector('[role="status"]')?.textContent;
		const resumeVisible = view.element.querySelector<HTMLElement>('.monaco-button')?.style.display;
		displaysOtherSession.set(undefined, undefined);
		assert.deepStrictEqual({
			message, resumeVisible, starts, attached: terminal.attached, disposed: terminal.disposed,
			statusDisplay: view.element.querySelector<HTMLElement>('.session-terminal-status')?.style.display,
		}, {
			message: 'This CLI is currently showing “Resumed task”. Use the CLI\'s session list to switch back to this conversation.',
			resumeVisible: 'none', starts: 0, attached: 1, disposed: 0, statusDisplay: 'none',
		});
	});

	test('a starting native process shows feedback instead of an unexplained blank terminal', () => {
		const registry = new SessionTerminalService();
		const terminal = createTerminal();
		const isInitializing = observableValue('initializing', true);
		store.add(registry.registerSessionTerminal('session', { ...state(terminal), isInitializing }));
		const view = createView(registry);
		view.setChat(chat, undefined, session('session'));
		const message = view.element.querySelector('[role="status"]')?.textContent;
		const spinner = view.element.querySelector<HTMLElement>('.monaco-pixel-spinner')!;
		const spinnerVisible = spinner.style.display !== 'none';
		isInitializing.set(false, undefined);
		assert.deepStrictEqual({
			message,
			spinnerVisible,
			spinnerHiddenAfterOutput: spinner.style.display === 'none',
			decorativeSpinner: spinner.getAttribute('aria-hidden'),
			statusDisplay: view.element.querySelector<HTMLElement>('.session-terminal-status')?.style.display,
			disposed: terminal.disposed,
		}, { message: 'Starting the CLI terminal...', spinnerVisible: true, spinnerHiddenAfterOutput: true, decorativeSpinner: 'true', statusDisplay: 'none', disposed: 0 });
	});

	test('terminal readiness requires an xterm render and a subsequent visible frame', async () => {
		const registry = new SessionTerminalService();
		const terminal = createTerminal();
		store.add(registry.registerSessionTerminal('session', state(terminal)));
		const view = createView(registry);
		await open(view, session('session'));
		view.flushFrames();
		const afterAttach = telemetry.events.length;
		terminal.render();
		const afterRender = telemetry.events.length;
		view.flushFrames();
		assert.deepStrictEqual({
			afterAttach, afterRender,
			events: telemetry.events.map(event => ({
				outcome: event.outcome, presentation: event.presentation,
				kind: event.terminalRenderReadyKind, chatModelBound: event.modelBoundDurationMs,
			})),
		}, {
			afterAttach: 0, afterRender: 0,
			events: [{ outcome: 'success', presentation: 'terminal', kind: 'render', chatModelBound: undefined }],
		});
	});

	test('terminal readiness waits for slow resume and initial output even after blank renders', async () => {
		const registry = new SessionTerminalService();
		const terminal = createTerminal();
		const starting = observableValue('starting', true);
		const initializing = observableValue('initializing', true);
		const terminalState = state(undefined);
		store.add(registry.registerSessionTerminal('session', { ...terminalState, isStarting: starting, isInitializing: initializing }));
		const view = createView(registry);
		await open(view, session('session'));
		view.flushFrames();
		const beforeInstance = telemetry.events.length;
		terminalState.instance.set(terminal, undefined);
		terminal.render();
		view.flushFrames();
		const beforeOutput = telemetry.events.length;
		initializing.set(false, undefined);
		terminal.render();
		view.flushFrames();
		const beforeResumeCompletes = telemetry.events.length;
		starting.set(false, undefined);
		view.flushFrames();
		assert.deepStrictEqual({
			beforeInstance, beforeOutput, beforeResumeCompletes,
			outcomes: telemetry.events.map(event => event.outcome),
		}, { beforeInstance: 0, beforeOutput: 0, beforeResumeCompletes: 0, outcomes: ['success'] });
	});

	test('repeated opens of an already rendered terminal observe frames without reattaching or resizing', async () => {
		const registry = new SessionTerminalService();
		const terminal = createTerminal();
		const target = session('session');
		store.add(registry.registerSessionTerminal(target.sessionId, state(terminal)));
		const view = createView(registry);
		await open(view, target);
		terminal.render();
		view.flushFrames();
		const pendingCounts: number[] = [];
		for (let index = 0; index < 3; index++) {
			await open(view, target);
			pendingCounts.push(telemetry.events.length);
			view.flushFrames();
		}
		assert.deepStrictEqual({
			pendingCounts,
			kinds: telemetry.events.map(event => event.terminalRenderReadyKind),
			attached: terminal.attached, layouts: terminal.layouts, shows: terminal.showCalls,
		}, { pendingCounts: [1, 2, 3], kinds: ['render', 'existingRender', 'existingRender', 'existingRender'], attached: 1, layouts: 1, shows: 1 });
	});

	test('changing the chat resource in the same session updates readiness without reattaching the terminal', async () => {
		const registry = new SessionTerminalService();
		const terminal = createTerminal();
		const target = session('session');
		const nextChat = new class extends mock<IChat>() {
			override readonly resource = URI.parse('test:///next-chat');
		}();
		store.add(registry.registerSessionTerminal(target.sessionId, state(terminal)));
		const view = createView(registry);
		await open(view, target);
		terminal.render();
		view.flushFrames();
		await openTelemetry.withOpenRequest('navigation', CancellationToken.None, async attempt => {
			openTelemetry.sessionResolved(attempt, target.resource, 'local-agent-host', true, false, 'terminal');
			openTelemetry.sessionActivationStarted(attempt);
			view.setChat(nextChat, undefined, target);
			openTelemetry.sessionActivated(attempt, nextChat.resource);
			openTelemetry.sessionLoaded(attempt);
		});
		view.flushFrames();
		assert.deepStrictEqual({
			outcomes: telemetry.events.map(event => event.outcome), attached: terminal.attached,
		}, { outcomes: ['success', 'success'], attached: 1 });
	});

	test('warm switches require a render for each attachment and ignore stale render callbacks', async () => {
		const registry = new SessionTerminalService();
		const terminals = [createTerminal(), createTerminal()];
		const targets = [session('first'), session('second')];
		for (const [index, target] of targets.entries()) {
			store.add(registry.registerSessionTerminal(target.sessionId, state(terminals[index])));
		}
		const view = createView(registry);
		await open(view, targets[0]);
		const staleRender = terminals[0].renderListener!;
		terminals[0].render();
		view.flushFrames();
		await open(view, targets[1]);
		terminals[1].render();
		view.flushFrames();
		await open(view, targets[0]);
		staleRender({ start: 0, end: 23 });
		view.flushFrames();
		const beforeCurrentRender = telemetry.events.length;
		terminals[0].render();
		view.flushFrames();
		assert.deepStrictEqual({
			beforeCurrentRender,
			kinds: telemetry.events.map(event => event.terminalRenderReadyKind),
			attached: terminals.map(terminal => terminal.attached),
			listeners: terminals.map(terminal => terminal.hasRenderListeners),
		}, { beforeCurrentRender: 2, kinds: ['render', 'render', 'render'], attached: [2, 1], listeners: [true, false] });
	});

	test('a terminal resize invalidates a cached render before the readiness frame', async () => {
		const registry = new SessionTerminalService();
		const terminal = createTerminal();
		store.add(registry.registerSessionTerminal('session', state(terminal)));
		const view = createView(registry);
		const target = session('session');
		await open(view, target);
		terminal.render();
		view.flushFrames();
		await open(view, target);
		terminal.resize();
		view.flushFrames();
		const beforeNewRender = telemetry.events.length;
		terminal.render();
		view.flushFrames();
		assert.deepStrictEqual({
			beforeNewRender,
			kinds: telemetry.events.map(event => event.terminalRenderReadyKind),
		}, { beforeNewRender: 1, kinds: ['render', 'render'] });
	});

	test('hidden views cancel pending frames and cannot report readiness until visible again', async () => {
		const registry = new SessionTerminalService();
		const terminal = createTerminal();
		store.add(registry.registerSessionTerminal('session', state(terminal)));
		const view = createView(registry);
		await open(view, session('session'));
		terminal.render();
		const staleFrame = view.frames[0].callback;
		view.setVisible(false);
		staleFrame();
		terminal.resize();
		terminal.render();
		view.flushFrames();
		const hidden = telemetry.events.length;
		view.setVisible(true);
		view.flushFrames();
		const beforeVisibleRender = telemetry.events.length;
		terminal.render();
		view.flushFrames();
		assert.deepStrictEqual({
			hidden, beforeVisibleRender,
			outcomes: telemetry.events.map(event => event.outcome),
		}, { hidden: 0, beforeVisibleRender: 0, outcomes: ['success'] });
	});

	test('disconnected, CSS-hidden and zero-sized surfaces cannot complete readiness frames', async () => {
		const registry = new SessionTerminalService();
		const terminal = createTerminal();
		store.add(registry.registerSessionTerminal('session', state(terminal)));
		const view = createView(registry);
		await open(view, session('session'));
		terminal.render();
		view.element.remove();
		view.flushFrames();
		const disconnected = telemetry.events.length;
		mainWindow.document.body.appendChild(view.element);
		view.element.style.visibility = 'hidden';
		view.layout(500, 400, 0, 0);
		view.flushFrames();
		const hidden = telemetry.events.length;
		view.element.style.visibility = '';
		view.layout(0, 400, 0, 0);
		view.flushFrames();
		const zeroWidth = telemetry.events.length;
		view.layout(500, 0, 0, 0);
		view.flushFrames();
		const zeroHeight = telemetry.events.length;
		view.layout(500, 400, 0, 0);
		terminal.render();
		view.flushFrames();
		assert.deepStrictEqual({
			disconnected, hidden, zeroWidth, zeroHeight,
			outcomes: telemetry.events.map(event => event.outcome),
		}, { disconnected: 0, hidden: 0, zeroWidth: 0, zeroHeight: 0, outcomes: ['success'] });
	});

	test('an inert creation warmup cannot complete a terminal open or warm the visible view readiness', async () => {
		const registry = new SessionTerminalService();
		const terminal = createTerminal();
		const target = session('session');
		store.add(registry.registerSessionTerminal(target.sessionId, state(terminal)));
		const warmup = createView(registry);
		warmup.element.inert = true;
		warmup.element.setAttribute('aria-hidden', 'true');
		warmup.setActive(false);
		await open(warmup, target);
		terminal.render();
		warmup.flushFrames();
		const hidden = telemetry.events.length;
		const visible = createView(registry);
		visible.setChat(chat, undefined, target);
		visible.flushFrames();
		const beforeVisibleRender = telemetry.events.length;
		warmup.dispose();
		terminal.render();
		visible.flushFrames();
		assert.deepStrictEqual({
			hidden, beforeVisibleRender,
			outcomes: telemetry.events.map(event => event.outcome),
			visible: terminal.visible, detached: terminal.detached,
		}, { hidden: 0, beforeVisibleRender: 0, outcomes: ['success'], visible: true, detached: 0 });
	});

	test('a terminal transferred to another session rejects outgoing frames and releases listeners', async () => {
		const registry = new SessionTerminalService();
		const terminal = createTerminal();
		store.add(registry.registerSessionTerminal('first', state(terminal)));
		store.add(registry.registerSessionTerminal('second', state(terminal)));
		const previous = createView(registry);
		const next = createView(registry);
		await open(previous, session('first'));
		terminal.render();
		const staleFrame = previous.frames[0].callback;
		await open(next, session('second'));
		staleFrame();
		const beforeNewRender = telemetry.events.map(event => event.outcome);
		previous.dispose();
		terminal.render();
		next.flushFrames();
		next.dispose();
		assert.deepStrictEqual({
			beforeNewRender,
			outcomes: telemetry.events.map(event => event.outcome),
			renderListeners: terminal.hasRenderListeners, resizeListeners: terminal.hasResizeListeners,
			disposed: terminal.disposed,
		}, { beforeNewRender: ['cancelled'], outcomes: ['cancelled', 'success'], renderListeners: false, resizeListeners: false, disposed: 0 });
	});

	test('same-session supersession rejects stale frames without cancelling the new request', async () => {
		const registry = new SessionTerminalService();
		const terminal = createTerminal();
		const target = session('session');
		store.add(registry.registerSessionTerminal(target.sessionId, state(terminal)));
		const view = createView(registry);
		await open(view, target);
		terminal.render();
		const staleFrame = view.frames[0].callback;
		await open(view, target);
		staleFrame();
		const beforeCurrentFrame = telemetry.events.map(event => event.outcome);
		view.flushFrames();
		assert.deepStrictEqual({
			beforeCurrentFrame,
			outcomes: telemetry.events.map(event => event.outcome),
		}, { beforeCurrentFrame: ['cancelled'], outcomes: ['cancelled', 'success'] });
	});

	test('a delayed xterm cannot install listeners after its view is disposed', async () => {
		const registry = new SessionTerminalService();
		const terminal = createTerminal();
		const xterm = terminal.xterm;
		const pending = new DeferredPromise<XtermTerminal | undefined>();
		terminal.xterm = undefined;
		terminal.xtermReadyPromise = pending.p;
		store.add(registry.registerSessionTerminal('session', state(terminal)));
		const view = createView(registry);
		const cancellation = store.add(new CancellationTokenSource());
		await open(view, session('session'), cancellation.token);
		view.dispose();
		await pending.complete(xterm);
		terminal.render();
		view.flushFrames();
		cancellation.cancel();
		assert.deepStrictEqual({
			outcomes: telemetry.events.map(event => event.outcome),
			renderListeners: terminal.hasRenderListeners, resizeListeners: terminal.hasResizeListeners,
			disposed: terminal.disposed,
		}, { outcomes: ['cancelled'], renderListeners: false, resizeListeners: false, disposed: 0 });
	});

	test('a delayed xterm is observed before its first render without treating initialization as readiness', async () => {
		const registry = new SessionTerminalService();
		const terminal = createTerminal();
		const xterm = terminal.xterm;
		const pending = new DeferredPromise<XtermTerminal | undefined>();
		terminal.xterm = undefined;
		terminal.xtermReadyPromise = pending.p;
		store.add(registry.registerSessionTerminal('session', state(terminal)));
		const view = createView(registry);
		await open(view, session('session'));
		await pending.complete(xterm);
		view.flushFrames();
		const beforeRender = telemetry.events.length;
		terminal.render();
		view.flushFrames();
		assert.deepStrictEqual({
			beforeRender,
			outcomes: telemetry.events.map(event => event.outcome),
		}, { beforeRender: 0, outcomes: ['success'] });
	});

	test('early process exit or disposal never completes a pending readiness frame', async () => {
		const registry = new SessionTerminalService();
		const terminals = [createTerminal(), createTerminal()];
		const targets = [session('exit'), session('dispose')];
		for (const [index, target] of targets.entries()) {
			store.add(registry.registerSessionTerminal(target.sessionId, state(terminals[index])));
			const view = createView(registry);
			await open(view, target);
			terminals[index].render();
			const staleFrame = view.frames[0].callback;
			if (index === 0) {
				terminals[index].exit();
			} else {
				terminals[index].dispose();
			}
			staleFrame();
			view.flushFrames();
		}
		assert.deepStrictEqual(telemetry.events.map(event => ({ outcome: event.outcome, ready: event.terminalRenderReadyDurationMs })), [
			{ outcome: 'failure', ready: undefined },
			{ outcome: 'failure', ready: undefined },
		]);
	});

	test('start cancellation and failure finish telemetry without reporting terminal readiness', async () => {
		const registry = new SessionTerminalService();
		const view = createView(registry);
		for (const [id, error] of [['cancelled', new CancellationError()], ['failure', new Error('Start failed')]] as const) {
			const pending = new DeferredPromise<void>();
			store.add(registry.registerSessionTerminal(id, state(undefined, () => pending.p)));
			await open(view, session(id));
			await pending.error(error);
			await Promise.resolve();
			view.flushFrames();
		}
		assert.deepStrictEqual(telemetry.events.map(event => ({ outcome: event.outcome, ready: event.terminalRenderReadyDurationMs })), [
			{ outcome: 'cancelled', ready: undefined },
			{ outcome: 'failure', ready: undefined },
		]);
	});
});
