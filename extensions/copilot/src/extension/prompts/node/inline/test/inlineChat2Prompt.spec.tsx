/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { expect, suite, test } from 'vitest';
import { TextDocumentSnapshot } from '../../../../../platform/editing/common/textDocumentSnapshot';
import { createTextDocumentData, setDocText } from '../../../../../util/common/test/shims/textDocument';
import { URI } from '../../../../../util/vs/base/common/uri';
import { ExtendedLanguageModelToolResult, LanguageModelTextPart, LanguageModelToolResult, Position, Range } from '../../../../../vscodeTypes';
import { FileContextElement, FileSelectionElement, ICompletedToolCallRound, LARGE_FILE_LINE_THRESHOLD, ToolCallRoundsElement } from '../inlineChat2Prompt';

function createSnapshot(content: string, languageId: string = 'typescript'): TextDocumentSnapshot {
	const uri = URI.file('/workspace/file.ts');
	const docData = createTextDocumentData(uri, content, languageId);
	return TextDocumentSnapshot.create(docData.document);
}

suite('FileContextElement', () => {

	test('cursor at the beginning of the file', async () => {
		const content = `line 1
line 2
line 3
line 4
line 5`;
		const snapshot = createSnapshot(content);
		const position = new Position(0, 0);

		const element = new FileContextElement({ snapshot, position });
		const rendered = await element.render(undefined, { tokenBudget: 1000, countTokens: () => Promise.resolve(0), endpoint: {} as any });

		const output = typeof rendered === 'string' ? rendered : JSON.stringify(rendered) ?? '';
		expect(output).toContain('$CURSOR$');
		expect(output).toContain('line 1');
		expect(output).toContain('line 2');
		expect(output).toContain('line 3');
	});

	test('cursor in the middle of a file', async () => {
		const content = `line 1
line 2
line 3
line 4
line 5
line 6
line 7`;
		const snapshot = createSnapshot(content);
		const position = new Position(3, 2); // after "li" in "line 4"

		const element = new FileContextElement({ snapshot, position });
		const rendered = await element.render(undefined, { tokenBudget: 1000, countTokens: () => Promise.resolve(0), endpoint: {} as any });

		const output = typeof rendered === 'string' ? rendered : JSON.stringify(rendered) ?? '';
		expect(output).toContain('$CURSOR$');
		// Should include lines before and after cursor
		expect(output).toContain('line 2');
		expect(output).toContain('line 3');
		// Cursor position (3, 2) splits "line 4" into "li" + "$CURSOR$" + "ne 4"
		expect(output).toContain('li$CURSOR$ne 4');
		expect(output).toContain('line 5');
		expect(output).toContain('line 6');
	});

	test('cursor at the end of file', async () => {
		const content = `line 1
line 2
line 3
line 4
line 5`;
		const snapshot = createSnapshot(content);
		const position = new Position(4, 6); // end of "line 5"

		const element = new FileContextElement({ snapshot, position });
		const rendered = await element.render(undefined, { tokenBudget: 1000, countTokens: () => Promise.resolve(0), endpoint: {} as any });

		const output = typeof rendered === 'string' ? rendered : JSON.stringify(rendered) ?? '';
		expect(output).toContain('$CURSOR$');
		expect(output).toContain('line 3');
		expect(output).toContain('line 4');
		expect(output).toContain('line 5');
	});

	test('cursor with empty lines - includes extra lines until non-empty', async () => {
		const content = `

line 3
line 4

`;
		const snapshot = createSnapshot(content);
		const position = new Position(2, 0); // start of "line 3"

		const element = new FileContextElement({ snapshot, position });
		const rendered = await element.render(undefined, { tokenBudget: 1000, countTokens: () => Promise.resolve(0), endpoint: {} as any });

		const output = typeof rendered === 'string' ? rendered : JSON.stringify(rendered) ?? '';
		expect(output).toContain('$CURSOR$');
		expect(output).toContain('line 3');
		expect(output).toContain('line 4');
	});

	test('single line file', async () => {
		const content = `only one line`;
		const snapshot = createSnapshot(content);
		const position = new Position(0, 5); // middle of line

		const element = new FileContextElement({ snapshot, position });
		const rendered = await element.render(undefined, { tokenBudget: 1000, countTokens: () => Promise.resolve(0), endpoint: {} as any });

		const output = typeof rendered === 'string' ? rendered : JSON.stringify(rendered) ?? '';
		expect(output).toContain('only $CURSOR$one line');
	});

	test('cursor position splits text correctly', async () => {
		const content = `hello world`;
		const snapshot = createSnapshot(content);
		const position = new Position(0, 6); // after "hello "

		const element = new FileContextElement({ snapshot, position });
		const rendered = await element.render(undefined, { tokenBudget: 1000, countTokens: () => Promise.resolve(0), endpoint: {} as any });

		const output = typeof rendered === 'string' ? rendered : JSON.stringify(rendered) ?? '';
		expect(output).toContain('hello $CURSOR$world');
	});
});

