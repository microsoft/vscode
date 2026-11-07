/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as sinon from 'sinon';
import type * as vscode from 'vscode';
import { DeferredPromise } from '../../../../base/common/async.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { toDisposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { CodeActionTriggerType, CompletionTriggerKind } from '../../../../editor/common/languages.js';
import { NullLogService } from '../../../../platform/log/common/log.js';
import { nullExtensionDescription } from '../../../services/extensions/common/extensions.js';
import { ICodeActionListDto, ICodeLensListDto, ICommandDto, IInlayHintsDto, ISuggestDataDtoField, ISuggestResultDto } from '../../common/extHost.protocol.js';
import { NullApiDeprecationService } from '../../common/extHostApiDeprecationService.js';
import { ExtHostCommands } from '../../common/extHostCommands.js';
import { ExtHostDiagnostics } from '../../common/extHostDiagnostics.js';
import { ExtHostDocuments } from '../../common/extHostDocuments.js';
import { ExtHostDocumentsAndEditors } from '../../common/extHostDocumentsAndEditors.js';
import { ExtHostLanguageFeatures } from '../../common/extHostLanguageFeatures.js';
import { IExtHostTelemetry } from '../../common/extHostTelemetry.js';
import { CodeAction, CodeLens, CompletionItem, InlayHint, InlayHintLabelPart, Position, Range, TextEdit } from '../../common/extHostTypes.js';
import { URITransformerService } from '../../common/extHostUriTransformerService.js';
import { AnyCallRPCProtocol } from './testRPCProtocol.js';

