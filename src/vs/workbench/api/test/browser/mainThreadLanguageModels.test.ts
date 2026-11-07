/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import type * as vscode from 'vscode';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { ExtensionIdentifier } from '../../../../platform/extensions/common/extensions.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../platform/log/common/log.js';
import { IAuthenticationProvider, IAuthenticationService, INTERNAL_AUTH_PROVIDER_PREFIX } from '../../../services/authentication/common/authentication.js';
import { AuthenticationAccessService, IAuthenticationAccessService } from '../../../services/authentication/browser/authenticationAccessService.js';
import { ILanguageModelIgnoredFilesService } from '../../../contrib/chat/common/ignoredFiles.js';
import { ILanguageModelChatProvider, ILanguageModelsService, IChatMessage, ILanguageModelChatMetadataAndIdentifier, LanguageModelsService } from '../../../contrib/chat/common/languageModels.js';
import { SerializableObjectWithBuffers } from '../../../services/extensions/common/proxyIdentifier.js';
import { TestExtensionService, TestProductService, TestStorageService } from '../../../test/common/workbenchTestServices.js';
import { MainThreadLanguageModels } from '../../browser/mainThreadLanguageModels.js';
import { ExtHostContext, ExtHostLanguageModelsShape, MainContext } from '../../common/extHost.protocol.js';
import { IExtHostAuthentication } from '../../common/extHostAuthentication.js';
import { ExtHostLanguageModels } from '../../common/extHostLanguageModels.js';
import { LanguageModelChatMessage2, LanguageModelChatMessageRole, LanguageModelDataPart, LanguageModelTextPart, LanguageModelToolCallPart, LanguageModelToolResultPart } from '../../common/extHostTypes.js';
import { IExtensionService, nullExtensionDescription } from '../../../services/extensions/common/extensions.js';
import { SingleProxyRPCProtocol, TestRPCProtocol } from '../common/testRPCProtocol.js';
import { AgentHostLanguageModelProvider } from '../../../contrib/chat/browser/agentSessions/agentHost/agentHostLanguageModelProvider.js';
import { AsyncIterableObject } from '../../../../base/common/async.js';
import { MockContextKeyService } from '../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { ILanguageModelsConfigurationService } from '../../../contrib/chat/common/languageModelsConfiguration.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { TestSecretStorageService } from '../../../../platform/secrets/test/common/testSecretStorageService.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { IRequestService } from '../../../../platform/request/common/request.js';
import { TestNotificationService } from '../../../../platform/notification/test/common/testNotificationService.js';
import { NullOpenerService } from '../../../../platform/opener/test/common/nullOpenerService.js';
import { NullTelemetryService } from '../../../../platform/telemetry/common/telemetryUtils.js';

