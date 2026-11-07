/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { ExtensionIdentifier } from '../../../../platform/extensions/common/extensions.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../platform/log/common/log.js';
import { IAuthenticationService } from '../../../services/authentication/common/authentication.js';
import { IAuthenticationAccessService } from '../../../services/authentication/browser/authenticationAccessService.js';
import { ILanguageModelIgnoredFilesService } from '../../../contrib/chat/common/ignoredFiles.js';
import { ILanguageModelChatMetadata, ILanguageModelChatProvider, ILanguageModelsService, IChatMessage } from '../../../contrib/chat/common/languageModels.js';
import { SerializableObjectWithBuffers } from '../../../services/extensions/common/proxyIdentifier.js';
import { TestExtensionService, TestProductService } from '../../../test/common/workbenchTestServices.js';
import { MainThreadLanguageModels } from '../../browser/mainThreadLanguageModels.js';
import { ExtHostContext, ExtHostLanguageModelsShape, MainContext } from '../../common/extHost.protocol.js';
import { IExtHostAuthentication } from '../../common/extHostAuthentication.js';
import { ExtHostLanguageModels } from '../../common/extHostLanguageModels.js';
import { LanguageModelChatMessage, LanguageModelDataPart } from '../../common/extHostTypes.js';
import { nullExtensionDescription } from '../../../services/extensions/common/extensions.js';
import { SingleProxyRPCProtocol, TestRPCProtocol } from '../common/testRPCProtocol.js';

