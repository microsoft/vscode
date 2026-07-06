/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { OffsetRange } from '../../../../../editor/common/core/ranges/offsetRange.js';
import { getAgentHostCompletionAttachmentRange } from '../../browser/agentHostInputCompletions.js';

suite('AgentHostInputCompletions', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('uses the accepted occurrence when duplicate slash tokens exist', () => {
		const text = 'first /rename then accepted /rename';
		const acceptedStart = text.lastIndexOf('/rename');

		assert.deepStrictEqual(
			getAgentHostCompletionAttachmentRange(
				text,
				'/rename',
				new OffsetRange(acceptedStart, acceptedStart + '/rename'.length),
				0,
				text.length
			),
			new OffsetRange(acceptedStart, acceptedStart + '/rename'.length)
		);
	});

	test('converts accepted occurrence ranges to trimmed message offsets', () => {
		const rawText = '  /rename  ';
		const messageText = rawText.trim();
		const messageOffset = rawText.length - rawText.trimStart().length;

		assert.deepStrictEqual(
			getAgentHostCompletionAttachmentRange(
				rawText,
				'/rename',
				new OffsetRange(2, 9),
				messageOffset,
				messageText.length
			),
			new OffsetRange(0, '/rename'.length)
		);
	});
});
