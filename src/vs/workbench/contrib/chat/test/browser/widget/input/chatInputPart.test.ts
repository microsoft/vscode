/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $ } from '../../../../../../../base/browser/dom.js';
import { Emitter } from '../../../../../../../base/common/event.js';
import { observableValue } from '../../../../../../../base/common/observable.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { ChatInputPart } from '../../../../browser/widget/input/chatInputPart.js';

suite('ChatInputPart picker layout visibility', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('combines control and widget visibility and resumes toolbars before pickers', () => {
		const states = new Map<string, boolean>();
		const calls: string[] = [];
		let invalidations = 0;
		const setEnabled = (name: string, enabled: boolean) => {
			states.set(name, enabled);
			calls.push(name);
		};
		const input: ChatInputPart = Object.assign(Object.create(ChatInputPart.prototype), {
			options: {},
			_pickerLayoutEnabled: true,
			_inputVisible: true,
			_notificationHostVisible: observableValue('input visibility', true),
			_onDidChangeVisibility: store.add(new Emitter<boolean>()),
			inputActionsToolbar: { setResponsiveLayoutEnabled: (enabled: boolean) => setEnabled('primary toolbar', enabled) },
			secondaryToolbar: { setResponsiveLayoutEnabled: (enabled: boolean) => setEnabled('secondary toolbar', enabled) },
			_inputPickerResponsiveLayout: {
				setLayoutEnabled: (enabled: boolean) => setEnabled('primary picker', enabled),
				invalidate: () => invalidations++,
			},
			_secondaryPickerResponsiveLayout: {
				setLayoutEnabled: (enabled: boolean) => setEnabled('secondary picker', enabled),
				invalidate: () => invalidations++,
			},
		});

		input.setPickerLayoutEnabled(false);
		input.setVisible(false);
		input.setPickerLayoutEnabled(true);
		const hiddenWidget = [...states.values()];
		input.setVisible(true);
		const visibleWidget = [...states.values()];
		input.setPickerLayoutEnabled(false);
		input.setVisible(false);
		input.setVisible(true);
		const hiddenControls = [...states.values()];
		calls.length = 0;
		input.setPickerLayoutEnabled(true);
		assert.deepStrictEqual({ hiddenWidget, visibleWidget, hiddenControls, resumed: [...states.values()], calls, invalidations }, {
			hiddenWidget: [false, false, false, false],
			visibleWidget: [true, true, true, true],
			hiddenControls: [false, false, false, false],
			resumed: [true, true, true, true],
			calls: ['primary toolbar', 'secondary toolbar', 'primary picker', 'secondary picker'],
			invalidations: 4,
		});
	});

	test('retains compact editor space without measuring hidden pickers and refreshes it on resume', () => {
		let toolbarWidth = 60;
		let measurements = 0;
		const layouts: number[] = [];
		const input: Pick<ChatInputPart, 'setPickerLayoutEnabled'> & { getLayoutData(): { toolbarsWidth: number } } = Object.assign(Object.create(ChatInputPart.prototype), {
			options: { renderStyle: 'compact' },
			_pickerLayoutEnabled: true,
			_inputVisible: true,
			cachedWidth: 500,
			cachedInputToolbarWidth: toolbarWidth,
			contextUsageWidgetContainer: $('div'),
			inputActionsToolbar: {
				setResponsiveLayoutEnabled: () => { },
				getItemsWidth: () => { measurements++; return toolbarWidth; },
				getItemsLength: () => 1,
			},
			executeToolbar: {
				getItemsWidth: () => 30,
				getItemsLength: () => 1,
			},
			_layout: () => layouts.push(input.getLayoutData().toolbarsWidth),
		});

		input.setPickerLayoutEnabled(false);
		toolbarWidth = 100;
		const hiddenWidth = input.getLayoutData().toolbarsWidth;
		const hiddenMeasurements = measurements;
		input.setPickerLayoutEnabled(true);
		input.setPickerLayoutEnabled(true);

		assert.deepStrictEqual({ hiddenWidth, hiddenMeasurements, layouts, measurements }, {
			hiddenWidth: 102,
			hiddenMeasurements: 0,
			layouts: [142],
			measurements: 1,
		});
	});
});