suite('MainThreadLanguageModels', function () {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('looks up cross-host model metadata in the shared catalog and observes removal', async () => {
		const metadata: ILanguageModelChatMetadata = {
			extension: new ExtensionIdentifier('test.provider'),
			id: 'model', name: 'model', vendor: 'test', version: '1', family: 'test',
			maxInputTokens: 1000, maxOutputTokens: 1000, isDefaultForLocation: {},
		};
		const catalog = new Map([['test/model', metadata]]);
		const languageModelsService = new class extends mock<ILanguageModelsService>() {
			override readonly onDidChangeLanguageModels = disposables.add(new Emitter<string>()).event;
			override getLanguageModelIds(): string[] { return [...catalog.keys()]; }
			override lookupLanguageModel(identifier: string) { return catalog.get(identifier); }
		};
		const mainThread = disposables.add(new MainThreadLanguageModels(
			SingleProxyRPCProtocol({}),
			languageModelsService,
			new NullLogService(),
			TestProductService,
			new class extends mock<IAuthenticationService>() { },
			new class extends mock<IAuthenticationAccessService>() { },
			new TestExtensionService(),
			new class extends mock<ILanguageModelIgnoredFilesService>() { },
		));

		assert.strictEqual(await mainThread.$getLanguageModelChatMetadata('test/model'), metadata);
		catalog.delete('test/model');
		assert.strictEqual(await mainThread.$getLanguageModelChatMetadata('test/model'), undefined);
	});

	test('preserves binary token-count messages across both RPC legs', async () => {
		const store = disposables.add(new DisposableStore());
		const consumerRPC = store.add(new TestRPCProtocol());
		const providerRPC = store.add(new TestRPCProtocol());
		let registeredProvider: ILanguageModelChatProvider | undefined;
		const catalog = new Map<string, ILanguageModelChatMetadata>();
		let countedData: { mimeType: string; data: Uint8Array }[] = [];
		const information = { id: 'model', name: 'model', family: 'test', version: '1', maxInputTokens: 1000, maxOutputTokens: 1000, capabilities: { imageInput: true } };
		const languageModelsService = new class extends mock<ILanguageModelsService>() {
			override readonly onDidChangeLanguageModels = store.add(new Emitter<string>()).event;
			override getLanguageModelIds(): string[] { return [...catalog.keys()]; }
			override lookupLanguageModel(identifier: string) { return catalog.get(identifier); }
			override registerLanguageModelProvider(_vendor: string, value: ILanguageModelChatProvider) {
				registeredProvider = value;
				return Disposable.None;
			}
			override async selectLanguageModels(): Promise<string[]> {
				assert.ok(registeredProvider);
				for (const model of await registeredProvider.provideLanguageModelChatInfo({ silent: true }, CancellationToken.None)) {
					catalog.set(model.identifier, model.metadata);
				}
				return [...catalog.keys()];
			}
			override computeTokenLength(identifier: string, value: string | IChatMessage, token: CancellationToken): Promise<number> {
				assert.ok(registeredProvider);
				return registeredProvider.provideTokenCount(identifier, value, token);
			}
		};
		const mainThread = store.add(new MainThreadLanguageModels(
			providerRPC,
			languageModelsService,
			new NullLogService(),
			TestProductService,
			new class extends mock<IAuthenticationService>() { },
			new class extends mock<IAuthenticationAccessService>() { },
			new TestExtensionService(),
			new class extends mock<ILanguageModelIgnoredFilesService>() { },
		));
		consumerRPC.set(MainContext.MainThreadLanguageModels, mainThread);
		providerRPC.set(MainContext.MainThreadLanguageModels, mainThread);
		const provider = store.add(new ExtHostLanguageModels(providerRPC, new NullLogService(), new class extends mock<IExtHostAuthentication>() { }));
		providerRPC.set(ExtHostContext.ExtHostChatProvider, provider);
		store.add(provider.registerLanguageModelChatProvider(nullExtensionDescription, 'test', {
			provideLanguageModelChatInformation: async () => [information],
			provideLanguageModelChatResponse: async () => { throw new Error('Unexpected chat request'); },
			provideTokenCount: async (model, value) => {
				assert.strictEqual(model, information);
				countedData = typeof value === 'string' ? [] : value.content
					.filter(part => part instanceof LanguageModelDataPart)
					.map(part => ({ mimeType: part.mimeType, data: part.data }));
				return 42;
			},
		}));
		await providerRPC.sync();
		const consumer = store.add(new ExtHostLanguageModels(consumerRPC, new NullLogService(), new class extends mock<IExtHostAuthentication>() { }));
		const selected = await consumer.getLanguageModelForRequest(nullExtensionDescription, 'test/model');
		const expected = [
			{ mimeType: 'image/png', data: new Uint8Array([0, 127, 128, 255]) },
			{ mimeType: 'application/octet-stream', data: new Uint8Array([255, 0, 254]) },
		];
		const message = LanguageModelChatMessage.User(expected.map(part => new LanguageModelDataPart(part.data, part.mimeType)));
		const count = await selected.countTokens(message, CancellationToken.None);
		assert.deepStrictEqual({ count, countedData: countedData.map(part => ({ mimeType: part.mimeType, typed: part.data instanceof Uint8Array, bytes: Array.from(part.data) })) }, {
			count: 42, countedData: expected.map(part => ({ mimeType: part.mimeType, typed: true, bytes: Array.from(part.data) })),
		});
	});

	test('bridges onDidChangeLanguageModels to $onChatModelsChange when the model id set changes', async () => {
		const store = disposables.add(new DisposableStore());
		const onDidChangeLanguageModels = store.add(new Emitter<string>());
		let onChatModelsChangeCount = 0;
		let modelIds: string[] = [];
		const proxy: Partial<ExtHostLanguageModelsShape> = {
			$onChatModelsChange: () => { onChatModelsChangeCount++; },
		};
		const languageModelsService = new class extends mock<ILanguageModelsService>() {
			override readonly onDidChangeLanguageModels = onDidChangeLanguageModels.event;
			override getLanguageModelIds(): string[] { return modelIds; }
		};

		store.add(new MainThreadLanguageModels(
			SingleProxyRPCProtocol(proxy),
			languageModelsService,
			new NullLogService(),
			TestProductService,
			new class extends mock<IAuthenticationService>() { },
			new class extends mock<IAuthenticationAccessService>() { },
			new TestExtensionService(),
			new class extends mock<ILanguageModelIgnoredFilesService>() { },
		));

		assert.strictEqual(onChatModelsChangeCount, 0);

		// New model identifier appears -> bridged
		modelIds = ['vendor-a/model-1'];
		onDidChangeLanguageModels.fire('vendor-a');
		assert.strictEqual(onChatModelsChangeCount, 1);

		// Another new identifier appears -> bridged
		modelIds = ['vendor-a/model-1', 'vendor-b/model-1'];
		onDidChangeLanguageModels.fire('vendor-b');
		assert.strictEqual(onChatModelsChangeCount, 2);

		// Identifier removed -> bridged
		modelIds = ['vendor-a/model-1'];
		onDidChangeLanguageModels.fire('vendor-b');
		assert.strictEqual(onChatModelsChangeCount, 3);
	});

	test('does not bridge metadata-only churn that keeps the model id set stable', async () => {
		const store = disposables.add(new DisposableStore());
		const onDidChangeLanguageModels = store.add(new Emitter<string>());
		let onChatModelsChangeCount = 0;
		// Same identifier set throughout: only metadata (e.g. baseCount) changes between fires.
		const modelIds = ['copilot/copilot-utility'];
		const proxy: Partial<ExtHostLanguageModelsShape> = {
			$onChatModelsChange: () => { onChatModelsChangeCount++; },
		};
		const languageModelsService = new class extends mock<ILanguageModelsService>() {
			override readonly onDidChangeLanguageModels = onDidChangeLanguageModels.event;
			override getLanguageModelIds(): string[] { return modelIds; }
		};

		store.add(new MainThreadLanguageModels(
			SingleProxyRPCProtocol(proxy),
			languageModelsService,
			new NullLogService(),
			TestProductService,
			new class extends mock<IAuthenticationService>() { },
			new class extends mock<IAuthenticationAccessService>() { },
			new TestExtensionService(),
			new class extends mock<ILanguageModelIgnoredFilesService>() { },
		));

		for (let i = 0; i < 10; i++) {
			onDidChangeLanguageModels.fire('copilot');
		}

		assert.strictEqual(onChatModelsChangeCount, 0);
	});

	test('defaults isBYOK in provideLanguageModelChatInfo for built-in and extension-contributed models', async () => {
		const store = disposables.add(new DisposableStore());
		let provider: ILanguageModelChatProvider | undefined;
		const copilotExtensionId = TestProductService.defaultChatAgent?.chatExtensionId;
		const proxy: Partial<ExtHostLanguageModelsShape> = {
			$provideLanguageModelChatInfo: async () => ([
				{
					identifier: 'explicit-true',
					metadata: {
						extension: new ExtensionIdentifier('custom.explicit-true'),
						name: 'explicit-true',
						id: 'explicit-true',
						vendor: 'test-vendor',
						version: '1',
						family: 'test-family',
						maxInputTokens: 1,
						maxOutputTokens: 1,
						isDefaultForLocation: {},
						isBYOK: true
					}
				},
				{
					identifier: 'explicit-false',
					metadata: {
						extension: new ExtensionIdentifier('custom.explicit-false'),
						name: 'explicit-false',
						id: 'explicit-false',
						vendor: 'test-vendor',
						version: '1',
						family: 'test-family',
						maxInputTokens: 1,
						maxOutputTokens: 1,
						isDefaultForLocation: {},
						isBYOK: false
					}
				},
				{
					identifier: 'builtin-default',
					metadata: {
						extension: new ExtensionIdentifier(copilotExtensionId ?? 'builtin.copilot'),
						name: 'builtin-default',
						id: 'builtin-default',
						vendor: 'test-vendor',
						version: '1',
						family: 'test-family',
						maxInputTokens: 1,
						maxOutputTokens: 1,
						isDefaultForLocation: {}
					}
				},
				{
					identifier: 'external-default',
					metadata: {
						extension: new ExtensionIdentifier('custom.external'),
						name: 'external-default',
						id: 'external-default',
						vendor: 'test-vendor',
						version: '1',
						family: 'test-family',
						maxInputTokens: 1,
						maxOutputTokens: 1,
						isDefaultForLocation: {}
					}
				}
			]),
		};
		const languageModelsService = new class extends mock<ILanguageModelsService>() {
			override readonly onDidChangeLanguageModels = store.add(new Emitter<string>()).event;
			override getLanguageModelIds(): string[] { return []; }
			override registerLanguageModelProvider(_vendor: string, value: ILanguageModelChatProvider) {
				provider = value;
				return Disposable.None;
			}
		};

		const mainThread = store.add(new MainThreadLanguageModels(
			SingleProxyRPCProtocol(proxy),
			languageModelsService,
			new NullLogService(),
			TestProductService,
			new class extends mock<IAuthenticationService>() { },
			new class extends mock<IAuthenticationAccessService>() { },
			new TestExtensionService(),
			new class extends mock<ILanguageModelIgnoredFilesService>() { },
		));
		mainThread.$registerLanguageModelProvider('test-vendor');

		const infos = await provider!.provideLanguageModelChatInfo({ silent: true }, CancellationToken.None);
		assert.deepStrictEqual(infos.map(info => ({ identifier: info.identifier, isBYOK: info.metadata.isBYOK })), [
			{ identifier: 'explicit-true', isBYOK: true },
			{ identifier: 'explicit-false', isBYOK: false },
			{ identifier: 'builtin-default', isBYOK: copilotExtensionId ? false : true },
			{ identifier: 'external-default', isBYOK: true }
		]);
	});

	test('$cancelLanguageModelChatRequest cancels the token passed to $tryStartChatRequest', async () => {
		const store = disposables.add(new DisposableStore());
		let capturedToken: CancellationToken | undefined;

		const languageModelsService = new class extends mock<ILanguageModelsService>() {
			override readonly onDidChangeLanguageModels = store.add(new Emitter<string>()).event;
			override getLanguageModelIds(): string[] { return []; }
			override sendChatRequest(_modelId: string, _from: ExtensionIdentifier, _messages: IChatMessage[], _options: unknown, token: CancellationToken) {
				capturedToken = token;
				// Return a response that never resolves so the CTS stays alive.
				return Promise.resolve({
					stream: (async function* () { })(),
					result: new Promise<void>(() => { }) // never resolves
				});
			}
		};

		const mainThread = store.add(new MainThreadLanguageModels(
			SingleProxyRPCProtocol({}),
			languageModelsService,
			new NullLogService(),
			TestProductService,
			new class extends mock<IAuthenticationService>() { },
			new class extends mock<IAuthenticationAccessService>() { },
			new TestExtensionService(),
			new class extends mock<ILanguageModelIgnoredFilesService>() { },
		));

		const requestId = 42;
		const cts = store.add(new CancellationTokenSource());

		await mainThread.$tryStartChatRequest(
			new ExtensionIdentifier('test.ext'),
			'model-1',
			requestId,
			new SerializableObjectWithBuffers<IChatMessage[]>([]),
			{},
			cts.token
		);

		assert.ok(capturedToken, 'token should have been captured by sendChatRequest');
		assert.strictEqual(capturedToken!.isCancellationRequested, false);

		mainThread.$cancelLanguageModelChatRequest(requestId);

		assert.strictEqual(capturedToken!.isCancellationRequested, true);
	});

	test('$cancelLanguageModelChatRequest is a no-op for unknown requestId', () => {
		const store = disposables.add(new DisposableStore());
		const onDidChangeLanguageModels = store.add(new Emitter<string>());
		const languageModelsService = new class extends mock<ILanguageModelsService>() {
			override readonly onDidChangeLanguageModels = onDidChangeLanguageModels.event;
			override getLanguageModelIds(): string[] { return []; }
		};

		const mainThread = store.add(new MainThreadLanguageModels(
			SingleProxyRPCProtocol({}),
			languageModelsService,
			new NullLogService(),
			TestProductService,
			new class extends mock<IAuthenticationService>() { },
			new class extends mock<IAuthenticationAccessService>() { },
			new TestExtensionService(),
			new class extends mock<ILanguageModelIgnoredFilesService>() { },
		));

		// Should not throw
		mainThread.$cancelLanguageModelChatRequest(999999);
	});

	test('disposes the provider request cancellation listener when the response completes', async () => {
		const store = disposables.add(new DisposableStore());
		let provider: ILanguageModelChatProvider | undefined;
		let requestId: number | undefined;
		let cancelCount = 0;
		const proxy: Partial<ExtHostLanguageModelsShape> = {
			$startChatRequest: async (_modelId, id) => {
				requestId = id;
			},
			$cancelLanguageModelChatRequest: () => {
				cancelCount++;
			},
		};
		const languageModelsService = new class extends mock<ILanguageModelsService>() {
			override readonly onDidChangeLanguageModels = store.add(new Emitter<string>()).event;
			override getLanguageModelIds(): string[] { return []; }
			override registerLanguageModelProvider(_vendor: string, value: ILanguageModelChatProvider) {
				provider = value;
				return Disposable.None;
			}
		};

		const mainThread = store.add(new MainThreadLanguageModels(
			SingleProxyRPCProtocol(proxy),
			languageModelsService,
			new NullLogService(),
			TestProductService,
			new class extends mock<IAuthenticationService>() { },
			new class extends mock<IAuthenticationAccessService>() { },
			new TestExtensionService(),
			new class extends mock<ILanguageModelIgnoredFilesService>() { },
		));
		mainThread.$registerLanguageModelProvider('test');

		const cts = store.add(new CancellationTokenSource());
		const response = await provider!.sendChatRequest('model-1', [], undefined, {}, cts.token);
		await mainThread.$reportResponseDone(requestId!, undefined);
		await response.result;
		cts.cancel();

		assert.strictEqual(cancelCount, 0);
	});
});
