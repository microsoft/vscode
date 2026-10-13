/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as sinon from 'sinon';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { AgentHostAllowSignedOutWhenUsableSettingId, IAgentHostService } from '../../../../../../platform/agentHost/common/agentService.js';
import type { RootState } from '../../../../../../platform/agentHost/common/state/protocol/channels-root/state.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { MockContextKeyService } from '../../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { IDefaultAccountService } from '../../../../../../platform/defaultAccount/common/defaultAccount.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ChatEntitlement, IChatEntitlementService } from '../../../../../services/chat/common/chatEntitlementService.js';
import { IExtensionService } from '../../../../../services/extensions/common/extensions.js';
import { AgentHostSignedOutModelsNotificationContribution } from '../../../browser/agentSessions/agentHost/agentHostSignedOutModelsNotification.js';
import { type IChatInputNotification, IChatInputNotificationService } from '../../../browser/widget/input/chatInputNotificationService.js';
import { SessionType } from '../../../common/chatSessionsService.js';
import { type ILanguageModelChatMetadata, ILanguageModelsService } from '../../../common/languageModels.js';
import { ILanguageModelsConfigurationService, type ILanguageModelsProviderGroup } from '../../../common/languageModelsConfiguration.js';

const GRACE_PERIOD_MS = 5_000;

