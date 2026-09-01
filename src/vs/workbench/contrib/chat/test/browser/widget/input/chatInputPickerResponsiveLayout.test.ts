/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as dom from '../../../../../../../base/browser/dom.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { ChatInputPickerResponsiveLayout } from '../../../../browser/widget/input/chatInputPickerResponsiveLayout.js';
import '../../../../browser/widget/input/modelPicker/media/modelPicker.css';
import '../../../../browser/widget/media/chat.css';

suite('ChatInputPickerResponsiveLayout', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	let host: HTMLElement;

	setup(() => {
		host = dom.append(document.body, dom.$('.chat-input-picker-responsive-layout-test'));
	});

	teardown(() => {
		host.remove();
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

		picker.textContent = 'picker changed';
		await new Promise(resolve => setTimeout(resolve, 0));

		assert.strictEqual(afterUnrelatedMutation, 0);
		assert.ok(layoutCalls > 0);
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
		const modelLabel = dom.append(modelItem, dom.$('a.action-label.model-picker-split'));
		const modelName = dom.append(modelLabel, dom.$('.model-picker-section.model-picker-name'));
		modelName.style.minWidth = '90px';
		const pickerLabel = dom.append(modelName, dom.$('.chat-input-picker-label'));
		pickerLabel.textContent = 'A very long model name';
		const modelConfig = dom.append(modelLabel, dom.$('.model-picker-section.model-picker-config'));
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

	test('keeps the primary picker icon anchored when its label disappears', () => {
		host.style.setProperty('--vscode-spacing-size60', '6px');
		host.classList.add('interactive-session');
		const toolbar = dom.append(host, dom.$('.chat-input-toolbar'));
		const item = dom.append(toolbar, dom.$('.chat-input-picker-item'));
		const actionLabel = dom.append(item, dom.$('a.action-label'));
		const icon = dom.append(actionLabel, dom.$('span.codicon'));
		icon.style.width = '16px';
		icon.style.height = '16px';
		const pickerLabel = dom.append(actionLabel, dom.$('span.chat-input-picker-label'));
		pickerLabel.textContent = 'Picker';

		const expandedOffset = icon.getBoundingClientRect().left - actionLabel.getBoundingClientRect().left;
		item.classList.add('compact');
		actionLabel.classList.add('icon-only');
		pickerLabel.remove();
		const compactOffset = icon.getBoundingClientRect().left - actionLabel.getBoundingClientRect().left;

		assert.deepStrictEqual({ expandedOffset, compactOffset }, {
			expandedOffset: 6,
			compactOffset: 6,
		});
	});
});
