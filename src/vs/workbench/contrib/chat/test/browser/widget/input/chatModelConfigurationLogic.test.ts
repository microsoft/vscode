/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { IStringDictionary } from '../../../../../../../base/common/collections.js';
import { ILanguageModelConfigurationSchema } from '../../../../common/languageModels.js';
import {
	computeStoredConfiguration,
	extractSchemaDefaults,
	resolveModelConfiguration,
} from '../../../../browser/widget/input/chatModelConfigurationLogic.js';

const effortSchema: ILanguageModelConfigurationSchema = {
	properties: {
		thinkingEffort: { enum: ['low', 'medium', 'high'], default: 'medium' },
		contextSize: { type: 'number' }, // no default
	}
};

suite('chatModelConfigurationLogic', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	suite('extractSchemaDefaults', () => {
		test('returns only properties that declare a default', () => {
			assert.deepStrictEqual(extractSchemaDefaults(effortSchema), { thinkingEffort: 'medium' });
		});

		test('returns empty for missing schema or properties', () => {
			assert.deepStrictEqual(extractSchemaDefaults(undefined), {});
			assert.deepStrictEqual(extractSchemaDefaults({}), {});
		});
	});

	suite('resolveModelConfiguration', () => {
		const defaults: IStringDictionary<unknown> = { thinkingEffort: 'medium' };

		test('present non-empty entry is merged over schema defaults and ignores global', () => {
			const resolved = resolveModelConfiguration({ thinkingEffort: 'high' }, defaults, { thinkingEffort: 'low' });
			assert.deepStrictEqual(resolved, { thinkingEffort: 'high' });
		});

		test('present empty entry resolves to schema defaults and ignores global (issue #320393)', () => {
			// An empty entry marks an explicit reset-to-default. It must NOT fall
			// back to the (possibly non-default) profile-global value.
			const resolved = resolveModelConfiguration({}, defaults, { thinkingEffort: 'high' });
			assert.deepStrictEqual(resolved, { thinkingEffort: 'medium' });
		});

		test('absent entry seeds from the profile-global value (migration)', () => {
			const resolved = resolveModelConfiguration(undefined, defaults, { thinkingEffort: 'high' });
			assert.deepStrictEqual(resolved, { thinkingEffort: 'high' });
		});

		test('absent entry with no global value resolves to empty', () => {
			assert.deepStrictEqual(resolveModelConfiguration(undefined, defaults, undefined), {});
		});
	});

	suite('computeStoredConfiguration', () => {
		const defaults: IStringDictionary<unknown> = { thinkingEffort: 'medium' };

		test('keeps non-default overrides', () => {
			assert.deepStrictEqual(computeStoredConfiguration({}, { thinkingEffort: 'high' }, defaults), { thinkingEffort: 'high' });
		});

		test('strips values equal to the schema default, yielding an empty marker', () => {
			assert.deepStrictEqual(computeStoredConfiguration({ thinkingEffort: 'high' }, { thinkingEffort: 'medium' }, defaults), {});
		});

		test('merges new values over the current effective config', () => {
			const current: IStringDictionary<unknown> = { thinkingEffort: 'high', contextSize: 1000 };
			assert.deepStrictEqual(computeStoredConfiguration(current, { contextSize: 2000 }, defaults), { thinkingEffort: 'high', contextSize: 2000 });
		});
	});

	test('end-to-end: explicit reset-to-default does not revert to a stale global value across editors', () => {
		const defaults = extractSchemaDefaults(effortSchema);
		const global: IStringDictionary<unknown> = { thinkingEffort: 'high' };

		// Editor A seeds from global (no scoped entry yet), then the user picks the
		// schema default 'medium'. The persisted entry is an empty marker.
		const seeded = resolveModelConfiguration(undefined, defaults, global);
		const stored = computeStoredConfiguration(seeded, { thinkingEffort: 'medium' }, defaults);
		assert.deepStrictEqual(stored, {});

		// Editor B opens later and reads the persisted (empty) entry: it must resolve
		// to the default 'medium', NOT the stale global 'high'.
		const resolvedInNewEditor = resolveModelConfiguration(stored, defaults, global);
		assert.deepStrictEqual(resolvedInNewEditor, { thinkingEffort: 'medium' });
	});
});
