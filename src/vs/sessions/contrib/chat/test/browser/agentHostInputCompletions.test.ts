/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { OffsetRange } from '../../../../../editor/common/core/ranges/offsetRange.js';
import { IChatRequestVariableEntry, toAgentHostCompletionVariableEntry, AgentHostCompletionReferenceKind } from '../../../../../workbench/contrib/chat/common/attachments/chatVariableEntries.js';
import { getAgentHostCompletionAttachmentRange, getCommandArgumentHintPlaceholder } from '../../browser/agentHostInputCompletions.js';

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

	suite('getCommandArgumentHintPlaceholder', () => {
		function commandEntry(argumentHint: string | undefined): IChatRequestVariableEntry {
			return toAgentHostCompletionVariableEntry(AgentHostCompletionReferenceKind.Command, '/plan', 'plan', { command: 'plan', ...(argumentHint !== undefined ? { argumentHint } : {}) });
		}

		test('returns the hint and end offset when the command is the sole content with a trailing space', () => {
			const entry = commandEntry('task');
			const references = new Map([[entry.id, { text: '/plan', range: new OffsetRange(0, 5) }]]);
			assert.deepStrictEqual(
				getCommandArgumentHintPlaceholder('/plan ', [entry], references),
				{ argumentHint: 'task', endOffset: 5 }
			);
		});

		test('returns undefined without a hint, once an argument is typed, or with leading text', () => {
			const withHint = commandEntry('task');
			const withoutHint = commandEntry(undefined);
			const refs = (entry: IChatRequestVariableEntry, start: number) => new Map([[entry.id, { text: '/plan', range: new OffsetRange(start, start + 5) }]]);

			assert.strictEqual(getCommandArgumentHintPlaceholder('/plan ', [withoutHint], refs(withoutHint, 0)), undefined);
			assert.strictEqual(getCommandArgumentHintPlaceholder('/plan task', [withHint], refs(withHint, 0)), undefined);
			assert.strictEqual(getCommandArgumentHintPlaceholder('hi /plan ', [withHint], refs(withHint, 3)), undefined);
			assert.strictEqual(getCommandArgumentHintPlaceholder('/plan ', [withHint], new Map()), undefined);
		});
	});
});
