/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $, h, trackAttributes, copyAttributes, disposableWindowInterval, getActiveDocument, getWindows, getWindowsCount, getWindowId, getWindowById, hasWindow, getWindow, getDocument, getDomNodeZoomLevel, isHTMLElement, SafeTriangle, AnimationFrameScheduler, DisposableResizeObserver, getRecentDisposableResizeObserverContextForLoopError, findParentWithClass, hasParentWithClass, ModifierKeyEmitter, alignToDevicePixels, getDevicePixelAlignmentOffset, IDevicePixelAlignment } from '../../browser/dom.js';
import { asCssValueWithDefault } from '../../../base/browser/cssValue.js';
import { CodeWindow, ensureCodeWindow, isAuxiliaryWindow, mainWindow } from '../../browser/window.js';
import { DeferredPromise, timeout } from '../../common/async.js';
import { errorHandler, setUnexpectedErrorHandler } from '../../common/errors.js';
import { DisposableStore, toDisposable } from '../../common/lifecycle.js';
import { runWithFakedTimers } from '../common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../common/utils.js';
import { registerTestIframe } from './testWindow.js';

suite('dom', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	test('hasClass', () => {

		const element = document.createElement('div');
		element.className = 'foobar boo far';

		assert(element.classList.contains('foobar'));
		assert(element.classList.contains('boo'));
		assert(element.classList.contains('far'));
		assert(!element.classList.contains('bar'));
		assert(!element.classList.contains('foo'));
		assert(!element.classList.contains(''));
	});

	test('findParentWithClass supports multiple required classes', () => {
		const root = $('div.modern-ui.motion-enabled');
		const intermediate = $('div.modern-ui');
		const child = $('div');
		root.appendChild(intermediate).appendChild(child);

		assert.deepStrictEqual({
			multipleClasses: findParentWithClass(child, ['modern-ui', 'motion-enabled']) === root,
			singleClass: findParentWithClass(child, 'modern-ui') === intermediate,
			missingClass: hasParentWithClass(child, ['modern-ui', 'missing']),
			stoppedBeforeMatch: hasParentWithClass(child, ['modern-ui', 'motion-enabled'], intermediate),
		}, {
			multipleClasses: true,
			singleClass: true,
			missingClass: false,
			stoppedBeforeMatch: false,
		});
	});

	test('removeClass', () => {

		let element = document.createElement('div');
		element.className = 'foobar boo far';

		element.classList.remove('boo');
		assert(element.classList.contains('far'));
		assert(!element.classList.contains('boo'));
		assert(element.classList.contains('foobar'));
		assert.strictEqual(element.className, 'foobar far');

		element = document.createElement('div');
		element.className = 'foobar boo far';

		element.classList.remove('far');
		assert(!element.classList.contains('far'));
		assert(element.classList.contains('boo'));
		assert(element.classList.contains('foobar'));
		assert.strictEqual(element.className, 'foobar boo');

		element.classList.remove('boo');
		assert(!element.classList.contains('far'));
		assert(!element.classList.contains('boo'));
		assert(element.classList.contains('foobar'));
		assert.strictEqual(element.className, 'foobar');

		element.classList.remove('foobar');
		assert(!element.classList.contains('far'));
		assert(!element.classList.contains('boo'));
		assert(!element.classList.contains('foobar'));
		assert.strictEqual(element.className, '');
	});

	test('removeClass should consider hyphens', function () {
		const element = document.createElement('div');

		element.classList.add('foo-bar');
		element.classList.add('bar');

		assert(element.classList.contains('foo-bar'));
		assert(element.classList.contains('bar'));

		element.classList.remove('bar');
		assert(element.classList.contains('foo-bar'));
		assert(!element.classList.contains('bar'));

		element.classList.remove('foo-bar');
		assert(!element.classList.contains('foo-bar'));
		assert(!element.classList.contains('bar'));
	});

	suite('$', () => {
		test('should build simple nodes', () => {
			const div = $('div');
			assert(div);
			assert(isHTMLElement(div));
			assert.strictEqual(div.tagName, 'DIV');
			assert(!div.firstChild);
		});

		test('should build nodes with id', () => {
			const div = $('div#foo');
			assert(div);
			assert(isHTMLElement(div));
			assert.strictEqual(div.tagName, 'DIV');
			assert.strictEqual(div.id, 'foo');
		});

		test('should build nodes with class-name', () => {
			const div = $('div.foo');
			assert(div);
			assert(isHTMLElement(div));
			assert.strictEqual(div.tagName, 'DIV');
			assert.strictEqual(div.className, 'foo');
		});

		test('should build nodes with attributes', () => {
			let div = $('div', { class: 'test' });
			assert.strictEqual(div.className, 'test');

			div = $('div', undefined);
			assert.strictEqual(div.className, '');
		});

		test('should build nodes with children', () => {
			let div = $('div', undefined, $('span', { id: 'demospan' }));
			const firstChild = div.firstChild as HTMLElement;
			assert.strictEqual(firstChild.tagName, 'SPAN');
			assert.strictEqual(firstChild.id, 'demospan');

			div = $('div', undefined, 'hello');

			assert.strictEqual(div.firstChild && div.firstChild.textContent, 'hello');
		});

		test('should build nodes with text children', () => {
			const div = $('div', undefined, 'foobar');
			const firstChild = div.firstChild as HTMLElement;
			assert.strictEqual(firstChild.tagName, undefined);
			assert.strictEqual(firstChild.textContent, 'foobar');
		});
	});

	suite('h', () => {
		test('should build simple nodes', () => {
			const div = h('div');
			assert(isHTMLElement(div.root));
			assert.strictEqual(div.root.tagName, 'DIV');

			const span = h('span');
			assert(isHTMLElement(span.root));
			assert.strictEqual(span.root.tagName, 'SPAN');

			const img = h('img');
			assert(isHTMLElement(img.root));
			assert.strictEqual(img.root.tagName, 'IMG');
		});

		test('should handle ids and classes', () => {
			const divId = h('div#myid');
			assert.strictEqual(divId.root.tagName, 'DIV');
			assert.strictEqual(divId.root.id, 'myid');

			const divClass = h('div.a');
			assert.strictEqual(divClass.root.tagName, 'DIV');
			assert.strictEqual(divClass.root.classList.length, 1);
			assert(divClass.root.classList.contains('a'));

			const divClasses = h('div.a.b.c');
			assert.strictEqual(divClasses.root.tagName, 'DIV');
			assert.strictEqual(divClasses.root.classList.length, 3);
			assert(divClasses.root.classList.contains('a'));
			assert(divClasses.root.classList.contains('b'));
			assert(divClasses.root.classList.contains('c'));

			const divAll = h('div#myid.a.b.c');
			assert.strictEqual(divAll.root.tagName, 'DIV');
			assert.strictEqual(divAll.root.id, 'myid');
			assert.strictEqual(divAll.root.classList.length, 3);
			assert(divAll.root.classList.contains('a'));
			assert(divAll.root.classList.contains('b'));
			assert(divAll.root.classList.contains('c'));

			const spanId = h('span#myid');
			assert.strictEqual(spanId.root.tagName, 'SPAN');
			assert.strictEqual(spanId.root.id, 'myid');

			const spanClass = h('span.a');
			assert.strictEqual(spanClass.root.tagName, 'SPAN');
			assert.strictEqual(spanClass.root.classList.length, 1);
			assert(spanClass.root.classList.contains('a'));

			const spanClasses = h('span.a.b.c');
			assert.strictEqual(spanClasses.root.tagName, 'SPAN');
			assert.strictEqual(spanClasses.root.classList.length, 3);
			assert(spanClasses.root.classList.contains('a'));
			assert(spanClasses.root.classList.contains('b'));
			assert(spanClasses.root.classList.contains('c'));

			const spanAll = h('span#myid.a.b.c');
			assert.strictEqual(spanAll.root.tagName, 'SPAN');
			assert.strictEqual(spanAll.root.id, 'myid');
			assert.strictEqual(spanAll.root.classList.length, 3);
			assert(spanAll.root.classList.contains('a'));
			assert(spanAll.root.classList.contains('b'));
			assert(spanAll.root.classList.contains('c'));
		});

		test('should implicitly handle ids and classes', () => {
			const divId = h('#myid');
			assert.strictEqual(divId.root.tagName, 'DIV');
			assert.strictEqual(divId.root.id, 'myid');

			const divClass = h('.a');
			assert.strictEqual(divClass.root.tagName, 'DIV');
			assert.strictEqual(divClass.root.classList.length, 1);
			assert(divClass.root.classList.contains('a'));

			const divClasses = h('.a.b.c');
			assert.strictEqual(divClasses.root.tagName, 'DIV');
			assert.strictEqual(divClasses.root.classList.length, 3);
			assert(divClasses.root.classList.contains('a'));
			assert(divClasses.root.classList.contains('b'));
			assert(divClasses.root.classList.contains('c'));

			const divAll = h('#myid.a.b.c');
			assert.strictEqual(divAll.root.tagName, 'DIV');
			assert.strictEqual(divAll.root.id, 'myid');
			assert.strictEqual(divAll.root.classList.length, 3);
			assert(divAll.root.classList.contains('a'));
			assert(divAll.root.classList.contains('b'));
			assert(divAll.root.classList.contains('c'));
		});

		test('should handle @ identifiers', () => {
			const implicit = h('@el');
			assert.strictEqual(implicit.root, implicit.el);
			assert.strictEqual(implicit.el.tagName, 'DIV');

			const explicit = h('div@el');
			assert.strictEqual(explicit.root, explicit.el);
			assert.strictEqual(explicit.el.tagName, 'DIV');

			const implicitId = h('#myid@el');
			assert.strictEqual(implicitId.root, implicitId.el);
			assert.strictEqual(implicitId.el.tagName, 'DIV');
			assert.strictEqual(implicitId.root.id, 'myid');

			const explicitId = h('div#myid@el');
			assert.strictEqual(explicitId.root, explicitId.el);
			assert.strictEqual(explicitId.el.tagName, 'DIV');
			assert.strictEqual(explicitId.root.id, 'myid');

			const implicitClass = h('.a@el');
			assert.strictEqual(implicitClass.root, implicitClass.el);
			assert.strictEqual(implicitClass.el.tagName, 'DIV');
			assert.strictEqual(implicitClass.root.classList.length, 1);
			assert(implicitClass.root.classList.contains('a'));

			const explicitClass = h('div.a@el');
			assert.strictEqual(explicitClass.root, explicitClass.el);
			assert.strictEqual(explicitClass.el.tagName, 'DIV');
			assert.strictEqual(explicitClass.root.classList.length, 1);
			assert(explicitClass.root.classList.contains('a'));
		});
	});

	test('should recurse', () => {
		const result = h('div.code-view', [
			h('div.title@title'),
			h('div.container', [
				h('div.gutter@gutterDiv'),
				h('span@editor'),
			]),
		]);

		assert.strictEqual(result.root.tagName, 'DIV');
		assert.strictEqual(result.root.className, 'code-view');
		assert.strictEqual(result.root.childElementCount, 2);
		assert.strictEqual(result.root.firstElementChild, result.title);
		assert.strictEqual(result.title.tagName, 'DIV');
		assert.strictEqual(result.title.className, 'title');
		assert.strictEqual(result.title.childElementCount, 0);
		assert.strictEqual(result.gutterDiv.tagName, 'DIV');
		assert.strictEqual(result.gutterDiv.className, 'gutter');
		assert.strictEqual(result.gutterDiv.childElementCount, 0);
		assert.strictEqual(result.editor.tagName, 'SPAN');
		assert.strictEqual(result.editor.className, '');
		assert.strictEqual(result.editor.childElementCount, 0);
	});

	test('cssValueWithDefault', () => {
		assert.strictEqual(asCssValueWithDefault('red', 'blue'), 'red');
		assert.strictEqual(asCssValueWithDefault(undefined, 'blue'), 'blue');
		assert.strictEqual(asCssValueWithDefault('var(--my-var)', 'blue'), 'var(--my-var, blue)');
		assert.strictEqual(asCssValueWithDefault('var(--my-var, red)', 'blue'), 'var(--my-var, red)');
		assert.strictEqual(asCssValueWithDefault('var(--my-var, var(--my-var2))', 'blue'), 'var(--my-var, var(--my-var2, blue))');
	});

	test('copyAttributes', () => {
		const elementSource = document.createElement('div');
		elementSource.setAttribute('foo', 'bar');
		elementSource.setAttribute('bar', 'foo');

		const elementTarget = document.createElement('div');
		copyAttributes(elementSource, elementTarget);

		assert.strictEqual(elementTarget.getAttribute('foo'), 'bar');
		assert.strictEqual(elementTarget.getAttribute('bar'), 'foo');
	});

	test('trackAttributes (unfiltered)', async () => {
		return runWithFakedTimers({ useFakeTimers: true }, async () => {
			const elementSource = document.createElement('div');
			const elementTarget = document.createElement('div');

			const disposable = trackAttributes(elementSource, elementTarget);

			elementSource.setAttribute('foo', 'bar');
			elementSource.setAttribute('bar', 'foo');

			await timeout(1);

			assert.strictEqual(elementTarget.getAttribute('foo'), 'bar');
			assert.strictEqual(elementTarget.getAttribute('bar'), 'foo');

			disposable.dispose();
		});
	});

	test('trackAttributes (filtered)', async () => {
		return runWithFakedTimers({ useFakeTimers: true }, async () => {
			const elementSource = document.createElement('div');
			const elementTarget = document.createElement('div');

			const disposable = trackAttributes(elementSource, elementTarget, ['foo']);

			elementSource.setAttribute('foo', 'bar');
			elementSource.setAttribute('bar', 'foo');

			await timeout(1);

			assert.strictEqual(elementTarget.getAttribute('foo'), 'bar');
			assert.strictEqual(elementTarget.getAttribute('bar'), null);

			disposable.dispose();
		});
	});

	test('window utilities', () => {
		const windows = Array.from(getWindows());
		assert.strictEqual(windows.length, 1);
		assert.strictEqual(getWindowsCount(), 1);
		const windowId = getWindowId(mainWindow);
		assert.ok(typeof windowId === 'number');
		assert.strictEqual(getWindowById(windowId)?.window, mainWindow);
		assert.strictEqual(getWindowById(undefined, true).window, mainWindow);
		assert.strictEqual(hasWindow(windowId), true);
		assert.strictEqual(isAuxiliaryWindow(mainWindow), false);
		ensureCodeWindow(mainWindow, 1);
		assert.ok(typeof mainWindow.vscodeWindowId === 'number');

		const div = document.createElement('div');
		assert.strictEqual(getWindow(div), mainWindow);
		assert.strictEqual(getDocument(div), mainWindow.document);

		const event = document.createEvent('MouseEvent');
		assert.strictEqual(getWindow(event), mainWindow);
		assert.strictEqual(getDocument(event), mainWindow.document);
	});

	test('getActiveDocument: of windows that all report focus, such as a macOS panel and the window it took focus from without that window losing it, the one focused last, also one that had focus as it registered; not once it lost focus', () => {
		const createWindow = (focused: { value: boolean }) => {
			const iframe = mainWindow.document.createElement('iframe');
			mainWindow.document.body.appendChild(iframe);
			store.add(toDisposable(() => iframe.remove()));
			const targetWindow = iframe.contentWindow as CodeWindow;
			targetWindow.document.hasFocus = () => focused.value;
			store.add(registerTestIframe(iframe));
			return targetWindow;
		};
		const focus = (targetWindow: CodeWindow) => targetWindow.dispatchEvent(new targetWindow.FocusEvent('focus'));
		const owner = createWindow({ value: true });
		focus(owner);
		// As a panel that took focus as it opened, before it registered, and so has no focus event
		const panelFocused = { value: true };
		const panel = createWindow(panelFocused);
		const active = () => getActiveDocument() === owner.document ? 'owner' : getActiveDocument() === panel.document ? 'panel' : 'other';

		const panelOpenedFocused = active();
		focus(owner);
		const ownerFocusedLast = active();
		focus(panel);
		const panelFocusedLast = active();
		panelFocused.value = false;
		// The first window that reports focus then, which can be the test runner's window
		const panelActiveOnceUnfocused = active() === 'panel';

		assert.deepStrictEqual({ panelOpenedFocused, ownerFocusedLast, panelFocusedLast, panelActiveOnceUnfocused }, { panelOpenedFocused: 'panel', ownerFocusedLast: 'owner', panelFocusedLast: 'panel', panelActiveOnceUnfocused: false });
	});

	suite('disposableWindowInterval', () => {
		test('basics', async () => {
			let count = 0;
			const promise = new DeferredPromise<void>();
			const interval = disposableWindowInterval(mainWindow, () => {
				count++;
				if (count === 3) {
					promise.complete(undefined);
					return true;
				} else {
					return false;
				}
			}, 0, 10);

			await promise.p;
			assert.strictEqual(count, 3);
			interval.dispose();
		});

		test('iterations', async () => {
			let count = 0;
			const interval = disposableWindowInterval(mainWindow, () => {
				count++;

				return false;
			}, 0, 0);

			await timeout(5);
			assert.strictEqual(count, 0);
			interval.dispose();
		});

		test('dispose', async () => {
			let count = 0;
			const interval = disposableWindowInterval(mainWindow, () => {
				count++;

				return false;
			}, 0, 10);

			interval.dispose();
			await timeout(5);
			assert.strictEqual(count, 0);
		});
	});

	suite('SafeTriangle', () => {
		const fakeElement = (left: number, right: number, top: number, bottom: number): HTMLElement => {
			return { getBoundingClientRect: () => ({ left, right, top, bottom }) } as HTMLElement;
		};

		test('works', () => {
			const safeTriangle = new SafeTriangle(0, 0, fakeElement(10, 20, 10, 20));

			assert.strictEqual(safeTriangle.contains(5, 5), true); // in triangle region
			assert.strictEqual(safeTriangle.contains(15, 5), false);
			assert.strictEqual(safeTriangle.contains(25, 5), false);

			assert.strictEqual(safeTriangle.contains(5, 15), false);
			assert.strictEqual(safeTriangle.contains(15, 15), true);
			assert.strictEqual(safeTriangle.contains(25, 15), false);

			assert.strictEqual(safeTriangle.contains(5, 25), false);
			assert.strictEqual(safeTriangle.contains(15, 25), false);
			assert.strictEqual(safeTriangle.contains(25, 25), false);
		});

		test('other dirations', () => {
			const a = new SafeTriangle(30, 30, fakeElement(10, 20, 10, 20));
			assert.strictEqual(a.contains(25, 25), true);

			const b = new SafeTriangle(0, 30, fakeElement(10, 20, 10, 20));
			assert.strictEqual(b.contains(5, 25), true);

			const c = new SafeTriangle(30, 0, fakeElement(10, 20, 10, 20));
			assert.strictEqual(c.contains(25, 5), true);
		});
	});

	suite('AnimationFrameScheduler', () => {
		// Helper to wait for an animation frame
		const waitForAnimationFrame = () => new Promise<void>(resolve => mainWindow.requestAnimationFrame(() => resolve()));

		test('schedules and runs the callback', async () => {
			const node = document.createElement('div');
			let callCount = 0;
			const scheduler = new AnimationFrameScheduler(node, () => {
				callCount++;
			});

			assert.strictEqual(scheduler.isScheduled(), false);
			scheduler.schedule();
			assert.strictEqual(scheduler.isScheduled(), true);

			// Wait for the animation frame
			await waitForAnimationFrame();

			assert.strictEqual(callCount, 1);
			assert.strictEqual(scheduler.isScheduled(), false);
			scheduler.dispose();
		});

		test('coalesces multiple schedule calls', async () => {
			const node = document.createElement('div');
			let callCount = 0;
			const scheduler = new AnimationFrameScheduler(node, () => {
				callCount++;
			});

			scheduler.schedule();
			scheduler.schedule();
			scheduler.schedule();

			assert.strictEqual(scheduler.isScheduled(), true);

			// Wait for the animation frame
			await waitForAnimationFrame();

			assert.strictEqual(callCount, 1);
			scheduler.dispose();
		});

		test('cancel prevents execution', async () => {
			const node = document.createElement('div');
			let callCount = 0;
			const scheduler = new AnimationFrameScheduler(node, () => {
				callCount++;
			});

			scheduler.schedule();
			assert.strictEqual(scheduler.isScheduled(), true);
			scheduler.cancel();
			assert.strictEqual(scheduler.isScheduled(), false);

			// Wait for the animation frame
			await waitForAnimationFrame();

			assert.strictEqual(callCount, 0);
			scheduler.dispose();
		});

		test('dispose prevents execution', async () => {
			const node = document.createElement('div');
			let callCount = 0;
			const scheduler = new AnimationFrameScheduler(node, () => {
				callCount++;
			});

			scheduler.schedule();
			scheduler.dispose();

			// Wait for the animation frame
			await waitForAnimationFrame();

			assert.strictEqual(callCount, 0);
		});

		test('can schedule again after execution', async () => {
			const node = document.createElement('div');
			let callCount = 0;
			const scheduler = new AnimationFrameScheduler(node, () => {
				callCount++;
			});

			scheduler.schedule();
			await waitForAnimationFrame();
			assert.strictEqual(callCount, 1);

			scheduler.schedule();
			await waitForAnimationFrame();
			assert.strictEqual(callCount, 2);

			scheduler.dispose();
		});
	});

	suite('DisposableResizeObserver', () => {
		teardown(() => new Promise<void>(resolve => mainWindow.requestAnimationFrame(() => resolve())));

		// Captures the callback handed to a `ResizeObserver` so tests can fire
		// deliveries synthetically. Returned via dependency injection — no
		// global mutation, no `any` casts.
		interface FakeResizeObserverHandle {
			ctor: typeof ResizeObserver;
			fire: (entries: ResizeObserverEntry[]) => void;
			disconnects: number;
		}

		function createFakeResizeObserverCtor(): FakeResizeObserverHandle {
			const handle: FakeResizeObserverHandle = {
				ctor: undefined!,
				fire: () => { throw new Error('observer not constructed'); },
				disconnects: 0,
			};
			class FakeResizeObserver implements ResizeObserver {
				constructor(callback: ResizeObserverCallback) {
					handle.fire = entries => callback(entries, this);
				}
				observe(_target: Element, _options?: ResizeObserverOptions): void { /* no-op */ }
				unobserve(_target: Element): void { /* no-op */ }
				disconnect(): void { handle.disconnects++; }
			}
			handle.ctor = FakeResizeObserver;
			return handle;
		}

		function fakeEntry(target: Element = document.createElement('div')): ResizeObserverEntry {
			const size: ResizeObserverSize = { blockSize: 0, inlineSize: 0 };
			return {
				target,
				contentRect: target.getBoundingClientRect(),
				borderBoxSize: [size],
				contentBoxSize: [size],
				devicePixelContentBoxSize: [size],
			};
		}

		test('callback runs synchronously with the entries the browser delivered', () => {
			const fake = createFakeResizeObserverCtor();
			let calls = 0;
			let received: ResizeObserverEntry[] | undefined;
			const observer = new DisposableResizeObserver('test.sync', (entries) => {
				calls++;
				received = entries;
			}, mainWindow, { resizeObserverCtor: fake.ctor });
			const a = fakeEntry();
			const b = fakeEntry();
			fake.fire([a, b]);
			assert.strictEqual(calls, 1, 'callback runs synchronously inside the resize-observation phase');
			assert.deepStrictEqual(received, [a, b], 'entries are forwarded as-is');
			observer.dispose();
		});

		test('each native delivery invokes the callback once (no batching)', () => {
			const fake = createFakeResizeObserverCtor();
			let calls = 0;
			const observer = new DisposableResizeObserver('test.noBatch', () => { calls++; }, mainWindow, { resizeObserverCtor: fake.ctor });
			fake.fire([fakeEntry()]);
			fake.fire([fakeEntry()]);
			assert.strictEqual(calls, 2, 'wrapper does not coalesce deliveries');
			observer.dispose();
		});

		test('dispose disconnects the underlying observer', () => {
			const fake = createFakeResizeObserverCtor();
			const observer = new DisposableResizeObserver('test.dispose', () => { /* noop */ }, mainWindow, { resizeObserverCtor: fake.ctor });
			observer.dispose();
			assert.strictEqual(fake.disconnects, 1);
		});

		test('exceptions in the user callback do not propagate', () => {
			const fake = createFakeResizeObserverCtor();
			const observer = new DisposableResizeObserver('test.throw', () => { throw new Error('boom'); }, mainWindow, { resizeObserverCtor: fake.ctor });
			// Browser would not catch a throw out of the native callback; we
			// must guard so a single bad consumer does not break delivery for
			// every other observer in the realm. The wrapper routes the throw
			// to onUnexpectedError, so swap the handler for the duration of
			// this test so the test runner does not flag it as a failure.
			const originalErrorHandler = errorHandler.getUnexpectedErrorHandler();
			setUnexpectedErrorHandler(() => { /* swallow expected */ });
			try {
				assert.doesNotThrow(() => fake.fire([fakeEntry()]));
			} finally {
				setUnexpectedErrorHandler(originalErrorHandler);
			}
			observer.dispose();
		});

		test('exposes the configured name for loop-warning context', () => {
			const fake = createFakeResizeObserverCtor();
			const observer = new DisposableResizeObserver(
				'my-observer',
				() => { /* noop */ },
				mainWindow,
				{ resizeObserverCtor: fake.ctor },
			);
			assert.strictEqual(observer.name, 'my-observer');
			observer.dispose();
		});

		test('getRecentDisposableResizeObserverContextForLoopError returns undefined for unrelated messages', () => {
			assert.strictEqual(getRecentDisposableResizeObserverContextForLoopError(undefined), undefined);
			assert.strictEqual(getRecentDisposableResizeObserverContextForLoopError('Uncaught TypeError: foo'), undefined);
		});

		test('getRecentDisposableResizeObserverContextForLoopError returns sorted unique wrapped observers from the current frame', () => {
			const fake = createFakeResizeObserverCtor();
			const a = new DisposableResizeObserver('a', () => { /* noop */ }, mainWindow, { resizeObserverCtor: fake.ctor });
			fake.fire([fakeEntry()]);
			const fakeB = createFakeResizeObserverCtor();
			const b = new DisposableResizeObserver('b', () => { /* noop */ }, mainWindow, { resizeObserverCtor: fakeB.ctor });
			fakeB.fire([fakeEntry()]);
			fake.fire([fakeEntry()]);
			const context = getRecentDisposableResizeObserverContextForLoopError(
				'ResizeObserver loop completed with undelivered notifications.',
			);
			assert.strictEqual(
				context,
				'[ResizeObserverLoopContext(a,b)] ResizeObserver loop completed with undelivered notifications.',
			);
			a.dispose();
			b.dispose();
		});

		test('getRecentDisposableResizeObserverContextForLoopError marks bounded participant overflow', () => {
			const observers: DisposableResizeObserver[] = [];
			for (let i = 8; i >= 0; i--) {
				const fake = createFakeResizeObserverCtor();
				observers.push(new DisposableResizeObserver(`observer-${i}`, () => { /* noop */ }, mainWindow, { resizeObserverCtor: fake.ctor }));
				fake.fire([fakeEntry()]);
			}
			assert.strictEqual(
				getRecentDisposableResizeObserverContextForLoopError('ResizeObserver loop completed with undelivered notifications.'),
				'[ResizeObserverLoopContext(observer-0,observer-1,observer-2,observer-3,observer-4,observer-5,observer-6,observer-7,<overflow>)] ResizeObserver loop completed with undelivered notifications.',
			);
			observers.forEach(observer => observer.dispose());
		});

		test('getRecentDisposableResizeObserverContextForLoopError is scoped to the observer window', async () => {
			const iframe = document.createElement('iframe');
			document.body.appendChild(iframe);
			const auxiliaryWindow = iframe.contentWindow!;
			ensureCodeWindow(auxiliaryWindow, 999);

			const fake = createFakeResizeObserverCtor();
			const observer = new DisposableResizeObserver('auxiliary', () => { /* noop */ }, auxiliaryWindow, { resizeObserverCtor: fake.ctor });
			fake.fire([fakeEntry()]);

			assert.strictEqual(
				getRecentDisposableResizeObserverContextForLoopError('ResizeObserver loop completed with undelivered notifications.', mainWindow),
				undefined,
			);
			assert.strictEqual(
				getRecentDisposableResizeObserverContextForLoopError('ResizeObserver loop completed with undelivered notifications.', auxiliaryWindow),
				'[ResizeObserverLoopContext(auxiliary)] ResizeObserver loop completed with undelivered notifications.',
			);

			observer.dispose();
			await new Promise<void>(resolve => auxiliaryWindow.requestAnimationFrame(() => resolve()));
			iframe.remove();
		});

		test('getRecentDisposableResizeObserverContextForLoopError clears at the next animation frame', async () => {
			const fake = createFakeResizeObserverCtor();
			const observer = new DisposableResizeObserver('scoped', () => { /* noop */ }, mainWindow, { resizeObserverCtor: fake.ctor });
			fake.fire([fakeEntry()]);
			// Context is recorded synchronously and survives microtasks (so it is
			// still set when Chromium dispatches the loop warning at the end
			// of the resize-observation phase).
			await Promise.resolve();
			assert.ok(getRecentDisposableResizeObserverContextForLoopError('ResizeObserver loop completed with undelivered notifications.'));
			await new Promise<void>(resolve => mainWindow.requestAnimationFrame(() => resolve()));
			assert.strictEqual(
				getRecentDisposableResizeObserverContextForLoopError('ResizeObserver loop completed with undelivered notifications.'),
				undefined,
				'context must be cleared at the next frame so a later rendering update does not inherit stale observers',
			);
			observer.dispose();
		});
	});

	test('getDomNodeZoomLevel multiplies ancestor CSS zoom across shadow roots', () => {
		const outer = mainWindow.document.body.appendChild($('div'));
		store.add(toDisposable(() => outer.remove()));
		outer.style.zoom = '1.25';
		const host = outer.appendChild($('div'));
		host.style.zoom = '0.8';
		const shadow = host.attachShadow({ mode: 'open' });
		const inner = shadow.appendChild($('div'));
		const leaf = inner.appendChild($('div'));
		leaf.style.zoom = '2';

		assert.deepStrictEqual({
			outer: getDomNodeZoomLevel(outer),
			host: getDomNodeZoomLevel(host),
			inner: getDomNodeZoomLevel(inner),
			leaf: getDomNodeZoomLevel(leaf),
		}, {
			outer: 1.25,
			host: 1,
			inner: 1,
			leaf: 2,
		});
	});

	suite('ModifierKeyEmitter', () => {
		test('exposes the keyboard event only while notifying listeners', () => {
			const disposables = new DisposableStore();
			const emitter = ModifierKeyEmitter.getInstance();
			const received: (string | undefined)[] = [];
			disposables.add(emitter.event(status => received.push(status.event?.type)));
			try {
				mainWindow.dispatchEvent(new KeyboardEvent('keydown', { key: 'Control', ctrlKey: true }));
				mainWindow.dispatchEvent(new KeyboardEvent('keyup', { key: 'Control', ctrlKey: false }));
			} finally {
				disposables.dispose();
			}

			assert.deepStrictEqual({ received, retained: emitter.keyStatus.event }, { received: ['keydown', 'keyup'], retained: undefined });
		});
	});

	suite('alignToDevicePixels', () => {
		let host: HTMLElement;

		setup(() => {
			host = mainWindow.document.body.appendChild($('div'));
		});

		teardown(() => {
			host.remove();
		});

		/** Chromium lays out in 1/64 device pixels and reports client rects as floats, so an aligned position is only on a device pixel to within the helper's tolerance. */
		function precision(dpr: number): number {
			return Math.max(dpr, 1) / 64 * 1.05;
		}

		/** Whether the element starts on a whole device pixel, within Chromium's layout precision. */
		function isDeviceAligned(element: HTMLElement): boolean {
			const rect = element.getBoundingClientRect();
			const dpr = getWindow(element).devicePixelRatio;
			const misalignment = (value: number) => Math.abs(value * dpr - Math.round(value * dpr));
			return misalignment(rect.left) <= precision(dpr) && misalignment(rect.top) <= precision(dpr);
		}

		function createPositioned(parent: HTMLElement, insets: Partial<Record<'left' | 'top' | 'right' | 'bottom', string>>, zoom = 1): HTMLElement {
			const element = parent.appendChild($('div'));
			element.style.position = 'fixed';
			element.style.width = '50px';
			element.style.height = '20px';
			Object.assign(element.style, insets);
			// Move px insets so the element sits half a device pixel off the grid, clear of the rounding tolerance at any DPR
			const dpr = getWindow(element).devicePixelRatio;
			const rect = element.getBoundingClientRect();
			for (const [start, end, value] of [['left', 'right', rect.left], ['top', 'bottom', rect.top]] as const) {
				const offset = ((Math.floor(value * dpr) + 0.5) / dpr - value) / zoom;
				if (element.style[start].endsWith('px')) {
					element.style[start] = `${parseFloat(element.style[start]) + offset}px`;
				} else if (element.style[end].endsWith('px')) {
					element.style[end] = `${parseFloat(element.style[end]) - offset}px`;
				}
			}
			return element;
		}

		test('moves fractional left/top or right/bottom insets onto whole device pixels without drifting', () => {
			const leftTop = createPositioned(host, { left: '10px', top: '20px' });
			const rightBottom = createPositioned(host, { right: '10px', bottom: '20px' });
			const percent = createPositioned(host, { left: '10.3%', top: '20.7%' });
			const results = [leftTop, rightBottom].map(element => {
				const before = isDeviceAligned(element);
				alignToDevicePixels(element);
				const styleAfterFirst = [element.style.left, element.style.top, element.style.right, element.style.bottom];
				alignToDevicePixels(element);
				const styleAfterSecond = [element.style.left, element.style.top, element.style.right, element.style.bottom];
				return { before, after: isDeviceAligned(element), stable: styleAfterFirst.join() === styleAfterSecond.join(), untouchedInsets: styleAfterSecond.filter(value => value === '').length };
			});
			alignToDevicePixels(percent);

			assert.deepStrictEqual({ results, percentInsets: [percent.style.left, percent.style.top, percent.style.right, percent.style.bottom] }, {
				results: [
					{ before: false, after: true, stable: true, untouchedInsets: 2 },
					{ before: false, after: true, stable: true, untouchedInsets: 2 },
				],
				percentInsets: ['10.3%', '20.7%', '', '']
			});
		});

		test('accounts for CSS zoom on ancestors, including shadow hosts', () => {
			const zoomed = host.appendChild($('div'));
			zoomed.style.zoom = '2';
			const element = createPositioned(zoomed, { left: '10px', top: '20px' }, 2);
			const shadowHost = host.appendChild($('div'));
			shadowHost.style.zoom = '2';
			const shadowElement = createPositioned(shadowHost.attachShadow({ mode: 'open' }).appendChild($('div')), { left: '10px', top: '20px' }, 2);
			const results = [element, shadowElement].map(element => {
				const before = isDeviceAligned(element);
				alignToDevicePixels(element);
				return { before, after: isDeviceAligned(element) };
			});

			assert.deepStrictEqual(results, [{ before: false, after: true }, { before: false, after: true }]);
		});

		test('rounds in the requested direction', () => {
			const dpr = getWindow(host).devicePixelRatio;
			const near = (actual: number, expected: number) => Math.abs(actual - expected) <= precision(dpr);
			const position = (direction: IDevicePixelAlignment) => {
				const element = createPositioned(host, { left: '10px', top: '20px' });
				const before = element.getBoundingClientRect();
				alignToDevicePixels(element, direction);
				const after = element.getBoundingClientRect();
				return { before: [before.left * dpr, before.top * dpr], after: [after.left * dpr, after.top * dpr] };
			};
			const upLeft = position({ horizontal: 'start', vertical: 'start' });
			const downRight = position({ horizontal: 'end', vertical: 'end' });
			// Starts 0.6 and is sized 0.6 device pixels past whole ones, so rounding its far edge moves it toward the start,
			// while rounding its near edge would move it toward the end
			const sized = createPositioned(host, { left: '10px', top: '20px' });
			sized.style.left = `${parseFloat(sized.style.left) + 0.1 / dpr}px`;
			sized.style.top = `${parseFloat(sized.style.top) + 0.1 / dpr}px`;
			sized.style.width = `${(Math.floor(50 * dpr) + 0.6) / dpr}px`;
			sized.style.height = `${(Math.floor(20 * dpr) + 0.6) / dpr}px`;
			const before = sized.getBoundingClientRect();
			alignToDevicePixels(sized, { horizontal: 'nearestEnd', vertical: 'nearestEnd' });
			const after = sized.getBoundingClientRect();
			const paintedEnd = (start: number, size: number) => Math.round(start * dpr) + Math.round(size * dpr);

			assert.deepStrictEqual({
				upLeft: upLeft.after.map((value, i) => near(value, Math.floor(upLeft.before[i]))),
				downRight: downRight.after.map((value, i) => near(value, Math.ceil(downRight.before[i]))),
				nearestEnd: {
					aligned: isDeviceAligned(sized),
					endsWhereUnaligned: [paintedEnd(after.left, after.width) === Math.round(before.right * dpr), paintedEnd(after.top, after.height) === Math.round(before.bottom * dpr)],
					movedTowardStart: [after.left < before.left, after.top < before.top]
				}
			}, {
				upLeft: [true, true],
				downRight: [true, true],
				nearestEnd: { aligned: true, endsWhereUnaligned: [true, true], movedTowardStart: [true, true] }
			});
		});

		test('keeps an aligned start when rounding the far edge again', () => {
			// Chromium lays out in 1/64 device pixels and reports client rects as floats, so an aligned start can read just short of its device pixel
			const read = (position: number, dpr: number) => Math.fround(Math.floor(position * dpr * 64 + 1e-6) / 64 / dpr);
			// A position is only written, and so laid out again, when it moves
			const align = (position: number, dpr: number, size: number) => {
				const offset = getDevicePixelAlignmentOffset(position, dpr, 'nearestEnd', size);
				return offset === 0 ? position : read(position + offset, dpr);
			};
			// A 17px view is 25.5 device pixels at DPR 1.5, so its far edge rounds to the device pixel before it when read just short
			const first = align(3.375, 1.5, 17);
			let unstable = 0;
			for (const dpr of [0.5, 1, 1.25, 1.32, 1.5, 1.75, 2, 2.5, 3]) {
				for (let unit = 0; unit < 4 * 64 * dpr; unit++) {
					for (let size = 10; size < 30; size += 7 / 64) {
						if (getDevicePixelAlignmentOffset(align(read(unit / 64 / dpr, dpr), dpr, read(size, dpr)), dpr, 'nearestEnd', read(size, dpr)) !== 0) {
							unstable++;
						}
					}
				}
			}

			assert.deepStrictEqual({ first, second: getDevicePixelAlignmentOffset(first, 1.5, 'nearestEnd', 17), unstable }, { first: Math.fround(10 / 3), second: 0, unstable: 0 });
		});

		test('treats a position floored by layout as aligned below a device pixel ratio of 1', () => {
			// Chromium floors a position on device pixel 40 to as little as 1/64 device pixel short of it, which must not round down a whole device pixel
			const offsets = [0.5, 0.67, 0.75, 0.9].map(dpr => {
				const position = Math.fround((40 - 1 / 64) / dpr);
				return (['start', 'end', 'nearest', 'nearestEnd'] as const).map(rounding => getDevicePixelAlignmentOffset(position, dpr, rounding, 10));
			});

			assert.deepStrictEqual(offsets, [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]);
		});
	});
});
