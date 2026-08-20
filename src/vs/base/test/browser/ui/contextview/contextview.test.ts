/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import sinon from 'sinon';
import { $, getDomNodePagePosition, getWindow } from '../../../../browser/dom.js';
import { CONTEXT_VIEW_CLOSE_ANIMATION_DURATION_VARIABLE, CONTEXT_VIEW_MENU_MOTION_CLASS, ContextView, ContextViewDOMPosition, IDelegate } from '../../../../browser/ui/contextview/contextview.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../common/utils.js';

suite('ContextView', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

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
