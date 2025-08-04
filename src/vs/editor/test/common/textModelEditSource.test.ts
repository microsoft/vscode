/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { EditSources } from '../../common/textModelEditSource.js';
import { ProviderId } from '../../common/languages.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';

suite('TextModelEditSource', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('applyEdits - backward compatibility without parameters', () => {
		const editSource = EditSources.applyEdits();
		assert.strictEqual(editSource.metadata.source, 'applyEdits');
		assert.strictEqual(editSource.metadata.$extensionId, undefined);
		assert.strictEqual(editSource.metadata.$extensionVersion, undefined);
		assert.strictEqual(editSource.metadata.$providerId, undefined);
	});

	test('applyEdits - with empty data object', () => {
		const editSource = EditSources.applyEdits({});
		assert.strictEqual(editSource.metadata.source, 'applyEdits');
		assert.strictEqual(editSource.metadata.$extensionId, undefined);
		assert.strictEqual(editSource.metadata.$extensionVersion, undefined);
		assert.strictEqual(editSource.metadata.$providerId, undefined);
	});

	test('applyEdits - with providerId containing extension information', () => {
		const providerId = new ProviderId('test.extension', '1.0.0', 'testProvider');
		const editSource = EditSources.applyEdits({ providerId });
		
		assert.strictEqual(editSource.metadata.source, 'applyEdits');
		assert.strictEqual(editSource.metadata.$extensionId, 'test.extension');
		assert.strictEqual(editSource.metadata.$extensionVersion, '1.0.0');
		assert.strictEqual(editSource.metadata.$providerId, 'testProvider');
	});

	test('applyEdits - with undefined providerId', () => {
		const editSource = EditSources.applyEdits({ providerId: undefined });
		assert.strictEqual(editSource.metadata.source, 'applyEdits');
		assert.strictEqual(editSource.metadata.$extensionId, undefined);
		assert.strictEqual(editSource.metadata.$extensionVersion, undefined);
		assert.strictEqual(editSource.metadata.$providerId, undefined);
	});

	test('applyEdits - maintains consistency with other EditSources methods', () => {
		const providerId = new ProviderId('test.extension', '1.0.0', 'testProvider');
		
		// Compare with suggest method which has the same pattern
		const suggestSource = EditSources.suggest({ providerId });
		const applyEditsSource = EditSources.applyEdits({ providerId });
		
		assert.strictEqual(suggestSource.metadata.$extensionId, applyEditsSource.metadata.$extensionId);
		assert.strictEqual(suggestSource.metadata.$extensionVersion, applyEditsSource.metadata.$extensionVersion);
		assert.strictEqual(suggestSource.metadata.$providerId, applyEditsSource.metadata.$providerId);
	});
});