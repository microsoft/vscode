/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import type * as vscode from 'vscode';
import { DeferredPromise } from '../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { isCancellationError } from '../../../../base/common/errors.js';
import { URI } from '../../../../base/common/uri.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { Range } from '../../../../editor/common/core/range.js';
import { StructuralDiffClassification, StructuralDiffContext, StructuralDiffTag, SymbolKind } from '../../../../editor/common/languages.js';
import { NullLogService } from '../../../../platform/log/common/log.js';
import { nullExtensionDescription } from '../../../services/extensions/common/extensions.js';
import { ExtHostContext, MainContext, MainThreadLanguageFeaturesShape } from '../../common/extHost.protocol.js';
import { NullApiDeprecationService } from '../../common/extHostApiDeprecationService.js';
import { ExtHostCommands } from '../../common/extHostCommands.js';
import { ExtHostDiagnostics } from '../../common/extHostDiagnostics.js';
import { ExtHostDocuments } from '../../common/extHostDocuments.js';
import { ExtHostDocumentsAndEditors } from '../../common/extHostDocumentsAndEditors.js';
import { ExtHostLanguageFeatures } from '../../common/extHostLanguageFeatures.js';
import { IExtHostTelemetry } from '../../common/extHostTelemetry.js';
import * as types from '../../common/extHostTypes.js';
import { URITransformerService } from '../../common/extHostUriTransformerService.js';
import { TestRPCProtocol } from './testRPCProtocol.js';

