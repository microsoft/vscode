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
import { SymbolKind as LanguageSymbolKind } from '../../../../editor/common/languages.js';
import { NullLogService } from '../../../../platform/log/common/log.js';
import { nullExtensionDescription } from '../../../services/extensions/common/extensions.js';
import { MainThreadLanguageFeaturesShape } from '../../common/extHost.protocol.js';
import { NullApiDeprecationService } from '../../common/extHostApiDeprecationService.js';
import { ExtHostCommands } from '../../common/extHostCommands.js';
import { ExtHostDiagnostics } from '../../common/extHostDiagnostics.js';
import { ExtHostDocuments } from '../../common/extHostDocuments.js';
import { ExtHostLanguageFeatures } from '../../common/extHostLanguageFeatures.js';
import { IExtHostTelemetry } from '../../common/extHostTelemetry.js';
import { Position, Range, SymbolKind } from '../../common/extHostTypes.js';
import { URITransformerService } from '../../common/extHostUriTransformerService.js';
import { SingleProxyRPCProtocol } from '../common/testRPCProtocol.js';

suite('Extension host workspace symbol cache', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const resource = URI.parse('test://symbols/example.ts');
	let extHost: ExtHostLanguageFeatures;
	let handle: number;

	setup(() => {
		const proxy = new class extends mock<MainThreadLanguageFeaturesShape>() {
			override $registerNavigateTypeSupport(value: number): void { handle = value; }
			override $unregister(): void { }
		};
		extHost = store.add(new ExtHostLanguageFeatures(
			SingleProxyRPCProtocol(proxy),
			new URITransformerService(null),
			new class extends mock<ExtHostDocuments>() { },
			new class extends mock<ExtHostCommands>() { },
			new class extends mock<ExtHostDiagnostics>() { },
			new NullLogService(),
			NullApiDeprecationService,
			new class extends mock<IExtHostTelemetry>() {
				override onExtensionError(): boolean { return true; }
			}
		));
	});

	test('does not resolve workspace symbols returned after cancellation', async () => {
		const pending = new DeferredPromise<vscode.SymbolInformation[]>();
		const resolved: vscode.SymbolInformation[] = [];
		store.add(extHost.registerWorkspaceSymbolProvider(nullExtensionDescription, {
			provideWorkspaceSymbols: () => pending.p,
			resolveWorkspaceSymbol: symbol => {
				resolved.push(symbol);
				return symbol;
			}
		}));
		const cancellation = store.add(new CancellationTokenSource());
		const request = extHost.$provideWorkspaceSymbols(handle, 'late', cancellation.token);
		cancellation.cancel();
		await assert.rejects(request, isCancellationError);
		await pending.complete([{ name: 'late', kind: SymbolKind.Function, containerName: '', location: { uri: resource, range: new Range(new Position(0, 0), new Position(0, 0)) } }]);
		await timeout(0);

		await extHost.$resolveWorkspaceSymbol(handle, {
			name: 'late', kind: LanguageSymbolKind.Function, location: { uri: resource, range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 } }, cacheId: [1, 0]
		}, CancellationToken.None);
		assert.deepStrictEqual(resolved, []);
	});

	test('resolves active workspace symbols until release', async () => {
		const symbol: vscode.SymbolInformation = { name: 'active', kind: SymbolKind.Function, containerName: '', location: { uri: resource, range: new Range(new Position(0, 0), new Position(0, 0)) } };
		const resolved: vscode.SymbolInformation[] = [];
		store.add(extHost.registerWorkspaceSymbolProvider(nullExtensionDescription, {
			provideWorkspaceSymbols: () => [symbol],
			resolveWorkspaceSymbol: symbol => {
				resolved.push(symbol);
				return symbol;
			}
		}));
		const result = await extHost.$provideWorkspaceSymbols(handle, 'active', CancellationToken.None);
		assert.ok(result.cacheId !== undefined);
		const [item] = result.symbols;
		await extHost.$resolveWorkspaceSymbol(handle, item, CancellationToken.None);
		extHost.$releaseWorkspaceSymbols(handle, result.cacheId);
		await extHost.$resolveWorkspaceSymbol(handle, item, CancellationToken.None);
		assert.deepStrictEqual(resolved, [symbol]);
	});
});
