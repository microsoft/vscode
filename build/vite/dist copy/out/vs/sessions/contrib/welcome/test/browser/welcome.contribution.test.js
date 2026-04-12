/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { Event } from '../../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { observableValue, transaction } from '../../../../../base/common/observable.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IDefaultAccountService } from '../../../../../platform/defaultAccount/common/defaultAccount.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IExtensionService } from '../../../../../workbench/services/extensions/common/extensions.js';
import { ChatEntitlement, IChatEntitlementService } from '../../../../../workbench/services/chat/common/chatEntitlementService.js';
import { ChatSetupStrategy } from '../../../../../workbench/contrib/chat/browser/chatSetup/chatSetup.js';
import { workbenchInstantiationService } from '../../../../../workbench/test/browser/workbenchTestServices.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { SessionsWelcomeVisibleContext } from '../../../../common/contextkeys.js';
import { SessionsWelcomeContribution } from '../../browser/welcome.contribution.js';
import { SessionsWalkthroughOverlay } from '../../browser/sessionsWalkthrough.js';
const WELCOME_COMPLETE_KEY = 'workbench.agentsession.welcomeComplete';
class MockChatEntitlementService {
    constructor() {
        this.onDidChangeEntitlement = Event.None;
        this.onDidChangeSentiment = Event.None;
        this.onDidChangeAnonymous = Event.None;
        this.onDidChangeQuotaExceeded = Event.None;
        this.onDidChangeQuotaRemaining = Event.None;
        this.entitlementObs = observableValue('entitlement', ChatEntitlement.Free);
        this.sentimentObs = observableValue('sentiment', { completed: true, installed: true });
        this.anonymousObs = observableValue('anonymous', false);
        this.organisations = undefined;
        this.isInternal = false;
        this.sku = undefined;
        this.copilotTrackingId = undefined;
        this.quotas = {};
        this.previewFeaturesDisabled = false;
    }
    get entitlement() { return this.entitlementObs.get(); }
    get sentiment() { return this.sentimentObs.get(); }
    get anonymous() { return this.anonymousObs.get(); }
    update() { return Promise.resolve(); }
    markAnonymousRateLimited() { }
}
class TestWalkthroughOverlay extends Disposable {
    constructor() {
        super(...arguments);
        this.outcome = new Promise(resolve => {
            this._resolveOutcome = resolve;
        });
    }
    resolve(outcome) {
        this._resolveOutcome(outcome);
    }
    complete() {
        this.resolve('completed');
    }
}
suite('SessionsWelcomeContribution', () => {
    const disposables = new DisposableStore();
    let instantiationService;
    let mockEntitlementService;
    setup(() => {
        instantiationService = workbenchInstantiationService(undefined, disposables);
        mockEntitlementService = new MockChatEntitlementService();
        instantiationService.stub(IChatEntitlementService, mockEntitlementService);
        // Ensure product has a defaultChatAgent so the contribution activates
        const productService = instantiationService.get(IProductService);
        instantiationService.stub(IProductService, {
            ...productService,
            defaultChatAgent: { ...productService.defaultChatAgent, chatExtensionId: 'test.chat' }
        });
    });
    teardown(() => {
        disposables.clear();
    });
    ensureNoDisposablesAreLeakedInTestSuite();
    function markReturningUser() {
        const storageService = instantiationService.get(IStorageService);
        storageService.store(WELCOME_COMPLETE_KEY, true, -1 /* StorageScope.APPLICATION */, 1 /* StorageTarget.MACHINE */);
    }
    function isOverlayVisible() {
        const contextKeyService = instantiationService.get(IContextKeyService);
        return SessionsWelcomeVisibleContext.getValue(contextKeyService) === true;
    }
    async function flushMicrotasks() {
        await Promise.resolve();
    }
    test('first launch shows overlay', () => {
        // First launch with no entitlement — should show overlay
        mockEntitlementService.entitlementObs.set(ChatEntitlement.Unknown, undefined);
        mockEntitlementService.sentimentObs.set({ completed: false, installed: false }, undefined);
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
        mockEntitlementService.sentimentObs.set({ completed: true, installed: true }, undefined);
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
        mockEntitlementService.sentimentObs.set({ completed: true, installed: true }, undefined);
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
        mockEntitlementService.sentimentObs.set({ completed: true, installed: true }, undefined);
        const contribution = disposables.add(instantiationService.createInstance(SessionsWelcomeContribution));
        assert.ok(contribution);
        assert.strictEqual(isOverlayVisible(), false, 'should not show initially');
        // Simulate extension being uninstalled
        transaction(tx => {
            mockEntitlementService.sentimentObs.set({ completed: true, installed: false }, tx);
        });
        assert.strictEqual(isOverlayVisible(), true, 'should show overlay when extension is uninstalled');
    });
    test('returning user: extension disabled DOES show overlay', () => {
        markReturningUser();
        mockEntitlementService.entitlementObs.set(ChatEntitlement.Free, undefined);
        mockEntitlementService.sentimentObs.set({ completed: true, installed: true }, undefined);
        const contribution = disposables.add(instantiationService.createInstance(SessionsWelcomeContribution));
        assert.ok(contribution);
        // Simulate extension being disabled
        transaction(tx => {
            mockEntitlementService.sentimentObs.set({ completed: true, installed: true, disabled: true }, tx);
        });
        assert.strictEqual(isOverlayVisible(), true, 'should show overlay when extension is disabled');
    });
    test('setup completion dismisses overlay and persists welcome completion', async () => {
        mockEntitlementService.entitlementObs.set(ChatEntitlement.Unknown, undefined);
        mockEntitlementService.sentimentObs.set({ completed: false, installed: false }, undefined);
        const contribution = disposables.add(instantiationService.createInstance(SessionsWelcomeContribution));
        assert.ok(contribution);
        assert.strictEqual(isOverlayVisible(), true, 'should show on first launch');
        // Simulate setup completion; the walkthrough remains visible until it resolves
        transaction(tx => {
            mockEntitlementService.entitlementObs.set(ChatEntitlement.Free, tx);
            mockEntitlementService.sentimentObs.set({ completed: true, installed: true }, tx);
        });
        await flushMicrotasks();
        const storageService = instantiationService.get(IStorageService);
        assert.strictEqual(storageService.getBoolean(WELCOME_COMPLETE_KEY, -1 /* StorageScope.APPLICATION */, false), true);
        assert.strictEqual(isOverlayVisible(), false, 'should dismiss once setup completes');
    });
    test('walkthrough cannot be dismissed by Escape or backdrop click', () => {
        mockEntitlementService.entitlementObs.set(ChatEntitlement.Unknown, undefined);
        mockEntitlementService.sentimentObs.set({ installed: false }, undefined);
        instantiationService.stub(ICommandService, {
            executeCommand: () => Promise.resolve(false)
        });
        instantiationService.stub(IExtensionService, {
            stopExtensionHosts: () => Promise.resolve(false),
            startExtensionHosts: () => Promise.resolve()
        });
        instantiationService.stub(IDefaultAccountService, {
            getDefaultAccount: () => Promise.resolve(undefined)
        });
        instantiationService.stub(ILogService, new NullLogService());
        const container = document.createElement('div');
        document.body.appendChild(container);
        try {
            const overlay = disposables.add(instantiationService.createInstance(SessionsWalkthroughOverlay, container));
            const overlayElement = container.querySelector('.sessions-walkthrough-overlay');
            assert.ok(overlayElement);
            overlayElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
            assert.strictEqual(overlayElement.isConnected, true, 'Escape should not dismiss the walkthrough');
            assert.strictEqual(overlayElement.classList.contains('sessions-walkthrough-dismissed'), false);
            overlayElement.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
            assert.strictEqual(overlayElement.isConnected, true, 'Backdrop click should not dismiss the walkthrough');
            assert.strictEqual(overlayElement.classList.contains('sessions-walkthrough-dismissed'), false);
            overlay.dispose();
        }
        finally {
            container.remove();
        }
    });
    test('walkthrough preserves provider-specific sign-in strategies', async () => {
        mockEntitlementService.entitlementObs.set(ChatEntitlement.Unknown, undefined);
        mockEntitlementService.sentimentObs.set({ installed: false }, undefined);
        let commandArgs;
        instantiationService.stub(IExtensionService, {
            stopExtensionHosts: () => Promise.resolve(false),
            startExtensionHosts: () => Promise.resolve()
        });
        instantiationService.stub(IDefaultAccountService, {
            getDefaultAccount: () => Promise.resolve(undefined)
        });
        instantiationService.stub(ILogService, new NullLogService());
        const container = document.createElement('div');
        document.body.appendChild(container);
        try {
            const assertButtonStrategy = async (selector, expectedStrategy) => {
                commandArgs = undefined;
                let resolveExecuteCommandCalled;
                const executeCommandCalled = new Promise(resolve => {
                    resolveExecuteCommandCalled = resolve;
                });
                instantiationService.stub(ICommandService, {
                    executeCommand: (...args) => {
                        commandArgs = args;
                        resolveExecuteCommandCalled();
                        return Promise.resolve(false);
                    }
                });
                const overlay = disposables.add(instantiationService.createInstance(SessionsWalkthroughOverlay, container));
                const githubButton = container.querySelector('.sessions-walkthrough-provider-btn.provider-github');
                const googleButton = container.querySelector('.sessions-walkthrough-provider-btn.provider-google');
                const appleButton = container.querySelector('.sessions-walkthrough-provider-btn.provider-apple');
                const enterpriseButton = container.querySelector('.sessions-walkthrough-provider-btn.provider-enterprise');
                assert.ok(githubButton);
                assert.ok(googleButton);
                assert.ok(appleButton);
                assert.ok(enterpriseButton);
                const button = container.querySelector(selector);
                assert.ok(button);
                button.click();
                await executeCommandCalled;
                assert.ok(commandArgs);
                assert.deepStrictEqual(commandArgs?.[1], {
                    setupStrategy: expectedStrategy
                });
                overlay.dispose();
                container.textContent = '';
            };
            await assertButtonStrategy('.sessions-walkthrough-provider-btn.provider-apple', ChatSetupStrategy.SetupWithAppleProvider);
            await assertButtonStrategy('.sessions-walkthrough-provider-btn.provider-google', ChatSetupStrategy.SetupWithGoogleProvider);
            await assertButtonStrategy('.sessions-walkthrough-provider-btn.provider-enterprise', ChatSetupStrategy.SetupWithEnterpriseProvider);
        }
        finally {
            container.remove();
        }
    });
    test('enterprise sign-in option is removed after setup begins', async () => {
        mockEntitlementService.entitlementObs.set(ChatEntitlement.Unknown, undefined);
        mockEntitlementService.sentimentObs.set({ installed: false }, undefined);
        let resolveExecuteCommand;
        const executeCommandStarted = new Promise(resolve => {
            resolveExecuteCommand = resolve;
        });
        instantiationService.stub(ICommandService, {
            executeCommand: () => {
                resolveExecuteCommand();
                return new Promise(() => { });
            }
        });
        instantiationService.stub(IExtensionService, {
            stopExtensionHosts: () => Promise.resolve(false),
            startExtensionHosts: () => Promise.resolve()
        });
        instantiationService.stub(ILogService, new NullLogService());
        const container = document.createElement('div');
        document.body.appendChild(container);
        try {
            const overlay = disposables.add(instantiationService.createInstance(SessionsWalkthroughOverlay, container));
            const enterpriseButton = container.querySelector('.sessions-walkthrough-provider-btn.provider-enterprise');
            assert.ok(enterpriseButton);
            enterpriseButton.click();
            await executeCommandStarted;
            await new Promise(resolve => setTimeout(resolve, 250));
            assert.strictEqual(container.querySelector('.sessions-walkthrough-provider-btn.provider-enterprise'), null);
            assert.strictEqual(container.querySelector('.sessions-walkthrough-provider-btn'), null);
            overlay.dispose();
        }
        finally {
            container.remove();
        }
    });
    test('walkthrough shows disclaimer links on the initial sign-in screen', () => {
        mockEntitlementService.entitlementObs.set(ChatEntitlement.Unknown, undefined);
        mockEntitlementService.sentimentObs.set({ installed: false }, undefined);
        instantiationService.stub(ICommandService, {
            executeCommand: () => Promise.resolve(false)
        });
        instantiationService.stub(IExtensionService, {
            stopExtensionHosts: () => Promise.resolve(false),
            startExtensionHosts: () => Promise.resolve()
        });
        instantiationService.stub(IDefaultAccountService, {
            getDefaultAccount: () => Promise.resolve(undefined)
        });
        instantiationService.stub(ILogService, new NullLogService());
        const productService = instantiationService.get(IProductService);
        instantiationService.stub(IProductService, {
            ...productService,
            defaultChatAgent: {
                ...productService.defaultChatAgent,
                chatExtensionId: 'test.chat',
                termsStatementUrl: 'https://example.com/terms',
                privacyStatementUrl: 'https://example.com/privacy',
                publicCodeMatchesUrl: 'https://example.com/public-code',
                manageSettingsUrl: 'https://example.com/settings'
            }
        });
        const container = document.createElement('div');
        document.body.appendChild(container);
        try {
            const overlay = disposables.add(instantiationService.createInstance(SessionsWalkthroughOverlay, container));
            const disclaimer = container.querySelector('.sessions-walkthrough-disclaimer');
            assert.ok(disclaimer);
            assert.strictEqual(disclaimer.classList.contains('hidden'), false);
            const links = Array.from(disclaimer.querySelectorAll('a'));
            assert.deepStrictEqual(links.map(link => link.textContent), ['Terms', 'Privacy Statement', 'public code', 'settings']);
            overlay.dispose();
        }
        finally {
            container.remove();
        }
    });
    test('walkthrough falls back to default disclaimer links when product links are missing', () => {
        mockEntitlementService.entitlementObs.set(ChatEntitlement.Unknown, undefined);
        mockEntitlementService.sentimentObs.set({ installed: false }, undefined);
        instantiationService.stub(ICommandService, {
            executeCommand: () => Promise.resolve(false)
        });
        instantiationService.stub(IExtensionService, {
            stopExtensionHosts: () => Promise.resolve(false),
            startExtensionHosts: () => Promise.resolve()
        });
        instantiationService.stub(ILogService, new NullLogService());
        const productService = instantiationService.get(IProductService);
        instantiationService.stub(IProductService, {
            ...productService,
            defaultChatAgent: {
                ...productService.defaultChatAgent,
                chatExtensionId: 'test.chat',
                termsStatementUrl: '',
                privacyStatementUrl: '',
                publicCodeMatchesUrl: '',
                manageSettingsUrl: ''
            }
        });
        const container = document.createElement('div');
        document.body.appendChild(container);
        try {
            const overlay = disposables.add(instantiationService.createInstance(SessionsWalkthroughOverlay, container));
            const disclaimer = container.querySelector('.sessions-walkthrough-disclaimer');
            assert.ok(disclaimer);
            assert.strictEqual(disclaimer.classList.contains('hidden'), false);
            assert.deepStrictEqual(Array.from(disclaimer.querySelectorAll('a')).map(link => link.getAttribute('href')), [
                'https://aka.ms/github-copilot-terms-statement',
                'https://aka.ms/github-copilot-privacy-statement',
                'https://aka.ms/github-copilot-match-public-code',
                'https://aka.ms/github-copilot-settings'
            ]);
            overlay.dispose();
        }
        finally {
            container.remove();
        }
    });
    test('dismissing walkthrough does not mark welcome complete', async () => {
        mockEntitlementService.entitlementObs.set(ChatEntitlement.Unknown, undefined);
        mockEntitlementService.sentimentObs.set({ installed: false }, undefined);
        const walkthrough = new TestWalkthroughOverlay();
        instantiationService.stubInstance(SessionsWalkthroughOverlay, walkthrough);
        const contribution = disposables.add(instantiationService.createInstance(SessionsWelcomeContribution));
        assert.ok(contribution);
        assert.strictEqual(isOverlayVisible(), true);
        walkthrough.resolve('dismissed');
        await flushMicrotasks();
        const storageService = instantiationService.get(IStorageService);
        assert.strictEqual(storageService.getBoolean(WELCOME_COMPLETE_KEY, -1 /* StorageScope.APPLICATION */, false), false);
        assert.strictEqual(isOverlayVisible(), false);
    });
    test('completing walkthrough marks welcome complete', async () => {
        mockEntitlementService.entitlementObs.set(ChatEntitlement.Unknown, undefined);
        mockEntitlementService.sentimentObs.set({ installed: false }, undefined);
        const walkthrough = new TestWalkthroughOverlay();
        instantiationService.stubInstance(SessionsWalkthroughOverlay, walkthrough);
        const contribution = disposables.add(instantiationService.createInstance(SessionsWelcomeContribution));
        assert.ok(contribution);
        assert.strictEqual(isOverlayVisible(), true);
        walkthrough.resolve('completed');
        await flushMicrotasks();
        const storageService = instantiationService.get(IStorageService);
        assert.strictEqual(storageService.getBoolean(WELCOME_COMPLETE_KEY, -1 /* StorageScope.APPLICATION */, false), true);
        assert.strictEqual(isOverlayVisible(), false);
    });
    test('returning user: entitlement going to Available DOES show overlay', () => {
        markReturningUser();
        mockEntitlementService.entitlementObs.set(ChatEntitlement.Free, undefined);
        mockEntitlementService.sentimentObs.set({ completed: true, installed: true }, undefined);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid2VsY29tZS5jb250cmlidXRpb24udGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3Nlc3Npb25zL2NvbnRyaWIvd2VsY29tZS90ZXN0L2Jyb3dzZXIvd2VsY29tZS5jb250cmlidXRpb24udGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLE1BQU0sTUFBTSxRQUFRLENBQUM7QUFDNUIsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQzVELE9BQU8sRUFBRSxVQUFVLEVBQUUsZUFBZSxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDdEYsT0FBTyxFQUF1QixlQUFlLEVBQUUsV0FBVyxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFDN0csT0FBTyxFQUFFLHVDQUF1QyxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFDbkcsT0FBTyxFQUFFLHNCQUFzQixFQUFFLE1BQU0saUVBQWlFLENBQUM7QUFFekcsT0FBTyxFQUFFLFdBQVcsRUFBRSxjQUFjLEVBQUUsTUFBTSwyQ0FBMkMsQ0FBQztBQUN4RixPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sMERBQTBELENBQUM7QUFDM0YsT0FBTyxFQUFFLGVBQWUsRUFBK0IsTUFBTSxtREFBbUQsQ0FBQztBQUNqSCxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0scURBQXFELENBQUM7QUFDdEYsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sbUVBQW1FLENBQUM7QUFDdEcsT0FBTyxFQUFFLGVBQWUsRUFBRSx1QkFBdUIsRUFBa0IsTUFBTSx5RUFBeUUsQ0FBQztBQUNuSixPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxzRUFBc0UsQ0FBQztBQUN6RyxPQUFPLEVBQUUsNkJBQTZCLEVBQUUsTUFBTSxnRUFBZ0UsQ0FBQztBQUMvRyxPQUFPLEVBQUUsa0JBQWtCLEVBQUUs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