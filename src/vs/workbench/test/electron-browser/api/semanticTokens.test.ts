/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { URI } from 'vs/base/common/uri';
import * as types from 'vs/workbench/api/common/extHostTypes';
import { TestRPCProtocol } from 'vs/workbench/test/electron-browser/api/testRPCProtocol';
import { SemanticColoringAdapter, SemanticColoringConstants } from 'vs/workbench/api/common/extHostLanguageFeatures';
import { ExtHostDocuments } from 'vs/workbench/api/common/extHostDocuments';
import { ExtHostDocumentsAndEditors } from 'vs/workbench/api/common/extHostDocumentsAndEditors';
import { ExtHostContext } from 'vs/workbench/api/common/extHost.protocol';
import * as vscode from 'vscode';
import { CancellationToken } from 'vs/base/common/cancellation';
import { decodeSemanticTokensDto, ISemanticTokensDto } from 'vs/workbench/api/common/shared/semanticTokens';
import { ExtHostDocumentData } from 'vs/workbench/api/common/extHostDocumentData';

suite('SemanticColoringAdapter', () => {

	const resource = URI.parse('foo:bar');
	const rpcProtocol = new TestRPCProtocol();

	const initialText = [
		'const enum E01 {}',
		'const enum E02 {}',
		'const enum E03 {}',
		'const enum E04 {}',
		'const enum E05 {}',
		'const enum E06 {}',
		'const enum E07 {}',
		'const enum E08 {}',
		'const enum E09 {}',
		'const enum E10 {}',
		'const enum E11 {}',
		'const enum E12 {}',
		'const enum E13 {}',
		'const enum E14 {}',
		'const enum E15 {}',
		'const enum E16 {}',
		'const enum E17 {}',
		'const enum E18 {}',
		'const enum E19 {}',
		'const enum E20 {}',
		'const enum E21 {}',
		'const enum E22 {}',
		'const enum E23 {}',
	].join('\n');

	const extHostDocumentsAndEditors = new ExtHostDocumentsAndEditors(rpcProtocol);
	extHostDocumentsAndEditors.$acceptDocumentsAndEditorsDelta({
		addedDocuments: [{
			isDirty: false,
			versionId: 1,
			modeId: 'javascript',
			uri: resource,
			lines: initialText.split(/\n/),
			EOL: '\n',
		}]
	});
	const extHostDocuments = new ExtHostDocuments(rpcProtocol, extHostDocumentsAndEditors);
	rpcProtocol.set(ExtHostContext.ExtHostDocuments, extHostDocuments);

	const semanticTokensProvider = new class implements vscode.SemanticColoringProvider {
		provideSemanticColoring(document: vscode.TextDocument, token: vscode.CancellationToken): types.SemanticColoring {
			const lines = document.getText().split(/\r\n|\r|\n/g);
			const tokens: number[] = [];
			const pushToken = (line: number, startCharacter: number, endCharacter: number, type: number) => {
				tokens.push(line);
				tokens.push(startCharacter);
				tokens.push(endCharacter);
				tokens.push(type);
				tokens.push(0);
			};
			for (let i = 0; i < lines.length; i++) {
				const line = lines[i];
				const m = line.match(/^(const enum )([\w\d]+) \{\}/);
				if (m) {
					pushToken(i, m[1].length, m[1].length + m[2].length, parseInt(m[2].substr(1)));
				}
			}
			return new types.SemanticColoring([new types.SemanticColoringArea(0, new Uint32Array(tokens))]);
		}
	};

	let adapter: SemanticColoringAdapter;
	let doc: ExtHostDocumentData;

	setup(() => {
		adapter = new SemanticColoringAdapter(extHostDocuments, semanticTokensProvider, 10, SemanticColoringConstants.DesiredMaxAreas, 5);
		doc = extHostDocumentsAndEditors.getDocument(resource)!;
		const docLineCount = doc.document.lineCount;
		const allRange = { startLineNumber: 1, startColumn: 1, endLineNumber: docLineCount, endColumn: doc.document.lineAt(docLineCount - 1).text.length + 1 };
		doc.onEvents({
			versionId: 1,
			eol: '\n',
			changes: [{
				range: allRange,
				rangeOffset: 0,
				rangeLength: 0,
				text: initialText
			}]
		});
	});

	type SimpleTokensDto = { type: 'full'; line: number; tokens: number[]; } | { type: 'delta'; line: number; oldIndex: number };

	function assertDTO(actual: ISemanticTokensDto, expected: SimpleTokensDto[]): void {
		const simpleActual: SimpleTokensDto[] = actual.areas.map((area) => {
			if (area.type === 'full') {
				const tokenCount = (area.data.length / 5) | 0;
				let tokens: number[] = [];
				for (let i = 0; i < tokenCount; i++) {
					tokens.push(area.data[5 * i]);
				}
				return {
					type: 'full',
					line: area.line,
					tokens: tokens
				};
			}
			return {
				type: 'delta',
				line: area.line,
				oldIndex: area.oldIndex
			};
		});
		assert.deepEqual(simpleActual, expected);
	}

	test('single area - breaks it up', async () => {
		const dto = (await adapter.provideSemanticColoring(resource, 0, CancellationToken.None))!;
		const result = decodeSemanticTokensDto(dto);
		assertDTO(result, [
			{ type: 'full', line: 1, tokens: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] },
			{ type: 'full', line: 11, tokens: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] },
			{ type: 'full', line: 21, tokens: [0, 1, 2] },
		]);
	});

	test('single area - after a not important change', async () => {
		const result1 = decodeSemanticTokensDto((await adapter.provideSemanticColoring(resource, 0, CancellationToken.None))!);
		assertDTO(result1, [
			{ type: 'full', line: 1, tokens: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] },
			{ type: 'full', line: 11, tokens: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] },
			{ type: 'full', line: 21, tokens: [0, 1, 2] },
		]);

		doc.onEvents({
			versionId: 2,
			eol: '\n',
			changes: [{
				range: { startLineNumber: 2, startColumn: 18, endLineNumber: 2, endColumn: 18 },
				rangeOffset: 0,
				rangeLength: 0,
				text: '//'
			}]
		});

		const result2 = decodeSemanticTokensDto((await adapter.provideSemanticColoring(resource, result1.id, CancellationToken.None))!);
		assertDTO(result2, [
			{ type: 'delta', line: 1, oldIndex: 0 },
			{ type: 'delta', line: 11, oldIndex: 1 },
			{ type: 'delta', line: 21, oldIndex: 2 },
		]);
		adapter.releaseSemanticColoring(result1.id);
	});

	test('single area - after a single removal in the first block', async () => {
		const result1 = decodeSemanticTokensDto((await adapter.provideSemanticColoring(resource, 0, CancellationToken.None))!);
		assertDTO(result1, [
			{ type: 'full', line: 1, tokens: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] },
			{ type: 'full', line: 11, tokens: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] },
			{ type: 'full', line: 21, tokens: [0, 1, 2] },
		]);

		doc.onEvents({
			versionId: 2,
			eol: '\n',
			changes: [{
				range: { startLineNumber: 2, startColumn: 1, endLineNumber: 2, endColumn: 1 },
				rangeOffset: 0,
				rangeLength: 0,
				text: '//'
			}]
		});

		const result2 = decodeSemanticTokensDto((await adapter.provideSemanticColoring(resource, result1.id, CancellationToken.None))!);
		assertDTO(result2, [
			{ type: 'full', line: 1, tokens: [0, 2, 3, 4, 5, 6, 7, 8, 9] },
			{ type: 'delta', line: 11, oldIndex: 1 },
			{ type: 'delta', line: 21, oldIndex: 2 },
		]);
		adapter.releaseSemanticColoring(result1.id);
	});

	test('single area - after a not important change', async () => {
		const result1 = decodeSemanticTokensDto((await adapter.provideSemanticColoring(resource, 0, CancellationToken.None))!);
		assertDTO(result1, [
			{ type: 'full', line: 1, tokens: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] },
			{ type: 'full', line: 11, tokens: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] },
			{ type: 'full', line: 21, tokens: [0, 1, 2] },
		]);

		doc.onEvents({
			versionId: 2,
			eol: '\n',
			changes: [{
				range: { startLineNumber: 2, startColumn: 18, endLineNumber: 2, endColumn: 18 },
				rangeOffset: 0,
				rangeLength: 0,
				text: '//'
			}]
		});

		const result2 = decodeSemanticTokensDto((await adapter.provideSemanticColoring(resource, result1.id, CancellationToken.None))!);
		assertDTO(result2, [
			{ type: 'delta', line: 1, oldIndex: 0 },
			{ type: 'delta', line: 11, oldIndex: 1 },
			{ type: 'delta', line: 21, oldIndex: 2 },
		]);
		adapter.releaseSemanticColoring(result1.id);
	});

	test('single area - after a down shift of all the blocks', async () => {
		const result1 = decodeSemanticTokensDto((await adapter.provideSemanticColoring(resource, 0, CancellationToken.None))!);
		assertDTO(result1, [
			{ type: 'full', line: 1, tokens: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] },
			{ type: 'full', line: 11, tokens: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] },
			{ type: 'full', line: 21, tokens: [0, 1, 2] },
		]);

		doc.onEvents({
			versionId: 2,
			eol: '\n',
			changes: [{
				range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 },
				rangeOffset: 0,
				rangeLength: 0,
				text: '\n'
			}]
		});

		const result2 = decodeSemanticTokensDto((await adapter.provideSemanticColoring(resource, result1.id, CancellationToken.None))!);
		assertDTO(result2, [
			{ type: 'delta', line: 2, oldIndex: 0 },
			{ type: 'delta', line: 12, oldIndex: 1 },
			{ type: 'delta', line: 22, oldIndex: 2 },
		]);
		adapter.releaseSemanticColoring(result1.id);
	});

	test('single area - after a single removal in the last block', async () => {
		const result1 = decodeSemanticTokensDto((await adapter.provideSemanticColoring(resource, 0, CancellationToken.None))!);
		assertDTO(result1, [
			{ type: 'full', line: 1, tokens: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] },
			{ type: 'full', line: 11, tokens: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] },
			{ type: 'full', line: 21, tokens: [0, 1, 2] },
		]);

		doc.onEvents({
			versionId: 2,
			eol: '\n',
			changes: [{
				range: { startLineNumber: 22, startColumn: 1, endLineNumber: 22, endColumn: 1 },
				rangeOffset: 0,
				rangeLength: 0,
				text: '//'
			}]
		});

		const result2 = decodeSemanticTokensDto((await adapter.provideSemanticColoring(resource, result1.id, CancellationToken.None))!);
		assertDTO(result2, [
			{ type: 'delta', line: 1, oldIndex: 0 },
			{ type: 'delta', line: 11, oldIndex: 1 },
			{ type: 'full', line: 21, tokens: [0, 2] },
		]);
		adapter.releaseSemanticColoring(result1.id);
	});

	test('single area - after a single addition in the first block', async () => {
		const result1 = decodeSemanticTokensDto((await adapter.provideSemanticColoring(resource, 0, CancellationToken.None))!);
		assertDTO(result1, [
			{ type: 'full', line: 1, tokens: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] },
			{ type: 'full', line: 11, tokens: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] },
			{ type: 'full', line: 21, tokens: [0, 1, 2] },
		]);

		doc.onEvents({
			versionId: 2,
			eol: '\n',
			changes: [{
				range: { startLineNumber: 2, startColumn: 1, endLineNumber: 2, endColumn: 1 },
				rangeOffset: 0,
				rangeLength: 0,
				text: 'const enum E00 {}\n'
			}]
		});

		const result2 = decodeSemanticTokensDto((await adapter.provideSemanticColoring(resource, result1.id, CancellationToken.None))!);
		assertDTO(result2, [
			{ type: 'full', line: 1, tokens: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10] },
			{ type: 'delta', line: 12, oldIndex: 1 },
			{ type: 'delta', line: 22, oldIndex: 2 },
		]);
		adapter.releaseSemanticColoring(result1.id);
	});

	test('going from empty to 1 semantic token', async () => {
		doc.onEvents({
			versionId: 2,
			eol: '\n',
			changes: [{
				range: { startLineNumber: 1, startColumn: 1, endLineNumber: 23, endColumn: 18 },
				rangeOffset: 0,
				rangeLength: 0,
				text: ''
			}]
		});

		const result1 = decodeSemanticTokensDto((await adapter.provideSemanticColoring(resource, 0, CancellationToken.None))!);
		assertDTO(result1, [
			{ type: 'full', line: 1, tokens: [] },
		]);

		doc.onEvents({
			versionId: 3,
			eol: '\n',
			changes: [{
				range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 },
				rangeOffset: 0,
				rangeLength: 0,
				text: 'const enum E01 {}\n'
			}]
		});

		const result2 = decodeSemanticTokensDto((await adapter.provideSemanticColoring(resource, result1.id, CancellationToken.None))!);
		assertDTO(result2, [
			{ type: 'full', line: 1, tokens: [0] }
		]);
		adapter.releaseSemanticColoring(result1.id);
	});
});
