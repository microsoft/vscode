/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ISettableObservable, observableValue, transaction } from '../../../../../base/common/observable.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IDefaultAccountService } from '../../../../../platform/defaultAccount/common/defaultAccount.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IExtensionService } from '../../../../../workbench/services/extensions/common/extensions.js';
import { ChatEntitlement, IChatEntitlementService, IChatSentiment } from '../../../../../workbench/services/chat/common/chatEntitlementService.js';
import { ChatSetupStrategy } from '../../../../../workbench/contrib/chat/browser/chatSetup/chatSetup.js';
import { workbenchInstantiationService } from '../../../../../workbench/test/browser/workbenchTestServices.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { SessionsWelcomeVisibleContext } from '../../../../common/contextkeys.js';
import { SessionsWelcomeContribution } from '../../browser/welcome.contribution.js';
import { SessionsWalkthroughOverlay, WalkthroughOutcome } from '../../browser/sessionsWalkthrough.js';

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

class TestWalkthroughOverlay extends Disposable {

	private _resolveOutcome!: (outcome: WalkthroughOutcome) => void;
	readonly outcome: Promise<WalkthroughOutcome> = new Promise(resolve => {
		this._resolveOutcome = resolve;
	});

	resolve(outcome: WalkthroughOutcome): void {
		this._resolveOutcome(outcome);
	}
}

