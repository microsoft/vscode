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
import { CallHierarchyItem, Range, SymbolKind, TypeHierarchyItem } from '../../common/extHostTypes.js';
import { URITransformerService } from '../../common/extHostUriTransformerService.js';
import { SingleProxyRPCProtocol } from '../common/testRPCProtocol.js';

suite('Extension host hierarchy sessions', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const resource = URI.parse('test://hierarchy/example.ts');
	const position = { lineNumber: 1, column: 1 };
	let extHost: ExtHostLanguageFeatures;
	let handle: number;

	setup(() => {
		handle = -1;
		const proxy = new class extends mock<MainThreadLanguageFeaturesShape>() {
			override $registerCallHierarchyProvider(value: number): void { handle = value; }
			override $registerTypeHierarchyProvider(value: number): void { handle = value; }
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

	test('does not cache call hierarchy items returned after cancellation', async () => {
		const pending = new DeferredPromise<vscode.CallHierarchyItem>();
		store.add(extHost.registerCallHierarchyProvider(nullExtensionDescription, { scheme: 'test' }, {
			prepareCallHierarchy: () => pending.p,
			provideCallHierarchyIncomingCalls: () => [],
			provideCallHierarchyOutgoingCalls: () => []
		}));
		const cancellation = store.add(new CancellationTokenSource());
		const request = extHost.$prepareCallHierarchy(handle, resource, position, cancellation.token);
		cancellation.cancel();
		await assert.rejects(request, isCancellationError);
		await pending.complete(new CallHierarchyItem(SymbolKind.Function, 'canceled', '', resource, new Range(0, 0, 0, 1), new Range(0, 0, 0, 1)));
		await timeout(0);

		await assert.rejects(extHost.$provideCallHierarchyIncomingCalls(handle, '1', '0', CancellationToken.None), /missing call hierarchy item/);
	});

	test('does not cache type hierarchy items returned after cancellation', async () => {
		const pending = new DeferredPromise<vscode.TypeHierarchyItem>();
		store.add(extHost.registerTypeHierarchyProvider(nullExtensionDescription, { scheme: 'test' }, {
			prepareTypeHierarchy: () => pending.p,
			provideTypeHierarchySupertypes: () => [],
			provideTypeHierarchySubtypes: () => []
		}));
		const cancellation = store.add(new CancellationTokenSource());
		const request = extHost.$prepareTypeHierarchy(handle, resource, position, cancellation.token);
		cancellation.cancel();
		await assert.rejects(request, isCancellationError);
		await pending.complete(new TypeHierarchyItem(SymbolKind.Class, 'canceled', '', resource, new Range(0, 0, 0, 1), new Range(0, 0, 0, 1)));
		await timeout(0);

		await assert.rejects(extHost.$provideTypeHierarchySupertypes(handle, '1', '0', CancellationToken.None), /missing type hierarchy item/);
	});

	test('keeps an active call hierarchy session until release', async () => {
		store.add(extHost.registerCallHierarchyProvider(nullExtensionDescription, { scheme: 'test' }, {
			prepareCallHierarchy: () => new CallHierarchyItem(SymbolKind.Function, 'active', '', resource, new Range(0, 0, 0, 1), new Range(0, 0, 0, 1)),
			provideCallHierarchyIncomingCalls: () => [],
			provideCallHierarchyOutgoingCalls: () => []
		}));
		const result = await extHost.$prepareCallHierarchy(handle, resource, position, CancellationToken.None);
		assert.ok(result);
		const [item] = result;
		assert.deepStrictEqual(await extHost.$provideCallHierarchyIncomingCalls(handle, item._sessionId, item._itemId, CancellationToken.None), []);
		extHost.$releaseCallHierarchy(handle, item._sessionId);
		await assert.rejects(extHost.$provideCallHierarchyIncomingCalls(handle, item._sessionId, item._itemId, CancellationToken.None), /missing call hierarchy item/);
	});

	test('keeps an active type hierarchy session until release', async () => {
		store.add(extHost.registerTypeHierarchyProvider(nullExtensionDescription, { scheme: 'test' }, {
			prepareTypeHierarchy: () => new TypeHierarchyItem(SymbolKind.Class, 'Active', '', resource, new Range(0, 0, 0, 1), new Range(0, 0, 0, 1)),
			provideTypeHierarchySupertypes: () => [],
			provideTypeHierarchySubtypes: () => []
		}));
		const result = await extHost.$prepareTypeHierarchy(handle, resource, position, CancellationToken.None);
		assert.ok(result);
		const [item] = result;
		assert.deepStrictEqual(await extHost.$provideTypeHierarchySupertypes(handle, item._sessionId, item._itemId, CancellationToken.None), []);
		extHost.$releaseTypeHierarchy(handle, item._sessionId);
		await assert.rejects(extHost.$provideTypeHierarchySupertypes(handle, item._sessionId, item._itemId, CancellationToken.None), /missing type hierarchy item/);
	});
});
