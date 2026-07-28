/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { OffsetRange } from '../../../../../../editor/common/core/ranges/offsetRange.js';
import { Range } from '../../../../../../editor/common/core/range.js';
import { getImmediateSilentSlashCommandPart } from '../../../browser/widget/chatWidget.js';
import { ChatAgentLocation } from '../../../common/constants.js';
import { ChatRequestSlashCommandPart, ChatRequestTextPart, IParsedChatRequest } from '../../../common/requestParser/chatParserTypes.js';

suite('ChatWidget', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('identifies only leading silent execute-immediately slash commands', () => {
		const command = new ChatRequestSlashCommandPart(
			new OffsetRange(0, 7),
			new Range(1, 1, 1, 8),
			{
				command: 'models',
				detail: 'Open models',
				executeImmediately: true,
				silent: true,
				locations: [ChatAgentLocation.Chat],
			},
		);
		const nonSilentCommand = new ChatRequestSlashCommandPart(
			new OffsetRange(0, 5),
			new Range(1, 1, 1, 6),
			{
				command: 'help',
				detail: 'Show help',
				executeImmediately: true,
				silent: false,
				locations: [ChatAgentLocation.Chat],
			},
		);
		const delayedCommand = new ChatRequestSlashCommandPart(
			new OffsetRange(0, 7),
			new Range(1, 1, 1, 8),
			{
				command: 'rename',
				detail: 'Rename chat',
				executeImmediately: false,
				silent: true,
				locations: [ChatAgentLocation.Chat],
			},
		);
		const prefix = new ChatRequestTextPart(new OffsetRange(0, 1), new Range(1, 1, 1, 2), ' ');
		const shiftedCommand = new ChatRequestSlashCommandPart(
			new OffsetRange(1, 8),
			new Range(1, 2, 1, 9),
			command.slashCommand,
		);

		assert.deepStrictEqual([
			getImmediateSilentSlashCommandPart({ text: '/models', parts: [command] } satisfies IParsedChatRequest)?.slashCommand.command,
			getImmediateSilentSlashCommandPart({ text: '/help', parts: [nonSilentCommand] } satisfies IParsedChatRequest)?.slashCommand.command,
			getImmediateSilentSlashCommandPart({ text: '/rename', parts: [delayedCommand] } satisfies IParsedChatRequest)?.slashCommand.command,
			getImmediateSilentSlashCommandPart({ text: ' /models', parts: [prefix, shiftedCommand] } satisfies IParsedChatRequest)?.slashCommand.command,
		], [
			'models',
			undefined,
			undefined,
			undefined,
		]);
	});
});
