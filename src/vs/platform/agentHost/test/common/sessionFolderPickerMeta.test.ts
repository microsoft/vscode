/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { parseSessionFolderPickerDecision, readSessionFolderPickerDecision, SESSION_META_FOLDER_PICKER_KEY, withSessionFolderPickerDecision, withSessionGitHubState } from '../../common/state/sessionState.js';

suite('Session folder-picker meta', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('reads validated decisions and rejects malformed ones', () => {
		assert.deepStrictEqual({
			absent: readSessionFolderPickerDecision(undefined),
			empty: readSessionFolderPickerDecision({}),
			shown: readSessionFolderPickerDecision({ [SESSION_META_FOLDER_PICKER_KEY]: { hidden: false } }),
			hiddenWithPrimary: readSessionFolderPickerDecision({ [SESSION_META_FOLDER_PICKER_KEY]: { hidden: true, primary: 'file:///wsB' } }),
			nonBooleanHidden: readSessionFolderPickerDecision({ [SESSION_META_FOLDER_PICKER_KEY]: { hidden: 'yes' } }),
			emptyPrimary: readSessionFolderPickerDecision({ [SESSION_META_FOLDER_PICKER_KEY]: { hidden: true, primary: '' } }),
			shownWithPrimary: readSessionFolderPickerDecision({ [SESSION_META_FOLDER_PICKER_KEY]: { hidden: false, primary: 'file:///wsB' } }),
			notAnObject: readSessionFolderPickerDecision({ [SESSION_META_FOLDER_PICKER_KEY]: 'nope' }),
		}, {
			absent: undefined,
			empty: undefined,
			shown: { hidden: false },
			hiddenWithPrimary: { hidden: true, primary: 'file:///wsB' },
			nonBooleanHidden: undefined,
			emptyPrimary: undefined,
			shownWithPrimary: undefined,
			notAnObject: undefined,
		});
	});

	test('round-trips the decision, preserves other slots, and clears to undefined', () => {
		const withOther = withSessionGitHubState(undefined, { owner: 'octo' });
		const tagged = withSessionFolderPickerDecision(withOther, { hidden: true, primary: 'file:///wsB' });

		assert.deepStrictEqual({
			decision: readSessionFolderPickerDecision(tagged),
			otherSlotPreserved: tagged?.['github'],
			cleared: withSessionFolderPickerDecision(tagged, undefined)?.[SESSION_META_FOLDER_PICKER_KEY],
			collapsesToUndefined: withSessionFolderPickerDecision({ [SESSION_META_FOLDER_PICKER_KEY]: { hidden: true } }, undefined),
		}, {
			decision: { hidden: true, primary: 'file:///wsB' },
			otherSlotPreserved: { owner: 'octo' },
			cleared: undefined,
			collapsesToUndefined: undefined,
		});
	});

	test('survives the persisted DB string round-trip and rejects malformed JSON', () => {
		assert.deepStrictEqual({
			hidden: parseSessionFolderPickerDecision(JSON.stringify({ hidden: true })),
			hiddenWithPrimary: parseSessionFolderPickerDecision(JSON.stringify({ hidden: true, primary: 'file:///wsB' })),
			shown: parseSessionFolderPickerDecision(JSON.stringify({ hidden: false })),
			absent: parseSessionFolderPickerDecision(undefined),
			malformedJson: parseSessionFolderPickerDecision('{'),
			malformedShape: parseSessionFolderPickerDecision(JSON.stringify({ hidden: 'yes' })),
			shownWithPrimary: parseSessionFolderPickerDecision(JSON.stringify({ hidden: false, primary: 'file:///wsB' })),
		}, {
			hidden: { hidden: true },
			hiddenWithPrimary: { hidden: true, primary: 'file:///wsB' },
			shown: { hidden: false },
			absent: undefined,
			malformedJson: undefined,
			malformedShape: undefined,
			shownWithPrimary: undefined,
		});
	});
});
