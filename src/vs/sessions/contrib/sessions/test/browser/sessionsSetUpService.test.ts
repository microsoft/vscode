/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { InMemoryStorageService, IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { IUserDataProfilesService } from '../../../../../platform/userDataProfile/common/userDataProfile.js';
import { IUserDataProfileStorageService } from '../../../../../platform/userDataProfile/common/userDataProfileStorageService.js';
import { IDefaultAccountService } from '../../../../../platform/defaultAccount/common/defaultAccount.js';
import { IDefaultAccount } from '../../../../../base/common/defaultAccount.js';
import { IWorkbenchEnvironmentService } from '../../../../../workbench/services/environment/common/environmentService.js';
import { IAuthenticationService } from '../../../../../workbench/services/authentication/common/authentication.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IWorkbenchLayoutService } from '../../../../../workbench/services/layout/browser/layoutService.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { IHostService } from '../../../../../workbench/services/host/browser/host.js';
import { IMarkdownRendererService } from '../../../../../platform/markdown/browser/markdownRenderer.js';
import { ChatEntitlement, IChatEntitlementService, IChatSentiment } from '../../../../../workbench/services/chat/common/chatEntitlementService.js';
import { IExtensionService } from '../../../../../workbench/services/extensions/common/extensions.js';
import { WELCOME_COMPLETE_KEY } from '../../../../common/welcome.js';
import { SessionsSetUpService } from '../../../../browser/sessionsSetUpService.js';

class ConfigurableChatEntitlementService extends mock<IChatEntitlementService>() {
	override readonly onDidChangeEntitlement = Event.None;
	override readonly onDidChangeQuotaExceeded = Event.None;
	override readonly onDidChangeQuotaRemaining = Event.None;
	override readonly onDidChangeUsageBasedBilling = Event.None;
	override readonly onDidChangeSentiment = Event.None;
	override readonly onDidChangeAnonymous = Event.None;
	override readonly entitlement = ChatEntitlement.Unknown;
	override readonly entitlementObs = observableValue('entitlement', ChatEntitlement.Unknown);
	override readonly previewFeaturesDisabled = false;
	override readonly clientByokEnabled = true;
	override hasByokModels = false;
	override readonly organisations = undefined;
	override readonly isInternal = false;
	override readonly sku = undefined;
	override readonly copilotTrackingId = undefined;
	override readonly quotas = {};
	override sentiment: IChatSentiment = {};
	override readonly sentimentObs = observableValue('sentiment', {});
	override readonly anonymous = false;
	override readonly anonymousObs = observableValue('anonymous', false);
	override acceptQuotas(): void { }
	override clearQuotas(): void { }
	override markAnonymousRateLimited(): void { }
	override markSetupCompleted(): void { }
	override setForceHidden(_hidden: boolean): void { }
	override update(): Promise<void> { return Promise.resolve(); }
}

async function createService(
	disposables: DisposableStore,
	options: {
		hasByokModels?: boolean;
		sentimentCompleted?: boolean;
		welcomeComplete?: boolean;
		defaultAccount?: IDefaultAccount | null;
		withChatAgent?: boolean;
	},
): Promise<{ service: SessionsSetUpService; storage: InMemoryStorageService; defaultAccountEmitter: Emitter<IDefaultAccount | null> }> {
	const storage = disposables.add(new InMemoryStorageService());
	if (options.welcomeComplete) {
		storage.store(WELCOME_COMPLETE_KEY, true, StorageScope.APPLICATION, StorageTarget.MACHINE);
	}

	const entitlement = new ConfigurableChatEntitlementService();
	entitlement.sentiment = { completed: true };
	entitlement.hasByokModels = options.hasByokModels ?? false;

	const defaultAccountEmitter = disposables.add(new Emitter<IDefaultAccount | null>());
	const defaultAccountService = new class extends mock<IDefaultAccountService>() {
		override readonly onDidChangeDefaultAccount = defaultAccountEmitter.event;
		override getDefaultAccount() {
			return Promise.resolve(options.defaultAccount ?? null);
		}
		override resolveGitHubUrl(path: string) {
			return `https://github.com/${path}`;
		}
	}();

	const instantiationService = disposables.add(new TestInstantiationService());
	instantiationService.stub(IChatEntitlementService, entitlement);
	instantiationService.stub(IUserDataProfileStorageService, {
		withProfileScopedStorageService: async (_profile: unknown, fn: (storageService: IStorageService) => Promise<void>) => fn(storage),
	} as IUserDataProfileStorageService);
	instantiationService.stub(IUserDataProfilesService, { defaultProfile: { id: 'default' } } as IUserDataProfilesService);
	instantiationService.stub(ILogService, NullLogService);
	instantiationService.stub(IProductService, {
		nameLong: 'Test',
		defaultChatAgent: options.withChatAgent ? { chatExtensionId: 'test.chat' } : undefined,
	} as IProductService);
	instantiationService.stub(IStorageService, storage);
	instantiationService.stub(IContextKeyService, disposables.add(new MockContextKeyService()));
	instantiationService.stub(IWorkbenchEnvironmentService, { enableSmokeTestDriver: false } as IWorkbenchEnvironmentService);
	instantiationService.stub(IAuthenticationService, { onDidChangeSessions: Event.None, getSessions: () => Promise.resolve([]) } as unknown as IAuthenticationService);
	instantiationService.stub(ICommandService, { executeCommand: () => Promise.resolve(undefined) } as unknown as ICommandService);
	instantiationService.stub(IConfigurationService, {
		getValue: () => false,
		onDidChangeConfiguration: Event.None,
		updateValue: () => Promise.resolve(),
	} as unknown as IConfigurationService);
	instantiationService.stub(IWorkbenchLayoutService, { activeContainer: document.body, mainContainer: document.body } as IWorkbenchLayoutService);
	instantiationService.stub(IKeybindingService, {} as IKeybindingService);
	instantiationService.stub(IHostService, {} as IHostService);
	instantiationService.stub(IMarkdownRendererService, {
		render: () => ({ element: document.createElement('span'), dispose: () => { } }),
	} as unknown as IMarkdownRendererService);
	instantiationService.stub(IDefaultAccountService, defaultAccountService);
	instantiationService.stub(IExtensionService, { whenInstalledExtensionsRegistered: () => Promise.resolve(true) } as unknown as IExtensionService);

	const service = disposables.add(instantiationService.createInstance(SessionsSetUpService));
	await (service as unknown as { _initPromise: Promise<void> })._initPromise;

	entitlement.sentiment = { completed: options.sentimentCompleted ?? false };

	return { service, storage, defaultAccountEmitter };
}

suite('SessionsSetUpService', () => {

	const disposables = new DisposableStore();

	teardown(() => {
		disposables.clear();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	test('whenSetupDone returns true when BYOK models are available', async () => {
		const { service } = await createService(disposables, { hasByokModels: true, sentimentCompleted: false });
		const whenSetupDone = (service as unknown as { whenSetupDone(): Promise<boolean> }).whenSetupDone.bind(service);
		assert.strictEqual(await whenSetupDone(), true);
	});

	test('whenSetupDone returns false without BYOK or completed setup', async () => {
		const { service } = await createService(disposables, { hasByokModels: false, sentimentCompleted: false });
		const whenSetupDone = (service as unknown as { whenSetupDone(): Promise<boolean> }).whenSetupDone.bind(service);
		assert.strictEqual(await whenSetupDone(), false);
	});

	test('whenSetupDone returns true when setup is completed', async () => {
		const { service } = await createService(disposables, { hasByokModels: false, sentimentCompleted: true });
		const whenSetupDone = (service as unknown as { whenSetupDone(): Promise<boolean> }).whenSetupDone.bind(service);
		assert.strictEqual(await whenSetupDone(), true);
	});

	test('whenWelcomeDone completes for BYOK without Copilot account', async () => {
		const { service } = await createService(disposables, {
			hasByokModels: true,
			welcomeComplete: true,
			defaultAccount: null,
			withChatAgent: true,
		});

		await service.whenWelcomeDone();
	});

	test('whenWelcomeDone completes when welcome already complete without BYOK context', async () => {
		const { service } = await createService(disposables, {
			hasByokModels: false,
			welcomeComplete: true,
			defaultAccount: null,
			withChatAgent: true,
		});

		await service.whenWelcomeDone();
	});
});
