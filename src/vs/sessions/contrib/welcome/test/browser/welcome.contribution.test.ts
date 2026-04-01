/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ISettableObservable, observableValue, transaction } from '../../../../../base/common/observable.js';
import { IDefaultAccountService } from '../../../../../platform/defaultAccount/common/defaultAccount.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { ChatEntitlement, IChatEntitlementService, IChatSentiment } from '../../../../../workbench/services/chat/common/chatEntitlementService.js';
import { workbenchInstantiationService } from '../../../../../workbench/test/browser/workbenchTestServices.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { SessionsWelcomeVisibleContext } from '../../../../common/contextkeys.js';
import { SessionsWelcomeContribution } from '../../browser/welcome.contribution.js';

const WELCOME_COMPLETE_KEY = 'workbench.agentsession.welcomeComplete';

class MockChatEntitlementService implements Partial<IChatEntitlementService> {

	declare readonly _serviceBrand: undefined;

	readonly onDidChangeEntitlement = Event.None;
	readonly onDidChangeSentiment = Event.None;
	readonly onDidChangeAnonymous = Event.None;
	readonly onDidChangeQuotaExceeded = Event.None;
	readonly onDidChangeQuotaRemaining = Event.None;

	readonly entitlementObs: ISettableObservable<ChatEntitlement> = observableValue('entitlement', ChatEntitlement.Free);
	readonly sentimentObs: ISettableObservable<IChatSentiment> = observableValue('sentiment', { completed: true } as IChatSentiment);
	readonly anonymousObs: ISettableObservable<boolean> = observableValue('anonymous', false);

	readonly organisations = undefined;
	readonly isInternal = false;
	readonly sku = undefined;
	readonly copilotTrackingId = undefined;
	readonly quotas = {};
	readonly previewFeaturesDisabled = false;

	get entitlement(): ChatEntitlement { return this.entitlementObs.get(); }
	get sentiment(): IChatSentiment { return this.sentimentObs.get(); }
	get anonymous(): boolean { return this.anonymousObs.get(); }

	update(): Promise<void> { return Promise.resolve(); }
	markAnonymousRateLimited(): void { }
}

