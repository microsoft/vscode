/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { SubmenuAction } from '../../../../../base/common/actions.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IQuickInputService } from '../../../../../platform/quickinput/common/quickInput.js';
import { createModelConfigurationActions, ILanguageModelConfigurationSchema } from '../../common/languageModels.js';
import { getModelConfigurationChoices, promptModelConfigurationNumber, supportsCustomModelConfiguration } from '../../common/modelConfigurationChoices.js';
import { filterConfigurationToSchema } from '../../browser/widget/input/chatModelConfigurationLogic.js';

type PropertySchema = NonNullable<ILanguageModelConfigurationSchema['properties']>[string];
const schema: PropertySchema = {
	type: 'integer', minimum: 1, maximum: 1_000_000, default: 1_000_000, group: 'tokens',
	suggestedValues: [{ value: 200_000, label: 'Standard Tier' }, { value: 500_000, label: 'Half' }, { value: 1_000_000, label: 'Full' }],
};

suite('ModelConfigurationChoices', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('suggestions do not restrict valid saved custom values', () => {
		const original = { properties: { contextSize: schema } };
		const changed = { properties: { contextSize: { ...schema, suggestedValues: [{ value: 1_000_000 }] } } };
		assert.deepStrictEqual({
			choices: getModelConfigurationChoices(schema),
			custom: filterConfigurationToSchema({ contextSize: 250_000 }, original),
			afterRefresh: filterConfigurationToSchema({ contextSize: 200_000 }, changed),
			invalid: filterConfigurationToSchema({ contextSize: 1_000_001 }, changed),
		}, {
			choices: schema.suggestedValues,
			custom: { contextSize: 250_000 }, afterRefresh: { contextSize: 200_000 }, invalid: {},
		});
	});

	test('invalid and duplicate suggestions are omitted without changing enum controls', () => {
		assert.deepStrictEqual({
			numeric: getModelConfigurationChoices({ ...schema, suggestedValues: [{ value: 0 }, { value: 200_000 }, { value: 200_000 }, { value: 1.5 }, { value: Infinity }] }),
			enum: getModelConfigurationChoices({ type: 'string', enum: ['low', 'high'], enumItemLabels: ['Low', 'High'] }),
			unbounded: supportsCustomModelConfiguration({ type: 'integer', minimum: 1, suggestedValues: [] }),
			closedEnum: supportsCustomModelConfiguration({ ...schema, enum: [200_000] }),
		}, {
			numeric: [{ value: 200_000 }],
			enum: [{ value: 'low', label: 'Low', description: undefined }, { value: 'high', label: 'High', description: undefined }],
			unbounded: false, closedEnum: false,
		});
	});

	test('custom input validates whole numbers and cancellation returns no value', async () => {
		const errors: (string | null | undefined | object)[] = [];
		const input: Pick<IQuickInputService, 'input'> = {
			async input(options) {
				for (const value of ['0', '1.5', '1e5', '1000001', '200000']) {
					errors.push(await options?.validateInput?.(value));
				}
				return '250000';
			},
		};
		const selected = await promptModelConfigurationNumber(input, schema, 200_000);
		const cancelled = await promptModelConfigurationNumber({ input: async () => undefined }, schema, 200_000);
		assert.deepStrictEqual({ selected, cancelled, invalid: errors.map(Boolean) }, {
			selected: 250_000, cancelled: undefined, invalid: [true, true, true, true, false],
		});
	});

	test('read-only input is never opened and invalid programmatic input is discarded', async () => {
		let calls = 0;
		const input: Pick<IQuickInputService, 'input'> = { input: async () => { calls++; return 'invalid'; } };
		const readOnly = await promptModelConfigurationNumber(input, { ...schema, readOnly: true }, 200_000);
		const invalid = await promptModelConfigurationNumber(input, schema, 200_000);
		assert.deepStrictEqual({ calls, readOnly, invalid }, { calls: 1, readOnly: undefined, invalid: undefined });
	});

	test('common menu writes presets and custom through supplied native actions', async () => {
		const writes: unknown[] = [];
		let custom = 0;
		const actions = createModelConfigurationActions({ properties: { contextSize: schema } }, { contextSize: 250_000 },
			(key, value) => writes.push({ key, value }), async key => { assert.strictEqual(key, 'contextSize'); custom++; });
		const submenu = actions[0];
		assert.ok(submenu instanceof SubmenuAction);
		const choices = submenu.actions;
		await choices[0].run();
		await choices[3].run();
		assert.deepStrictEqual({ writes, custom, checked: choices.map(choice => choice.checked) }, {
			writes: [{ key: 'contextSize', value: 200_000 }], custom: 1, checked: [false, false, false, true],
		});
	});
});
