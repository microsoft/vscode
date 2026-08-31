/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IAutomationDescriptor } from '../../../common/automations/automation.js';
import { serializeAutomationEditableState } from '../../../common/automations/automationService.js';

suite('Automations - editable state', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('serializes provider configuration independently of property insertion order', () => {
		const automation: IAutomationDescriptor = {
			id: 'automation',
			name: 'Automation',
			prompt: 'Run the task',
			schedule: { interval: 'daily', scheduleHour: 9, scheduleMinute: 0, scheduleDay: 1 },
			target: {
				kind: 'workspace',
				folderUri: URI.parse('file:///workspace'),
				isolation: { kind: 'folder' },
			},
			configuration: {
				nested: { first: true, second: false },
				mode: 'plan',
			},
			enabled: true,
			createdAt: '2026-01-01T00:00:00.000Z',
			updatedAt: '2026-01-01T00:00:00.000Z',
		};
		const reordered: IAutomationDescriptor = {
			...automation,
			configuration: {
				mode: 'plan',
				nested: { second: false, first: true },
			},
		};

		assert.strictEqual(serializeAutomationEditableState(automation), serializeAutomationEditableState(reordered));
	});
});
