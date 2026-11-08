/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { computeAggregateIssueIcon, computeIssueIcon } from '../../common/chatIssue.js';

suite('Chat Issue Icons', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('shares issue glyphs and colors across chat surfaces', () => {
		const icons = [
			computeIssueIcon('open', undefined),
			computeIssueIcon('closed', 'completed'),
			computeIssueIcon('closed', 'not_planned'),
			computeIssueIcon('closed', 'duplicate'),
		];
		assert.deepStrictEqual(icons.map(icon => ({ id: icon.id, color: icon.color?.id })), [
			{ id: 'issue-opened', color: 'charts.green' },
			{ id: 'issue-closed', color: 'charts.purple' },
			{ id: 'issue-closed', color: 'descriptionForeground' },
			{ id: 'issue-closed', color: 'descriptionForeground' },
		]);
	});

	test('prioritizes open and unresolved issues, then completed issues, then discarded issues', () => {
		const icons = [
			computeAggregateIssueIcon([]),
			computeAggregateIssueIcon([undefined, { state: 'closed', stateReason: 'completed' }]),
			computeAggregateIssueIcon([{ state: 'closed' }, { state: 'open' }]),
			computeAggregateIssueIcon([{ state: 'closed', stateReason: 'not_planned' }, { state: 'closed', stateReason: 'completed' }]),
			computeAggregateIssueIcon([{ state: 'closed', stateReason: 'not_planned' }, { state: 'closed', stateReason: 'duplicate' }]),
		];
		assert.deepStrictEqual(icons.map(icon => ({ id: icon.id, color: icon.color?.id })), [
			{ id: 'issue-opened', color: 'charts.green' },
			{ id: 'issue-opened', color: 'charts.green' },
			{ id: 'issue-opened', color: 'charts.green' },
			{ id: 'issue-closed', color: 'charts.purple' },
			{ id: 'issue-closed', color: 'descriptionForeground' },
		]);
	});
});
