/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import sinon from 'sinon';
import * as dom from '../../../../../../../base/browser/dom.js';
import { getZoomLevel, setZoomLevel } from '../../../../../../../base/browser/browser.js';
import { timeout } from '../../../../../../../base/common/async.js';
import { toDisposable } from '../../../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { ChatInputPickerResponsiveLayout } from '../../../../browser/widget/input/chatInputPickerResponsiveLayout.js';
import { renderChatInputPickerSplit } from '../../../../browser/widget/input/chatInputPickerActionItem.js';
import '../../../../browser/widget/input/modelPicker/media/modelPicker.css';
import '../../../../browser/widget/media/chat.css';

suite('ChatInputPickerResponsiveLayout', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	let host: HTMLElement;

	setup(() => {
		host = dom.append(document.body, dom.$('.chat-input-picker-responsive-layout-test'));
	});

	teardown(() => {
		sinon.restore();
		host.remove();
	});

	function createPickerLane(width: number, expandedWidths: number[], usePreferredWidth = false, resizeObserverCtor?: typeof ResizeObserver) {
		const lane = dom.append(host, dom.$('.picker-lane'));
		lane.style.display = 'flex';
		lane.style.width = `${width}px`;
		lane.style.overflow = 'hidden';

		const items = expandedWidths.map(expandedWidth => {
			const picker = dom.append(lane, dom.$('.picker'));
			picker.style.flex = '0 0 auto';
			picker.style.width = `${expandedWidth}px`;
			const label = dom.append(picker, dom.$('.picker-label'));
			label.style.display = 'block';
			label.style.width = `${expandedWidth}px`;
			let compact = false;
			return {
				element: picker,
				isCompact: () => compact,
				setCompact: (value: boolean) => {
					compact = value;
					picker.style.width = value ? '20px' : `${expandedWidth}px`;
					label.style.display = value ? 'none' : 'block';
				},
			};
		});
		const relayout = sinon.spy();
		const layout = store.add(new ChatInputPickerResponsiveLayout('test.measuredPickerLane', lane, {
			getItems: () => items,
			usePreferredWidth,
			relayout,
		}, resizeObserverCtor));
		return { lane, items, layout, relayout };
	}

	async function waitForLayout(): Promise<void> {
		const targetWindow = dom.getWindow(host);
		await new Promise<void>(resolve => targetWindow.requestAnimationFrame(() => targetWindow.requestAnimationFrame(() => resolve())));
	}

	test('intrinsic sizing ignores intermediate reveal widths and restores labels', () => {
		const { lane, items, layout } = createPickerLane(260, [80, 80, 80], true);
		for (const item of items) {
			const animation = item.element.animate([{ width: '20px' }, { width: '80px' }], { duration: 1000 });
			store.add(toDisposable(() => animation.cancel()));
			animation.pause();
			animation.currentTime = 0;
		}
		layout.layout();
		const wide = items.map(item => item.isCompact());
		lane.style.width = '180px';
		layout.layout();
		const narrow = items.map(item => item.isCompact());
		lane.style.width = '260px';
		layout.layout();
		assert.deepStrictEqual({ wide, narrow, restored: items.map(item => item.isCompact()) }, {
			wide: [false, false, false],
			narrow: [false, false, true],
			restored: [false, false, false],
		});
	});

	test('uses the rendered picker width instead of a viewport threshold', () => {
		const lane = dom.append(host, dom.$('.picker-lane'));
		lane.style.display = 'flex';
		lane.style.width = '120px';
		lane.style.overflow = 'hidden';

		const picker = dom.append(lane, dom.$('.picker'));
		picker.style.flex = '0 0 auto';
		picker.style.width = '240px';

		let compact = false;
		let expandedWidth = 240;
		const layout = store.add(new ChatInputPickerResponsiveLayout('test.pickerLane', lane, {
			getItems: () => [{
				element: picker,
				isCompact: () => compact,
				setCompact: value => {
					compact = value;
					picker.style.width = value ? '20px' : `${expandedWidth}px`;
				},
			}],
		}));

		layout.layout();
		const narrow = compact;

		lane.style.width = '300px';
		layout.layout();
		const expandedAfterLaneGrows = compact;

		lane.style.width = '120px';
		expandedWidth = 80;
		picker.style.width = `${expandedWidth}px`;
		layout.layout();
		const wideEnoughForCurrentItems = compact;

		assert.deepStrictEqual({ narrow, expandedAfterLaneGrows, wideEnoughForCurrentItems }, {
			narrow: true,
			expandedAfterLaneGrows: false,
			wideEnoughForCurrentItems: false,
		});
	});

	test('compacts picker items from right to left until the lane fits', () => {
		const lane = dom.append(host, dom.$('.picker-lane'));
		lane.style.display = 'flex';
		lane.style.width = '180px';
		lane.style.overflow = 'hidden';

		const compact = [false, false, false];
		const pickers = compact.map((_, index) => {
			const picker = dom.append(lane, dom.$(`.picker-${index}`));
			picker.style.flex = '0 0 auto';
			picker.style.width = '80px';
			return picker;
		});
		const layout = store.add(new ChatInputPickerResponsiveLayout('test.progressivePickerLane', lane, {
			getItems: () => pickers.map((picker, index) => ({
				element: picker,
				isCompact: () => compact[index],
				setCompact: value => {
					compact[index] = value;
					picker.style.width = value ? '20px' : '80px';
				},
			})),
		}));

		layout.layout();
		const firstCollision = [...compact];

		lane.style.width = '130px';
		layout.layout();
		const secondCollision = [...compact];

		lane.style.width = '240px';
		layout.layout();
		const expanded = [...compact];

		assert.deepStrictEqual({ firstCollision, secondCollision, expanded }, {
			firstCollision: [false, false, true],
			secondCollision: [false, true, true],
			expanded: [false, false, false],
		});
	});

	test('restores expanded items when compaction is disabled', () => {
		const lane = dom.append(host, dom.$('.picker-lane'));
		lane.style.display = 'flex';
		lane.style.width = '80px';
		lane.style.overflow = 'auto';

		let compact = true;
		let compactionEnabled = false;
		const picker = dom.append(lane, dom.$('.picker'));
		picker.style.flex = '0 0 auto';
		const layout = store.add(new ChatInputPickerResponsiveLayout('test.scrollablePickerLane', lane, {
			isCompactionEnabled: () => compactionEnabled,
			getItems: () => [{
				element: picker,
				isCompact: () => compact,
				setCompact: value => {
					compact = value;
					picker.style.width = value ? '20px' : '120px';
				},
			}],
		}));

		layout.layout();
		const expandedForScrolling = compact;
		compactionEnabled = true;
		layout.layout();

		assert.deepStrictEqual({ expandedForScrolling, compactAfterEnabling: compact }, {
			expandedForScrolling: false,
			compactAfterEnabling: true,
		});
	});

	test('measures each necessary presentation once and reuses it across resizes', () => {
		const { lane, items, layout } = createPickerLane(130, [80, 80, 80]);
		const clone = sinon.spy(lane, 'cloneNode');

		layout.layout();
		const initialMeasurements = clone.callCount;
		lane.style.width = '300px';
		layout.layout();
		lane.style.width = '130px';
		layout.layout();

		assert.deepStrictEqual({
			compact: items.map(item => item.isCompact()),
			initialMeasurements,
			repeatedMeasurements: clone.callCount - initialMeasurements,
		}, {
			compact: [false, true, true],
			initialMeasurements: 3,
			repeatedMeasurements: 0,
		});
	});

	test('fits exact boundaries with the existing width tolerance', () => {
		const { lane, items, layout } = createPickerLane(240, [80, 80, 80]);
		const results = [240, 239, 238, 180, 179, 178, 240].map(width => {
			lane.style.width = `${width}px`;
			layout.layout();
			return items.map(item => item.isCompact());
		});
		assert.deepStrictEqual(results, [
			[false, false, false],
			[false, false, false],
			[false, false, true],
			[false, false, true],
			[false, false, true],
			[false, true, true],
			[false, false, false],
		]);
	});

	test('does not measure, relayout or reapply an unchanged presentation', () => {
		const { lane, items, layout, relayout } = createPickerLane(180, [80, 80, 80]);
		layout.layout();
		relayout.resetHistory();
		const clone = sinon.spy(lane, 'cloneNode');
		const applications = items.map(item => sinon.spy(item, 'setCompact'));
		for (let index = 0; index < 5; index++) {
			layout.layout();
		}
		lane.style.width = '190px';
		layout.layout();
		assert.deepStrictEqual({
			measurements: clone.callCount,
			relayouts: relayout.callCount,
			applications: applications.map(application => application.callCount),
			compact: items.map(item => item.isCompact()),
		}, { measurements: 0, relayouts: 0, applications: [0, 0, 0], compact: [false, false, true] });
	});

	for (const usePreferredWidth of [false, true]) {
		test(`preserves primary toolbar spacing at fitting boundaries (preferred width: ${usePreferredWidth})`, () => {
			host.classList.add('interactive-session');
			host.style.setProperty('--vscode-spacing-size60', '6px');
			host.style.setProperty('--vscode-codiconFontSize-compact', '12px');
			const toolbars = dom.append(host, dom.$('.chat-input-toolbars'));
			const lane = dom.append(toolbars, dom.$('.monaco-toolbar.chat-input-toolbar'));
			lane.style.flex = 'none';
			lane.style.width = 'max-content';
			const actions = dom.append(dom.append(lane, dom.$('.monaco-action-bar')), dom.$('ul.actions-container'));
			const items = ['Agent', 'Plan'].map(name => {
				const element = dom.append(actions, dom.$('li.action-item.chat-input-picker-item.chat-mode-picker-item'));
				const button = dom.append(element, dom.$('a.action-label', { role: 'button', tabindex: 0, 'aria-label': name }));
				const icon = dom.append(button, dom.$('span.codicon'));
				const label = dom.append(button, dom.$('span.chat-input-picker-label', undefined, name));
				let compact = false;
				return {
					element,
					button,
					label,
					isCompact: () => compact,
					setCompact: (value: boolean) => {
						compact = value;
						element.classList.toggle('compact-picker', value);
						button.classList.toggle('compact', value);
						button.classList.toggle('icon-only', value);
						dom.reset(button, icon, ...(value ? [] : [label]));
					},
				};
			});
			const expandedWidth = lane.getBoundingClientRect().width;
			const labelSpacing = items.map(item => dom.getWindow(lane).getComputedStyle(item.label).marginLeft);
			const layout = store.add(new ChatInputPickerResponsiveLayout('test.primaryToolbarSpacing', lane, {
				getItems: () => items,
				usePreferredWidth,
			}));
			const clone = sinon.spy(lane, 'cloneNode');
			items[0].button.focus();
			const states = [expandedWidth, expandedWidth - 1, expandedWidth - 2, expandedWidth - 1, expandedWidth - 2, expandedWidth].map(width => {
				lane.style.width = `${width}px`;
				layout.layout();
				return items.map(item => item.isCompact());
			});
			assert.deepStrictEqual({
				labelSpacing,
				states,
				measurements: clone.callCount,
				focusPreserved: document.activeElement === items[0].button,
				ariaLabels: items.map(item => item.button.getAttribute('aria-label')),
			}, {
				labelSpacing: ['6px', '6px'],
				states: [[false, false], [false, false], [false, true], [false, false], [false, true], [false, false]],
				measurements: 2,
				focusPreserved: true,
				ariaLabels: ['Agent', 'Plan'],
			});
		});
	}

	test('invalidates labels that grow and shrink while compact', () => {
		const lane = dom.append(host, dom.$('.picker-lane'));
		lane.style.cssText = 'display: flex; width: 120px';
		const picker = dom.append(lane, dom.$('button'));
		picker.style.cssText = 'flex: none; padding: 0; border: 0';
		const label = dom.append(picker, dom.$('span'));
		label.style.whiteSpace = 'nowrap';
		label.textContent = 'Short';
		picker.setAttribute('aria-label', 'Choose a model');
		let compact = false;
		const layout = store.add(new ChatInputPickerResponsiveLayout('test.labelInvalidation', lane, {
			getItems: () => [{
				element: picker,
				isCompact: () => compact,
				setCompact: value => {
					compact = value;
					picker.style.width = value ? '20px' : '';
					label.style.display = value ? 'none' : '';
				},
			}],
		}));
		layout.layout();
		picker.focus();
		label.textContent = 'A much longer model label that cannot fit';
		layout.layout();
		const afterGrowing = compact;
		label.textContent = 'Tiny';
		layout.layout();
		assert.deepStrictEqual({
			afterGrowing,
			afterShrinking: compact,
			focusPreserved: document.activeElement === picker,
			ariaLabel: picker.getAttribute('aria-label'),
		}, { afterGrowing: true, afterShrinking: false, focusPreserved: true, ariaLabel: 'Choose a model' });
	});

	test('invalidates changed membership and replacement elements', () => {
		const { lane, items, layout } = createPickerLane(180, [80, 80, 80]);
		layout.layout();
		const removed = items.shift()!;
		removed.element.remove();
		layout.layout();
		const afterRemoval = items.map(item => item.isCompact());
		items[0].element.remove();
		const replacement = dom.prepend(lane, dom.$('.picker'));
		replacement.style.cssText = 'flex: none; width: 140px';
		let compact = false;
		items[0] = {
			element: replacement,
			isCompact: () => compact,
			setCompact: value => {
				compact = value;
				replacement.style.width = value ? '20px' : '140px';
			},
		};
		layout.layout();
		assert.deepStrictEqual({ afterRemoval, afterReplacement: items.map(item => item.isCompact()) }, {
			afterRemoval: [false, false],
			afterReplacement: [false, true],
		});
	});

	test('invalidates intrinsic styles but not lane dimension changes', () => {
		const { lane, items, layout } = createPickerLane(100, [80]);
		const label = items[0].element.firstElementChild as HTMLElement;
		label.style.width = 'var(--picker-label-width, 80px)';
		layout.layout();
		lane.style.setProperty('--picker-label-width', '160px');
		layout.layout();
		const afterStyleChange = items[0].isCompact();
		lane.style.setProperty('--picker-label-width', '40px');
		layout.layout();
		const clone = sinon.spy(lane, 'cloneNode');
		lane.style.height = '30px';
		lane.style.width = '110px';
		layout.layout();
		assert.deepStrictEqual({
			afterStyleChange,
			afterShorterStyle: items[0].isCompact(),
			dimensionMeasurements: clone.callCount,
		}, { afterStyleChange: true, afterShorterStyle: false, dimensionMeasurements: 0 });
	});

	test('invalidates action state and external style notifications', () => {
		const { lane, items, layout } = createPickerLane(100, [80]);
		layout.layout();
		const clone = sinon.spy(lane, 'cloneNode');
		items[0].element.setAttribute('aria-disabled', 'true');
		layout.layout();
		const actionMeasurements = clone.callCount;
		clone.resetHistory();
		layout.invalidate();
		layout.invalidate();
		layout.layout();
		assert.deepStrictEqual({ actionMeasurements, styleMeasurements: clone.callCount }, {
			actionMeasurements: 1,
			styleMeasurements: 1,
		});
	});

	test('remeasures after a hidden lane becomes visible', () => {
		const { lane, items, layout } = createPickerLane(100, [80]);
		layout.layout();
		lane.style.display = 'none';
		layout.layout();
		lane.style.display = 'flex';
		lane.style.width = '30px';
		layout.layout();
		assert.deepStrictEqual(items.map(item => item.isCompact()), [true]);
	});

	test('invalidates font loading and zoom changes', () => {
		const { lane, layout } = createPickerLane(100, [80]);
		const targetWindow = dom.getWindow(lane);
		const zoomLevel = getZoomLevel(targetWindow);
		store.add(toDisposable(() => setZoomLevel(zoomLevel, targetWindow)));
		layout.layout();
		const clone = sinon.spy(lane, 'cloneNode');
		targetWindow.document.fonts.dispatchEvent(new Event('loadingdone'));
		layout.layout();
		const fontMeasurements = clone.callCount;
		clone.resetHistory();
		setZoomLevel(zoomLevel + 1, targetWindow);
		layout.layout();
		assert.deepStrictEqual({ fontMeasurements, zoomMeasurements: clone.callCount }, {
			fontMeasurements: 1,
			zoomMeasurements: 1,
		});
	});

	test('keeps compact and minimal thresholds distinct across repeated transitions', () => {
		const lane = dom.append(host, dom.$('.picker-lane'));
		lane.style.cssText = 'display: flex; width: 120px';
		const picker = dom.append(lane, dom.$('.picker'));
		picker.style.cssText = 'flex: none; width: 120px';
		let compact = false;
		let minimal = false;
		const layout = store.add(new ChatInputPickerResponsiveLayout('test.minimalThresholds', lane, {
			getItems: () => [{
				element: picker,
				isCompact: () => compact,
				isMinimal: () => minimal,
				setCompact: value => compact = value,
				setMinimal: value => minimal = value,
			}],
			relayout: () => picker.style.width = minimal ? '20px' : compact ? '60px' : '120px',
		}));
		const clone = sinon.spy(lane, 'cloneNode');
		const states = [120, 60, 20, 60, 120].map(width => {
			lane.style.width = `${width}px`;
			layout.layout();
			return { compact, minimal };
		});
		assert.deepStrictEqual({ states, measurements: clone.callCount }, {
			states: [
				{ compact: false, minimal: false },
				{ compact: true, minimal: false },
				{ compact: true, minimal: true },
				{ compact: true, minimal: false },
				{ compact: false, minimal: false },
			],
			measurements: 3,
		});
	});

	test('coalesces parent, resize observer and content notifications', async () => {
		let resizeObserver: TestResizeObserver | undefined;
		class TestResizeObserver implements ResizeObserver {
			private target: Element | undefined;
			constructor(private readonly callback: ResizeObserverCallback) {
				resizeObserver = this;
			}
			observe(target: Element): void { this.target = target; }
			unobserve(): void { this.target = undefined; }
			disconnect(): void { this.target = undefined; }
			deliver(width: number, height: number): void {
				assert.ok(this.target);
				const size = [{ inlineSize: width, blockSize: height }];
				this.callback([{
					target: this.target,
					contentRect: new DOMRect(0, 0, width, height),
					borderBoxSize: size,
					contentBoxSize: size,
					devicePixelContentBoxSize: size,
				}], this);
			}
		}
		const { lane, items, layout } = createPickerLane(180, [80, 80, 80], false, TestResizeObserver);
		layout.layout();
		const clone = sinon.spy(lane, 'cloneNode');
		const applications = items.map(item => sinon.spy(item, 'setCompact'));
		layout.scheduleLayout();
		layout.scheduleLayout();
		resizeObserver!.deliver(180, 20);
		resizeObserver!.deliver(180, 30);
		await waitForLayout();
		const unchanged = { measurements: clone.callCount, applications: applications.map(application => application.callCount) };
		items[0].element.setAttribute('aria-label', 'New picker label');
		layout.scheduleLayout();
		layout.layout();
		const contentMeasurements = clone.callCount;
		await waitForLayout();
		assert.deepStrictEqual({
			unchanged,
			contentMeasured: contentMeasurements > 0,
			selfTriggeredMeasurements: clone.callCount - contentMeasurements,
		}, {
			unchanged: { measurements: 0, applications: [0, 0, 0] },
			contentMeasured: true,
			selfTriggeredMeasurements: 0,
		});
	});

	test('does not invalidate net-zero toolbar style writes', async () => {
		const { lane, items, layout } = createPickerLane(180, [80, 80, 80]);
		layout.layout();
		await waitForLayout();
		const clone = sinon.spy(lane, 'cloneNode');
		const oldStyle = items[0].element.getAttribute('style')!;
		items[0].element.style.flexShrink = '0';
		items[0].element.style.minWidth = '0';
		items[0].element.setAttribute('style', oldStyle);
		await waitForLayout();
		assert.strictEqual(clone.callCount, 0);
	});

	test('flushes parent layouts scheduled within a frame in that same frame', async () => {
		const { lane, items, layout } = createPickerLane(240, [80, 80, 80]);
		layout.layout();
		await new Promise<void>(resolve => {
			store.add(dom.scheduleAtNextAnimationFrame(dom.getWindow(lane), () => {
				lane.style.width = '180px';
				layout.scheduleLayout();
			}));
			store.add(dom.scheduleAtNextAnimationFrame(dom.getWindow(lane), () => {
				assert.deepStrictEqual(items.map(item => item.isCompact()), [false, false, true]);
				resolve();
			}, -1));
		});
	});

	test('cancels queued layout on disposal', async () => {
		const { lane, layout } = createPickerLane(180, [80, 80, 80]);
		const clone = sinon.spy(lane, 'cloneNode');
		layout.scheduleLayout();
		layout.dispose();
		await waitForLayout();
		assert.strictEqual(clone.callCount, 0);
	});

	for (const hiding of ['visibility', 'opacity'] as const) {
		test(`suspends all geometry reads for ${hiding}-hidden pickers and reuses thresholds on resume`, async () => {
			const { lane, items, layout, relayout } = createPickerLane(180, [80, 80, 80]);
			layout.layout();
			await waitForLayout();
			const laneBounds = sinon.spy(lane, 'getBoundingClientRect');
			const itemBounds = items.map(item => sinon.spy(item.element, 'getBoundingClientRect'));
			const itemRects = items.map(item => sinon.spy(item.element, 'getClientRects'));
			const clone = sinon.spy(lane, 'cloneNode');
			const applications = items.map(item => sinon.spy(item, 'setCompact'));
			relayout.resetHistory();
			layout.scheduleLayout();
			layout.setLayoutEnabled(false);
			host.style[hiding] = hiding === 'opacity' ? '0' : 'hidden';
			lane.style.width = '240px';
			layout.layout(0);
			layout.layout();
			layout.scheduleLayout();
			await waitForLayout();
			const hidden = {
				reads: laneBounds.callCount + [...itemBounds, ...itemRects].reduce((sum, spy) => sum + spy.callCount, 0),
				clones: clone.callCount,
				applications: applications.map(spy => spy.callCount),
				relayouts: relayout.callCount,
			};
			host.style[hiding] = '';
			layout.setLayoutEnabled(true);
			const resumed = items.map(item => item.isCompact());
			const reads = laneBounds.callCount;
			layout.setLayoutEnabled(true);
			assert.deepStrictEqual({
				hidden, resumed, resumeClones: clone.callCount, repeatedEnableReads: laneBounds.callCount - reads,
			}, {
				hidden: { reads: 0, clones: 0, applications: [0, 0, 0], relayouts: 0 },
				resumed: [false, false, false], resumeClones: 0, repeatedEnableReads: 0,
			});
		});
	}

	test('retains hidden content and style invalidations until resume', async () => {
		const { lane, items, layout } = createPickerLane(100, [80]);
		const label = items[0].element.firstElementChild as HTMLElement;
		label.style.width = 'var(--picker-label-width, 80px)';
		layout.layout();
		layout.setLayoutEnabled(false);
		const clone = sinon.spy(lane, 'cloneNode');
		const bounds = sinon.spy(lane, 'getBoundingClientRect');
		label.textContent = 'Changed while hidden';
		lane.style.setProperty('--picker-label-width', '160px');
		layout.invalidate();
		layout.scheduleLayout();
		await waitForLayout();
		const hidden = { clones: clone.callCount, reads: bounds.callCount };
		layout.setLayoutEnabled(true);
		const afterGrowing = items[0].isCompact();
		layout.setLayoutEnabled(false);
		lane.style.setProperty('--picker-label-width', '40px');
		label.textContent = 'Short';
		layout.setLayoutEnabled(true);
		assert.deepStrictEqual({ hidden, afterGrowing, afterShrinking: items[0].isCompact() }, {
			hidden: { clones: 0, reads: 0 }, afterGrowing: true, afterShrinking: false,
		});
	});

	test('uses changed membership and the latest width when resumed', () => {
		const { lane, items, layout } = createPickerLane(180, [80, 80, 80]);
		layout.layout();
		layout.setLayoutEnabled(false);
		items.shift()!.element.remove();
		lane.style.width = '160px';
		layout.setLayoutEnabled(true);
		const afterRemoval = items.map(item => item.isCompact());
		layout.setLayoutEnabled(false);
		lane.style.width = '90px';
		layout.setLayoutEnabled(true);
		assert.deepStrictEqual({ afterRemoval, afterShrinking: items.map(item => item.isCompact()) }, {
			afterRemoval: [false, false], afterShrinking: [true, true],
		});
	});

	test('does not resume a disposed picker layout', async () => {
		const { lane, layout } = createPickerLane(180, [80, 80, 80]);
		const bounds = sinon.spy(lane, 'getBoundingClientRect');
		layout.scheduleLayout();
		layout.setLayoutEnabled(false);
		layout.dispose();
		layout.setLayoutEnabled(true);
		layout.scheduleLayout();
		layout.layout();
		await waitForLayout();
		assert.strictEqual(bounds.callCount, 0);
	});

	test('does not strand a scheduled layout while detached', async () => {
		const { lane, items, layout } = createPickerLane(240, [80, 80, 80]);
		layout.layout();
		lane.remove();
		layout.scheduleLayout();
		await waitForLayout();
		host.appendChild(lane);
		lane.style.width = '120px';
		layout.scheduleLayout();
		await waitForLayout();
		assert.deepStrictEqual(items.map(item => item.isCompact()), [false, true, true]);
	});

	test('prepares all preferred-width measurement styles before attaching the clone', () => {
		const { lane, items, layout } = createPickerLane(300, [80, 80, 80]);
		const observer = new (dom.getWindow(host).MutationObserver)(() => { });
		store.add(toDisposable(() => observer.disconnect()));
		observer.observe(host, { attributes: true, childList: true, subtree: true });

		layout.layout();

		const mutations = observer.takeRecords();
		const measurements = mutations.flatMap(mutation => Array.from(mutation.addedNodes)
			.filter((node): node is HTMLElement => dom.isHTMLElement(node) && node.classList.contains('chat-input-picker-measurement'))
			.map(node => ({ node, parent: mutation.target })));
		const measurementWrites = mutations.filter(mutation =>
			mutation.type === 'attributes' && dom.isHTMLElement(mutation.target) && mutation.target.closest('.chat-input-picker-measurement'));

		assert.deepStrictEqual({
			compact: items.map(item => item.isCompact()),
			measurements: measurements.length,
			measurementWrites: measurementWrites.length,
			sameParent: measurements.every(({ parent }) => parent === lane.parentElement),
			ariaHidden: measurements.every(({ node }) => node.getAttribute('aria-hidden') === 'true'),
			inert: measurements.every(({ node }) => node.hasAttribute('inert')),
			remainingMeasurements: host.querySelectorAll('.chat-input-picker-measurement').length,
		}, {
			compact: [false, false, false],
			measurements: 2,
			measurementWrites: 0,
			sameParent: true,
			ariaHidden: true,
			inert: true,
			remainingMeasurements: 0,
		});
	});

	test('preserves visual compaction order for reversed picker lanes', () => {
		const { lane, items, layout } = createPickerLane(180, [80, 80, 80]);
		lane.style.flexDirection = 'row-reverse';

		layout.layout();

		assert.deepStrictEqual(items.map(item => item.isCompact()), [true, false, false]);
	});

	test('excludes hidden picker bounds from fit checks', () => {
		const { items, layout } = createPickerLane(160, [80, 200, 80]);
		items[1].element.style.display = 'none';

		layout.layout();

		assert.deepStrictEqual(items.map(item => item.isCompact()), [false, false, false]);
	});

	test('still measures non-picker contents when picker bounds fit', () => {
		const { lane, items, layout } = createPickerLane(120, [80]);
		const fixedItem = dom.append(lane, dom.$('.non-responsive-item'));
		fixedItem.style.flex = '0 0 100px';
		const label = dom.append(fixedItem, dom.$('span'));
		label.style.display = 'block';
		label.style.width = '100px';

		layout.layout();

		assert.deepStrictEqual(items.map(item => item.isCompact()), [true]);
	});

	test('treats an empty picker set as fully compact', () => {
		const lane = dom.append(host, dom.$('.picker-lane'));
		const layout = store.add(new ChatInputPickerResponsiveLayout('test.emptyPickerLane', lane, {
			getItems: () => [],
		}));

		assert.strictEqual(layout.areAllItemsCompact(), true);
	});

	test('ignores mutations outside the responsive picker container', async () => {
		const row = dom.append(host, dom.$('.secondary-row'));
		const lane = dom.append(row, dom.$('.responsive-picker-container'));
		const picker = dom.append(lane, dom.$('.picker'));
		const unrelated = dom.append(row, dom.$('.context-usage'));
		lane.style.width = '100px';
		lane.style.height = '20px';
		let compact = false;
		const layout = store.add(new ChatInputPickerResponsiveLayout('test.isolatedPickerLane', lane, {
			getItems: () => [{
				element: picker,
				isCompact: () => compact,
				setCompact: value => compact = value,
			}],
		}));

		let layoutCalls = 0;
		layout.layout = () => layoutCalls++;
		const targetWindow = dom.getWindow(lane);
		await new Promise<void>(resolve => targetWindow.requestAnimationFrame(() => targetWindow.requestAnimationFrame(() => resolve())));
		layoutCalls = 0;
		unrelated.textContent = 'streamed cost update';
		await new Promise(resolve => setTimeout(resolve, 0));
		const afterUnrelatedMutation = layoutCalls;

		picker.setAttribute('data-picker-open', 'true');
		await new Promise(resolve => setTimeout(resolve, 0));
		const afterVisualStateMutation = layoutCalls;

		picker.textContent = 'picker changed';
		await waitForLayout();

		assert.deepStrictEqual({
			afterUnrelatedMutation,
			afterVisualStateMutation,
			afterContentMutation: layoutCalls > 0,
		}, {
			afterUnrelatedMutation: 0,
			afterVisualStateMutation: 0,
			afterContentMutation: true,
		});
	});

	test('restores overflowed actions in compact form before considering expanded labels', () => {
		const lane = dom.append(host, dom.$('.picker-lane'));
		lane.style.display = 'flex';
		lane.style.width = '50px';
		lane.style.overflow = 'hidden';

		const actionBar = dom.append(lane, dom.$('.monaco-action-bar.has-overflow'));
		const picker = dom.$('.picker');
		let compact = false;
		let overflow = true;
		const layout = store.add(new ChatInputPickerResponsiveLayout('test.overflowedPickerLane', lane, {
			getItems: () => [{
				element: picker.isConnected ? picker : undefined,
				isCompact: () => compact,
				setCompact: value => {
					compact = value;
					picker.style.width = value ? '60px' : '150px';
				},
			}],
			hasOverflow: () => overflow,
			relayout: () => {
				if (!picker.isConnected && compact && Number.parseFloat(picker.style.width) <= lane.getBoundingClientRect().width) {
					actionBar.appendChild(picker);
					overflow = false;
				}
			},
		}));

		layout.layout();
		const tooNarrowForCompact = { compact, overflow };

		lane.style.width = '70px';
		layout.layout();
		const compactItemsRestored = { compact, overflow };

		lane.style.width = '160px';
		layout.layout();
		const expanded = { compact, overflow };

		assert.deepStrictEqual({ tooNarrowForCompact, compactItemsRestored, expanded }, {
			tooNarrowForCompact: { compact: true, overflow: true },
			compactItemsRestored: { compact: true, overflow: false },
			expanded: { compact: false, overflow: false },
		});
	});

	test('restores every hidden picker across repeated overflow cycles', () => {
		const lane = dom.append(host, dom.$('.picker-lane'));
		lane.style.display = 'flex';
		lane.style.width = '400px';

		const compact = [true, true, true, true];
		const pickers = compact.map((_, index) => {
			const picker = dom.$(`.picker-${index}`);
			picker.style.width = '20px';
			return picker;
		});
		let visibleItemCount = 1;
		let overflow = true;
		lane.appendChild(pickers[0]);

		const hidePickers = () => {
			for (const picker of pickers.slice(1)) {
				picker.remove();
			}
			visibleItemCount = 1;
			overflow = true;
		};
		const layout = store.add(new ChatInputPickerResponsiveLayout('test.restoreAllPickerLane', lane, {
			getItems: () => pickers.map((picker, index) => ({
				element: picker,
				isCompact: () => compact[index],
				setCompact: value => {
					compact[index] = value;
					picker.style.width = value ? '20px' : '80px';
				},
			})),
			hasOverflow: () => overflow,
			relayout: () => {
				if (visibleItemCount < pickers.length && compact.slice(visibleItemCount).every(Boolean)) {
					lane.appendChild(pickers[visibleItemCount++]);
				}
				overflow = visibleItemCount < pickers.length;
			},
		}));

		layout.layout();
		const firstRestore = { visibleItemCount, compact: [...compact], overflow };

		hidePickers();
		layout.layout();
		const secondRestore = { visibleItemCount, compact: [...compact], overflow };

		assert.deepStrictEqual({ firstRestore, secondRestore }, {
			firstRestore: { visibleItemCount: 4, compact: [false, false, false, false], overflow: false },
			secondRestore: { visibleItemCount: 4, compact: [false, false, false, false], overflow: false },
		});
	});

	test('compacts a picker whose rendered bounds escape the lane', () => {
		const lane = dom.append(host, dom.$('.picker-lane'));
		lane.style.display = 'flex';
		lane.style.width = '100px';
		lane.style.overflow = 'visible';

		const picker = dom.append(lane, dom.$('.picker'));
		picker.style.flex = '0 0 auto';
		picker.style.width = '80px';
		picker.style.transform = 'translateX(50px)';
		let compact = false;
		const layout = store.add(new ChatInputPickerResponsiveLayout('test.visuallyOverflowedPickerLane', lane, {
			getItems: () => [{
				element: picker,
				isCompact: () => compact,
				setCompact: value => {
					compact = value;
					picker.style.width = value ? '20px' : '80px';
				},
			}],
		}));

		layout.layout();

		assert.deepStrictEqual({
			compact,
			measurementHosts: host.querySelectorAll('.chat-input-picker-measurement-host').length,
		}, {
			compact: true,
			measurementHosts: 0,
		});
	});

	test('compacts an expanded picker before its label truncates', () => {
		const lane = dom.append(host, dom.$('.picker-lane'));
		lane.style.display = 'flex';
		lane.style.width = '200px';

		const picker = dom.append(lane, dom.$('.picker'));
		picker.style.flex = '0 1 80px';
		picker.style.width = '80px';
		picker.style.overflow = 'hidden';
		const label = dom.append(picker, dom.$('.picker-label'));
		label.style.display = 'block';
		label.style.width = '140px';
		label.textContent = 'A picker label that would otherwise ellipsize';

		let compact = false;
		const layout = store.add(new ChatInputPickerResponsiveLayout('test.truncatedPickerLane', lane, {
			getItems: () => [{
				element: picker,
				isCompact: () => compact,
				setCompact: value => {
					compact = value;
					picker.style.width = value ? '20px' : '80px';
					label.style.display = value ? 'none' : '';
				},
			}],
		}));

		layout.layout();

		assert.strictEqual(compact, true);
	});

	test('lets a shrinkable picker ellipsize before compacting at its minimum width', () => {
		const lane = dom.append(host, dom.$('.picker-lane'));
		lane.style.display = 'flex';
		lane.style.width = '100px';

		const picker = dom.append(lane, dom.$('.picker'));
		picker.style.flex = '0 1 160px';
		picker.style.width = '160px';
		picker.style.minWidth = '60px';
		picker.style.overflow = 'hidden';
		const label = dom.append(picker, dom.$('.picker-label'));
		label.style.overflow = 'hidden';
		label.style.textOverflow = 'ellipsis';
		label.style.whiteSpace = 'nowrap';
		label.textContent = 'A picker label that can ellipsize';

		let compact = false;
		let overflow = false;
		const layout = store.add(new ChatInputPickerResponsiveLayout('test.shrinkablePickerLane', lane, {
			getItems: () => [{
				element: picker,
				canShrink: true,
				isCompact: () => compact,
				setCompact: value => {
					compact = value;
				},
			}],
			hasOverflow: () => overflow,
			relayout: () => {
				picker.style.flexBasis = compact ? '20px' : '160px';
				picker.style.width = compact ? '20px' : '160px';
				picker.style.minWidth = compact ? '20px' : '60px';
				overflow = picker.getBoundingClientRect().width > lane.getBoundingClientRect().width;
			},
		}));

		layout.layout();
		const truncated = { compact, overflow, width: picker.getBoundingClientRect().width };

		lane.style.width = '50px';
		layout.layout();
		const collapsed = { compact, overflow, width: picker.getBoundingClientRect().width };

		lane.style.width = '15px';
		layout.layout();
		const overflowed = { compact, overflow };

		assert.deepStrictEqual({ truncated, collapsed, overflowed }, {
			truncated: { compact: false, overflow: false, width: 100 },
			collapsed: { compact: true, overflow: false, width: 20 },
			overflowed: { compact: true, overflow: true },
		});
	});

	test('preserves shrinkable picker fit budgets with trailing fixed actions', () => {
		const lane = dom.append(host, dom.$('.picker-lane'));
		lane.style.cssText = 'display: flex; width: 240px; overflow: hidden';
		const mode = dom.append(lane, dom.$('.mode-picker'));
		mode.style.flex = 'none';
		const modeLabel = dom.append(mode, dom.$('span'));
		modeLabel.style.width = '80px';
		const model = dom.append(lane, dom.$('.model-picker'));
		model.style.flex = '0 1 auto';
		const modelLabel = dom.append(model, dom.$('span'));
		modelLabel.style.width = '160px';
		const fixedAction = dom.append(lane, dom.$('.fixed-action'));
		fixedAction.style.cssText = 'flex: none; width: 100px';

		let modeCompact = false;
		let modelCompact = false;
		let modelMinimal = false;
		const render = () => {
			mode.style.width = modeCompact ? '20px' : '80px';
			modeLabel.style.display = modeCompact ? 'none' : 'block';
			const modelWidth = modelMinimal ? 20 : modelCompact ? 40 : 160;
			model.style.width = `${modelWidth}px`;
			model.style.minWidth = `${modelCompact ? modelWidth : 60}px`;
			modelLabel.style.display = modelCompact ? 'none' : 'block';
		};
		render();
		const layout = store.add(new ChatInputPickerResponsiveLayout('test.shrinkablePickerWithFixedActions', lane, {
			getItems: () => [
				{
					element: mode,
					isCompact: () => modeCompact,
					setCompact: value => modeCompact = value,
				},
				{
					element: model,
					canShrink: true,
					isCompact: () => modelCompact,
					isMinimal: () => modelMinimal,
					setCompact: value => modelCompact = value,
					setMinimal: value => modelMinimal = value,
				},
			],
			relayout: render,
		}));
		const clone = sinon.spy(lane, 'cloneNode');
		const states = [240, 140, 120, 100, 80, 100, 140, 240].map(width => {
			lane.style.width = `${width}px`;
			layout.layout();
			return { modeCompact, modelCompact, modelMinimal };
		});

		assert.deepStrictEqual({ states, measurements: clone.callCount }, {
			states: [
				{ modeCompact: false, modelCompact: false, modelMinimal: false },
				{ modeCompact: false, modelCompact: false, modelMinimal: false },
				{ modeCompact: false, modelCompact: true, modelMinimal: false },
				{ modeCompact: false, modelCompact: true, modelMinimal: true },
				{ modeCompact: true, modelCompact: true, modelMinimal: true },
				{ modeCompact: false, modelCompact: true, modelMinimal: true },
				{ modeCompact: false, modelCompact: false, modelMinimal: false },
				{ modeCompact: false, modelCompact: false, modelMinimal: false },
			],
			measurements: 4,
		});
	});

	for (const constraint of ['width', 'maxWidth'] as const) {
		test(`preserves constrained nested toolbar ${constraint} when caching picker fits`, () => {
			const lane = dom.append(host, dom.$('.picker-lane'));
			lane.style.cssText = 'display: flex; width: 500px';
			const toolbar = dom.append(lane, dom.$('.picker-toolbar'));
			toolbar.style.cssText = 'flex: none; min-width: 0';
			toolbar.style[constraint] = '140px';
			const actions = dom.append(toolbar, dom.$('.actions-container'));
			actions.style.display = 'flex';
			const picker = dom.append(actions, dom.$('.model-picker'));
			picker.style.cssText = 'flex: 0 1 auto; width: 240px; min-width: 0; overflow: hidden';
			const label = dom.append(picker, dom.$('span'));
			label.style.cssText = 'display: block; width: 240px';

			let compact = false;
			const item = {
				element: picker,
				isCompact: () => compact,
				setCompact: (value: boolean) => {
					compact = value;
					picker.style.width = value ? '20px' : '240px';
					label.style.display = value ? 'none' : 'block';
				},
			};
			const layout = store.add(new ChatInputPickerResponsiveLayout('test.constrainedNestedToolbar', lane, {
				getItems: () => [item],
			}));
			const clone = sinon.spy(lane, 'cloneNode');
			layout.layout();
			const initial = { compact, measurements: clone.callCount };
			const apply = sinon.spy(item, 'setCompact');

			for (const width of [600, 500]) {
				lane.style.width = `${width}px`;
				layout.layout();
			}
			const resized = { compact, measurements: clone.callCount, applications: apply.callCount };
			const states = [300, 140].map(width => {
				toolbar.style[constraint] = `${width}px`;
				layout.layout();
				return compact;
			});

			assert.deepStrictEqual({ initial, resized, states, measurements: clone.callCount }, {
				initial: { compact: true, measurements: 2 },
				resized: { compact: true, measurements: 2, applications: 0 },
				states: [false, true],
				measurements: 5,
			});
		});
	}

	test('uses a minimal picker state before overflowing', () => {
		const lane = dom.append(host, dom.$('.picker-lane'));
		lane.style.display = 'flex';
		lane.style.width = '50px';

		const picker = dom.append(lane, dom.$('.picker'));
		let compact = false;
		let minimal = false;
		let overflow = false;
		const layout = store.add(new ChatInputPickerResponsiveLayout('test.minimalPickerLane', lane, {
			getItems: () => [{
				element: picker,
				canShrink: true,
				isCompact: () => compact,
				isMinimal: () => minimal,
				setCompact: value => compact = value,
				setMinimal: value => minimal = value,
			}],
			hasOverflow: () => overflow,
			relayout: () => {
				picker.style.width = minimal ? '20px' : compact ? '60px' : '120px';
				picker.style.minWidth = minimal ? '20px' : '60px';
				overflow = picker.getBoundingClientRect().width > lane.getBoundingClientRect().width;
			},
		}));

		layout.layout();

		assert.deepStrictEqual({ compact, minimal, overflow, width: picker.getBoundingClientRect().width }, {
			compact: true,
			minimal: true,
			overflow: false,
			width: 20,
		});
	});

	test('keeps the toolbar row height stable when the model picker overflows', () => {
		host.style.setProperty('--vscode-spacing-size40', '4px');
		host.style.setProperty('--vscode-spacing-size60', '6px');
		host.classList.add('interactive-session');

		const row = dom.append(host, dom.$('.picker-row.chat-input-toolbar'));
		row.style.display = 'flex';
		row.style.alignItems = 'center';

		const modelItem = dom.append(row, dom.$('.chat-input-picker-item.model-picker-item'));
		modelItem.style.width = '100px';
		const modelLabel = dom.append(modelItem, dom.$('div.action-label.model-picker-split'));
		const { primaryButton: modelName, secondaryButton: modelConfig } = renderChatInputPickerSplit(modelLabel);
		modelName.classList.add('model-picker-section', 'model-picker-name');
		modelConfig.classList.add('model-picker-section', 'model-picker-config');
		modelName.style.minWidth = '90px';
		const pickerLabel = dom.append(modelName, dom.$('.chat-input-picker-label'));
		pickerLabel.textContent = 'A very long model name';
		modelConfig.style.width = '40px';

		const overflowItem = dom.append(row, dom.$('.overflow-item'));
		overflowItem.style.width = '22px';
		overflowItem.style.height = '22px';
		overflowItem.style.display = 'none';

		const withModelPicker = row.getBoundingClientRect().height;
		const expandedModelNameFlexShrink = dom.getWindow(modelName).getComputedStyle(modelName).flexShrink;
		const expandedLabelTextOverflow = dom.getWindow(pickerLabel).getComputedStyle(pickerLabel).textOverflow;
		const expandedModelPickerWidth = modelLabel.getBoundingClientRect().width;
		const expandedModelNameWidth = modelName.getBoundingClientRect().width;
		const expandedLabelTruncated = pickerLabel.scrollWidth > pickerLabel.clientWidth;
		const expandedIconOffset = modelName.getBoundingClientRect().left - modelLabel.getBoundingClientRect().left;
		modelLabel.style.width = '22px';
		modelItem.classList.add('compact-picker');
		modelLabel.classList.add('compact');
		const compactIconOffset = modelName.getBoundingClientRect().left - modelLabel.getBoundingClientRect().left;
		modelItem.style.display = 'none';
		overflowItem.style.display = '';
		const withOverflow = row.getBoundingClientRect().height;

		assert.deepStrictEqual({
			withModelPicker,
			withOverflow,
			expandedModelNameFlexShrink,
			expandedLabelTextOverflow,
			expandedModelPickerWidth,
			expandedModelNameWidth,
			expandedLabelTruncated,
			expandedIconOffset,
			compactIconOffset,
		}, {
			withModelPicker: 22,
			withOverflow: 22,
			expandedModelNameFlexShrink: '1',
			expandedLabelTextOverflow: 'ellipsis',
			expandedModelPickerWidth: 100,
			expandedModelNameWidth: 90,
			expandedLabelTruncated: true,
			expandedIconOffset: 0,
			compactIconOffset: 0,
		});
	});

	test('centers compact primary and secondary picker icons', () => {
		host.style.setProperty('--vscode-spacing-size60', '6px');
		host.style.setProperty('--vscode-spacing-size80', '8px');
		host.classList.add('monaco-workbench', 'interactive-session');
		host.style.setProperty('--vscode-codiconFontSize-compact', '12px');

		const renderPicker = (toolbarClass: string, itemClass: string) => {
			const toolbar = dom.append(host, dom.$(`.${toolbarClass}`));
			const item = dom.append(toolbar, dom.$(`.${itemClass}`));
			const actionLabel = dom.append(item, dom.$('a.action-label'));
			const icon = dom.append(actionLabel, dom.$('span.codicon'));
			const pickerLabel = dom.append(actionLabel, dom.$('span.chat-input-picker-label'));
			pickerLabel.textContent = 'Picker';

			const expandedOffset = icon.getBoundingClientRect().left - actionLabel.getBoundingClientRect().left;
			actionLabel.classList.add('icon-only');
			pickerLabel.remove();
			const actionBounds = actionLabel.getBoundingClientRect();
			const iconBounds = icon.getBoundingClientRect();
			return {
				expandedOffset,
				action: { width: actionBounds.width, height: actionBounds.height },
				icon: {
					width: iconBounds.width,
					height: iconBounds.height,
					x: iconBounds.left - actionBounds.left,
					y: iconBounds.top - actionBounds.top,
				},
			};
		};

		assert.deepStrictEqual({
			primary: renderPicker('chat-input-toolbar', 'chat-input-picker-item'),
			secondary: renderPicker('chat-secondary-input-toolbar', 'chat-sessionPicker-item'),
		}, {
			primary: {
				expandedOffset: 6,
				action: { width: 22, height: 22 },
				icon: { width: 12, height: 12, x: 5, y: 5 },
			},
			secondary: {
				expandedOffset: 6,
				action: { width: 22, height: 22 },
				icon: { width: 12, height: 12, x: 5, y: 5 },
			},
		});
	});

	test('keeps icon-only model pickers at the toolbar control size regardless of stylesheet order', async () => {
		host.classList.add('monaco-workbench', 'interactive-session');
		host.style.setProperty('--vscode-spacing-size60', '6px');
		host.style.setProperty('--vscode-codiconFontSize-compact', '12px');

		await timeout(0);
		const splitPickerRule = [...document.styleSheets, ...document.adoptedStyleSheets]
			.flatMap(sheet => Array.from(sheet.cssRules))
			.flatMap(rule => rule instanceof CSSImportRule && rule.styleSheet ? Array.from(rule.styleSheet.cssRules) : [rule])
			.find(rule => rule instanceof CSSStyleRule && rule.selectorText === '.interactive-session .chat-input-toolbar .chat-input-picker-item .action-label.model-picker-split');
		assert.ok(splitPickerRule);
		// Load the real split-picker rule last to exercise the conflicting stylesheet order.
		dom.append(host, dom.$('style')).textContent = splitPickerRule.cssText;

		const toolbar = dom.append(host, dom.$('.chat-input-toolbar'));
		const item = dom.append(toolbar, dom.$('.chat-input-picker-item.model-picker-item.compact-picker'));
		item.style.width = '22px';
		const actionLabel = dom.append(item, dom.$('div.action-label.model-picker-split.compact.icon-only'));
		const { primaryButton: button, secondaryButton } = renderChatInputPickerSplit(actionLabel);
		button.classList.add('model-picker-section', 'model-picker-name');
		secondaryButton.style.display = 'none';
		button.style.minWidth = '22px';
		const icon = dom.append(button, dom.$('span.codicon'));

		const measure = () => {
			const actionBounds = actionLabel.getBoundingClientRect();
			const buttonBounds = button.getBoundingClientRect();
			const iconBounds = icon.getBoundingClientRect();
			return {
				action: { width: actionBounds.width, height: actionBounds.height },
				button: { width: buttonBounds.width, height: buttonBounds.height },
				icon: {
					width: iconBounds.width,
					height: iconBounds.height,
					x: iconBounds.left - buttonBounds.left,
					y: iconBounds.top - buttonBounds.top,
				},
			};
		};

		const compact = measure();
		actionLabel.classList.add('minimal');
		const minimal = measure();
		const expected = {
			action: { width: 22, height: 22 },
			button: { width: 22, height: 22 },
			icon: { width: 12, height: 12, x: 5, y: 5 },
		};
		assert.deepStrictEqual({ compact, minimal }, { compact: expected, minimal: expected });
	});

});
