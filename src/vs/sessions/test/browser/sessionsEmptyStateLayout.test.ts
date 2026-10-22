/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $, append } from '../../../base/browser/dom.js';
import { mainWindow } from '../../../base/browser/window.js';
import { toDisposable } from '../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { SessionsEmptyStateLayout } from '../../browser/parts/sessionsEmptyStateLayout.js';

suite('Sessions - Empty state layout', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('aligns the first button with search fields and status text above it', () => {
		const observers: TestResizeObserver[] = [];
		class TestResizeObserver implements ResizeObserver {
			constructor(readonly callback: ResizeObserverCallback) { observers.push(this); }
			observe(): void { }
			unobserve(): void { }
			disconnect(): void { }
		}
		const fixtures = [
			{ name: 'main', header: 0, toolbar: 0, heights: [84], status: 0 },
			{ name: 'main-with-extra-action', header: 0, toolbar: 0, heights: [112], status: 0 },
			{ name: 'files', header: 35, toolbar: 0, heights: [98], status: 42 },
			{ name: 'browser', header: 35, toolbar: 32, heights: [56], status: 0 },
			{ name: 'search', header: 35, toolbar: 0, heights: [26, 56], status: 0 },
			{ name: 'search-with-multiline-query', header: 35, toolbar: 0, heights: [52, 56], status: 0 },
			{ name: 'changes', header: 35, toolbar: 0, heights: [90], status: 34 },
			{ name: 'changes-with-wrapped-status', header: 35, toolbar: 0, heights: [108], status: 52 },
		].map(options => {
			const group = append(mainWindow.document.body, $('.editor-group-container'));
			group.style.cssText = 'position: relative; width: 400px; height: 400px; display: flex; flex-direction: column;';
			store.add(toDisposable(() => group.remove()));
			const header = append(group, $('div'));
			header.style.flex = `0 0 ${options.header}px`;
			const container = append(group, $('div'));
			container.style.cssText = 'display: flex; flex-direction: column; flex: 1; min-height: 0;';
			if (options.toolbar) {
				const toolbar = append(container, $('div'));
				toolbar.style.flex = `0 0 ${options.toolbar}px`;
			}
			const elements = options.heights.map(height => {
				const element = append(container, $('div'));
				element.style.cssText = `flex: 0 0 ${height}px;`;
				return element;
			});
			elements[0].style.marginTop = 'auto';
			elements.at(-1)!.style.marginBottom = 'auto';
			if (elements.length > 1) {
				elements[0].style.marginBottom = '16px';
			}
			const anchor = options.status ? append(elements[0], $('button')) : elements.at(-1)!;
			if (options.status) {
				anchor.style.cssText = `display: block; position: relative; top: ${options.status}px; height: 28px;`;
			}
			store.add(new SessionsEmptyStateLayout(container, elements, anchor, TestResizeObserver));
			return { ...options, group, headerElement: header, elements, anchor };
		});
		const results = [];
		for (const height of [400, 640]) {
			for (const headerHeight of [28, 35]) {
				for (const fixture of fixtures) {
					fixture.group.style.height = `${height}px`;
					fixture.headerElement.style.flexBasis = `${fixture.header ? headerHeight : 0}px`;
				}
				for (const observer of observers) {
					observer.callback([], observer);
				}
				results.push(...fixtures.map(fixture => {
					const groupBounds = fixture.group.getBoundingClientRect();
					const firstButtonTop = fixture.anchor.getBoundingClientRect().top;
					const mainFirstRowTop = (groupBounds.top + groupBounds.bottom) / 2 - 42;
					return {
						name: fixture.name,
						height,
						headerHeight,
						firstButtonAligned: Math.abs(firstButtonTop - mainFirstRowTop) < 1,
					};
				}));
			}
		}
		assert.deepStrictEqual(results, results.map(result => ({ ...result, firstButtonAligned: true })));
	});

	test('observes only alignment targets and preceding toolbars while following header changes', () => {
		const observed: Element[] = [];
		let observer: TestResizeObserver | undefined;
		class TestResizeObserver implements ResizeObserver {
			constructor(readonly callback: ResizeObserverCallback) { observer = this; }
			observe(target: Element): void { observed.push(target); }
			unobserve(): void { }
			disconnect(): void { }
		}
		const group = append(mainWindow.document.body, $('.editor-group-container'));
		group.style.cssText = 'height: 220px; width: 400px; display: flex; flex-direction: column;';
		store.add(toDisposable(() => group.remove()));
		const header = append(group, $('div'));
		header.style.flex = '0 0 35px';
		const wrapper = append(group, $('div'));
		wrapper.style.cssText = 'display: flex; flex: 1; min-height: 0;';
		const container = append(wrapper, $('div'));
		container.style.cssText = 'display: flex; flex-direction: column; flex: 1; min-height: 0;';
		const toolbar = append(container, $('div'));
		toolbar.style.flex = '0 0 20px';
		const content = append(container, $('div'));
		content.style.cssText = 'flex: 0 0 56px; margin: auto 0;';
		const anchor = append(content, $('button'));
		anchor.style.cssText = 'display: block; height: 28px;';
		const unrelated = append(container, $('div'));
		unrelated.style.cssText = 'position: absolute; height: 10px;';
		store.add(new SessionsEmptyStateLayout(container, [content], anchor, TestResizeObserver));
		assert.ok(observer);
		const geometry = () => ({
			aligned: Math.abs(anchor.getBoundingClientRect().top - (group.getBoundingClientRect().top + group.getBoundingClientRect().bottom) / 2 + 42) < 1,
			belowToolbar: content.getBoundingClientRect().top >= toolbar.getBoundingClientRect().bottom,
			insidePanel: content.getBoundingClientRect().bottom <= group.getBoundingClientRect().bottom,
		});
		const before = geometry();
		header.style.flexBasis = '40px';
		toolbar.style.flexBasis = '80px';
		observer.callback([], observer);
		const clamped = geometry();
		group.style.height = '400px';
		observer.callback([], observer);
		assert.deepStrictEqual({
			targets: observed.map(element => element === container ? 'container' : element === group ? 'group' : element === anchor ? 'anchor' : element === content ? 'content' : element === toolbar ? 'toolbar' : 'unrelated'),
			before,
			clamped,
			resized: geometry(),
		}, {
			targets: ['container', 'group', 'anchor', 'content', 'toolbar'],
			before: { aligned: true, belowToolbar: true, insidePanel: true },
			clamped: { aligned: false, belowToolbar: true, insidePanel: true },
			resized: { aligned: true, belowToolbar: true, insidePanel: true },
		});
	});

	test('clamps short panels below the toolbar and cleans up positioning on dispose', () => {
		let disconnected = false;
		class TestResizeObserver implements ResizeObserver {
			observe(): void { }
			unobserve(): void { }
			disconnect(): void { disconnected = true; }
		}
		const group = append(mainWindow.document.body, $('.editor-group-container'));
		group.style.cssText = 'height: 160px; width: 400px; display: flex; flex-direction: column;';
		store.add(toDisposable(() => group.remove()));
		const header = append(group, $('div'));
		header.style.flex = '0 0 35px';
		const container = append(group, $('div'));
		container.style.cssText = 'flex: 1; min-height: 0; display: flex; flex-direction: column;';
		const toolbar = append(container, $('div'));
		toolbar.style.flex = '0 0 48px';
		const content = append(container, $('div'));
		content.style.cssText = 'flex: 0 0 56px; margin: auto 0;';
		const layout = store.add(new SessionsEmptyStateLayout(container, [content], content, TestResizeObserver));
		const contentBounds = content.getBoundingClientRect();
		const before = {
			belowToolbar: contentBounds.top >= toolbar.getBoundingClientRect().bottom,
			insidePanel: contentBounds.bottom <= group.getBoundingClientRect().bottom,
		};
		layout.dispose();
		assert.deepStrictEqual({
			before,
			disconnected,
			positioningRemoved: !content.classList.contains('sessions-empty-state-aligned') && content.style.translate === '',
		}, {
			before: { belowToolbar: true, insidePanel: true },
			disconnected: true,
			positioningRemoved: true,
		});
	});
});
