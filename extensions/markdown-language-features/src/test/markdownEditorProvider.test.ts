/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import 'mocha';
import * as vscode from 'vscode';
import { MarkdownContributions } from '../markdownExtensions';
import { computeMarkdownEditorEdit, getInDocumentLinkTargetRange, getMarkdownCodeBlockEditorApiV1, getMarkdownCodeBlockEditorApiV2, isSupportedMarkdownCodeBlockEditorApiVersion, lineRangesToGutterMarkers, readMarkdownEditorEdit } from '../preview/markdownEditorProvider';
import { encodeWebviewInitialState } from '../preview/webviewInitialState';

suite('Markdown editor links', () => {
	test('validates edits from the webview', () => {
		assert.deepStrictEqual({
			valid: readMarkdownEditorEdit({ start: 1, endExclusive: 3, text: 'new', editEpoch: 2 }),
			negativeStart: readMarkdownEditorEdit({ start: -1, endExclusive: 3, text: 'new', editEpoch: 2 }),
			reversed: readMarkdownEditorEdit({ start: 3, endExclusive: 1, text: 'new', editEpoch: 2 }),
			fractional: readMarkdownEditorEdit({ start: 1.5, endExclusive: 3, text: 'new', editEpoch: 2 }),
			nonText: readMarkdownEditorEdit({ start: 1, endExclusive: 3, text: 4, editEpoch: 2 }),
			staleShape: readMarkdownEditorEdit({ start: 1, endExclusive: 3, text: 'new' }),
		}, {
			valid: { start: 1, endExclusive: 3, text: 'new', editEpoch: 2 },
			negativeStart: undefined,
			reversed: undefined,
			fractional: undefined,
			nonText: undefined,
			staleShape: undefined,
		});
	});

	test('maps sequential LF webview edits onto a CRLF document', () => {
		const resource = vscode.Uri.file('/workspace/readme.md');
		const first = computeMarkdownEditorEdit(resource, 'ab\r\n', vscode.EndOfLine.CRLF, 'ab\r\n', {
			start: 1,
			endExclusive: 1,
			text: '\n',
			editEpoch: 0,
		});
		const second = first && computeMarkdownEditorEdit(resource, first.expectedDocumentText, vscode.EndOfLine.CRLF, first.nextWebviewText, {
			start: 2,
			endExclusive: 2,
			text: 'x',
			editEpoch: 0,
		});

		assert.deepStrictEqual({
			first: first && {
				range: [first.range.start.line, first.range.start.character, first.range.end.line, first.range.end.character],
				replacementText: first.replacementText,
				expectedDocumentText: first.expectedDocumentText,
				nextWebviewText: first.nextWebviewText,
			},
			second: second && {
				range: [second.range.start.line, second.range.start.character, second.range.end.line, second.range.end.character],
				expectedDocumentText: second.expectedDocumentText,
				nextWebviewText: second.nextWebviewText,
			},
		}, {
			first: {
				range: [0, 1, 0, 1],
				replacementText: '\r\n',
				expectedDocumentText: 'a\r\nb\r\n',
				nextWebviewText: 'a\nb\r\n',
			},
			second: {
				range: [1, 0, 1, 0],
				expectedDocumentText: 'a\r\nxb\r\n',
				nextWebviewText: 'a\nxb\r\n',
			},
		});
	});

	test('maps only positioned links within the current document to source ranges', async () => {
		const document = await vscode.workspace.openTextDocument({ language: 'markdown', content: '# First\n\n## Target\n' });
		const targetPosition = { line: 2, character: 0 };

		assert.deepStrictEqual({
			currentDocument: getInDocumentLinkTargetRange(document, {
				kind: 'file',
				uri: document.uri,
				positionOrRange: targetPosition,
			}),
			otherDocument: getInDocumentLinkTargetRange(document, {
				kind: 'file',
				uri: document.uri.with({ path: `${document.uri.path}-other` }),
				positionOrRange: targetPosition,
			}),
			currentDocumentRange: getInDocumentLinkTargetRange(document, {
				kind: 'file',
				uri: document.uri,
				positionOrRange: {
					start: targetPosition,
					end: { line: 2, character: 6 },
				},
			}),
			currentDocumentColumn: getInDocumentLinkTargetRange(document, {
				kind: 'file',
				uri: document.uri,
				positionOrRange: { line: 2, character: 3 },
			}),
			currentDocumentDifferentEol: getInDocumentLinkTargetRange(document, {
				kind: 'file',
				uri: document.uri,
				positionOrRange: targetPosition,
			}, '# First\r\n\r\n## Target\r\n'),
			withoutPosition: getInDocumentLinkTargetRange(document, {
				kind: 'file',
				uri: document.uri,
			}),
			outsideDocument: getInDocumentLinkTargetRange(document, {
				kind: 'file',
				uri: document.uri,
				positionOrRange: { line: document.lineCount, character: 0 },
			}),
		}, {
			currentDocument: {
				start: document.offsetAt(new vscode.Position(2, 0)),
				endExclusive: document.offsetAt(new vscode.Position(2, 9)),
				selectionStart: document.offsetAt(new vscode.Position(2, 0)),
			},
			otherDocument: undefined,
			currentDocumentRange: {
				start: document.offsetAt(new vscode.Position(2, 0)),
				endExclusive: document.offsetAt(new vscode.Position(2, 6)),
				selectionStart: document.offsetAt(new vscode.Position(2, 0)),
			},
			currentDocumentColumn: {
				start: document.offsetAt(new vscode.Position(2, 0)),
				endExclusive: document.offsetAt(new vscode.Position(2, 9)),
				selectionStart: document.offsetAt(new vscode.Position(2, 3)),
			},
			currentDocumentDifferentEol: {
				start: 11,
				endExclusive: 20,
				selectionStart: 11,
			},
			withoutPosition: undefined,
			outsideDocument: undefined,
		});
	});
});

