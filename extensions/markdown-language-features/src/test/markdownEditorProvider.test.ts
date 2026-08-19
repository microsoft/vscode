/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import 'mocha';
import * as vscode from 'vscode';
import { MarkdownContributions } from '../markdownExtensions';
import { getMarkdownCodeBlockEditorApiV1, historyResultPayload, isSupportedMarkdownCodeBlockEditorApiVersion, lineRangesToGutterMarkers } from '../preview/markdownEditorProvider';
import { encodeWebviewInitialState } from '../preview/webviewInitialState';

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

suite('Markdown editor history handshake', () => {
	test('attributes a restore only to a command that changed the document version', () => {
		assert.deepStrictEqual({
			noOp: historyResultPayload(7, 7, 'unchanged text'),
			restored: historyResultPayload(7, 8, 'restored text'),
		}, {
			noOp: { status: 'unchanged' },
			restored: { status: 'restored', content: 'restored text', documentVersion: 8 },
		});
	});
});

suite('Markdown editor initial state', () => {	test('safely round-trips document content', () => {
		const state = {
			content: '</meta><script>globalThis.modified = true</script><!--\n# Heading "quoted"',
			documentVersion: 17,
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

	test('only advertises API version 1', () => {
		assert.strictEqual(isSupportedMarkdownCodeBlockEditorApiVersion(1), true);
		assert.strictEqual(isSupportedMarkdownCodeBlockEditorApiVersion(2), false);
	});
});

function readCodeBlockEditorProviders(source: unknown) {
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
				}],
			},
		},
	} as vscode.Extension<unknown>;
	return MarkdownContributions.fromExtension(extension).codeBlockEditorProviders;
}