suite('ExtHost structural diff', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const originalUri = URI.parse('test:/original.ts');
	const modifiedUri = URI.parse('test:/modified.ts');
	const extension = { ...nullExtensionDescription, enabledApiProposals: ['structuralDiff'] };
	const context: StructuralDiffContext = {
		changes: [{ originalRange: new Range(1, 1, 1, 2), modifiedRange: new Range(1, 1, 1, 2) }],
	};
	let documentsAndEditors: ExtHostDocumentsAndEditors;
	let documents: ExtHostDocuments;
	let features: ExtHostLanguageFeatures;
	let handle: number;
	let rpc: TestRPCProtocol;

	setup(() => {
		handle = -1;
		rpc = store.add(new TestRPCProtocol());
		rpc.set(MainContext.MainThreadLanguageFeatures, new class extends mock<MainThreadLanguageFeaturesShape>() {
			override $registerStructuralDiffProvider(value: number): void {
				handle = value;
			}
			override $unregister(): void { }
		});
		documentsAndEditors = new ExtHostDocumentsAndEditors(rpc, new NullLogService());
		documents = store.add(new ExtHostDocuments(rpc, documentsAndEditors));
		documentsAndEditors.$acceptDocumentsAndEditorsDelta({
			addedDocuments: [
				{ uri: originalUri, lines: ['a'], EOL: '\n', versionId: 1, languageId: 'typescript', isDirty: false, encoding: 'utf8' },
				{ uri: modifiedUri, lines: ['b'], EOL: '\n', versionId: 1, languageId: 'typescript', isDirty: false, encoding: 'utf8' },
			],
		});
		features = store.add(new ExtHostLanguageFeatures(
			rpc,
			new URITransformerService(null),
			documents,
			new class extends mock<ExtHostCommands>() { },
			new class extends mock<ExtHostDiagnostics>() { },
			new NullLogService(),
			NullApiDeprecationService,
			new class extends mock<IExtHostTelemetry>() {
				override onExtensionError(): boolean { return true; }
			},
		));
		rpc.set(ExtHostContext.ExtHostLanguageFeatures, features);
	});

	teardown(() => rpc.sync());

	async function register(provider: vscode.StructuralDiffProvider): Promise<void> {
		store.add(features.registerStructuralDiffProvider(extension, { language: 'typescript' }, provider));
		await rpc.sync();
		assert.ok(handle >= 0);
	}

	function provide(token: CancellationToken = CancellationToken.None, originalVersion = 1, modifiedVersion = 1) {
		return rpc.getProxy(ExtHostContext.ExtHostLanguageFeatures).$provideStructuralDiff(handle, originalUri, originalVersion, modifiedUri, modifiedVersion, context, token);
	}

	test('requires the proposal before registering', () => {
		assert.throws(() => features.registerStructuralDiffProvider(nullExtensionDescription, '*', {
			provideStructuralDiff: () => undefined,
		}), /CANNOT use API proposal: structuralDiff/);
		assert.strictEqual(handle, -1);
	});

	test('converts both snapshots, paired ranges and nested classifications', async () => {
		let received: { texts: string[]; uris: string[]; context: vscode.StructuralDiffContext } | undefined;
		await register({
			provideStructuralDiff: (original, modified, value) => {
				received = { texts: [original.getText(), modified.getText()], uris: [original.uri.toString(), modified.uri.toString()], context: value };
				const entity = { name: 'file.ts', kind: types.SymbolKind.File, range: new types.Range(0, 0, 0, 1) };
				return {
					root: {
						id: 'file', original: entity, modified: entity, originalChanges: [], modifiedChanges: [],
						children: [{
							id: 'member',
							original: { name: 'oldName', detail: 'old', kind: types.SymbolKind.Method, languageKind: 'method', range: entity.range, selectionRange: entity.range },
							modified: { name: 'newName', detail: 'new', kind: types.SymbolKind.Method, languageKind: 'method', range: entity.range, selectionRange: entity.range },
							originalChanges: [{ textChangeIndex: 0, range: entity.range, classification: types.StructuralDiffClassification.Header, tags: [types.StructuralDiffTag.Test] }],
							modifiedChanges: [{ textChangeIndex: 0, range: entity.range, classification: types.StructuralDiffClassification.Implementation, tags: [] }],
							children: [],
						}],
					},
					isIncomplete: false,
				};
			},
		});
		const result = await provide();
		const range = { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 2 };
		assert.deepStrictEqual({ received, child: result?.root.children[0], isIncomplete: result?.isIncomplete }, {
			received: {
				texts: ['a', 'b'],
				uris: [originalUri.toString(), modifiedUri.toString()],
				context: { changes: [{ originalRange: new types.Range(0, 0, 0, 1), modifiedRange: new types.Range(0, 0, 0, 1) }] },
			},
			child: {
				id: 'member',
				original: { name: 'oldName', detail: 'old', kind: SymbolKind.Method, languageKind: 'method', range, selectionRange: range },
				modified: { name: 'newName', detail: 'new', kind: SymbolKind.Method, languageKind: 'method', range, selectionRange: range },
				originalChanges: [{ textChangeIndex: 0, range, classification: StructuralDiffClassification.Header, tags: [StructuralDiffTag.Test] }],
				modifiedChanges: [{ textChangeIndex: 0, range, classification: StructuralDiffClassification.Implementation, tags: [] }],
				children: [],
			},
			isIncomplete: false,
		});
	});

	for (const result of [null, undefined]) {
		test(`returns undefined when the provider returns ${result}`, async () => {
			await register({ provideStructuralDiff: () => result });
			assert.strictEqual(await provide(), undefined);
		});
	}

	for (const side of ['original', 'modified'] as const) {
		test(`rejects a stale ${side} snapshot before invocation`, async () => {
			let called = false;
			await register({ provideStructuralDiff: () => { called = true; return undefined; } });
			await assert.rejects(provide(CancellationToken.None, side === 'original' ? 2 : 1, side === 'modified' ? 2 : 1), isCancellationError);
			assert.strictEqual(called, false);
		});
	}

	for (const reason of ['caller', 'original changed', 'modified changed', 'original closed', 'modified closed'] as const) {
		test(`cancels a pending extension provider when ${reason}`, async () => {
			const source = store.add(new CancellationTokenSource());
			const started = new DeferredPromise<vscode.CancellationToken>();
			const pending = new DeferredPromise<vscode.StructuralDiff | undefined>();
			await register({
				provideStructuralDiff: (_original, _modified, _context, token) => {
					started.complete(token);
					return pending.p;
				},
			});
			const rejected = assert.rejects(provide(source.token), isCancellationError);
			const providerToken = await started.p;
			const uri = reason.startsWith('original') ? originalUri : modifiedUri;
			if (reason === 'caller') {
				source.cancel();
			} else if (reason.endsWith('closed')) {
				documentsAndEditors.$acceptDocumentsAndEditorsDelta({ removedDocuments: [uri] });
			} else {
				documents.$acceptModelChanged(uri, {
					changes: [{ range: new Range(1, 1, 1, 2), rangeOffset: 0, rangeLength: 1, text: 'c' }],
					eol: '\n', versionId: 2, isUndoing: false, isRedoing: false, isFlush: false, isEolChange: false, detailedReason: undefined,
				}, false);
			}
			await rejected;
			assert.strictEqual(providerToken.isCancellationRequested, true);
			await pending.complete(undefined);
		});
	}

	test('propagates provider errors', async () => {
		await register({ provideStructuralDiff: () => { throw new Error('Provider failed'); } });
		await assert.rejects(provide(), /Provider failed/);
	});

	test('runtime enum values match the core contract', () => {
		assert.deepStrictEqual({
			classification: types.StructuralDiffClassification,
			tag: types.StructuralDiffTag,
		}, {
			classification: StructuralDiffClassification,
			tag: StructuralDiffTag,
		});
	});
});