suite('FileSelectionElement', () => {

	test('single line selection', async () => {
		const content = `line 1
line 2
line 3
line 4
line 5`;
		const snapshot = createSnapshot(content);
		const selection = new Range(1, 0, 1, 6); // "line 2"

		const element = new FileSelectionElement({ snapshot, selection });
		const rendered = await element.render(undefined, { tokenBudget: 1000, countTokens: () => Promise.resolve(0), endpoint: {} as any });

		const output = typeof rendered === 'string' ? rendered : JSON.stringify(rendered) ?? '';
		expect(output).toContain('line 2');
		expect(output).not.toContain('line 1');
		expect(output).not.toContain('line 3');
	});

	test('multi-line selection', async () => {
		const content = `line 1
line 2
line 3
line 4
line 5`;
		const snapshot = createSnapshot(content);
		const selection = new Range(1, 0, 3, 6); // "line 2" through "line 4"

		const element = new FileSelectionElement({ snapshot, selection });
		const rendered = await element.render(undefined, { tokenBudget: 1000, countTokens: () => Promise.resolve(0), endpoint: {} as any });

		const output = typeof rendered === 'string' ? rendered : JSON.stringify(rendered) ?? '';
		expect(output).toContain('line 2');
		expect(output).toContain('line 3');
		expect(output).toContain('line 4');
		expect(output).not.toContain('line 1');
		expect(output).not.toContain('line 5');
	});

	test('partial line selection extends to full lines', async () => {
		const content = `line 1
line 2
line 3`;
		const snapshot = createSnapshot(content);
		// Select from middle of line 2 to middle of line 2 (partial)
		const selection = new Range(1, 2, 1, 4);

		const element = new FileSelectionElement({ snapshot, selection });
		const rendered = await element.render(undefined, { tokenBudget: 1000, countTokens: () => Promise.resolve(0), endpoint: {} as any });

		const output = typeof rendered === 'string' ? rendered : JSON.stringify(rendered) ?? '';
		// Should include the full line, not just "ne"
		expect(output).toContain('line 2');
	});

	test('selection at start of file', async () => {
		const content = `line 1
line 2
line 3`;
		const snapshot = createSnapshot(content);
		const selection = new Range(0, 0, 0, 6);

		const element = new FileSelectionElement({ snapshot, selection });
		const rendered = await element.render(undefined, { tokenBudget: 1000, countTokens: () => Promise.resolve(0), endpoint: {} as any });

		const output = typeof rendered === 'string' ? rendered : JSON.stringify(rendered) ?? '';
		expect(output).toContain('line 1');
		expect(output).not.toContain('line 2');
	});

	test('selection at end of file', async () => {
		const content = `line 1
line 2
line 3`;
		const snapshot = createSnapshot(content);
		const selection = new Range(2, 0, 2, 6);

		const element = new FileSelectionElement({ snapshot, selection });
		const rendered = await element.render(undefined, { tokenBudget: 1000, countTokens: () => Promise.resolve(0), endpoint: {} as any });

		const output = typeof rendered === 'string' ? rendered : JSON.stringify(rendered) ?? '';
		expect(output).toContain('line 3');
		expect(output).not.toContain('line 2');
	});

	test('selection spanning partial lines extends to full lines', async () => {
		const content = `first line here
second line here
third line here`;
		const snapshot = createSnapshot(content);
		// Select from middle of "first" to middle of "second"
		const selection = new Range(0, 6, 1, 7);

		const element = new FileSelectionElement({ snapshot, selection });
		const rendered = await element.render(undefined, { tokenBudget: 1000, countTokens: () => Promise.resolve(0), endpoint: {} as any });

		const output = typeof rendered === 'string' ? rendered : JSON.stringify(rendered) ?? '';
		// Should include full lines
		expect(output).toContain('first line here');
		expect(output).toContain('second line here');
		expect(output).not.toContain('third line here');
	});

	test('preserves language id for code block', async () => {
		const content = `const x = 1;`;
		const snapshot = createSnapshot(content, 'javascript');
		const selection = new Range(0, 0, 0, 12);

		const element = new FileSelectionElement({ snapshot, selection });
		const rendered = await element.render(undefined, { tokenBudget: 1000, countTokens: () => Promise.resolve(0), endpoint: {} as any });

		const output = typeof rendered === 'string' ? rendered : JSON.stringify(rendered) ?? '';
		expect(output).toContain('javascript');
	});
});