suite('AgentHostSignedOutModelsNotification', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	teardown(() => {
		sinon.restore();
	});

	test('shows as soon as local model readiness settles, without waiting out the grace period', async () => {
		const fixture = await createFixture();

		assert.strictEqual(fixture.notifications.isShown(), true);
		fixture.clock.restore();
	});

	test('waits while a configured BYOK vendor is still resolving, then shows once the grace period bounds it', async () => {
		const fixture = await createFixture({ configuredVendors: ['anthropic'], resolvedVendors: [] });

		assert.strictEqual(fixture.notifications.isShown(), false);
		await fixture.clock.tickAsync(GRACE_PERIOD_MS - 1);
		assert.strictEqual(fixture.notifications.isShown(), false);
		await fixture.clock.tickAsync(1);
		assert.strictEqual(fixture.notifications.isShown(), true);
		fixture.clock.restore();
	});

	test('never shows when a model arrives while the grace period is still running', async () => {
		const fixture = await createFixture({ configuredVendors: ['anthropic'], resolvedVendors: [] });

		await fixture.clock.tickAsync(3_000);
		assert.strictEqual(fixture.notifications.isShown(), false);
		fixture.addAgentHostByokModel();

		await fixture.clock.tickAsync(GRACE_PERIOD_MS);
		assert.strictEqual(fixture.notifications.isShown(), false);
		fixture.clock.restore();
	});

	test('hides once a model targeting the harness becomes available', async () => {
		const fixture = await createFixture();
		assert.strictEqual(fixture.notifications.isShown(), true);

		fixture.addAgentHostByokModel();

		assert.strictEqual(fixture.notifications.isShown(), false);
		fixture.clock.restore();
	});

	test('hides when the user signs in', async () => {
		const fixture = await createFixture();
		assert.strictEqual(fixture.notifications.isShown(), true);

		fixture.signIn();

		assert.strictEqual(fixture.notifications.isShown(), false);
		fixture.clock.restore();
	});

	test('never shows while a signed-in entitlement resolves after startup', async () => {
		const fixture = await createFixture({ entitlement: ChatEntitlement.Unresolved });
		const shownWhileUnresolved = fixture.notifications.isShown();

		fixture.setEntitlement(ChatEntitlement.Pro);

		assert.deepStrictEqual([shownWhileUnresolved, fixture.notifications.isShown()], [false, false]);
		fixture.clock.restore();
	});

	test('shows once an unresolved entitlement resolves signed out', async () => {
		const fixture = await createFixture({ entitlement: ChatEntitlement.Unresolved });
		const shownWhileUnresolved = fixture.notifications.isShown();

		fixture.setEntitlement(ChatEntitlement.Unknown);

		assert.deepStrictEqual([shownWhileUnresolved, fixture.notifications.isShown()], [false, true]);
		fixture.clock.restore();
	});

	test('gives a later wait its own grace period instead of the remainder of an earlier one', async () => {
		const fixture = await createFixture({ configuredVendors: ['anthropic'], resolvedVendors: [] });
		assert.strictEqual(fixture.notifications.isShown(), false);

		// Readiness settles a second in, so the notification shows without the first wait ever elapsing.
		await fixture.clock.tickAsync(1_000);
		fixture.resolveVendor('anthropic');
		assert.strictEqual(fixture.notifications.isShown(), true);

		// A newly configured vendor is unresolved again, so the notification waits afresh.
		fixture.addConfiguredVendor('openai');
		assert.strictEqual(fixture.notifications.isShown(), false);

		// The first wait would have elapsed here; only the second one should govern.
		await fixture.clock.tickAsync(GRACE_PERIOD_MS - 1_000);
		assert.strictEqual(fixture.notifications.isShown(), false);
		await fixture.clock.tickAsync(1_000);
		assert.strictEqual(fixture.notifications.isShown(), true);
		fixture.clock.restore();
	});

	test('still waits for a vendor configured long after readiness settled', async () => {
		const fixture = await createFixture({ configuredVendors: ['anthropic'], resolvedVendors: [] });

		await fixture.clock.tickAsync(1_000);
		fixture.resolveVendor('anthropic');
		// Idle well past the original budget, so a leaked timer would have marked it elapsed.
		await fixture.clock.tickAsync(GRACE_PERIOD_MS * 2);
		assert.strictEqual(fixture.notifications.isShown(), true);

		fixture.addConfiguredVendor('openai');

		assert.strictEqual(fixture.notifications.isShown(), false);
		fixture.clock.restore();
	});

	async function createFixture(options: { configuredVendors?: string[]; resolvedVendors?: string[]; entitlement?: ChatEntitlement } = {}) {
		const clock = sinon.useFakeTimers({ shouldAdvanceTime: false });
		const notifications = new TestChatInputNotificationService();
		const languageModels = new TestLanguageModelsService(options.resolvedVendors ?? ['anthropic']);
		const languageModelsConfiguration = new TestLanguageModelsConfigurationService(options.configuredVendors ?? []);
		const account = new TestDefaultAccountService();
		const chatEntitlement = new TestChatEntitlementService(options.entitlement ?? ChatEntitlement.Unknown);
		const configuration = new TestConfigurationService();
		configuration.setUserConfiguration(AgentHostAllowSignedOutWhenUsableSettingId, true);

		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IChatInputNotificationService, notifications);
		instantiationService.stub(IDefaultAccountService, account);
		instantiationService.stub(ILanguageModelsService, languageModels);
		instantiationService.stub(ILanguageModelsConfigurationService, languageModelsConfiguration);
		instantiationService.stub(IAgentHostService, {
			onAgentHostStart: Event.None,
			rootState: new TestRootStateSubscription({ agents: [{ provider: 'copilotcli' }] } as RootState),
		});
		instantiationService.stub(IConfigurationService, configuration);
		instantiationService.stub(IChatEntitlementService, chatEntitlement);
		instantiationService.stub(IContextKeyService, store.add(new MockContextKeyService()));
		instantiationService.stub(IExtensionService, { whenInstalledExtensionsRegistered: () => Promise.resolve(true) });

		store.add(instantiationService.createInstance(AgentHostSignedOutModelsNotificationContribution));
		// Let the account and extension readiness promises settle.
		await clock.tickAsync(0);

		return {
			clock,
			notifications,
			addAgentHostByokModel: () => languageModels.addAgentHostByokModel(),
			resolveVendor: (vendor: string) => languageModels.resolveVendor(vendor),
			addConfiguredVendor: (vendor: string) => languageModelsConfiguration.addVendor(vendor),
			signIn: () => account.setSignedIn(),
			setEntitlement: (entitlement: ChatEntitlement) => chatEntitlement.setEntitlement(entitlement),
		};
	}
});

class TestChatInputNotificationService implements Partial<IChatInputNotificationService> {
	declare readonly _serviceBrand: undefined;
	readonly onDidChange = Event.None;
	readonly onDidDismiss = Event.None;
	private readonly _notifications = new Map<string, IChatInputNotification>();

	setNotification(notification: IChatInputNotification): void {
		this._notifications.set(notification.id, notification);
	}
	deleteNotification(id: string): void {
		this._notifications.delete(id);
	}
	isShown(): boolean {
		return this._notifications.size > 0;
	}
}

