/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert';
import path from 'node:path';
import ts from 'typescript';
import { beforeAll, suite, test } from 'vitest';
import * as vscode from 'vscode';
import { toGitUri } from '../../../../../platform/git/common/utils';
import { createTextDocumentData, setDocText } from '../../../../../util/common/test/shims/textDocument';
import { CancellationToken } from '../../../../../util/vs/base/common/cancellation';
import { isCancellationError } from '../../../../../util/vs/base/common/errors';
import * as protocol from '../../../common/serverProtocol';
import type * as structuralDiff from '../../../serverPlugin/src/common/structuralDiff';
import { createCompute, defineStructuralDiffCases, fixtureDirectory, rangeOf } from '../../test/structuralDiffCases';
import { TS6StructuralDiffProvider } from '../structuralDiffProvider';

suite('TypeScript 6 structural diff', () => {
	const uri = vscode.Uri.file(path.join(fixtureDirectory, 'example.ts'));
	let computeStructuralDiff: typeof structuralDiff.computeStructuralDiff;

	beforeAll(async () => {
		(await import('../../../serverPlugin/src/common/typescript')).default.install(ts);
		computeStructuralDiff = (await import('../../../serverPlugin/src/common/structuralDiff')).computeStructuralDiff;
	});

	/**
	 * Runs the request in the server plugin, including the JSON serialization between the client and the TypeScript server.
	 */
	async function serve(args: protocol.StructuralDiffRequestArgs): Promise<protocol.StructuralDiffResponse> {
		const body = computeStructuralDiff(JSON.parse(JSON.stringify(args)), { isCancellationRequested: () => false, throwIfCancellationRequested: () => { } });
		return JSON.parse(JSON.stringify({ seq: 0, type: 'response', command: '_.copilot.structuralDiff', request_seq: 0, success: true, body }));
	}

	const provider = new TS6StructuralDiffProvider(serve);
	defineStructuralDiffCases(createCompute(() => provider, uri));

	test('sends the backing file of a Git snapshot, both texts and the change offsets', async () => {
		const requests: protocol.StructuralDiffRequestArgs[] = [];
		const provider = new TS6StructuralDiffProvider(async args => {
			requests.push(args);
			return undefined;
		});
		const original = 'const before = 1;\n';
		const modified = 'const after = 1;\n';
		const result = await provider.provideStructuralDiff(
			createTextDocumentData(toGitUri(uri, 'HEAD'), original, 'typescript').document,
			createTextDocumentData(toGitUri(uri, '', { replaceFileExtension: true }), modified, 'typescript').document,
			{ changes: [{ originalRange: rangeOf(original, 'before'), modifiedRange: rangeOf(modified, 'after') }] },
			CancellationToken.None);
		assert.deepStrictEqual({ result, requests }, {
			result: undefined,
			requests: [{
				fileName: uri.fsPath,
				originalText: original,
				modifiedText: modified,
				changes: [{ original: { start: 6, end: 12 }, modified: { start: 6, end: 11 } }],
			}],
		});
	});

	for (const [name, response, error] of [
		['a plugin failure', { seq: 0, type: 'response', command: '_.copilot.structuralDiff', request_seq: 0, success: true, body: { error: protocol.ErrorCode.exception, message: 'Plugin failed' } }, /Plugin failed/],
		['a cancelled request', { type: 'cancelled' }, isCancellationError],
	] as const) {
		test(`rejects ${name}`, async () => {
			const provider = new TS6StructuralDiffProvider(async () => response);
			const document = createTextDocumentData(uri, 'const value = 1;', 'typescript').document;
			await assert.rejects(provider.provideStructuralDiff(document, document, { changes: [] }, CancellationToken.None), error);
		});
	}

	test('opens the backing file and repeats a staged request that tsserver rejects before it has a project', async () => {
		const texts: [string, string][] = [];
		let opened: vscode.Uri | undefined;
		const provider = new TS6StructuralDiffProvider(async args => {
			texts.push([args.originalText, args.modifiedText]);
			if (opened === undefined) {
				throw new Error('Unrecognized JSON command: _.copilot.structuralDiff');
			}
			return serve(args);
		}, async fileUri => { opened = fileUri; });
		const original = 'function staged() { return 1; }';
		const modified = 'function staged() { return 2; }';
		const result = await provider.provideStructuralDiff(
			createTextDocumentData(toGitUri(uri, 'HEAD'), original, 'typescript').document,
			createTextDocumentData(toGitUri(uri, ''), modified, 'typescript').document,
			{ changes: [{ originalRange: rangeOf(original, '1'), modifiedRange: rangeOf(modified, '2') }] },
			CancellationToken.None);
		assert.deepStrictEqual({ opened: opened?.toString(), texts, names: result?.root.children?.map(node => node.modifiedItem?.name) }, {
			opened: uri.toString(),
			texts: [[original, modified], [original, modified]],
			names: ['staged'],
		});
	});

	test('rejects with the request failure when the backing file cannot be opened', async () => {
		const failure = new Error('Unrecognized JSON command: _.copilot.structuralDiff');
		const provider = new TS6StructuralDiffProvider(async () => { throw failure; }, async () => { throw new Error('File not found'); });
		const document = createTextDocumentData(toGitUri(uri, ''), 'const value = 1;', 'typescript').document;
		await assert.rejects(provider.provideStructuralDiff(document, document, { changes: [] }, CancellationToken.None), error => error === failure);
	});

	test('does not send a request for an already cancelled request', async () => {
		const requests: protocol.StructuralDiffRequestArgs[] = [];
		const provider = new TS6StructuralDiffProvider(async args => {
			requests.push(args);
			return serve(args);
		});
		const document = createTextDocumentData(uri, '', 'typescript').document;
		await assert.rejects(provider.provideStructuralDiff(document, document, { changes: [] }, CancellationToken.Cancelled), isCancellationError);
		assert.deepStrictEqual(requests, []);
	});

	for (const side of ['original', 'modified'] as const) {
		test(`does not publish a result for a ${side} document edited during the request`, async () => {
			const original = createTextDocumentData(toGitUri(uri, ''), 'const x = 1;', 'typescript');
			const modified = createTextDocumentData(uri, 'const x = 2;', 'typescript');
			const provider = new TS6StructuralDiffProvider(args => {
				setDocText(side === 'original' ? original : modified, 'const x = 3;');
				return serve(args);
			});
			await assert.rejects(provider.provideStructuralDiff(original.document, modified.document, { changes: [] }, CancellationToken.None), isCancellationError);
		});
	}

	test('stops the analysis in the server plugin once the request is cancelled', () => {
		const args = { fileName: uri.fsPath, originalText: 'const x = 1;', modifiedText: 'const x = 2;', changes: [] };
		const token = { isCancellationRequested: () => true, throwIfCancellationRequested: () => { throw new ts.OperationCanceledException(); } };
		assert.throws(() => computeStructuralDiff(args, token), ts.OperationCanceledException);
	});
});
