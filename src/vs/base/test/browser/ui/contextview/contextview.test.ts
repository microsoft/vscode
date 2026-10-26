/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import sinon from 'sinon';
import { $, getDomNodePagePosition, getWindow } from '../../../../browser/dom.js';
import { CONTEXT_VIEW_CLOSE_ANIMATION_DURATION_VARIABLE, CONTEXT_VIEW_MENU_MOTION_CLASS, CONTEXT_VIEW_MENU_MOTION_CLOSING_CLASS, ContextView, ContextViewDOMPosition, contextViewMenuCloseAnimation, IDelegate } from '../../../../browser/ui/contextview/contextview.js';
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
});
