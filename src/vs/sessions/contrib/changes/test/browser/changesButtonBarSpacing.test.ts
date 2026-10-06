/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as dom from '../../../../../base/browser/dom.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { CHANGES_OUTSIDE_CARD_CLASS, getChangesButtonBarIconLabelSpacing } from '../../browser/changesButtonBarSpacing.js';

suite('Changes button-bar spacing', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('selects default spacing for the standard outside-card actions row', () => {
		const container = dom.$(`.chat-editing-session-actions.${CHANGES_OUTSIDE_CARD_CLASS}`);
		assert.strictEqual(getChangesButtonBarIconLabelSpacing(container), 'default');
	});

	test('selects compact spacing for the single-pane header row (no outside-card class)', () => {
		const container = dom.$('.chat-editing-session-actions');
		assert.strictEqual(getChangesButtonBarIconLabelSpacing(container), 'compact');
	});
});
