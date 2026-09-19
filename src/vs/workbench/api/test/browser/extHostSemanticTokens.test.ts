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
import { MainThreadLanguageFeaturesShape } from '../../common/extHost.protocol.js';
import { NullApiDeprecationService } from '../../common/extHostApiDeprecationService.js';
import { ExtHostCommands } from '../../common/extHostCommands.js';
import { ExtHostDiagnostics } from '../../common/extHostDiagnostics.js';
import { ExtHostDocuments } from '../../common/extHostDocuments.js';
import { ExtHostLanguageFeatures } from '../../common/extHostLanguageFeatures.js';
import { IExtHostTelemetry } from '../../common/extHostTelemetry.js';
import { SemanticTokens, SemanticTokensEdits, SemanticTokensLegend } from '../../common/extHostTypes.js';
import { URITransformerService } from '../../common/extHostUriTransformerService.js';
import { SingleProxyRPCProtocol } from '../common/testRPCProtocol.js';

suite('Extension host semantic tokens cache', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const resource = URI.parse('test://semantic/example.ts');
	let extHost: ExtHostLanguageFeatures;
	let handle: number;

	setup(() => {
		const proxy = new class extends mock<MainThreadLanguageFeaturesShape>() {
			override $registerDocumentSemanticTokensProvider(value: number): void { handle = value; }
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

	for (const useEdits of [false, true]) {
		test(`does not reuse ${useEdits ? 'edits' : 'tokens'} returned after cancellation`, async () => {
			const pendingTokens = new DeferredPromise<vscode.SemanticTokens>();
			const pendingEdits = new DeferredPromise<vscode.SemanticTokensEdits>();
			const requests: string[] = [];
			let cancelNext = !useEdits;
			store.add(extHost.registerDocumentSemanticTokensProvider(nullExtensionDescription, { scheme: 'test' }, {
				provideDocumentSemanticTokens: () => {
					requests.push('full');
					return cancelNext ? pendingTokens.p : new SemanticTokens(new Uint32Array([0, 0, 1, 0, 0]), 'active');
				},
				provideDocumentSemanticTokensEdits: (_document, previousResultId) => {
					requests.push(previousResultId);
					return cancelNext ? pendingEdits.p : undefined;
				}
			}, new SemanticTokensLegend(['class'])));
			if (useEdits) {
				await extHost.$provideDocumentSemanticTokens(handle, resource, 0, CancellationToken.None);
				cancelNext = true;
			}
			const cancellation = store.add(new CancellationTokenSource());
			const request = extHost.$provideDocumentSemanticTokens(handle, resource, useEdits ? 1 : 0, cancellation.token);
			cancellation.cancel();
			await assert.rejects(request, isCancellationError);
			if (useEdits) {
				await pendingEdits.complete(new SemanticTokensEdits([], 'late'));
			} else {
				await pendingTokens.complete(new SemanticTokens(new Uint32Array([0, 0, 1, 0, 0]), 'late'));
			}
			await timeout(0);
			cancelNext = false;
			await extHost.$provideDocumentSemanticTokens(handle, resource, useEdits ? 2 : 1, CancellationToken.None);
			assert.deepStrictEqual(requests, useEdits ? ['full', 'active', 'full'] : ['full', 'full']);
		});
	}

	test('uses active result IDs for edits until release', async () => {
		const requests: string[] = [];
		store.add(extHost.registerDocumentSemanticTokensProvider(nullExtensionDescription, { scheme: 'test' }, {
			provideDocumentSemanticTokens: () => {
				requests.push('full');
				return new SemanticTokens(new Uint32Array([0, 0, 1, 0, 0]), 'active');
			},
			provideDocumentSemanticTokensEdits: (_document, previousResultId) => {
				requests.push(previousResultId);
				return new SemanticTokensEdits([], 'updated');
			}
		}, new SemanticTokensLegend(['class'])));
		await extHost.$provideDocumentSemanticTokens(handle, resource, 0, CancellationToken.None);
		await extHost.$provideDocumentSemanticTokens(handle, resource, 1, CancellationToken.None);
		extHost.$releaseDocumentSemanticTokens(handle, 2);
		await extHost.$provideDocumentSemanticTokens(handle, resource, 2, CancellationToken.None);
		assert.deepStrictEqual(requests, ['full', 'active', 'full']);
	});
});