suite('SessionsWelcomeContribution', () => {

	const disposables = new DisposableStore();
	let instantiationService: TestInstantiationService;
	let mockEntitlementService: MockChatEntitlementService;
	let defaultAccountEmitter: Emitter<unknown>;

	setup(() => {
		instantiationService = workbenchInstantiationService(undefined, disposables);
		mockEntitlementService = new MockChatEntitlementService();
		instantiationService.stub(IChatEntitlementService, mockEntitlementService as unknown as IChatEntitlementService);

		defaultAccountEmitter = disposables.add(new Emitter<unknown>());
		instantiationService.stub(IDefaultAccountService, { onDidChangeDefaultAccount: defaultAccountEmitter.event } as Partial<IDefaultAccountService> as IDefaultAccountService);

		// Ensure product has a defaultChatAgent so the contribution activates
		const productService = instantiationService.get(IProductService);
		instantiationService.stub(IProductService, {
			...productService,
			defaultChatAgent: { ...productService.defaultChatAgent, chatExtensionId: 'test.chat' }
		} as IProductService);
	});

	teardown(() => {
		disposables.clear();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	function markReturningUser(): void {
		const storageService = instantiationService.get(IStorageService);
		storageService.store(WELCOME_COMPLETE_KEY, true, StorageScope.APPLICATION, StorageTarget.MACHINE);
	}

	function isOverlayVisible(): boolean {
		const contextKeyService = instantiationService.get(IContextKeyService);
		return SessionsWelcomeVisibleContext.getValue(contextKeyService) === true;
	}

	test('first launch shows overlay', () => {
		// First launch with no entitlement — should show overlay
		mockEntitlementService.entitlementObs.set(ChatEntitlement.Unknown, undefined);
		mockEntitlementService.sentimentObs.set({ completed: false } as IChatSentiment, undefined);

		const contribution = disposables.add(instantiationService.createInstance(SessionsWelcomeContribution));
		assert.ok(contribution);
		assert.strictEqual(isOverlayVisible(), true);
	});

	test('returning user with valid entitlement does not show overlay', () => {
		markReturningUser();
		const contribution = disposables.add(instantiationService.createInstance(SessionsWelcomeContribution));
		assert.ok(contribution);
		assert.strictEqual(isOverlayVisible(), false);
	});

	test('returning user: transient Unknown entitlement does NOT show overlay', () => {
		markReturningUser();
		mockEntitlementService.entitlementObs.set(ChatEntitlement.Free, undefined);
		mockEntitlementService.sentimentObs.set({ completed: true } as IChatSentiment, undefined);

		const contribution = disposables.add(instantiationService.createInstance(SessionsWelcomeContribution));
		assert.ok(contribution);
		assert.strictEqual(isOverlayVisible(), false, 'should not show initially');

		// Simulate transient Unknown (stale token → 401)
		transaction(tx => {
			mockEntitlementService.entitlementObs.set(ChatEntitlement.Unknown, tx);
		});

		assert.strictEqual(isOverlayVisible(), false, 'should NOT show overlay for transient Unknown');

		// Simulate recovery (token refreshed → entitlement restored)
		transaction(tx => {
			mockEntitlementService.entitlementObs.set(ChatEntitlement.Free, tx);
		});

		assert.strictEqual(isOverlayVisible(), false, 'should remain hidden after recovery');
	});

	test('returning user: transient Unresolved entitlement does NOT show overlay', () => {
		markReturningUser();
		mockEntitlementService.entitlementObs.set(ChatEntitlement.Pro, undefined);
		mockEntitlementService.sentimentObs.set({ completed: true } as IChatSentiment, undefined);

		const contribution = disposables.add(instantiationService.createInstance(SessionsWelcomeContribution));
		assert.ok(contribution);

		// Simulate Unresolved (intermediate state during account resolution)
		transaction(tx => {
			mockEntitlementService.entitlementObs.set(ChatEntitlement.Unresolved, tx);
		});

		assert.strictEqual(isOverlayVisible(), false, 'should NOT show overlay for Unresolved');
	});

	test('returning user: extension uninstalled DOES show overlay', () => {
		markReturningUser();
		mockEntitlementService.entitlementObs.set(ChatEntitlement.Free, undefined);
		mockEntitlementService.sentimentObs.set({ completed: true } as IChatSentiment, undefined);

		const contribution = disposables.add(instantiationService.createInstance(SessionsWelcomeContribution));
		assert.ok(contribution);
		assert.strictEqual(isOverlayVisible(), false, 'should not show initially');

		// Simulate extension being uninstalled
		transaction(tx => {
			mockEntitlementService.sentimentObs.set({ completed: false } as IChatSentiment, tx);
		});

		assert.strictEqual(isOverlayVisible(), true, 'should show overlay when extension is uninstalled');
	});

	test('returning user: extension disabled DOES show overlay', () => {
		markReturningUser();
		mockEntitlementService.entitlementObs.set(ChatEntitlement.Free, undefined);
		mockEntitlementService.sentimentObs.set({ completed: true } as IChatSentiment, undefined);

		const contribution = disposables.add(instantiationService.createInstance(SessionsWelcomeContribution));
		assert.ok(contribution);

		// Simulate extension being disabled
		transaction(tx => {
			mockEntitlementService.sentimentObs.set({ completed: true, disabled: true } as IChatSentiment, tx);
		});

		assert.strictEqual(isOverlayVisible(), true, 'should show overlay when extension is disabled');
	});

	test('overlay dismisses when setup completes', () => {
		mockEntitlementService.entitlementObs.set(ChatEntitlement.Unknown, undefined);
		mockEntitlementService.sentimentObs.set({ completed: false } as IChatSentiment, undefined);

		const contribution = disposables.add(instantiationService.createInstance(SessionsWelcomeContribution));
		assert.ok(contribution);
		assert.strictEqual(isOverlayVisible(), true, 'should show on first launch');

		// Simulate completing setup
		transaction(tx => {
			mockEntitlementService.entitlementObs.set(ChatEntitlement.Free, tx);
			mockEntitlementService.sentimentObs.set({ completed: true } as IChatSentiment, tx);
		});

		assert.strictEqual(isOverlayVisible(), false, 'should dismiss after setup completes');
	});

	test('returning user: entitlement going to Available DOES show overlay', () => {
		markReturningUser();
		mockEntitlementService.entitlementObs.set(ChatEntitlement.Free, undefined);
		mockEntitlementService.sentimentObs.set({ completed: true } as IChatSentiment, undefined);

		const contribution = disposables.add(instantiationService.createInstance(SessionsWelcomeContribution));
		assert.ok(contribution);

		// Available means user can sign up for free — this is a real state,
		// not transient, so the overlay should show
		transaction(tx => {
			mockEntitlementService.entitlementObs.set(ChatEntitlement.Available, tx);
		});

		assert.strictEqual(isOverlayVisible(), true, 'should show overlay for Available entitlement');
	});

	test('returning user: explicit sign-out shows overlay', () => {
		markReturningUser();
		mockEntitlementService.entitlementObs.set(ChatEntitlement.Free, undefined);
		mockEntitlementService.sentimentObs.set({ completed: true } as IChatSentiment, undefined);

		const contribution = disposables.add(instantiationService.createInstance(SessionsWelcomeContribution));
		assert.ok(contribution);
		assert.strictEqual(isOverlayVisible(), false, 'should not show initially');

		// Simulate explicit sign-out: account removed then entitlement goes Unknown
		defaultAccountEmitter.fire(null);
		transaction(tx => {
			mockEntitlementService.entitlementObs.set(ChatEntitlement.Unknown, tx);
		});

		assert.strictEqual(isOverlayVisible(), true, 'should show overlay after explicit sign-out');
	});
});