suite('SessionsWelcomeContribution', () => {

	const disposables = new DisposableStore();
	let instantiationService: TestInstantiationService;
	let mockEntitlementService: MockChatEntitlementService;

	setup(() => {
		instantiationService = workbenchInstantiationService(undefined, disposables);
		mockEntitlementService = new MockChatEntitlementService();
		instantiationService.stub(IChatEntitlementService, mockEntitlementService as unknown as IChatEntitlementService);

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

	async function flushMicrotasks(): Promise<void> {
		await Promise.resolve();
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

	test('walkthrough cannot be dismissed by Escape or backdrop click', () => {
		mockEntitlementService.entitlementObs.set(ChatEntitlement.Unknown, undefined);
		mockEntitlementService.sentimentObs.set({ installed: false } as IChatSentiment, undefined);

		instantiationService.stub(ICommandService, {
			executeCommand: () => Promise.resolve(false)
		} as unknown as ICommandService);
		instantiationService.stub(IExtensionService, {
			stopExtensionHosts: () => Promise.resolve(false),
			startExtensionHosts: () => Promise.resolve()
		} as unknown as IExtensionService);
		instantiationService.stub(IDefaultAccountService, {
			getDefaultAccount: () => Promise.resolve(undefined)
		} as unknown as IDefaultAccountService);
		instantiationService.stub(ILogService, new NullLogService());

		const container = document.createElement('div');
		document.body.appendChild(container);

		try {
			const overlay = disposables.add(instantiationService.createInstance(SessionsWalkthroughOverlay, container));
			const overlayElement = container.querySelector<HTMLElement>('.sessions-walkthrough-overlay');
			assert.ok(overlayElement);

			overlayElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
			assert.strictEqual(overlayElement.isConnected, true, 'Escape should not dismiss the walkthrough');
			assert.strictEqual(overlayElement.classList.contains('sessions-walkthrough-dismissed'), false);

			overlayElement.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
			assert.strictEqual(overlayElement.isConnected, true, 'Backdrop click should not dismiss the walkthrough');
			assert.strictEqual(overlayElement.classList.contains('sessions-walkthrough-dismissed'), false);

			overlay.dispose();
		} finally {
			container.remove();
		}
	});

	test('walkthrough preserves provider-specific sign-in strategies', async () => {
		mockEntitlementService.entitlementObs.set(ChatEntitlement.Unknown, undefined);
		mockEntitlementService.sentimentObs.set({ installed: false } as IChatSentiment, undefined);

		let commandArgs: unknown[] | undefined;
		instantiationService.stub(ICommandService, {
			executeCommand: (...args: unknown[]) => {
				commandArgs = args;
				return Promise.resolve(false);
			}
		} as unknown as ICommandService);
		instantiationService.stub(IExtensionService, {
			stopExtensionHosts: () => Promise.resolve(false),
			startExtensionHosts: () => Promise.resolve()
		} as unknown as IExtensionService);
		instantiationService.stub(IDefaultAccountService, {
			getDefaultAccount: () => Promise.resolve(undefined)
		} as unknown as IDefaultAccountService);
		instantiationService.stub(ILogService, new NullLogService());

		const container = document.createElement('div');
		document.body.appendChild(container);

		try {
			const assertButtonStrategy = async (selector: string, expectedStrategy: ChatSetupStrategy) => {
				commandArgs = undefined;
				const overlay = disposables.add(instantiationService.createInstance(SessionsWalkthroughOverlay, container));
				const githubButton = container.querySelector<HTMLButtonElement>('.sessions-walkthrough-provider-btn.provider-github');
				const googleButton = container.querySelector<HTMLButtonElement>('.sessions-walkthrough-provider-btn.provider-google');
				const appleButton = container.querySelector<HTMLButtonElement>('.sessions-walkthrough-provider-btn.provider-apple');
				assert.ok(githubButton);
				assert.ok(googleButton);
				assert.ok(appleButton);

				const button = container.querySelector<HTMLButtonElement>(selector);
				assert.ok(button);
				button.click();
				await new Promise(resolve => setTimeout(resolve, 250));

				assert.ok(commandArgs);
				assert.deepStrictEqual(commandArgs?.[1], {
					setupStrategy: expectedStrategy
				});

				overlay.dispose();
				container.textContent = '';
			};

			await assertButtonStrategy('.sessions-walkthrough-provider-btn.provider-apple', ChatSetupStrategy.SetupWithAppleProvider);
			await assertButtonStrategy('.sessions-walkthrough-provider-btn.provider-google', ChatSetupStrategy.SetupWithGoogleProvider);
		} finally {
			container.remove();
		}
	});

	test('walkthrough shows disclaimer links on the initial sign-in screen', () => {
		mockEntitlementService.entitlementObs.set(ChatEntitlement.Unknown, undefined);
		mockEntitlementService.sentimentObs.set({ installed: false } as IChatSentiment, undefined);

		instantiationService.stub(ICommandService, {
			executeCommand: () => Promise.resolve(false)
		} as unknown as ICommandService);
		instantiationService.stub(IExtensionService, {
			stopExtensionHosts: () => Promise.resolve(false),
			startExtensionHosts: () => Promise.resolve()
		} as unknown as IExtensionService);
		instantiationService.stub(IDefaultAccountService, {
			getDefaultAccount: () => Promise.resolve(undefined)
		} as unknown as IDefaultAccountService);
		instantiationService.stub(ILogService, new NullLogService());

		const container = document.createElement('div');
		document.body.appendChild(container);

		try {
			const overlay = disposables.add(instantiationService.createInstance(SessionsWalkthroughOverlay, container));
			const disclaimer = container.querySelector<HTMLElement>('.sessions-walkthrough-disclaimer');
			assert.ok(disclaimer);
			assert.strictEqual(disclaimer.classList.contains('hidden'), false);

			const links = Array.from(disclaimer.querySelectorAll<HTMLAnchorElement>('a'));
			assert.deepStrictEqual(links.map(link => link.textContent), ['Terms', 'Privacy Statement', 'public code', 'settings']);

			overlay.dispose();
		} finally {
			container.remove();
		}
	});

	test('dismissing walkthrough does not mark welcome complete', async () => {
		mockEntitlementService.entitlementObs.set(ChatEntitlement.Unknown, undefined);
		mockEntitlementService.sentimentObs.set({ installed: false } as IChatSentiment, undefined);

		const walkthrough = new TestWalkthroughOverlay();
		instantiationService.stubInstance(SessionsWalkthroughOverlay, walkthrough as unknown as SessionsWalkthroughOverlay);

		const contribution = disposables.add(instantiationService.createInstance(SessionsWelcomeContribution));
		assert.ok(contribution);
		assert.strictEqual(isOverlayVisible(), true);

		walkthrough.resolve('dismissed');
		await flushMicrotasks();

		const storageService = instantiationService.get(IStorageService);
		assert.strictEqual(storageService.getBoolean(WELCOME_COMPLETE_KEY, StorageScope.APPLICATION, false), false);
		assert.strictEqual(isOverlayVisible(), false);
	});

	test('completing walkthrough marks welcome complete', async () => {
		mockEntitlementService.entitlementObs.set(ChatEntitlement.Unknown, undefined);
		mockEntitlementService.sentimentObs.set({ installed: false } as IChatSentiment, undefined);

		const walkthrough = new TestWalkthroughOverlay();
		instantiationService.stubInstance(SessionsWalkthroughOverlay, walkthrough as unknown as SessionsWalkthroughOverlay);

		const contribution = disposables.add(instantiationService.createInstance(SessionsWelcomeContribution));
		assert.ok(contribution);
		assert.strictEqual(isOverlayVisible(), true);

		walkthrough.resolve('completed');
		await flushMicrotasks();

		const storageService = instantiationService.get(IStorageService);
		assert.strictEqual(storageService.getBoolean(WELCOME_COMPLETE_KEY, StorageScope.APPLICATION, false), true);
		assert.strictEqual(isOverlayVisible(), false);
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
});
