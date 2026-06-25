/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { StateType } from '../../../../../platform/update/common/update.js';
import { getUpdateIndicatorVariant, shouldRenderIconUpdateIndicator } from '../../common/updateIconExperiment.js';

suite('UpdateIconExperiment', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('maps treatment values to variants', () => {
		assert.strictEqual(getUpdateIndicatorVariant(undefined), 'text');
		assert.strictEqual(getUpdateIndicatorVariant(false), 'text');
		assert.strictEqual(getUpdateIndicatorVariant('disabled'), 'text');

		assert.strictEqual(getUpdateIndicatorVariant(true), 'icon');
		assert.strictEqual(getUpdateIndicatorVariant('enabled'), 'icon');
		assert.strictEqual(getUpdateIndicatorVariant('icon'), 'icon');
	});

	test('renders icon only for actionable update states', () => {
		assert.strictEqual(shouldRenderIconUpdateIndicator('icon', StateType.AvailableForDownload), true);
		assert.strictEqual(shouldRenderIconUpdateIndicator('icon', StateType.Downloaded), true);
		assert.strictEqual(shouldRenderIconUpdateIndicator('icon', StateType.Ready), true);

		assert.strictEqual(shouldRenderIconUpdateIndicator('icon', StateType.Disabled), false);
		assert.strictEqual(shouldRenderIconUpdateIndicator('icon', StateType.Downloading), false);
		assert.strictEqual(shouldRenderIconUpdateIndicator('text', StateType.Ready), false);
	});
});
