/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import 'mocha';
import * as vscode from 'vscode';
import { MarkdownContributions } from '../markdownExtensions';
import { MarkdownPreviewLineDiffProvider } from '../preview/lineDiff';
import { getInDocumentLinkTargetRange, getMarkdownCodeBlockEditorApiV1, getMarkdownCodeBlockEditorApiV2, isSupportedMarkdownCodeBlockEditorApiVersion, lineRangesToGutterMarkers } from '../preview/markdownEditorProvider';
import { mergeCodeBlockEditorPresentation } from '../preview/markdownEditorProtocol';
import { encodeWebviewInitialState } from '../preview/webviewInitialState';

suite('Markdown editor links', () => {
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
	for (const { name, original, modified, markers, added, indicatorTypes } of [
		{
			name: 'an insertion at the start',
			original: 'one\n',
			modified: 'new\none\n',
			markers: [{ start: 0, endExclusive: 3, type: 'added' }],
			added: [0],
			indicatorTypes: [],
		},
		{
			name: 'an insertion in the middle',
			original: 'one\nthree\n',
			modified: 'one\ntwo\nthree\n',
			markers: [{ start: 4, endExclusive: 7, type: 'added' }],
			added: [1],
			indicatorTypes: [],
		},
		{
			name: 'an appended section',
			original: '# Heading\n',
			modified: '# Heading\n\n## New section\n\nAdded text.\n',
			markers: [{ start: 10, endExclusive: 38, type: 'added' }],
			added: [1, 2, 3, 4],
			indicatorTypes: [],
		},
		{
			name: 'an insertion with CRLF line endings',
			original: 'one\r\nthree\r\n',
			modified: 'one\r\ntwo\r\nthree\r\n',
			markers: [{ start: 5, endExclusive: 8, type: 'added' }],
			added: [1],
			indicatorTypes: [],
		},
		{
			name: 'a deletion',
			original: 'one\ntwo\nthree\n',
			modified: 'one\nthree\n',
			markers: [{ start: 4, endExclusive: 4, type: 'deleted' }],
			added: [],
			indicatorTypes: ['deletion'],
		},
		{
			name: 'a modification',
			original: 'one\ntwo\nthree\n',
			modified: 'one\ntwo changed\nthree\n',
			markers: [{ start: 4, endExclusive: 15, type: 'modified' }],
			added: [1],
			indicatorTypes: ['modification'],
		},
		{
			name: 'unchanged content',
			original: 'one\n',
			modified: 'one\n',
			markers: [],
			added: undefined,
			indicatorTypes: undefined,
		},
	]) {
		test(`computes gutter markers for ${name} without changing preview indicators`, async () => {
			const originalDocument = await vscode.workspace.openTextDocument({ language: 'markdown', content: original });
			const modifiedDocument = await vscode.workspace.openTextDocument({ language: 'markdown', content: modified });
			const provider = new MarkdownPreviewLineDiffProvider(originalDocument, modifiedDocument);
			const changes = await provider.getChangedLineRanges();
			const previewChanges = await provider.getModifiedLineChanges();

			assert.deepStrictEqual({
				markers: lineRangesToGutterMarkers(modifiedDocument, changes),
				added: previewChanges?.added,
				indicatorTypes: previewChanges?.changeIndicators?.map(indicator => indicator.type),
			}, { markers, added, indicatorTypes });
		});
	}

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
			taskProgressLabels: {
				title: 'Task Progress',
				summary: '{0} of {1} tasks completed <script>',
				language: 'en',
			},
			content: '</meta><script>globalThis.modified = true</script><!--\n# Heading "quoted"',
			readonly: true,
			richLinksEnabled: true,
			highlightActiveBlock: false,
			lineBreak: '\r\n' as const,
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

	test('reads and validates presentation preferences', () => {
		const source = { kind: 'exportApi', apiVersion: 2 };
		const presentation = { resizable: true, fullWidth: false, fullView: true, minHeight: 160, maxAutomaticHeight: 400 };
		assert.deepStrictEqual(readCodeBlockEditorProviders(source, undefined, presentation)[0]?.presentation, presentation);
		for (const invalid of [{ resizable: 'yes' }, { minHeight: 0 }, { minHeight: Infinity }, { minHeight: 10_001 }, { maxAutomaticHeight: 0 }, { maxAutomaticHeight: 10_001 }]) {
			assert.strictEqual(readCodeBlockEditorProviders(source, undefined, invalid).length, 0);
		}
	});

	test('resolved presentation properties override contributed ones', () => {
		assert.deepStrictEqual(mergeCodeBlockEditorPresentation(
			{ resizable: true, minHeight: 120, maxAutomaticHeight: 400 },
			{ resizable: false, maxAutomaticHeight: 300 },
		), { resizable: false, fullWidth: undefined, fullView: undefined, minHeight: 120, maxAutomaticHeight: 300 });
	});

	test('contributions that differ only in their height cap are not equal', () => {
		const source = { kind: 'exportApi', apiVersion: 1 };
		const contributions = (maxAutomaticHeight: number) => MarkdownContributions.fromExtension(contributingExtension(source, undefined, { maxAutomaticHeight }));
		assert.strictEqual(MarkdownContributions.equal(contributions(400), contributions(400)), true);
		assert.strictEqual(MarkdownContributions.equal(contributions(400), contributions(300)), false);
	});
});

function readCodeBlockEditorProviders(source: unknown, runtimeKey?: string, presentation?: unknown) {
	return MarkdownContributions.fromExtension(contributingExtension(source, runtimeKey, presentation)).codeBlockEditorProviders;
}

function contributingExtension(source: unknown, runtimeKey?: string, presentation?: unknown): vscode.Extension<unknown> {
	return {
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
					presentation,
				}],
			},
		},
	} as vscode.Extension<unknown>;
}