suite('Markdown editor diff', () => {
	test('maps modified-side line changes to quick diff gutter markers', async () => {
		const document = await vscode.workspace.openTextDocument({ language: 'markdown', content: 'one\ntwo changed\nthree added\nfour\n' });
		const changes = [
			{ originalRange: new vscode.Range(1, 0, 2, 0), modifiedRange: new vscode.Range(1, 0, 2, 0) },
			{ originalRange: new vscode.Range(2, 0, 2, 0), modifiedRange: new vscode.Range(2, 0, 3, 0) },
			{ originalRange: new vscode.Range(3, 0, 4, 0), modifiedRange: new vscode.Range(3, 0, 3, 0) },
		];

		assert.deepStrictEqual(lineRangesToGutterMarkers(document, changes), [
			{ start: 4, endExclusive: 15, type: 'modified' },
			{ start: 16, endExclusive: 27, type: 'added' },
			{ start: 28, endExclusive: 28, type: 'deleted' },
		]);
	});
});

suite('Markdown editor initial state', () => {
	test('safely round-trips document content', () => {
		const state = {
			content: '</meta><script>globalThis.modified = true</script><!--\n# Heading "quoted"',
			documentVersion: 17,
			editEpoch: 3,
			readonly: true,
			richLinksEnabled: true,
			linkPresentationRules: [],
		};
		const encoded = encodeWebviewInitialState(state);

		assert.deepStrictEqual({
			containsHtmlAttributeSyntax: /["<>&]/.test(encoded),
			roundTrip: JSON.parse(decodeURIComponent(encoded)),
		}, {
			containsHtmlAttributeSyntax: false,
			roundTrip: state,
		});
	});
});

suite('Markdown code block editor API versioning', () => {
	test('requires an explicit positive integer export API version', () => {
		assert.strictEqual(readCodeBlockEditorProviders({ kind: 'exportApi' }).length, 0);
		assert.strictEqual(readCodeBlockEditorProviders({ kind: 'exportApi', apiVersion: 0 }).length, 0);
		assert.strictEqual(readCodeBlockEditorProviders({ kind: 'exportApi', apiVersion: 1.5 }).length, 0);
		assert.deepStrictEqual(readCodeBlockEditorProviders({ kind: 'exportApi', apiVersion: 1 })[0]?.source, {
			kind: 'exportApi',
			apiVersion: 1,
		});
		assert.deepStrictEqual(readCodeBlockEditorProviders({ kind: 'exportApi', apiVersion: 2 })[0]?.source, {
			kind: 'exportApi',
			apiVersion: 2,
		});
	});

	test('only accepts the namespaced V1 extension API', () => {
		const apiV1 = { getProvider: () => undefined };
		assert.strictEqual(getMarkdownCodeBlockEditorApiV1({
			markdownCodeBlockEditors: { apiV1 },
		}), apiV1);
		assert.strictEqual(getMarkdownCodeBlockEditorApiV1({
			getMarkdownCodeBlockEditorProvider: () => undefined,
		}), undefined);
		assert.strictEqual(getMarkdownCodeBlockEditorApiV1({
			markdownCodeBlockEditors: { apiV1: {} },
		}), undefined);
		assert.strictEqual(getMarkdownCodeBlockEditorApiV1({
			markdownCodeBlockEditors: { apiV2: apiV1 },
		}), undefined);
	});

	test('accepts the namespaced V2 extension API', () => {
		const apiV2 = { getProvider: () => undefined };
		assert.strictEqual(getMarkdownCodeBlockEditorApiV2({
			markdownCodeBlockEditors: { apiV2 },
		}), apiV2);
		assert.strictEqual(getMarkdownCodeBlockEditorApiV2({
			markdownCodeBlockEditors: { apiV1: apiV2 },
		}), undefined);
	});

	test('advertises API versions 1 and 2', () => {
		assert.deepStrictEqual(
			[0, 1, 2, 3].map(isSupportedMarkdownCodeBlockEditorApiVersion),
			[false, true, true, false],
		);
	});

	test('reads the optional runtime key', () => {
		assert.strictEqual(readCodeBlockEditorProviders(
			{ kind: 'exportApi', apiVersion: 2 },
			'shared-runtime',
		)[0]?.runtimeKey, 'shared-runtime');
	});
});

function readCodeBlockEditorProviders(source: unknown, runtimeKey?: string) {
	const extension = {
		id: 'test.markdown-code-block-editor',
		extensionUri: vscode.Uri.file('/test/markdown-code-block-editor'),
		packageJSON: {
			version: '1.0.0',
			contributes: {
				'markdown.codeBlockEditorProviders': [{
					id: 'test',
					selector: { language: 'test' },
					source,
					runtimeKey,
				}],
			},
		},
	} as vscode.Extension<unknown>;
	return MarkdownContributions.fromExtension(extension).codeBlockEditorProviders;
}