suite('MainThreadLanguageModels', function () {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('reconciles consent against the complete vendor catalogue across configured groups', async () => {
		const owner = new ExtensionIdentifier('provider.extension');
		const requester = new ExtensionIdentifier('consumer.extension');
		const providerId = INTERNAL_AUTH_PROVIDER_PREFIX + owner.value;
		let groups = ['Account A', 'Account B'];
		const service = disposables.add(new LanguageModelsService(
			new class extends mock<IExtensionService>() { override async activateByEvent() { } },
			new NullLogService(), disposables.add(new TestStorageService()), disposables.add(new MockContextKeyService()),
			new class extends mock<ILanguageModelsConfigurationService>() {
				override onDidChangeLanguageModelGroups = Event.None;
				override getLanguageModelsProviderGroups() { return groups.map(name => ({ vendor: 'test', name })); }
			},
			new class extends mock<IQuickInputService>() { }, disposables.add(new TestSecretStorageService()),
			new class extends mock<IProductService>() { override readonly version = '1.100.0'; },
			new class extends mock<IRequestService>() { }, new TestNotificationService(), NullOpenerService, NullTelemetryService,
		));
		service.deltaLanguageModelChatProviderDescriptors([{ vendor: 'test', displayName: 'Test', configuration: { type: 'object', properties: {} } as unknown as undefined, managementCommand: undefined, when: undefined }], []);
		const registered = new Map<string, IAuthenticationProvider>();
		const access = disposables.add(new AuthenticationAccessService(disposables.add(new TestStorageService()), TestProductService));
		const main = disposables.add(new MainThreadLanguageModels(
			SingleProxyRPCProtocol({
				$provideLanguageModelChatInfo: async (_vendor: string, options: { group?: string }) => options.group ? [{
					identifier: `test/${options.group}/model`,
					metadata: {
						id: 'model', vendor: 'test', extension: owner, name: 'Model', family: 'model', version: '1',
						maxInputTokens: 1000, maxOutputTokens: 1000, isDefaultForLocation: {},
						auth: { providerLabel: 'Provider', accountLabel: options.group },
					},
				}] : [],
				$onChatModelsChange: () => { },
				$updateModelAccesslist: () => { },
			}),
			service, new NullLogService(), TestProductService,
			new class extends mock<IAuthenticationService>() {
				override getProviderIds() { return [...registered.keys()]; }
				override getProvider(id: string) { return registered.get(id)!; }
				override registerAuthenticationProvider(id: string, provider: IAuthenticationProvider) { registered.set(id, provider); }
				override unregisterAuthenticationProvider(id: string) { registered.delete(id); }
			},
			access, new TestExtensionService(), new class extends mock<ILanguageModelIgnoredFilesService>() { },
		));
		main.$registerLanguageModelProvider('test');
		assert.deepStrictEqual(await service.selectLanguageModels({ vendor: 'test' }), ['test/Account A/model', 'test/Account B/model']);
		const provider = registered.get(providerId)!;
		const sessions = [];
		for (const label of groups) {
			const session = await provider.createSession([], { account: { id: label, label } });
			sessions.push(session);
			access.updateAllowedExtensions(providerId, label, [{ id: requester.value, name: requester.value, allowed: true }]);
		}
		const changes: unknown[] = [];
		disposables.add(provider.onDidChangeSessions(event => changes.push(event)));
		await service.selectLanguageModels({ vendor: 'test' });
		assert.deepStrictEqual(await provider.getSessions(undefined, {}), sessions);
		assert.deepStrictEqual(changes, []);
		groups = ['Account B'];
		await service.selectLanguageModels({ vendor: 'test' });
		assert.deepStrictEqual(await provider.getSessions(undefined, {}), [sessions[1]]);
		assert.deepStrictEqual(changes, [{ added: [], changed: [], removed: [sessions[0]] }]);
		await assert.rejects(provider.createSession([], { account: { id: 'Account A', label: 'Account A' } }), { code: 'NotFound' });
	});

	test('updates consent sessions when the target account changes and requires a grant for the new account', async () => {
		const owner = new ExtensionIdentifier('provider.extension');
		const requester = new ExtensionIdentifier('consumer.extension');
		const providerId = INTERNAL_AUTH_PROVIDER_PREFIX + owner.value;
		const registered = new Map<string, IAuthenticationProvider>();
		const access = disposables.add(new AuthenticationAccessService(disposables.add(new TestStorageService()), TestProductService));
		let accountLabel = 'Account A';
		let additionalAccounts: string[] = [];
		let infos: ILanguageModelChatMetadataAndIdentifier[] = [];
		let target: ILanguageModelChatProvider | undefined;
		let requests = 0;
		const service = new class extends mock<ILanguageModelsService>() {
			override onDidChangeLanguageModels = Event.None;
			override getLanguageModelIds() { return infos.map(info => info.identifier); }
			override lookupLanguageModel(id: string) { return infos.find(info => info.identifier === id)?.metadata; }
			override registerLanguageModelProvider(_vendor: string, value: ILanguageModelChatProvider) {
				target = value;
				return Disposable.None;
			}
			override async sendChatRequest() {
				requests++;
				return { stream: AsyncIterableObject.fromArray([]), result: Promise.resolve() };
			}
		};
		const main = disposables.add(new MainThreadLanguageModels(
			SingleProxyRPCProtocol({
				$provideLanguageModelChatInfo: async () => [accountLabel, ...additionalAccounts].map((label, index) => ({
					identifier: `copilot/model${index || ''}`,
					metadata: {
						id: `model${index || ''}`, vendor: 'copilot', extension: owner, name: 'Model', family: 'model', version: '1',
						maxInputTokens: 1000, maxOutputTokens: 1000, isDefaultForLocation: {},
						auth: { providerLabel: 'Provider', accountLabel: label },
					},
				})),
				$updateModelAccesslist: () => { },
			}),
			service, new NullLogService(), TestProductService,
			new class extends mock<IAuthenticationService>() {
				override getProviderIds() { return [...registered.keys()]; }
				override getProvider(id: string) { return registered.get(id)!; }
				override registerAuthenticationProvider(id: string, provider: IAuthenticationProvider) { registered.set(id, provider); }
				override unregisterAuthenticationProvider(id: string) { registered.delete(id); }
			},
			access, new TestExtensionService(), new class extends mock<ILanguageModelIgnoredFilesService>() { },
		));
		main.$registerLanguageModelProvider('copilot');
		infos = await target!.provideLanguageModelChatInfo({ silent: true }, CancellationToken.None);
		const authProvider = registered.get(providerId)!;
		const changes: unknown[] = [];
		disposables.add(authProvider.onDidChangeSessions(event => changes.push(event)));
		const bridge = disposables.add(new AgentHostLanguageModelProvider('agent-host-copilotcli', 'agent-host-copilotcli', service, service, access));
		bridge.updateModels([{ id: 'model', name: 'Model', provider: 'copilotcli' }]);
		const send = () => bridge.sendChatRequest('agent-host-copilotcli:model', [], requester, {}, CancellationToken.None);
		const grantSession = async () => {
			const session = await authProvider.createSession([], {});
			access.updateAllowedExtensions(providerId, session.account.label, [{ id: requester.value, name: requester.value, allowed: true }]);
			return session;
		};
		const sessionA = await grantSession();
		assert.strictEqual(sessionA.account.label, 'Account A');
		await send();
		accountLabel = 'Account B';
		infos = await target!.provideLanguageModelChatInfo({ silent: true }, CancellationToken.None);
		assert.strictEqual(registered.get(providerId), authProvider);
		assert.deepStrictEqual(changes[1], { added: [], changed: [], removed: [sessionA] });
		await assert.rejects(send(), { code: 'NoPermissions' });
		const [sessionB] = await authProvider.getSessions([], {});
		assert.strictEqual(sessionB.account.label, 'Account B');
		await assert.rejects(send(), { code: 'NoPermissions' });
		assert.strictEqual((await grantSession()).account.label, 'Account B');
		await send();
		assert.strictEqual(requests, 2);

		// Multiple currently published accounts must coexist, not overwrite each other.
		additionalAccounts = ['Account A'];
		infos = await target!.provideLanguageModelChatInfo({ silent: true }, CancellationToken.None);
		bridge.updateModels([{ id: 'model', name: 'Model B', provider: 'copilotcli' }, { id: 'model1', name: 'Model A', provider: 'copilotcli' }]);
		access.updateAllowedExtensions(providerId, 'Account A', [{ id: requester.value, name: requester.value, allowed: false }]);
		const sendA = () => bridge.sendChatRequest('agent-host-copilotcli:model1', [], requester, {}, CancellationToken.None);
		await assert.rejects(sendA(), { code: 'NoPermissions' });
		const accountA = { id: 'Account A', label: 'Account A' };
		const [selectedA] = await authProvider.getSessions([], { account: accountA });
		assert.deepStrictEqual(selectedA.account, accountA);
		access.updateAllowedExtensions(providerId, selectedA.account.label, [{ id: requester.value, name: requester.value, allowed: true }]);
		await sendA();
		await send();
		const changesBeforeResolve = changes.length;
		infos = await target!.provideLanguageModelChatInfo({ silent: true }, CancellationToken.None);
		assert.strictEqual(changes.length, changesBeforeResolve);
		assert.deepStrictEqual((await authProvider.getSessions([], { account: { id: 'Account B', label: 'Account B' } })).map(session => session.account.label), ['Account B']);
		await sendA();
		await send();
		assert.strictEqual(requests, 6);
		const primary = target!;
		main.$registerLanguageModelProvider('second-vendor');
		accountLabel = 'Account C';
		additionalAccounts = [];
		await target!.provideLanguageModelChatInfo({ silent: true }, CancellationToken.None);
		assert.deepStrictEqual((await authProvider.getSessions([], {})).map(session => session.account.label), ['Account B', 'Account A', 'Account C']);
		main.$unregisterProvider('second-vendor');
		assert.deepStrictEqual((await authProvider.getSessions([], {})).map(session => session.account.label), ['Account B', 'Account A']);
		accountLabel = 'Account B';
		additionalAccounts = ['Account A'];
		infos = await primary.provideLanguageModelChatInfo({ silent: true }, CancellationToken.None);
		await sendA();
		await send();
		assert.strictEqual(requests, 8);
	});

	test('checks current authorization at request dispatch even if an external caller cached old metadata', async () => {
		const requester = new ExtensionIdentifier('consumer.extension');
		const owner = new ExtensionIdentifier('provider.extension');
		let requiresAuth = false;
		let allowed = false;
		let requests = 0;
		const proxy: Partial<ExtHostLanguageModelsShape> = {
			$acceptResponseDone: async () => { },
		};
		const service = new class extends mock<ILanguageModelsService>() {
			override onDidChangeLanguageModels = Event.None;
			override getLanguageModelIds() { return ['external/model']; }
			override lookupLanguageModel() {
				return {
					id: 'model', vendor: 'external', extension: owner, name: 'Model', family: 'model', version: '1',
					maxInputTokens: 1000, maxOutputTokens: 1000, isDefaultForLocation: {},
					auth: requiresAuth ? { providerLabel: 'Provider' } : undefined,
				};
			}
			override async sendChatRequest() {
				requests++;
				return { stream: AsyncIterableObject.fromArray([]), result: Promise.resolve() };
			}
		};
		const main = disposables.add(new MainThreadLanguageModels(
			SingleProxyRPCProtocol(proxy), service, new NullLogService(), TestProductService,
			new class extends mock<IAuthenticationService>() { },
			new class extends mock<IAuthenticationAccessService>() {
				override isAccessAllowed(providerId: string, account: string, extension: string) {
					assert.deepStrictEqual([providerId, account, extension], [INTERNAL_AUTH_PROVIDER_PREFIX + owner.value, 'Language Models', requester.value]);
					return allowed;
				}
			},
			new TestExtensionService(), new class extends mock<ILanguageModelIgnoredFilesService>() { },
		));
		const send = () => main.$tryStartChatRequest(requester, 'external/model', requests, new SerializableObjectWithBuffers([]), {}, CancellationToken.None);
		await send();
		requiresAuth = true;
		await assert.rejects(send(), { code: 'NoPermissions' });
		assert.strictEqual(requests, 1);
		allowed = true;
		await send();
		allowed = false;
		await assert.rejects(send(), { code: 'NoPermissions' });
		await main.$tryStartChatRequest(owner, 'external/model', requests, new SerializableObjectWithBuffers([]), {}, CancellationToken.None);
		assert.strictEqual(requests, 3);
	});

	test('token counts across extension hosts preserve message classes, roles and nested buffers on both RPC legs', async () => {
		let provider: ILanguageModelChatProvider | undefined;
		let infos: ILanguageModelChatMetadataAndIdentifier[] = [];
		const service = new class extends mock<ILanguageModelsService>() {
			override readonly onDidChangeLanguageModels = Event.None;
			override getLanguageModelIds() { return infos.map(info => info.identifier); }
			override async selectLanguageModels() { return this.getLanguageModelIds(); }
			override lookupLanguageModel(id: string) { return infos.find(info => info.identifier === id)?.metadata; }
			override registerLanguageModelProvider(_vendor: string, value: ILanguageModelChatProvider) {
				provider = value;
				return Disposable.None;
			}
			override computeTokenLength(id: string, value: string | IChatMessage, token: CancellationToken) {
				return provider!.provideTokenCount(id, value, token);
			}
		};
		const createHost = () => {
			const rpc = disposables.add(new TestRPCProtocol());
			const main = disposables.add(new MainThreadLanguageModels(
				rpc, service, new NullLogService(), TestProductService,
				new class extends mock<IAuthenticationService>() { },
				new class extends mock<IAuthenticationAccessService>() { },
				new TestExtensionService(),
				new class extends mock<ILanguageModelIgnoredFilesService>() { },
			));
			rpc.set(MainContext.MainThreadLanguageModels, main);
			const host = disposables.add(new ExtHostLanguageModels(rpc, new NullLogService(), new class extends mock<IExtHostAuthentication>() { }));
			rpc.set(ExtHostContext.ExtHostChatProvider, host);
			return { rpc, host };
		};
		const { rpc: ownerRpc, host: owner } = createHost();
		const received: (string | vscode.LanguageModelChatRequestMessage)[] = [];
		const countParts = (parts: readonly unknown[]): number => {
			return parts.reduce<number>((sum, part) => {
				if (part instanceof LanguageModelTextPart) {
					return sum + part.value.length;
				} else if (part instanceof LanguageModelDataPart) {
					return sum + part.data.byteLength;
				} else if (part instanceof LanguageModelToolCallPart) {
					return sum + part.name.length + JSON.stringify(part.input).length;
				} else if (part instanceof LanguageModelToolResultPart) {
					return sum + countParts(part.content);
				}
				return sum;
			}, 0);
		};
		const count = (value: string | vscode.LanguageModelChatRequestMessage): number => typeof value === 'string' ? value.length : countParts(value.content);
		disposables.add(owner.registerLanguageModelChatProvider(nullExtensionDescription, 'test', {
			provideLanguageModelChatInformation: async () => [{ id: 'model', name: 'Model', family: 'model', version: '1', maxInputTokens: 1000, maxOutputTokens: 1000, capabilities: {} }],
			provideLanguageModelChatResponse: async () => { throw new Error('Unexpected request'); },
			provideTokenCount: async (_model, value) => {
				received.push(value);
				return count(value);
			},
		}));
		await ownerRpc.sync();
		infos = await provider!.provideLanguageModelChatInfo({ silent: true }, CancellationToken.None);
		const { host: consumer } = createHost();
		const remoteModel = await consumer.getLanguageModelForRequest(nullExtensionDescription, infos[0].identifier);
		const localModel = await owner.getLanguageModelForRequest(nullExtensionDescription, infos[0].identifier);
		const values = [
			'hello',
			LanguageModelChatMessage2.User('user text', 'user'),
			new LanguageModelChatMessage2(LanguageModelChatMessageRole.System, 'system text'),
			LanguageModelChatMessage2.Assistant([new LanguageModelTextPart('assistant'), new LanguageModelToolCallPart('call-1', 'testTool', { value: 42 })]),
			LanguageModelChatMessage2.User([
				new LanguageModelDataPart(VSBuffer.fromString('\0image\u00ff').buffer, 'image/png'),
				new LanguageModelToolResultPart('call-1', [
					new LanguageModelTextPart('result'),
					new LanguageModelDataPart(VSBuffer.fromString('\0nested\u00ff').buffer, 'application/octet-stream'),
				]),
			]),
		];
		for (const value of values) {
			assert.strictEqual(await remoteModel.countTokens(value), count(value));
			assert.strictEqual(await localModel.countTokens(value), count(value));
			assert.deepStrictEqual(received.splice(0), [value, value]);
		}
		await ownerRpc.sync();
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
			override lookupLanguageModel() {
				return { id: 'model-1', vendor: 'test', extension: nullExtensionDescription.identifier, name: 'Model', family: 'model', version: '1', maxInputTokens: 1, maxOutputTokens: 1, isDefaultForLocation: {} };
			}
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
