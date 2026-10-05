/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { Event } from '../../../../../base/common/event.js';
import { constObservable } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { Position } from '../../../../../editor/common/core/position.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { OffsetRange } from '../../../../../editor/common/core/ranges/offsetRange.js';
import { CompletionItem, CompletionItemKind } from '../../../../../editor/common/languages.js';
import { createTextModel } from '../../../../../editor/test/common/testTextModel.js';
import { withTestCodeEditor } from '../../../../../editor/test/browser/testCodeEditor.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { IChatInputCompletionItem, IChatSessionsService } from '../../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { IChatRequestVariableEntry, toAgentHostCompletionVariableEntry, AgentHostCompletionReferenceKind } from '../../../../../workbench/contrib/chat/common/attachments/chatVariableEntries.js';
import { ISessionContext } from '../../../../services/sessions/browser/sessionContext.js';
import { AgentHostInputCompletionHandler, getAgentHostCompletionAttachmentRange, getCommandArgumentHintPlaceholder } from '../../browser/agentHostInputCompletions.js';
import { INewChatAttachments } from '../../browser/newChatContextAttachments.js';

class TestableAgentHostInputCompletionHandler extends AgentHostInputCompletionHandler {
	buildItem(position: Position, item: IChatInputCompletionItem): CompletionItem | undefined {
		return this._buildItem(position, item);
	}
}

suite('AgentHostInputCompletions', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('shows plain-text sandbox slash commands without adding an attachment', async () => {
		const services = new ServiceCollection(
			[ISessionContext, { _serviceBrand: undefined, session: constObservable(undefined) }],
			[IChatSessionsService, new class extends mock<IChatSessionsService>() { }],
		);
		const model = store.add(createTextModel('/', null, undefined, URI.parse('test:input')));
		await withTestCodeEditor(model, { serviceCollection: services }, async (editor, _viewModel, instantiationService) => {
			const attachments = new class extends mock<INewChatAttachments>() {
				override readonly onDidChangeContext = Event.None;
				override readonly attachments = [];
			};
			const handler = store.add(instantiationService.createInstance(TestableAgentHostInputCompletionHandler, editor, attachments, async () => true));
			assert.deepStrictEqual(handler.buildItem(new Position(1, 2), {
				insertText: '/review',
				label: 'Review the workspace',
				start: { lineNumber: 1, column: 1 },
				end: { lineNumber: 1, column: 2 },
				attachment: { kind: 'text' },
			}), {
				label: { label: '/review', description: 'Review the workspace' },
				insertText: '/review',
				filterText: '/review',
				range: {
					insert: new Range(1, 1, 1, 2),
					replace: new Range(1, 1, 1, 2),
				},
				kind: CompletionItemKind.Text,
			});
		});
	});

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

	test('does not resolve a numbered reference inside a higher-numbered sibling', () => {
		const text = 'see #attachment:Pasted text #10 here';

		assert.deepStrictEqual({
			prefixOfSibling: getAgentHostCompletionAttachmentRange(text, '#attachment:Pasted text #1', undefined, 0, text.length),
			exactSibling: getAgentHostCompletionAttachmentRange(text, '#attachment:Pasted text #10', undefined, 0, text.length),
		}, {
			prefixOfSibling: undefined,
			exactSibling: new OffsetRange(4, 31),
		});
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
