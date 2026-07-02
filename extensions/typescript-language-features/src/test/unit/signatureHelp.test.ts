/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import 'mocha';
import * as vscode from 'vscode';
import type * as Proto from '../../tsServer/protocol/protocol';
import { ITypeScriptServiceClient } from '../../typescriptService';
import { _TypeScriptSignatureHelpProvider } from '../../languageFeatures/signatureHelp';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSigItem(): Proto.SignatureHelpItem {
	return {
		prefixDisplayParts: [],
		suffixDisplayParts: [],
		separatorDisplayParts: [],
		parameters: [],
		documentation: [],
		tags: [],
		isVariadic: false,
	};
}

function makeClient(selectedItemIndex: number): ITypeScriptServiceClient {
	return {
		toOpenTsFilePath: () => '/test.ts',
		interruptGetErr: (fn: () => unknown) => fn(),
		execute: () => Promise.resolve({
			type: 'response' as const,
			success: true,
			message: '',
			body: {
				items: [makeSigItem(), makeSigItem()],
				selectedItemIndex,
				argumentIndex: 1,
				argumentCount: 2,
			} as Proto.SignatureHelpItems,
		}),
	} as unknown as ITypeScriptServiceClient;
}

function makeContext(opts: { isRetrigger: boolean; previousActiveSignature?: number }): vscode.SignatureHelpContext {
	return {
		triggerKind: vscode.SignatureHelpTriggerKind.TriggerCharacter,
		triggerCharacter: ',',
		isRetrigger: opts.isRetrigger,
		activeSignatureHelp: opts.previousActiveSignature !== undefined
			? {
				signatures: [
					new vscode.SignatureInformation('foo(a: number): number'),
					new vscode.SignatureInformation('foo(a: string): string'),
				],
				activeSignature: opts.previousActiveSignature,
				activeParameter: 0,
			}
			: undefined,
	} as vscode.SignatureHelpContext;
}

const doc = { uri: vscode.Uri.parse('file:///test.ts') } as vscode.TextDocument;
const pos = new vscode.Position(0, 0);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

suite('TypeScriptSignatureHelpProvider', () => {
	suite('provideSignatureHelp — activeSignature selection', () => {
		let tokenSource: vscode.CancellationTokenSource;

		setup(() => { tokenSource = new vscode.CancellationTokenSource(); });
		teardown(() => { tokenSource.dispose(); });

		test('fresh trigger uses TypeScript selectedItemIndex', async () => {
			const provider = new _TypeScriptSignatureHelpProvider(makeClient(0));
			const result = await provider.provideSignatureHelp(doc, pos, tokenSource.token, makeContext({ isRetrigger: false }));
			assert.strictEqual(result?.activeSignature, 0);
		});

		test('BUG (#268728): old retrigger guard returned stale index when TS updated selectedItemIndex', () => {
			// The original getActiveSignature found the previously-shown overload by label
			// and returned its index unconditionally, regardless of what TS now recommended.
			// Reproduced here to document what the old code did.
			const oldGetActiveSignature = (
				context: { isRetrigger: boolean; activeSignatureHelp?: { signatures: vscode.SignatureInformation[]; activeSignature: number } },
				tsSelectedItemIndex: number,
				signatures: vscode.SignatureInformation[],
			): number => {
				const prev = context.activeSignatureHelp?.signatures[context.activeSignatureHelp.activeSignature];
				if (prev && context.isRetrigger) {
					const idx = signatures.findIndex(s => s.label === prev.label);
					if (idx >= 0) { return idx; }
				}
				return tsSelectedItemIndex;
			};

			const ctx = makeContext({ isRetrigger: true, previousActiveSignature: 0 });
			const sigs = ctx.activeSignatureHelp!.signatures;
			// TS updated selectedItemIndex to 1 (string overload), but old code returned 0.
			assert.strictEqual(oldGetActiveSignature(ctx, 1, sigs), 0);
		});

		test('FIX (#268728): retrigger now follows TypeScript when arguments narrow the overload set', async () => {
			// Previously showing overload 0 (number). TS now returns selectedItemIndex=1 (string).
			// Fixed code sets result.activeSignature = info.selectedItemIndex → must return 1.
			const provider = new _TypeScriptSignatureHelpProvider(makeClient(1));
			const result = await provider.provideSignatureHelp(doc, pos, tokenSource.token, makeContext({ isRetrigger: true, previousActiveSignature: 0 }));
			assert.strictEqual(result?.activeSignature, 1);
		});

		test('retrigger with unchanged TypeScript selection uses selectedItemIndex', async () => {
			// TS still recommends overload 0 — result should be 0.
			const provider = new _TypeScriptSignatureHelpProvider(makeClient(0));
			const result = await provider.provideSignatureHelp(doc, pos, tokenSource.token, makeContext({ isRetrigger: true, previousActiveSignature: 0 }));
			assert.strictEqual(result?.activeSignature, 0);
		});
	});
});