class TestLanguageModelsService implements Partial<ILanguageModelsService> {
	declare readonly _serviceBrand: undefined;
	private readonly _onDidChangeLanguageModels = new Emitter<never>();
	readonly onDidChangeLanguageModels = this._onDidChangeLanguageModels.event as ILanguageModelsService['onDidChangeLanguageModels'];
	private readonly _onDidChangeModelVisibility = new Emitter<never>();
	readonly onDidChangeModelVisibility = this._onDidChangeModelVisibility.event as ILanguageModelsService['onDidChangeModelVisibility'];
	private readonly _models = new Map<string, ILanguageModelChatMetadata>();
	private readonly _resolvedVendors: Set<string>;

	constructor(resolvedVendors: readonly string[]) {
		this._resolvedVendors = new Set(resolvedVendors);
	}

	hasResolvedVendor(vendor: string): boolean {
		return this._resolvedVendors.has(vendor);
	}
	resolveVendor(vendor: string): void {
		this._resolvedVendors.add(vendor);
		this._onDidChangeLanguageModels.fire(undefined as never);
	}
	getLanguageModelIds(): string[] {
		return [...this._models.keys()];
	}
	lookupLanguageModel(id: string): ILanguageModelChatMetadata | undefined {
		return this._models.get(id);
	}
	isModelHidden(): boolean {
		return false;
	}
	addAgentHostByokModel(): void {
		this._models.set('byok-source', { id: 'byok-source', isBYOK: true } as ILanguageModelChatMetadata);
		this._models.set('byok-target', { id: 'byok-target', byokModelIdentifier: 'byok-source', targetChatSessionType: SessionType.AgentHostCopilot } as ILanguageModelChatMetadata);
		this._onDidChangeLanguageModels.fire(undefined as never);
	}
}

class TestLanguageModelsConfigurationService implements Partial<ILanguageModelsConfigurationService> {
	declare readonly _serviceBrand: undefined;
	private readonly _onDidChangeLanguageModelGroups = new Emitter<readonly ILanguageModelsProviderGroup[]>();
	readonly onDidChangeLanguageModelGroups = this._onDidChangeLanguageModelGroups.event;
	readonly whenReady = Promise.resolve();
	private readonly _vendors: string[];

	constructor(vendors: readonly string[]) {
		this._vendors = [...vendors];
	}

	getLanguageModelsProviderGroups(): readonly ILanguageModelsProviderGroup[] {
		return this._vendors.map(vendor => ({ name: vendor, vendor } satisfies ILanguageModelsProviderGroup));
	}
	addVendor(vendor: string): void {
		this._vendors.push(vendor);
		this._onDidChangeLanguageModelGroups.fire(this.getLanguageModelsProviderGroups());
	}
}

class TestDefaultAccountService implements Partial<IDefaultAccountService> {
	declare readonly _serviceBrand: undefined;
	private readonly _onDidChangeDefaultAccount = new Emitter<never>();
	readonly onDidChangeDefaultAccount = this._onDidChangeDefaultAccount.event as IDefaultAccountService['onDidChangeDefaultAccount'];
	private _account: IDefaultAccountService['currentDefaultAccount'] = null;

	get currentDefaultAccount() {
		return this._account;
	}
	getDefaultAccount(): Promise<IDefaultAccountService['currentDefaultAccount']> {
		return Promise.resolve(this._account);
	}
	setSignedIn(): void {
		this._account = { sessionId: 'session' } as NonNullable<IDefaultAccountService['currentDefaultAccount']>;
		this._onDidChangeDefaultAccount.fire(undefined as never);
	}
}

class TestChatEntitlementService implements Partial<IChatEntitlementService> {
	declare readonly _serviceBrand: undefined;
	private readonly _onDidChangeEntitlement = new Emitter<void>();
	readonly onDidChangeEntitlement = this._onDidChangeEntitlement.event;
	readonly clientByokEnabled = true;

	constructor(private _entitlement: ChatEntitlement) { }

	get entitlement(): ChatEntitlement {
		return this._entitlement;
	}
	setEntitlement(entitlement: ChatEntitlement): void {
		this._entitlement = entitlement;
		this._onDidChangeEntitlement.fire();
	}
}

class TestRootStateSubscription {
	readonly onDidChange = Event.None;
	readonly onDidError = Event.None;
	readonly onWillApplyAction = Event.None;
	readonly onDidApplyAction = Event.None;

	constructor(readonly value: RootState) { }

	get verifiedValue(): RootState {
		return this.value;
	}
}
