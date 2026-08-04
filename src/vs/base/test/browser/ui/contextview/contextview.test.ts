/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import sinon from 'sinon';
import { $, getWindow } from '../../../../browser/dom.js';
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
		container.classList.add('style-override', 'monaco-enable-motion');
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
				requiredAncestorClasses: ['style-override', 'monaco-enable-motion']
			}
		};

		contextView.show(delegate);
		contextView.hide();
		contextView.hide();

		assert.deepStrictEqual({
			disposeCount,
			hasClosingClass: contextView.getViewElement().classList.contains('closing'),
			animationDuration: contextView.getViewElement().style.getPropertyValue(CONTEXT_VIEW_CLOSE_ANIMATION_DURATION_VARIABLE)
		}, {
			disposeCount: 0,
			hasClosingClass: true,
			animationDuration: '100ms'
		});

		clock.tick(100);

		assert.deepStrictEqual({
			disposeCount,
			hasClosingClass: contextView.getViewElement().classList.contains('closing'),
			animationDuration: contextView.getViewElement().style.getPropertyValue(CONTEXT_VIEW_CLOSE_ANIMATION_DURATION_VARIABLE)
		}, {
			disposeCount: 1,
			hasClosingClass: false,
			animationDuration: ''
		});

		contextView.dispose();
		assert.strictEqual(disposeCount, 1);
		container.remove();
	});

	test('positions absolute view relative to the containing block when the container is position: static', () => {
		// The containing block for an absolutely positioned element is the nearest
		// positioned ancestor (offsetParent), which is not necessarily the container
		// the context view is appended to. When the container is position: static
		// (the default) and sits offset inside a positioned ancestor, positioning the
		// view relative to the container instead of the ancestor pushed it off-screen.
		const ancestor = $('.ancestor');
		ancestor.style.position = 'relative';

		// A spacer offsets the (statically positioned) container inside the ancestor,
		// so the container's page position differs from the containing block's.
		const spacer = $('.spacer');
		spacer.style.height = '60px';

		const container = $('.container'); // position: static (default)
		ancestor.appendChild(spacer);
		ancestor.appendChild(container);
		document.body.appendChild(ancestor);

		const anchorY = 100;
		const contextView = new ContextView(container, ContextViewDOMPosition.ABSOLUTE);
		contextView.show({
			getAnchor: () => ({ x: 0, y: anchorY, width: 0, height: 0 }),
			render: view => {
				view.textContent = 'x';
				return null;
			}
		});

		// The view must render at the anchor's page position. Anchoring it to the
		// container (60px lower) instead of the containing block would render it
		// ~60px too high.
		const viewTop = contextView.getViewElement().getBoundingClientRect().top;
		assert.ok(
			Math.abs(viewTop - anchorY) <= 8,
			`expected view to render near anchor y=${anchorY}, got ${viewTop}`
		);

		contextView.dispose();
		ancestor.remove();
	});

	test('menu motion does not retain a containing block for submenus (#326248)', () => {
		const container = $('.container');
		container.classList.add('style-override', 'monaco-enable-motion');
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
