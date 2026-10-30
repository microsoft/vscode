/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import sinon from 'sinon';
import { $, getDomNodePagePosition, getWindow } from '../../../../browser/dom.js';
import { CONTEXT_VIEW_CLOSE_ANIMATION_DURATION_VARIABLE, CONTEXT_VIEW_MENU_MOTION_CLASS, CONTEXT_VIEW_MENU_MOTION_CLOSING_CLASS, ContextView, ContextViewDOMPosition, contextViewMenuCloseAnimation, IContextViewRenderContext, IDelegate } from '../../../../browser/ui/contextview/contextview.js';
import { mainWindow } from '../../../../browser/window.js';
import { errorHandler, setUnexpectedErrorHandler } from '../../../../common/errors.js';
import { DeferredPromise, timeout } from '../../../../common/async.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../common/utils.js';

suite('ContextView', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	teardown(() => {
		sinon.restore();
	});

	test('hide() is re-entrant safe and does not double-dispose render result (#319393)', () => {
		const container = $('.container');
		const contextView = new ContextView(container, ContextViewDOMPosition.ABSOLUTE);

		let disposeCount = 0;
		const delegate: IDelegate = {
			getAnchor: () => ({ x: 0, y: 0 }),
			render: () => ({
				dispose: () => {
					disposeCount++;
					if (disposeCount === 1) {
						// Simulate a re-entrant hide() call (e.g. via a blur event
						// fired while removing the rendered DOM node from the document).
						contextView.hide();
					}
				}
			})
		};

		contextView.show(delegate);

		assert.doesNotThrow(() => contextView.hide());
		assert.strictEqual(disposeCount, 1, 'render disposable must be disposed exactly once');

		contextView.dispose();
		container.remove();
	});

	test('shadow DOM host is layered with the context view', () => {
		const container = $('.container');
		const contextView = new ContextView(container, ContextViewDOMPosition.FIXED_SHADOW);
		const delegate: IDelegate = {
			getAnchor: () => ({ x: 0, y: 0 }),
			render: () => null,
			layer: 1
		};

		contextView.show(delegate);

		const shadowRootHost = container.getElementsByClassName('shadow-root-host')[0] as HTMLElement;
		assert.deepStrictEqual({
			position: shadowRootHost.style.position,
			top: shadowRootHost.style.top,
			left: shadowRootHost.style.left,
			width: shadowRootHost.style.width,
			height: shadowRootHost.style.height,
			zIndex: shadowRootHost.style.zIndex,
			contextViewZIndex: contextView.getViewElement().style.zIndex
		}, {
			position: 'fixed',
			top: '0px',
			left: '0px',
			width: '0px',
			height: '0px',
			zIndex: '2576',
			contextViewZIndex: '2576'
		});

		contextView.dispose();
		container.remove();
	});

	test('hide() delays render disposal for close animations', () => {
		const clock = sinon.useFakeTimers();
		const container = $('.container');
		container.classList.add('modern-ui', 'monaco-enable-motion');
		const contextView = new ContextView(container, ContextViewDOMPosition.ABSOLUTE);

		let disposeCount = 0;
		const delegate: IDelegate = {
			getAnchor: () => ({ x: 0, y: 0 }),
			render: () => ({
				dispose: () => {
					disposeCount++;
				}
			}),
			closeAnimation: {
				className: 'closing',
				duration: 100,
				requiredAncestorClasses: ['modern-ui', 'monaco-enable-motion']
			}
		};

		contextView.show(delegate);
		contextView.hide();
		contextView.hide();

		assert.deepStrictEqual({
			disposeCount,
			hasClosingClass: contextView.getViewElement().classList.contains('closing'),
			animationDuration: contextView.getViewElement().style.getPropertyValue(CONTEXT_VIEW_CLOSE_ANIMATION_DURATION_VARIABLE),
			inert: contextView.getViewElement().inert
		}, {
			disposeCount: 0,
			hasClosingClass: true,
			animationDuration: '100ms',
			inert: true
		});

		clock.tick(100);

		assert.deepStrictEqual({
			disposeCount,
			hasClosingClass: contextView.getViewElement().classList.contains('closing'),
			animationDuration: contextView.getViewElement().style.getPropertyValue(CONTEXT_VIEW_CLOSE_ANIMATION_DURATION_VARIABLE),
			inert: contextView.getViewElement().inert
		}, {
			disposeCount: 1,
			hasClosingClass: false,
			animationDuration: '',
			inert: false
		});

		contextView.dispose();
		assert.strictEqual(disposeCount, 1);
		container.remove();
	});

	for (const domPosition of [ContextViewDOMPosition.ABSOLUTE, ContextViewDOMPosition.FIXED_SHADOW]) {
		for (const { name, classes, animate } of [
			{ name: 'Editor motion', classes: 'modern-ui monaco-enable-motion', animate: true },
			{ name: 'Agents glass motion', classes: 'agent-sessions-workbench modern-ui-frosted-glass monaco-enable-motion', animate: true },
			{ name: 'Agents without glass', classes: 'agent-sessions-workbench monaco-enable-motion', animate: false },
			{ name: 'Agents reduced motion', classes: 'agent-sessions-workbench modern-ui-frosted-glass monaco-reduce-motion', animate: false },
			{ name: 'Editor reduced motion', classes: 'modern-ui monaco-reduce-motion', animate: false },
			{ name: 'legacy motion', classes: 'monaco-enable-motion', animate: false },
		]) {
			test(`menu closing motion with ${name} in DOM position ${domPosition}`, () => {
				const clock = sinon.useFakeTimers();
				const container = $('.container');
				container.classList.add(...classes.split(' '));
				const contextView = store.add(new ContextView(container, domPosition));
				let hides = 0;
				let disposals = 0;
				contextView.show({
					getAnchor: () => ({ x: 0, y: 0 }),
					render: () => ({ dispose: () => disposals++ }),
					onHide: () => hides++,
					closeAnimation: contextViewMenuCloseAnimation,
				});

				const view = contextView.getViewElement();
				const read = () => ({
					hides,
					disposals,
					closing: view.classList.contains(CONTEXT_VIEW_MENU_MOTION_CLOSING_CLASS),
					hidden: view.style.display === 'none',
					inert: view.inert,
				});
				contextView.hide();
				contextView.hide();
				const initial = read();
				clock.tick(contextViewMenuCloseAnimation.duration - 1);
				const beforeEnd = read();
				clock.tick(1);

				const duringClose = { hides: 1, disposals: animate ? 0 : 1, closing: animate, hidden: !animate, inert: animate };
				assert.deepStrictEqual({ initial, beforeEnd, finished: read() }, {
					initial: duringClose,
					beforeEnd: duringClose,
					finished: { hides: 1, disposals: 1, closing: false, hidden: true, inert: false },
				});
			});
		}
	}

	test('positions absolute view when the container is position: static', () => {
		const host = $('.host');
		const spacer = $('.spacer');
		spacer.style.height = '60px';
		const container = $('.container');
		host.append(spacer, container);
		document.body.appendChild(host);

		const contextView = new ContextView(container, ContextViewDOMPosition.ABSOLUTE);
		contextView.show({
			getAnchor: () => ({ x: 100, y: 100, width: 1, height: 1 }),
			render: view => {
				view.style.width = '10px';
				view.style.height = '10px';
				return null;
			}
		});

		const position = getDomNodePagePosition(contextView.getViewElement());
		assert.deepStrictEqual({
			left: Math.round(position.left),
			top: Math.round(position.top)
		}, {
			left: 100,
			top: 101
		});

		contextView.dispose();
		host.remove();
	});

	test('positions absolute view in a bordered scrolling containing block', () => {
		const ancestor = $('.ancestor');
		ancestor.style.position = 'relative';
		ancestor.style.border = '10px solid transparent';
		ancestor.style.overflow = 'scroll';
		ancestor.style.width = '200px';
		ancestor.style.height = '200px';

		const container = $('.container');
		container.style.width = '500px';
		container.style.height = '500px';
		ancestor.appendChild(container);
		document.body.appendChild(ancestor);
		ancestor.scrollLeft = 30;
		ancestor.scrollTop = 40;

		const ancestorPosition = getDomNodePagePosition(ancestor);
		const anchor = {
			x: ancestorPosition.left + 100,
			y: ancestorPosition.top + 100,
			width: 1,
			height: 1
		};
		const contextView = new ContextView(container, ContextViewDOMPosition.ABSOLUTE);
		contextView.show({
			getAnchor: () => anchor,
			render: view => {
				view.style.width = '10px';
				view.style.height = '10px';
				return null;
			}
		});

		const position = getDomNodePagePosition(contextView.getViewElement());
		assert.deepStrictEqual({
			scrollLeft: ancestor.scrollLeft,
			scrollTop: ancestor.scrollTop,
			left: Math.round(position.left),
			top: Math.round(position.top)
		}, {
			scrollLeft: 30,
			scrollTop: 40,
			left: Math.round(anchor.x),
			top: Math.round(anchor.y + anchor.height)
		});

		contextView.dispose();
		ancestor.remove();
	});

	test('relayouts fixed view from the positioning origin', () => {
		const container = $('.container');
		document.body.appendChild(container);

		let anchorY = 100;
		const contextView = new ContextView(container, ContextViewDOMPosition.FIXED);
		contextView.show({
			getAnchor: () => ({ x: 100, y: anchorY, width: 1, height: 1 }),
			render: view => {
				view.textContent = 'x';
				view.style.width = '10px';
				view.style.height = '10px';
				return null;
			}
		});

		anchorY = 200;
		contextView.layout();

		const position = getDomNodePagePosition(contextView.getViewElement());
		assert.deepStrictEqual({
			left: Math.round(position.left),
			top: Math.round(position.top)
		}, {
			left: 100,
			top: 201
		});

		contextView.dispose();
		container.remove();
	});

	test('menu motion does not retain a containing block for submenus (#326248)', () => {
		const container = $('.container');
		container.classList.add('modern-ui', 'monaco-enable-motion');
		document.body.appendChild(container);

		const surface = $('.monaco-scrollable-element');
		const contextView = new ContextView(container, ContextViewDOMPosition.ABSOLUTE);
		contextView.show({
			getAnchor: () => ({ x: 0, y: 0 }),
			render: view => {
				view.appendChild(surface);
				return null;
			}
		});
		contextView.getViewElement().classList.add(CONTEXT_VIEW_MENU_MOTION_CLASS);

		const style = getWindow(surface).getComputedStyle(surface);
		assert.deepStrictEqual({
			animationFillMode: style.animationFillMode,
			willChange: style.willChange
		}, {
			animationFillMode: 'backwards',
			willChange: 'opacity'
		});

		contextView.dispose();
		container.remove();
	});

	suite('popover hosting', () => {

		let disposables: (() => void)[] = [];
		let unexpectedErrors: unknown[] = [];

		setup(() => {
			unexpectedErrors = [];
			const previousHandler = errorHandler.getUnexpectedErrorHandler();
			setUnexpectedErrorHandler(e => unexpectedErrors.push(e));
			disposables.push(() => setUnexpectedErrorHandler(previousHandler));
		});

		teardown(() => {
			for (const dispose of disposables.reverse()) {
				dispose();
			}
			disposables = [];
		});

		function createOwner(style = '') {
			const owner = $('.owner');
			owner.tabIndex = -1;
			owner.style.cssText = `position: absolute; top: 20px; left: 20px; width: 200px; height: 40px; overflow: hidden; transform: scale(0.97); ${style}`;
			const input = $('input') as HTMLInputElement;
			owner.appendChild(input);
			const outside = $('button.outside') as HTMLButtonElement;
			outside.textContent = 'outside';
			mainWindow.document.body.append(owner, outside);
			disposables.push(() => { owner.remove(); outside.remove(); });
			return { owner, input, outside };
		}

		function createDelegate(overrides: Partial<IDelegate> = {}) {
			const contexts: (IContextViewRenderContext | undefined)[] = [];
			const hides: unknown[] = [];
			let item: HTMLButtonElement | undefined;
			const delegate: IDelegate = {
				getAnchor: () => ({ x: 20, y: 200 }),
				render: (container, context) => {
					contexts.push(context);
					item = $('button.item') as HTMLButtonElement;
					item.textContent = 'item';
					container.appendChild(item);
					return null;
				},
				onHide: data => hides.push(data),
				...overrides
			};
			return { delegate, contexts, hides, item: () => item! };
		}

		function createContextView(owner: HTMLElement, domPosition: ContextViewDOMPosition, fallback?: HTMLElement) {
			const contextView = new ContextView(owner, domPosition, fallback ? { getFallbackContainer: () => fallback } : undefined);
			disposables.push(() => contextView.dispose());
			return contextView;
		}

		function isOpen(element: Element) {
			return element.matches(':popover-open');
		}

		test('hosts the view inside its owner as a manual popover in the top layer', () => {
			const { owner } = createOwner();
			const contextView = createContextView(owner, ContextViewDOMPosition.POPOVER);
			const { delegate, contexts, item } = createDelegate();

			contextView.show(delegate);

			const view = contextView.getViewElement();
			const itemRect = item().getBoundingClientRect();
			const ownerRect = owner.getBoundingClientRect();
			assert.deepStrictEqual({
				insideOwner: owner.contains(view),
				popover: view.getAttribute('popover'),
				open: isOpen(view),
				context: contexts,
				effectivePosition: contextView.getEffectiveDOMPosition(),
				itemBelowOwner: itemRect.top >= ownerRect.bottom,
				itemHittable: mainWindow.document.elementFromPoint(itemRect.left + 2, itemRect.top + 2) === item(),
				errors: unexpectedErrors.length
			}, {
				insideOwner: true,
				popover: 'manual',
				open: true,
				context: [{ domPosition: ContextViewDOMPosition.POPOVER }],
				effectivePosition: ContextViewDOMPosition.POPOVER,
				itemBelowOwner: true,
				itemHittable: true,
				errors: 0
			});

			contextView.hide();
			assert.strictEqual(isOpen(view), false);
		});

		test('hosts a shadow root popover inside its owner', () => {
			const { owner } = createOwner();
			const contextView = createContextView(owner, ContextViewDOMPosition.POPOVER_SHADOW);
			const { delegate, contexts } = createDelegate();

			contextView.show(delegate);

			const host = owner.querySelector('.shadow-root-host') as HTMLElement;
			const view = contextView.getViewElement();
			assert.deepStrictEqual({
				hostPopover: host.getAttribute('popover'),
				hostOpen: isOpen(host),
				viewPopover: view.hasAttribute('popover'),
				viewInShadow: view.getRootNode() === host.shadowRoot,
				context: contexts
			}, {
				hostPopover: 'manual',
				hostOpen: true,
				viewPopover: false,
				viewInShadow: true,
				context: [{ domPosition: ContextViewDOMPosition.POPOVER_SHADOW }]
			});

			contextView.hide();
			assert.strictEqual(isOpen(host), false);
		});

		test('falls back to a fixed position in the fallback container when showPopover throws, before rendering and without moving focus', () => {
			const { owner, input } = createOwner();
			const fallback = $('.fallback');
			mainWindow.document.body.appendChild(fallback);
			disposables.push(() => fallback.remove());
			const contextView = createContextView(owner, ContextViewDOMPosition.POPOVER, fallback);
			const errorsAtRender: number[] = [];
			const { delegate, contexts } = createDelegate();
			const render = delegate.render;
			delegate.render = (container, context) => {
				errorsAtRender.push(unexpectedErrors.length);
				return render(container, context);
			};
			const showPopover = sinon.stub(HTMLElement.prototype, 'showPopover').throws(new Error('showPopover failed'));
			input.focus();

			contextView.show(delegate);

			const view = contextView.getViewElement();
			assert.deepStrictEqual({
				showPopoverCalls: showPopover.callCount,
				errors: unexpectedErrors.length,
				errorsAtRender,
				context: contexts,
				effectivePosition: contextView.getEffectiveDOMPosition(),
				inFallback: fallback.contains(view),
				inOwner: owner.contains(view),
				popover: view.hasAttribute('popover'),
				position: view.style.position,
				focus: mainWindow.document.activeElement === input
			}, {
				showPopoverCalls: 1,
				errors: 1,
				errorsAtRender: [1],
				context: [{ domPosition: ContextViewDOMPosition.FIXED }],
				effectivePosition: ContextViewDOMPosition.FIXED,
				inFallback: true,
				inOwner: false,
				popover: false,
				position: 'fixed',
				focus: true
			});
		});

		test('falls back to a fixed shadow position in the owner document body when the owner is disconnected', () => {
			const owner = $('.owner');
			const contextView = createContextView(owner, ContextViewDOMPosition.POPOVER_SHADOW);
			const { delegate, contexts } = createDelegate();

			contextView.show(delegate);

			const host = mainWindow.document.body.querySelector(':scope > .shadow-root-host') as HTMLElement | null;
			assert.deepStrictEqual({
				errors: unexpectedErrors.length,
				context: contexts,
				hostInBody: !!host && host.shadowRoot === contextView.getViewElement().getRootNode(),
				hostPopover: host?.hasAttribute('popover')
			}, {
				errors: 1,
				context: [{ domPosition: ContextViewDOMPosition.FIXED_SHADOW }],
				hostInBody: true,
				hostPopover: false
			});
		});

		test('restores focus to the element focused before show when hiding', () => {
			const { owner, input } = createOwner();
			const contextView = createContextView(owner, ContextViewDOMPosition.POPOVER);
			const { delegate, item } = createDelegate({ focus: () => item().focus() });
			input.focus();

			contextView.show(delegate);
			const focusWhileShown = mainWindow.document.activeElement === item();
			contextView.hide();

			assert.deepStrictEqual({ focusWhileShown, focusAfterHide: mainWindow.document.activeElement === input }, { focusWhileShown: true, focusAfterHide: true });
		});

		test('does not steal focus back when it already moved elsewhere', () => {
			const { owner, input, outside } = createOwner();
			const contextView = createContextView(owner, ContextViewDOMPosition.POPOVER);
			const { delegate } = createDelegate();
			input.focus();

			contextView.show(delegate);
			outside.focus();
			contextView.hide();

			assert.strictEqual(mainWindow.document.activeElement, outside);
		});

		test('legacy positions neither use popovers nor restore focus', () => {
			const { owner, input } = createOwner();
			const contextView = createContextView(owner, ContextViewDOMPosition.FIXED);
			const { delegate, contexts, item } = createDelegate({ focus: () => item().focus() });
			input.focus();

			contextView.show(delegate);
			const popover = contextView.getViewElement().hasAttribute('popover');
			contextView.hide();

			assert.deepStrictEqual({ popover, context: contexts, focusRestored: mainWindow.document.activeElement === input }, { popover: false, context: [{ domPosition: ContextViewDOMPosition.FIXED }], focusRestored: false });
		});

		test('hides without restoring focus on a pointer press outside the view and its owner', () => {
			const { owner, input, outside } = createOwner();
			const contextView = createContextView(owner, ContextViewDOMPosition.POPOVER);
			const { delegate, hides, item } = createDelegate({ focus: () => item().focus() });
			input.focus();
			contextView.show(delegate);

			item().dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, composed: true }));
			input.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, composed: true }));
			const hidesInside = hides.length;
			outside.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, composed: true }));

			assert.deepStrictEqual({
				hidesInside,
				hidesOutside: hides.length,
				open: isOpen(contextView.getViewElement()),
				focusRestored: mainWindow.document.activeElement === input
			}, { hidesInside: 0, hidesOutside: 1, open: false, focusRestored: false });
		});

		test('keeps keys pressed in the view from reaching the owner and the window', () => {
			const { owner, input } = createOwner();
			const contextView = createContextView(owner, ContextViewDOMPosition.POPOVER);
			const { delegate, item } = createDelegate();
			contextView.show(delegate);
			const received: string[] = [];
			const onOwner = (e: KeyboardEvent) => received.push(`owner:${e.type}:${(e.target as HTMLElement).className}`);
			const onWindow = (e: KeyboardEvent) => received.push(`window:${e.type}:${(e.target as HTMLElement).className}`);
			for (const type of ['keydown', 'keyup', 'keypress'] as const) {
				owner.addEventListener(type, onOwner);
				mainWindow.addEventListener(type, onWindow);
				disposables.push(() => { owner.removeEventListener(type, onOwner); mainWindow.removeEventListener(type, onWindow); });
			}

			for (const type of ['keydown', 'keyup', 'keypress']) {
				item().dispatchEvent(new KeyboardEvent(type, { key: 'Enter', bubbles: true, composed: true }));
			}
			input.className = 'input';
			input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, composed: true }));

			assert.deepStrictEqual(received, ['owner:keydown:input', 'window:keydown:input']);
		});

		test('hides without restoring focus on layout when the owner is removed or hidden', () => {
			for (const lose of [(owner: HTMLElement) => owner.remove(), (owner: HTMLElement) => owner.style.display = 'none']) {
				const { owner, input } = createOwner();
				const contextView = createContextView(owner, ContextViewDOMPosition.POPOVER);
				const { delegate, hides } = createDelegate();
				input.focus();
				contextView.show(delegate);

				lose(owner);
				contextView.layout();

				assert.deepStrictEqual({ hides: hides.length, open: isOpen(contextView.getViewElement()) }, { hides: 1, open: false });
			}
		});

		test('hides when the owner is removed or hidden without a layout', async () => {
			for (const lose of [(owner: HTMLElement) => owner.remove(), (owner: HTMLElement) => owner.style.display = 'none']) {
				const { owner } = createOwner();
				const contextView = createContextView(owner, ContextViewDOMPosition.POPOVER);
				const hidden = new DeferredPromise<void>();
				let hideCount = 0;
				const { delegate } = createDelegate({ onHide: () => { hideCount++; hidden.complete(); } });
				contextView.show(delegate);
				await timeout(50);

				lose(owner);
				await hidden.p;

				assert.strictEqual(hideCount, 1);
			}
		});

		test('stays open while a rendered owner has zero size', async () => {
			const { owner } = createOwner();
			const contextView = createContextView(owner, ContextViewDOMPosition.POPOVER);
			const { delegate, hides } = createDelegate();
			contextView.show(delegate);

			owner.style.width = '0';
			owner.style.height = '0';
			await timeout(100);
			contextView.layout();

			assert.deepStrictEqual({ hides: hides.length, open: isOpen(contextView.getViewElement()) }, { hides: 0, open: true });
			contextView.hide();
		});

		test('rebuilds the view when switching between popover and legacy hosting', () => {
			const { owner } = createOwner();
			const contextView = createContextView(owner, ContextViewDOMPosition.POPOVER);
			const { delegate, hides } = createDelegate();
			contextView.show(delegate);
			const view = contextView.getViewElement();

			contextView.setContainer(owner, ContextViewDOMPosition.FIXED);
			const afterSwitch = { hides: hides.length, open: isOpen(view), popover: view.hasAttribute('popover'), inset: view.style.inset, inOwner: owner.contains(view) };

			contextView.setContainer(owner, ContextViewDOMPosition.POPOVER);
			contextView.show(delegate);
			const afterSwitchBack = { popover: view.getAttribute('popover'), open: isOpen(view) };
			contextView.hide();

			assert.deepStrictEqual({ afterSwitch, afterSwitchBack }, {
				afterSwitch: { hides: 1, open: false, popover: false, inset: '', inOwner: true },
				afterSwitchBack: { popover: 'manual', open: true }
			});
		});

		test('restores focus immediately and keeps the popover open until the close animation completes', async () => {
			const { owner, input } = createOwner();
			const contextView = createContextView(owner, ContextViewDOMPosition.POPOVER);
			const { delegate, item } = createDelegate({ focus: () => item().focus(), closeAnimation: { className: 'closing', duration: 50 } });
			input.focus();
			contextView.show(delegate);
			const view = contextView.getViewElement();

			contextView.hide();
			const during = { focusRestored: mainWindow.document.activeElement === input, open: isOpen(view), inert: view.inert };
			await timeout(100);
			const after = { open: isOpen(view), inert: view.inert };

			assert.deepStrictEqual({ during, after }, {
				during: { focusRestored: true, open: true, inert: true },
				after: { open: false, inert: false }
			});
		});

		test('closes the popover when disposed', () => {
			const { owner } = createOwner();
			const contextView = new ContextView(owner, ContextViewDOMPosition.POPOVER);
			const { delegate, hides } = createDelegate();
			contextView.show(delegate);
			const view = contextView.getViewElement();

			contextView.dispose();

			assert.deepStrictEqual({ hides: hides.length, open: isOpen(view), inOwner: owner.contains(view) }, { hides: 1, open: false, inOwner: false });
		});
	});
});