suite('ExtHostLanguageFeatures provider disposal', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const resource = URI.file('/test/document.txt');
	const range = { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 5 };
	const kinds = ['codeLens', 'codeAction', 'completion', 'inlayHint'] as const;
	type Kind = typeof kinds[number];
	type Result = ICodeLensListDto | ICodeActionListDto | ISuggestResultDto | IInlayHintsDto;
	let features: ExtHostLanguageFeatures;
	let commands: ExtHostCommands;
	let documents: ExtHostDocuments;
	let handle: number;

	teardown(() => sinon.restore());

	setup(() => {
		const captureHandle = (value: number) => { handle = value; };
		const rpc = AnyCallRPCProtocol({
			$registerCodeLensSupport: captureHandle,
			$registerCodeActionSupport: captureHandle,
			$registerCompletionsProvider: captureHandle,
			$registerInlayHintsProvider: captureHandle
		});
		const telemetry = new class extends mock<IExtHostTelemetry>() {
			override onExtensionError(): boolean { return true; }
		};
		commands = new ExtHostCommands(rpc, new NullLogService(), telemetry);
		const documentsAndEditors = new ExtHostDocumentsAndEditors(rpc, new NullLogService());
		documentsAndEditors.$acceptDocumentsAndEditorsDelta({
			addedDocuments: [{ uri: resource, lines: [''], EOL: '\n', versionId: 1, languageId: 'plaintext', isDirty: false, encoding: 'utf8' }]
		});
		store.add(toDisposable(() => documentsAndEditors.$acceptDocumentsAndEditorsDelta({ removedDocuments: [resource] })));
		documents = store.add(new ExtHostDocuments(rpc, documentsAndEditors));
		const diagnostics = new class extends mock<ExtHostDiagnostics>() {
			override getDiagnostics(): [] { return []; }
		};
		features = store.add(new ExtHostLanguageFeatures(rpc, new URITransformerService(null), documents, commands, diagnostics,
			new NullLogService(), NullApiDeprecationService, telemetry));
	});

	function createProvider(kind: Kind, pending?: DeferredPromise<void>, resolvePending?: DeferredPromise<void>): { registration: vscode.Disposable; request: () => Promise<Result | undefined> } {
		const command = { command: 'provider-disposal-test', title: 'Test', arguments: [{ value: kind }] };
		const selector = { scheme: 'file' };
		switch (kind) {
			case 'codeLens': {
				const registration = store.add(features.registerCodeLensProvider(nullExtensionDescription, selector, {
					provideCodeLenses: async () => {
						await pending?.p;
						return [new CodeLens(new Range(0, 0, 0, 1), resolvePending ? undefined : command)];
					},
					resolveCodeLens: async lens => {
						await resolvePending?.p;
						lens.command = command;
						return lens;
					}
				}));
				return { registration, request: () => features.$provideCodeLenses(handle, resource, CancellationToken.None) };
			}
			case 'codeAction': {
				const registration = store.add(features.registerCodeActionProvider(nullExtensionDescription, selector, {
					provideCodeActions: async () => {
						await pending?.p;
						const action = new CodeAction('Test');
						action.command = command;
						return [action];
					},
					resolveCodeAction: async action => {
						await resolvePending?.p;
						return action;
					}
				}));
				return { registration, request: () => features.$provideCodeActions(handle, resource, range, { trigger: CodeActionTriggerType.Invoke }, CancellationToken.None) };
			}
			case 'completion': {
				const registration = store.add(features.registerCompletionItemProvider(nullExtensionDescription, selector, {
					provideCompletionItems: async () => {
						await pending?.p;
						const item = new CompletionItem('Test');
						item.command = command;
						return [item];
					},
					resolveCompletionItem: async item => {
						await resolvePending?.p;
						item.additionalTextEdits = [TextEdit.insert(new Position(0, 0), 'import { Test } from "./test";\n')];
						return item;
					}
				}, []));
				return { registration, request: () => features.$provideCompletionItems(handle, resource, { lineNumber: 1, column: 1 }, { triggerKind: CompletionTriggerKind.Invoke }, CancellationToken.None) };
			}
			case 'inlayHint': {
				const registration = store.add(features.registerInlayHintsProvider(nullExtensionDescription, selector, {
					provideInlayHints: async () => {
						await pending?.p;
						const part = new InlayHintLabelPart('Test');
						part.command = command;
						return [new InlayHint(new Position(0, 0), [part])];
					},
					resolveInlayHint: async item => {
						await resolvePending?.p;
						return item;
					}
				}));
				return { registration, request: () => features.$provideInlayHints(handle, resource, range, CancellationToken.None) };
			}
		}
	}

	function release(kind: Kind, result: Result, providerHandle = handle): void {
		switch (kind) {
			case 'codeLens': features.$releaseCodeLenses(providerHandle, (result as ICodeLensListDto).cacheId!); break;
			case 'codeAction': features.$releaseCodeActions(providerHandle, (result as ICodeActionListDto).cacheId!); break;
			case 'completion': features.$releaseCompletionItems(providerHandle, (result as ISuggestResultDto).x!); break;
			case 'inlayHint': features.$releaseInlayHints(providerHandle, (result as IInlayHintsDto).cacheId!); break;
		}
	}

	function resolveResult(kind: Kind, result: Result) {
		const cacheId = kind === 'completion' ? (result as ISuggestResultDto).x : (result as IInlayHintsDto | ICodeActionListDto | ICodeLensListDto).cacheId;
		assert.ok(typeof cacheId === 'number');
		switch (kind) {
			case 'codeLens': return features.$resolveCodeLens(handle, (result as ICodeLensListDto).lenses[0], CancellationToken.None);
			case 'codeAction': return features.$resolveCodeAction(handle, [cacheId, 0], CancellationToken.None);
			case 'completion': return features.$resolveCompletionItem(handle, [cacheId, 0], CancellationToken.None);
			case 'inlayHint': return features.$resolveInlayHint(handle, [cacheId, 0], CancellationToken.None);
		}
	}

	for (const kind of kinds) {
		for (const execute of [false, true]) {
			test(`${kind} retains ${execute ? 'accepted' : 'unused'} commands until result release after unregistration`, async () => {
				const provider = createProvider(kind);
				const convert = sinon.spy(commands.converter, 'toInternal');
				const commandHandler = sinon.spy();
				store.add(commands.registerCommand(true, 'provider-disposal-test', commandHandler));
				try {
					const result = await provider.request();
					assert.ok(result);
					const command = convert.returnValues.find(value => value?.$ident);
					assert.ok(command);
					// Acceptance sends the edit notification before the command RPC.
					store.add(documents.onDidChangeDocument(() => provider.registration.dispose()));
					documents.$acceptModelChanged(resource, {
						changes: [{ range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 }, rangeOffset: 0, rangeLength: 0, text: 'Test' }],
						eol: '\n', versionId: 2, isUndoing: false, isRedoing: false, isFlush: false, isEolChange: false, detailedReason: undefined
					}, true);
					assert.strictEqual(await provider.request(), undefined);
					assert.ok(commands.converter.fromInternal(command));
					if (execute) {
						await commands.$executeContributedCommand(command.id, ...command.arguments!);
					}
					release(kind, result);
					release(kind, result); // Duplicate release is harmless.
					assert.deepStrictEqual({ text: documents.getDocument(resource).getText(), cached: commands.converter.fromInternal(command), calls: commandHandler.args }, {
						text: 'Test',
						cached: undefined,
						calls: execute ? [[{ value: kind }]] : []
					});
				} finally {
					for (const call of convert.getCalls()) { call.args[1].dispose(); }
					convert.restore();
				}
			});
		}

		test(`${kind} releases outstanding lists independently after unregistration`, async () => {
			const provider = createProvider(kind);
			const convert = sinon.spy(commands.converter, 'toInternal');
			try {
				const first = await provider.request();
				const second = await provider.request();
				assert.ok(first && second);
				const cachedCommands = convert.returnValues.filter((value): value is ICommandDto => typeof value?.$ident === 'string');
				assert.strictEqual(cachedCommands.length, 2);
				provider.registration.dispose();
				release(kind, first);
				assert.deepStrictEqual(cachedCommands.map(command => Boolean(commands.converter.fromInternal(command))), [false, true]);
				release(kind, second);
				assert.deepStrictEqual(cachedCommands.map(command => commands.converter.fromInternal(command)), [undefined, undefined]);
			} finally {
				for (const call of convert.getCalls()) { call.args[1].dispose(); }
				convert.restore();
			}
		});

		test(`${kind} releases retired command stores on shutdown`, async () => {
			const provider = createProvider(kind);
			const convert = sinon.spy(commands.converter, 'toInternal');
			try {
				assert.ok(await provider.request());
				const command = convert.returnValues.find(value => value?.$ident);
				assert.ok(command);
				provider.registration.dispose();
				features.dispose();
				assert.strictEqual(commands.converter.fromInternal(command), undefined);
			} finally {
				for (const call of convert.getCalls()) { call.args[1].dispose(); }
				convert.restore();
			}
		});

		test(`${kind} ignores results arriving after provider unregistration`, async () => {
			const pending = new DeferredPromise<void>();
			const provider = createProvider(kind, pending);
			const convert = sinon.spy(commands.converter, 'toInternal');
			try {
				const request = provider.request();
				provider.registration.dispose();
				await pending.complete();
				assert.deepStrictEqual({ result: await request, conversions: convert.callCount }, { result: undefined, conversions: 0 });
			} finally {
				for (const call of convert.getCalls()) { call.args[1].dispose(); }
				convert.restore();
			}
		});
	}

	test('completion preserves pending import edits when insertion unregisters its provider', async () => {
		const pending = new DeferredPromise<void>();
		const provider = createProvider('completion', undefined, pending);
		const result = await provider.request() as ISuggestResultDto;
		assert.ok(typeof result.x === 'number');
		const resolve = features.$resolveCompletionItem(handle, [result.x, 0], CancellationToken.None);
		store.add(documents.onDidChangeDocument(() => provider.registration.dispose()));
		documents.$acceptModelChanged(resource, {
			changes: [{ range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 }, rangeOffset: 0, rangeLength: 0, text: 'Test' }],
			eol: '\n', versionId: 2, isUndoing: false, isRedoing: false, isFlush: false, isEolChange: false, detailedReason: undefined
		}, true);
		await pending.complete();
		const resolved = await resolve;
		assert.deepStrictEqual(resolved?.[ISuggestDataDtoField.additionalTextEdits]?.map(edit => edit.text), ['import { Test } from "./test";\n']);
		release('completion', result);
	});

	for (const kind of kinds) {
		test(`${kind} finishes an owned in-flight resolve after provider unregistration`, async () => {
			const pending = new DeferredPromise<void>();
			const provider = createProvider(kind, undefined, pending);
			const result = await provider.request();
			assert.ok(result);
			const convert = sinon.spy(commands.converter, 'toInternal');
			try {
				const resolve = resolveResult(kind, result);
				convert.resetHistory();
				provider.registration.dispose();
				await pending.complete();
				assert.ok(await resolve);
				const command = convert.returnValues.find(value => value?.$ident);
				assert.ok(command);
				assert.ok(commands.converter.fromInternal(command));
				release(kind, result);
				assert.strictEqual(commands.converter.fromInternal(command), undefined);
			} finally {
				for (const call of convert.getCalls()) { call.args[1].dispose(); }
				convert.restore();
			}
		});
	}

	for (const kind of kinds) {
		for (const unregister of [false, true]) {
			test(`${kind} ignores an in-flight resolve after result release (${unregister ? 'retired' : 'registered'} provider)`, async () => {
				const pending = new DeferredPromise<void>();
				const provider = createProvider(kind, undefined, pending);
				const result = await provider.request();
				assert.ok(result);
				const convert = sinon.spy(commands.converter, 'toInternal');
				try {
					const resolve = resolveResult(kind, result);
					convert.resetHistory();
					if (unregister) {
						provider.registration.dispose();
					}
					release(kind, result);
					await pending.complete();
					assert.deepStrictEqual({ result: await resolve, conversions: convert.callCount }, {
						result: kind === 'codeAction' ? {} : undefined,
						conversions: 0
					});
					release(kind, result);
				} finally {
					for (const call of convert.getCalls()) { call.args[1].dispose(); }
					convert.restore();
				}
			});
		}
	}
});
