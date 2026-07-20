/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import sinon from 'sinon';
import { $ } from '../../../../browser/dom.js';
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

	test('menu motion CSS must not create a containing block on scrollable element (#326593)', () => {
		// The menu motion CSS is injected as a global style sheet when ContextView
		// is instantiated. We create a throwaway instance to trigger the injection,
		// then verify that the generated CSS rules for .monaco-scrollable-element do
		// not set properties that create a CSS containing block (will-change:transform,
		// animation-fill-mode:both with a transform keyframe). Such a containing block
		// causes position:fixed submenu flyouts to be clipped by the scrollable
		// element's overflow:hidden.

		const container = $('.container');
		container.classList.add('style-override', 'monaco-enable-motion');
		const contextView = new ContextView(container, ContextViewDOMPosition.ABSOLUTE);

		// Find the motion style sheet(s) – they contain 'context-view-menu-motion'
		const sheets = Array.from(document.querySelectorAll('style'))
			.filter(s => s.textContent?.includes(CONTEXT_VIEW_MENU_MOTION_CLASS));
		assert.ok(sheets.length > 0, 'motion style sheet should be injected');

		const css = sheets.map(s => s.textContent).join('\n');

		// Verify will-change on the scrollable-element selector does NOT include 'transform'.
		// will-change:transform creates a containing block for position:fixed descendants.
		const scrollableRuleMatch = css.match(
			/\.context-view\.context-view-menu-motion\s*>\s*\.monaco-scrollable-element\s*\{([^}]+)\}/
		);
		assert.ok(scrollableRuleMatch, 'should find a scrollable-element motion rule');
		const ruleBody = scrollableRuleMatch[1];

		const willChangeMatch = ruleBody.match(/will-change\s*:\s*([^;]+)/);
		if (willChangeMatch) {
			assert.ok(
				!willChangeMatch[1].includes('transform'),
				`will-change must not include 'transform' (creates containing block); got: ${willChangeMatch[1].trim()}`
			);
		}

		// Verify the open animation does not use fill-mode 'both', which retains the
		// final transform:scale(1) keyframe value and creates a containing block.
		const animationMatch = ruleBody.match(/animation\s*:\s*([^;]+)/);
		assert.ok(animationMatch, 'should find an animation property');
		assert.ok(
			!animationMatch[1].includes('both'),
			`open animation fill-mode must not be 'both' (retains transform, creates containing block); got: ${animationMatch[1].trim()}`
		);

		contextView.dispose();
		container.remove();
	});
});
