/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { automationTriggerFields, normalizeAutomationTriggerField, validateAutomationTriggerFields } from '../../../../../workbench/contrib/chat/common/automations/automationTriggers.js';

suite('Automation triggers', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('normalizes internal and public catalog fields without supplying defaults', () => {
		const fields = automationTriggerFields({
			name: 'issue_labeled', title: 'Labeled', description: '', field_labels: { labels: 'Labels added' },
			fields: [
				{ name: 'types', required: true, options: ['labeled'] },
				{ name: 'labels', required: true },
				{ id: 'query', label: 'Filter', type: 'string', required: false },
				{ name: 'write_scope', required: false },
			],
		})!;
		assert.deepStrictEqual({
			fields,
			labels: normalizeAutomationTriggerField(fields[0], ' bug, help wanted, , bug '),
			query: normalizeAutomationTriggerField(fields[1], ' label:bug is:open '),
			empty: normalizeAutomationTriggerField(fields[1], '   '),
			error: validateAutomationTriggerFields(fields, {}),
		}, {
			fields: [
				{ name: 'labels', label: 'Labels added', required: true, scalar: false, options: undefined },
				{ name: 'query', label: 'Filter', required: false, scalar: true, options: undefined },
			],
			labels: ['bug', 'help wanted'], query: 'label:bug is:open', empty: undefined, error: 'Labels added is required.',
		});
	});

	test('requires supported controls and validates advertised options and shapes', () => {
		const definition = { title: 'Review', description: '', fields: [{ name: 'states', required: true, options: ['approved'] }] };
		const fields = automationTriggerFields(definition)!;
		assert.deepStrictEqual({
			unknown: automationTriggerFields({ ...definition, fields: [{ name: 'destination', required: true }] }),
			wrongType: automationTriggerFields({ ...definition, fields: [{ name: 'states', type: 'integer', required: true }] }),
			empty: validateAutomationTriggerFields(fields, { states: [] }),
			unknownOption: validateAutomationTriggerFields(fields, { states: ['future'] }),
			valid: validateAutomationTriggerFields(fields, { states: ['approved'], opaque: true }),
		}, {
			unknown: undefined, wrongType: undefined, empty: 'states is required.',
			unknownOption: 'Choose a supported value for states.', valid: undefined,
		});
	});
});