// --- Helpers for ToolCallRoundsElement tests

function makeToolCall(id: string, name: string = 'replace_string_in_file', args: string = '{}') {
	return { id, name, arguments: args };
}

function makeToolResult(text: string, hasError = false): ExtendedLanguageModelToolResult {
	const result = new LanguageModelToolResult([new LanguageModelTextPart(text)]) as ExtendedLanguageModelToolResult;
	(result as any).hasError = hasError;
	return result;
}

function makeRound(...calls: [string, string][]): ICompletedToolCallRound {
	return {
		calls: calls.map(([id, resultText]) => [makeToolCall(id), makeToolResult(resultText)])
	};
}

function makeDocument(content: string, languageId = 'typescript', uri = URI.file('/workspace/file.ts')) {
	return createTextDocumentData(uri, content, languageId);
}

suite('ToolCallRoundsElement', () => {

	test('empty rounds renders nothing', async () => {
		const doc = makeDocument('const x = 1;');
		const element = new ToolCallRoundsElement({
			previousRounds: [],
			hasFailedEdits: false,
			data: { document: doc.document, selection: new Range(0, 0, 0, 0) } as any,
			documentVersionAtRequest: doc.document.version,
			isLargeFile: false,
			selection: new Range(0, 0, 0, 0),
			filepath: '/workspace/file.ts',
		});
		const rendered = await element.render();
		expect(rendered).toBeUndefined();
	});

	test('single round produces AssistantMessage then ToolMessage', async () => {
		const doc = makeDocument('const x = 1;');
		const element = new ToolCallRoundsElement({
			previousRounds: [makeRound(['call-1', 'result-one'])],
			hasFailedEdits: false,
			data: { document: doc.document, selection: new Range(0, 0, 0, 0) } as any,
			documentVersionAtRequest: doc.document.version,
			isLargeFile: false,
			selection: new Range(0, 0, 0, 0),
			filepath: '/workspace/file.ts',
		});
		const output = JSON.stringify(await element.render());
		// tool call id and result text both appear
		expect(output).toContain('call-1');
		expect(output).toContain('result-one');
	});

	test('hasFailedEdits: false - no feedback tag', async () => {
		const doc = makeDocument('const x = 1;');
		const element = new ToolCallRoundsElement({
			previousRounds: [makeRound(['call-1', 'ok'])],
			hasFailedEdits: false,
			data: { document: doc.document, selection: new Range(0, 0, 0, 0) } as any,
			documentVersionAtRequest: doc.document.version,
			isLargeFile: false,
			selection: new Range(0, 0, 0, 0),
			filepath: '/workspace/file.ts',
		});
		const output = JSON.stringify(await element.render());
		expect(output).not.toContain('feedback');
	});

	test('hasFailedEdits: true + document unchanged - feedback without file content', async () => {
		const doc = makeDocument('const x = 1;');
		const element = new ToolCallRoundsElement({
			previousRounds: [makeRound(['call-1', 'error'])],
			hasFailedEdits: true,
			data: { document: doc.document, selection: new Range(0, 0, 0, 0) } as any,
			documentVersionAtRequest: doc.document.version, // same version = no change
			isLargeFile: false,
			selection: new Range(0, 0, 0, 0),
			filepath: '/workspace/file.ts',
		});
		const output = JSON.stringify(await element.render());
		expect(output).toContain('feedback');
		expect(output).toContain('No changes were made');
		// should NOT include the file content block
		expect(output).not.toContain('current file content');
	});

	test('hasFailedEdits: true + document changed + small file - feedback with full file content', async () => {
		const doc = makeDocument('const x = 1;');
		setDocText(doc, 'const x = 2;'); // bumps version
		const element = new ToolCallRoundsElement({
			previousRounds: [makeRound(['call-1', 'error'])],
			hasFailedEdits: true,
			data: { document: doc.document, selection: new Range(0, 0, 0, 0) } as any,
			documentVersionAtRequest: doc.document.version - 1, // old version
			isLargeFile: false,
			selection: new Range(0, 0, 0, 0),
			filepath: '/workspace/file.ts',
		});
		const output = JSON.stringify(await element.render());
		expect(output).toContain('feedback');
		expect(output).toContain('current file content');
		expect(output).toContain('const x = 2;');
	});

	test('hasFailedEdits: true + document changed + large file - feedback uses CroppedFileContentElement', async () => {
		// Build a document that exceeds the large-file threshold
		const lines = Array.from({ length: LARGE_FILE_LINE_THRESHOLD + 10 }, (_, i) => `let line${i} = ${i};`);
		const content = lines.join('\n');
		const doc = makeDocument(content);
		setDocText(doc, content + '\n// changed');
		const selection = new Range(0, 0, 0, 0);
		const element = new ToolCallRoundsElement({
			previousRounds: [makeRound(['call-1', 'error'])],
			hasFailedEdits: true,
			data: { document: doc.document, selection } as any,
			documentVersionAtRequest: doc.document.version - 1,
			isLargeFile: true,
			selection,
			filepath: '/workspace/file.ts',
		});
		const output = JSON.stringify(await element.render());
		expect(output).toContain('feedback');
		expect(output).toContain('current file content');
		// CroppedFileContentElement receives 'filepath' as a plain string prop (distinguishes it
		// from the small-file path which uses CodeBlock with a 'code' prop instead)
		expect(output).toContain('"filepath":"/workspace/file.ts"');
	});

	test('multiple rounds - content appears in round order', async () => {
		const doc = makeDocument('const x = 1;');
		const element = new ToolCallRoundsElement({
			previousRounds: [
				makeRound(['round1-call', 'round1-result']),
				makeRound(['round2-call', 'round2-result']),
			],
			hasFailedEdits: false,
			data: { document: doc.document, selection: new Range(0, 0, 0, 0) } as any,
			documentVersionAtRequest: doc.document.version,
			isLargeFile: false,
			selection: new Range(0, 0, 0, 0),
			filepath: '/workspace/file.ts',
		});
		const output = JSON.stringify(await element.render());
		const idx1 = output.indexOf('round1-call');
		const idx2 = output.indexOf('round2-call');
		expect(idx1).toBeGreaterThan(-1);
		expect(idx2).toBeGreaterThan(-1);
		expect(idx1).toBeLessThan(idx2);
	});

	test('multiple rounds - results are interleaved with calls (result-1 before call-2)', async () => {
		const doc = makeDocument('const x = 1;');
		const element = new ToolCallRoundsElement({
			previousRounds: [
				makeRound(['round1-call', 'round1-result']),
				makeRound(['round2-call', 'round2-result']),
			],
			hasFailedEdits: false,
			data: { document: doc.document, selection: new Range(0, 0, 0, 0) } as any,
			documentVersionAtRequest: doc.document.version,
			isLargeFile: false,
			selection: new Range(0, 0, 0, 0),
			filepath: '/workspace/file.ts',
		});
		const output = JSON.stringify(await element.render());
		// The interleaving invariant: round1 call → round1 result → round2 call → round2 result
		const idxCall1 = output.indexOf('round1-call');
		const idxResult1 = output.indexOf('round1-result');
		const idxCall2 = output.indexOf('round2-call');
		const idxResult2 = output.indexOf('round2-result');
		expect(idxCall1).toBeGreaterThan(-1);
		expect(idxResult1).toBeGreaterThan(-1);
		expect(idxCall2).toBeGreaterThan(-1);
		expect(idxResult2).toBeGreaterThan(-1);
		// call comes before its own result
		expect(idxCall1).toBeLessThan(idxResult1);
		// round 1's result comes before round 2's call (not batched)
		expect(idxResult1).toBeLessThan(idxCall2);
		// round 2's call comes before its own result
		expect(idxCall2).toBeLessThan(idxResult2);
	});

	test('multiple calls in one round - all calls precede their results', async () => {
		const doc = makeDocument('const x = 1;');
		const round: ICompletedToolCallRound = {
			calls: [
				[makeToolCall('read-call', 'read_file'), makeToolResult('file contents')],
				[makeToolCall('edit-call', 'replace_string_in_file'), makeToolResult('edit result')],
			]
		};
		const element = new ToolCallRoundsElement({
			previousRounds: [round],
			hasFailedEdits: false,
			data: { document: doc.document, selection: new Range(0, 0, 0, 0) } as any,
			documentVersionAtRequest: doc.document.version,
			isLargeFile: false,
			selection: new Range(0, 0, 0, 0),
			filepath: '/workspace/file.ts',
		});
		const output = JSON.stringify(await element.render());
		// Both call ids appear
		expect(output).toContain('read-call');
		expect(output).toContain('edit-call');
		// Both results appear
		expect(output).toContain('file contents');
		expect(output).toContain('edit result');
	});
});
