/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as sinon from 'sinon';
import type * as vscode from 'vscode';
import { DeferredPromise } from '../../../../base/common/async.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { URI } from '../../../../base/common/uri.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { CodeActionTriggerType, CompletionTriggerKind } from '../../../../editor/common/languages.js';
import { NullLogService } from '../../../../platform/log/common/log.js';
import { nullExtensionDescription } from '../../../services/extensions/common/extensions.js';
import { ICodeActionListDto, ICodeLensListDto, IInlayHintsDto, ISuggestResultDto } from '../../common/extHost.protocol.js';
import { NullApiDeprecationService } from '../../common/extHostApiDeprecationService.js';
import { ExtHostCommands } from '../../common/extHostCommands.js';
import { ExtHostDiagnostics } from '../../common/extHostDiagnostics.js';
import { ExtHostDocuments } from '../../common/extHostDocuments.js';
import { ExtHostLanguageFeatures } from '../../common/extHostLanguageFeatures.js';
import { IExtHostTelemetry } from '../../common/extHostTelemetry.js';
import { CodeAction, CodeLens, CompletionItem, InlayHint, InlayHintLabelPart, Position, Range } from '../../common/extHostTypes.js';
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
	let handle: number;

	setup(() => {
		const captureHandle = (value: number) => { handle = value; };
		const rpc = AnyCallRPCProtocol({
			$registerCodeLensSupport: captureHandle,
			$registerCodeActionSupport: captureHandle,
			$registerCompletionsProvider: captureHandle,
			$registerInlayHintsProvider: captureHandle
		});
		const telemetry = new class extends mock<IExtHostTelemetry>() { };
		commands = new ExtHostCommands(rpc, new NullLogService(), telemetry);
		const document = new class extends mock<vscode.TextDocument>() {
			override getWordRangeAtPosition(): undefined { return undefined; }
		};
		const documents = new class extends mock<ExtHostDocuments>() {
			override getDocument(): vscode.TextDocument { return document; }
		};
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
						return [new CodeLens(new Range(0, 0, 0, 1), command)];
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

	for (const kind of kinds) {
		test(`${kind} releases command arguments when its provider is unregistered`, async () => {
			const provider = createProvider(kind);
			const convert = sinon.spy(commands.converter, 'toInternal');
			try {
				assert.ok(await provider.request());
				const command = convert.returnValues.find(value => value?.$ident);
				assert.ok(command);
				assert.ok(commands.converter.fromInternal(command));
				provider.registration.dispose();
				assert.strictEqual(commands.converter.fromInternal(command), undefined);
			} finally {
				// Keep baseline assertion failures isolated from the disposable tracker.
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

	for (const kind of ['codeAction', 'completion', 'inlayHint'] as const) {
		test(`${kind} ignores an in-flight resolve after provider unregistration`, async () => {
			const pending = new DeferredPromise<void>();
			const provider = createProvider(kind, undefined, pending);
			const result = await provider.request();
			assert.ok(result);
			const cacheId = kind === 'completion' ? (result as ISuggestResultDto).x : (result as IInlayHintsDto | ICodeActionListDto).cacheId;
			assert.ok(typeof cacheId === 'number');
			const convert = sinon.spy(commands.converter, 'toInternal');
			try {
				const resolve = kind === 'completion'
					? features.$resolveCompletionItem(handle, [cacheId, 0], CancellationToken.None)
					: kind === 'codeAction'
						? features.$resolveCodeAction(handle, [cacheId, 0], CancellationToken.None)
						: features.$resolveInlayHint(handle, [cacheId, 0], CancellationToken.None);
				convert.resetHistory();
				provider.registration.dispose();
				await pending.complete();
				assert.deepStrictEqual({ result: await resolve, conversions: convert.callCount }, {
					result: kind === 'codeAction' ? {} : undefined,
					conversions: 0
				});
			} finally {
				for (const call of convert.getCalls()) { call.args[1].dispose(); }
				convert.restore();
			}
		});
	}
});
