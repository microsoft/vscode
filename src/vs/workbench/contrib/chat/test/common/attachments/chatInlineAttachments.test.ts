/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { Range } from '../../../../../../editor/common/core/range.js';
import { OffsetRange } from '../../../../../../editor/common/core/ranges/offsetRange.js';
import { canOpenAttachment, canShowAttachmentInline, getAttachmentMention, getAttachmentPromptText, getInlineRequestAttachments, getMarkdownCodeRanges, INLINE_ATTACHMENT_ANCHOR as A, isInlineAttachmentCandidate, projectInlineAttachments, recoverAttachmentMentions } from '../../../common/attachments/chatInlineAttachments.js';
import { IChatRequestVariableEntry } from '../../../common/attachments/chatVariableEntries.js';
import { IDynamicVariable } from '../../../common/attachments/chatVariables.js';
import { ChatRequestDynamicVariablePart, ChatRequestTextPart, ChatRequestToolPart } from '../../../common/requestParser/chatParserTypes.js';

suite('Chat inline attachments', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	function reference(id: string, range: Range, extra?: Partial<IDynamicVariable>): IDynamicVariable {
		return { id, range, data: undefined, ...extra };
	}

	function summarize(input: string, anchors: Parameters<typeof projectInlineAttachments>[1], references: IDynamicVariable[]) {
		const projection = projectInlineAttachments(input, anchors, references);
		return projection && {
			text: projection.text,
			references: projection.references.map(r => ({ id: r.id, range: Range.lift(r.range).toString(), isAttachmentReference: r.isAttachmentReference })),
			replacements: projection.replacements,
		};
	}

	test('input without anchors already is the prompt', () => {
		assert.strictEqual(projectInlineAttachments('compare #file:a.ts', [], []), undefined);
	});

	test('expands pills in place and projects their references with the input references', () => {
		const input = `compare ${A} with ${A} and #sym:Foo`;
		assert.deepStrictEqual(summarize(input, [
			{ offset: 8, text: '#attachment:a.png', reference: reference('a', new Range(1, 1, 1, 1), { isAttachmentReference: true }) },
			{ offset: 15, text: '#file:b.ts', reference: reference('b', new Range(1, 1, 1, 1)) },
		], [reference('sym', new Range(1, 22, 1, 30))]), {
			text: 'compare #attachment:a.png with #file:b.ts and #sym:Foo',
			references: [
				{ id: 'sym', range: '[1,47 -> 1,55]', isAttachmentReference: undefined },
				{ id: 'a', range: '[1,9 -> 1,26]', isAttachmentReference: true },
				{ id: 'b', range: '[1,32 -> 1,42]', isAttachmentReference: undefined },
			],
			replacements: [
				{ inputOffset: 8, text: '#attachment:a.png' },
				{ inputOffset: 15, text: '#file:b.ts' },
			],
		});
	});

	test('separates pills from adjacent text and drops anchors without a pill', () => {
		const input = `a${A}b${A}${A}c ${A}`;
		const projection = projectInlineAttachments(input, [
			{ offset: 1, text: '#x' },
			{ offset: 3, text: '#y' },
			{ offset: 4, text: '#z' },
		], [])!;
		assert.deepStrictEqual({
			text: projection.text,
			promptOffsets: [0, 1, 2, 3, 4, 5, 6, 7].map(offset => projection.toPromptOffset(offset)),
			inputRanges: [
				projection.toInputRange(new Range(1, 3, 1, 5)).toString(),
				projection.toInputRange(new Range(1, 1, 1, 15)).toString(),
			],
		}, {
			text: 'a #x b #y #z c ',
			promptOffsets: [0, 1, 5, 6, 9, 13, 14, 15],
			inputRanges: [
				'[1,2 -> 1,3]',
				'[1,1 -> 1,7]',
			],
		});
	});

	test('maps positions across lines', () => {
		const input = `first\r\n${A} second ${A}`;
		const projection = projectInlineAttachments(input, [
			{ offset: 7, text: '#file:a.ts', reference: reference('a', new Range(1, 1, 1, 1)) },
			{ offset: 16, text: '#file:b.ts', reference: reference('b', new Range(1, 1, 1, 1)) },
		], [])!;
		assert.deepStrictEqual({
			text: projection.text,
			references: projection.references.map(r => Range.lift(r.range).toString()),
			promptRange: projection.toPromptRange(new Range(2, 2, 2, 10)).toString(),
			inputRange: projection.toInputRange(new Range(2, 5, 2, 21)).toString(),
		}, {
			text: 'first\r\n#file:a.ts second #file:b.ts',
			references: ['[2,1 -> 2,11]', '[2,19 -> 2,29]'],
			promptRange: '[2,11 -> 2,19]',
			inputRange: '[2,1 -> 2,11]',
		});
	});

	test('shows the attachments of a request inline, including images', () => {
		const text = 'compare #attachment:a.ts #attachment:shot.png #codebase #attachment:gone.ts';
		const parts = [
			new ChatRequestTextPart(new OffsetRange(0, 8), new Range(1, 1, 1, 9), 'compare '),
			new ChatRequestDynamicVariablePart(new OffsetRange(8, 24), new Range(1, 9, 1, 25), '#attachment:a.ts', 'file-a', undefined, undefined, 'a.ts', undefined, true, false, undefined, true),
			new ChatRequestTextPart(new OffsetRange(24, 25), new Range(1, 25, 1, 26), ' '),
			new ChatRequestDynamicVariablePart(new OffsetRange(25, 45), new Range(1, 26, 1, 46), '#attachment:shot.png', 'image-1', undefined, undefined, 'shot.png', undefined, false, false, undefined, true),
			new ChatRequestTextPart(new OffsetRange(45, 46), new Range(1, 46, 1, 47), ' '),
			new ChatRequestToolPart(new OffsetRange(46, 55), new Range(1, 47, 1, 56), 'codebase', 'search-codebase'),
			new ChatRequestTextPart(new OffsetRange(55, 56), new Range(1, 56, 1, 57), ' '),
			new ChatRequestDynamicVariablePart(new OffsetRange(56, text.length), new Range(1, 57, 1, text.length + 1), '#attachment:gone.ts', 'file-gone', undefined, undefined, 'gone.ts', undefined, true, false, undefined, true),
		];
		const variables: IChatRequestVariableEntry[] = [
			{ kind: 'file', id: 'file-a', name: 'a.ts', value: URI.file('/a.ts') },
			{ kind: 'image', id: 'image-1', name: 'shot.png', value: new Uint8Array() },
		];
		const inline = getInlineRequestAttachments(parts, variables);
		assert.deepStrictEqual([...inline].map(([index, attachment]) => [index, attachment.kind, attachment.id]), [
			[1, 'file', 'file-a'],
			[3, 'image', 'image-1'],
			[5, 'tool', 'search-codebase'],
		]);
	});

	test('shows every attachment inline, including images, except agent host completions', () => {
		assert.deepStrictEqual([
			{ kind: 'file', id: 'file', name: 'a.ts', value: URI.file('/a.ts') },
			{ kind: 'image', id: 'image', name: 'shot.png', value: new Uint8Array() },
			{ kind: 'notebookOutput', id: 'plot', name: 'plot', value: URI.file('/a.ipynb'), mimeType: 'image/png' },
			{ kind: 'file', id: 'ranged', name: 'b.ts', value: URI.file('/b.ts'), range: { start: 0, endExclusive: 5 } },
		].map(attachment => [canShowAttachmentInline(attachment as IChatRequestVariableEntry), isInlineAttachmentCandidate(attachment as IChatRequestVariableEntry)]), [
			[true, true],
			[true, true],
			[true, true],
			[true, false],
		]);
	});

	test('reads an attachment in the prompt sent to the model as its name and location', () => {
		assert.deepStrictEqual([
			{ kind: 'file', id: 'file', name: 'a b.ts', value: URI.file('/src/a b.ts') },
			{ kind: 'file', id: 'completed', name: 'file:c.ts', value: URI.file('/src/c.ts') },
			{ kind: 'directory', id: 'folder', name: 'docs', value: URI.file('/docs') },
			{ kind: 'symbol', id: 'symbol', name: 'main', value: { uri: URI.file('/src/app.ts'), range: new Range(3, 1, 5, 2) }, symbolKind: 11 },
			{ kind: 'generic', id: 'github-context:https://github.com/o/r/pull/1', name: 'o/r#1', value: 'GitHub context: https://github.com/o/r/pull/1' },
			{ kind: 'image', id: 'dropped', name: 'shot [1].png', fullName: '/shot [1].png', value: new Uint8Array(), references: [{ kind: 'reference', reference: URI.file('/shot [1].png') }] },
			{ kind: 'image', id: 'pasted', name: 'Pasted Image', value: new Uint8Array() },
			{ kind: 'paste', id: 'paste', name: 'Pasted text #1', value: 'x', code: 'x', language: 'plaintext', pastedLines: '1 line', fileName: 'Pasted text #1', copiedFrom: undefined },
		].map(attachment => getAttachmentPromptText(attachment as IChatRequestVariableEntry)), [
			'[a b.ts](file:///src/a%20b.ts)',
			'[c.ts](file:///src/c.ts)',
			'[docs](file:///docs)',
			'[main](file:///src/app.ts#L3-L5)',
			'[o/r#1](https://github.com/o/r/pull/1)',
			'[shot \\[1\\].png](file:///shot%20%5B1%5D.png)',
			'Pasted Image',
			'Pasted text #1',
		]);
	});

	test('the projected reference of a pill reads as what the prompt sent to the model says, and otherwise as its text', () => {
		const pillReference: IDynamicVariable = { id: 'a', range: new Range(1, 1, 1, 1), data: URI.file('/a.ts'), isAttachmentReference: true, promptText: 'stale' };
		const input = `see ${A} and ${A}`;
		const anchors = [
			{ offset: 4, text: '#attachment:a.ts', reference: pillReference, promptText: '[a.ts](file:///a.ts)' },
			{ offset: 10, text: '#attachment:a.ts', reference: pillReference },
		];
		const projection = projectInlineAttachments(input, anchors, []);
		assert.deepStrictEqual(projection?.references.map(projected => [projected.id, projected.promptText]), [
			['a', '[a.ts](file:///a.ts)'],
			['a', undefined],
		]);
	});

	test('mentions an attachment on a single line', () => {
		assert.deepStrictEqual([
			getAttachmentMention('index.ts'),
			getAttachmentMention('for f in *; do\r\n  echo $f\ndone', '@'),
		], [
			'#attachment:index.ts',
			'@attachment:for f in *; do   echo $f done',
		]);
	});

	test('finds the code of a prompt, where mentions are not pills', () => {
		const text = 'see `#attachment:a.ts` and #attachment:b.ts\r\n\r\n```\n#attachment:c.ts\n```\n- item `x`';
		assert.deepStrictEqual(getMarkdownCodeRanges(text).map(range => text.slice(range.start, range.endExclusive)), [
			'`#attachment:a.ts`',
			'```\n#attachment:c.ts\n```\n',
			'`x`',
		]);

		const parts = [
			new ChatRequestTextPart(new OffsetRange(0, 5), new Range(1, 1, 1, 6), 'see `'),
			new ChatRequestDynamicVariablePart(new OffsetRange(5, 21), new Range(1, 6, 1, 22), '#attachment:a.ts', 'a', undefined, undefined, 'a.ts', undefined, true, false, undefined, true),
			new ChatRequestTextPart(new OffsetRange(21, 27), new Range(1, 22, 1, 28), '` and '),
			new ChatRequestDynamicVariablePart(new OffsetRange(27, 43), new Range(1, 28, 1, 44), '#attachment:b.ts', 'b', undefined, undefined, 'b.ts', undefined, true, false, undefined, true),
		];
		const variables: IChatRequestVariableEntry[] = [
			{ kind: 'file', id: 'a', name: 'a.ts', value: URI.file('/a.ts') },
			{ kind: 'file', id: 'b', name: 'b.ts', value: URI.file('/b.ts') },
		];
		assert.deepStrictEqual([...getInlineRequestAttachments(parts, variables, text).keys()], [3]);
	});

	test('finds code nested in block quotes and lists', () => {
		const text = '> ```\n> #attachment:a.ts\n> ```\n\n- item `#attachment:b.ts`\n- item\n\n  ```\n  #attachment:c.ts\n  ```\n\n> - quoted `#attachment:d.ts` item';
		assert.deepStrictEqual(getMarkdownCodeRanges(text).map(range => text.slice(range.start, range.endExclusive)), [
			'```\n> #attachment:a.ts\n> ```',
			'`#attachment:b.ts`',
			'```\n  #attachment:c.ts\n  ```',
			'`#attachment:d.ts`',
		]);
	});

	test('recovers the mentions of attachments in a request whose history kept only its text', () => {
		const text = 'compare #attachment:index.ts with #attachment:index.ts and #attachment:a.tsx, #b.ts, https://github.com/o/r/pull/1/files and not `#attachment:a.ts`';
		const message = { text, parts: [new ChatRequestTextPart(new OffsetRange(0, text.length), new Range(1, 1, 1, text.length + 1), text)] };
		const variables: IChatRequestVariableEntry[] = [
			{ kind: 'file', id: 'first', name: 'index.ts', value: URI.file('/a/index.ts') },
			{ kind: 'file', id: 'second', name: 'index.ts', value: URI.file('/b/index.ts') },
			{ kind: 'file', id: 'short', name: 'a.ts', value: URI.file('/a.ts') },
			{ kind: 'file', id: 'long', name: 'a.tsx', value: URI.file('/a.tsx') },
			{ kind: 'file', id: 'completed', name: 'b.ts', value: URI.file('/b.ts') },
			{ kind: 'generic', id: 'github-context:https://github.com/o/r/pull/1', name: 'o/r#1', value: 'GitHub context: https://github.com/o/r/pull/1' },
			{ kind: 'image', id: 'image', name: 'shot.png', value: new Uint8Array() },
		];
		const recovered = recoverAttachmentMentions(message, variables);
		assert.deepStrictEqual({
			parts: recovered.parts.map(part => part instanceof ChatRequestDynamicVariablePart ? `[${part.id}]` : part.text),
			inline: [...getInlineRequestAttachments(recovered.parts, variables, text).values()].map(variable => variable.id),
		}, {
			parts: ['compare ', '[first]', ' with ', '[second]', ' and ', '[long]', ', ', '[completed]', ', ', '[github-context:https://github.com/o/r/pull/1]', ' and not `#attachment:a.ts`'],
			inline: ['first', 'second', 'long', 'completed', 'github-context:https://github.com/o/r/pull/1'],
		});
	});

	test('recovers the mentions that the prompt sent to the model read pills as', () => {
		const text = 'compare [utils.ts](file:///src/utils.ts) with [utils.ts](file:///src/utils.ts) using Pasted text #1, not Pasted text #12 or MyPasted text #1';
		const message = { text, parts: [new ChatRequestTextPart(new OffsetRange(0, text.length), new Range(1, 1, 1, text.length + 1), text)] };
		const variables: IChatRequestVariableEntry[] = [
			{ kind: 'file', id: 'utils', name: 'utils.ts', value: URI.file('/src/utils.ts') },
			{ kind: 'paste', id: 'paste', name: 'Pasted text #1', value: 'x', code: 'x', language: 'plaintext', pastedLines: '1 line', fileName: 'Pasted text #1', copiedFrom: undefined },
		];
		const recovered = recoverAttachmentMentions(message, variables);
		assert.deepStrictEqual(recovered.parts.map(part => part instanceof ChatRequestDynamicVariablePart ? `[${part.id}]` : part.text), [
			'compare ', '[utils]', ' with ', '[utils]', ' using ', '[paste]', ', not Pasted text #12 or MyPasted text #1',
		]);
	});

	test('opens pills only when activating them does something', () => {
		assert.deepStrictEqual([
			{ kind: 'file', id: 'file', name: 'a.ts', value: URI.file('/a.ts') },
			{ kind: 'directory', id: 'folder', name: 'src', value: URI.file('/src') },
			{ kind: 'tool', id: 'tool', name: 'fetch', value: undefined },
			{ kind: 'paste', id: 'paste', name: 'Pasted', value: 'x', code: 'x', language: 'plaintext', pastedLines: '1 line', fileName: 'Pasted', copiedFrom: undefined },
			{ kind: 'string', id: 'pr', name: 'PR #1', value: 'pr', uri: URI.parse('https://github.com/o/r/pull/1'), handle: 0 },
			{ kind: 'string', id: 'item', name: 'Item', value: 'item', uri: URI.parse('https://example.com'), handle: 0, commandId: 'open' },
			{ kind: 'diagnostic', id: 'problems', name: 'Problems', value: undefined },
		].map(attachment => canOpenAttachment(attachment as IChatRequestVariableEntry)), [true, true, false, false, false, true, true]);
	});
});
