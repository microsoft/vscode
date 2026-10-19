/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import type * as vscode from 'vscode';
import { DeferredPromise, timeout } from '../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { isCancellationError } from '../../../../base/common/errors.js';
import { URI } from '../../../../base/common/uri.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../platform/log/common/log.js';
import { nullExtensionDescription } from '../../../services/extensions/common/extensions.js';
import { ISignatureHelpContextDto, MainThreadLanguageFeaturesShape } from '../../common/extHost.protocol.js';
import { NullApiDeprecationService } from '../../common/extHostApiDeprecationService.js';
import { ExtHostCommands } from '../../common/extHostCommands.js';
import { ExtHostDiagnostics } from '../../common/extHostDiagnostics.js';
import { ExtHostDocuments } from '../../common/extHostDocuments.js';
import { ExtHostLanguageFeatures } from '../../common/extHostLanguageFeatures.js';
import { IExtHostTelemetry } from '../../common/extHostTelemetry.js';
import { SignatureHelp, SignatureHelpTriggerKind } from '../../common/extHostTypes.js';
import { URITransformerService } from '../../common/extHostUriTransformerService.js';
import { SingleProxyRPCProtocol } from '../common/testRPCProtocol.js';

suite('Extension host signature help cache', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const resource = URI.parse('test://signature/example.ts');
	const position = { lineNumber: 1, column: 1 };
	const context: ISignatureHelpContextDto = { triggerKind: SignatureHelpTriggerKind.Invoke, isRetrigger: false, triggerCharacter: undefined, activeSignatureHelp: undefined };
	let extHost: ExtHostLanguageFeatures;
	let handle: number;

	setup(() => {
		const proxy = new class extends mock<MainThreadLanguageFeaturesShape>() {
			override $registerSignatureHelpProvider(value: number): void { handle = value; }
			override $unregister(): void { }
		};
		extHost = store.add(new ExtHostLanguageFeatures(
			SingleProxyRPCProtocol(proxy),
			new URITransformerService(null),
			new class extends mock<ExtHostDocuments>() {
				override getDocument(): vscode.TextDocument { return new class extends mock<vscode.TextDocument>() { }; }
			},
			new class extends mock<ExtHostCommands>() { },
			new class extends mock<ExtHostDiagnostics>() { },
			new NullLogService(),
			NullApiDeprecationService,
			new class extends mock<IExtHostTelemetry>() {
				override onExtensionError(): boolean { return true; }
			}
		));
	});

	test('does not reuse signature help returned after cancellation', async () => {
		const pending = new DeferredPromise<vscode.SignatureHelp>();
		const lateResult = new SignatureHelp();
		let activeSignatureHelp: vscode.SignatureHelp | undefined;
		store.add(extHost.registerSignatureHelpProvider(nullExtensionDescription, { scheme: 'test' }, {
			provideSignatureHelp: (_document, _position, _token, context) => {
				if (!context.isRetrigger) {
					return pending.p;
				}
				activeSignatureHelp = context.activeSignatureHelp;
				return undefined;
			}
		}, []));
		const cancellation = store.add(new CancellationTokenSource());
		const request = extHost.$provideSignatureHelp(handle, resource, position, context, cancellation.token);
		cancellation.cancel();
		await assert.rejects(request, isCancellationError);
		await pending.complete(lateResult);
		await timeout(0);

		await extHost.$provideSignatureHelp(handle, resource, position, {
			...context,
			isRetrigger: true,
			activeSignatureHelp: { id: 1, signatures: [], activeSignature: 0, activeParameter: 0 }
		}, CancellationToken.None);
		assert.notStrictEqual(activeSignatureHelp, lateResult);
	});

	test('reuses active signature help until it is released', async () => {
		const result = new SignatureHelp();
		let activeSignatureHelp: vscode.SignatureHelp | undefined;
		store.add(extHost.registerSignatureHelpProvider(nullExtensionDescription, { scheme: 'test' }, {
			provideSignatureHelp: (_document, _position, _token, context) => {
				activeSignatureHelp = context.activeSignatureHelp;
				return context.isRetrigger ? undefined : result;
			}
		}, []));
		const first = await extHost.$provideSignatureHelp(handle, resource, position, context, CancellationToken.None);
		assert.ok(first);
		const retrigger = { ...context, isRetrigger: true, activeSignatureHelp: first };
		await extHost.$provideSignatureHelp(handle, resource, position, retrigger, CancellationToken.None);
		assert.strictEqual(activeSignatureHelp, result);
		extHost.$releaseSignatureHelp(handle, first.id);
		await extHost.$provideSignatureHelp(handle, resource, position, retrigger, CancellationToken.None);
		assert.notStrictEqual(activeSignatureHelp, result);
	});
});
