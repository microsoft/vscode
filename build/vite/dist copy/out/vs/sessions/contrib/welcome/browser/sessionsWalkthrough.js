/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import './media/sessionsWalkthrough.css';
import { disposableTimeout } from '../../../../base/common/async.js';
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { $, append, EventType, addDisposableListener, getActiveElement, isHTMLElement } from '../../../../base/browser/dom.js';
import { localize } from '../../../../nls.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { IExtensionService } from '../../../../workbench/services/extensions/common/extensions.js';
import { ChatEntitlement, IChatEntitlementService } from '../../../../workbench/services/chat/common/chatEntitlementService.js';
import { CHAT_SETUP_SUPPORT_ANONYMOUS_ACTION_ID } from '../../../../workbench/contrib/chat/browser/actions/chatActions.js';
import { ChatSetupStrategy } from '../../../../workbench/contrib/chat/browser/chatSetup/chatSetup.js';
import { URI } from '../../../../base/common/uri.js';
const fadeDuration = 200;
const resetMessageDuration = 2000;
const dismissDuration = 250;
const fallbackChatAgentLinks = {
    termsStatementUrl: 'https://aka.ms/github-copilot-terms-statement',
    privacyStatementUrl: 'https://aka.ms/github-copilot-privacy-statement',
    publicCodeMatchesUrl: 'https://aka.ms/github-copilot-match-public-code',
    manageSettingsUrl: 'https://aka.ms/github-copilot-settings'
};
/**
 * Sign-in onboarding overlay:
 *   - Sign in via GitHub / Google / Apple
 */
let SessionsWalkthroughOverlay = class SessionsWalkthroughOverlay extends Disposable {
    constructor(container, chatEntitlementService, commandService, extensionService, openerService, productService, logService) {
        super();
        this.chatEntitlementService = chatEntitlementService;
        this.commandService = commandService;
        this.extensionService = extensionService;
        this.openerService = openerService;
        this.productService = productService;
        this.logService = logService;
        this.stepDisposables = this._register(new MutableDisposable());
        this.currentFocusableElements = [];
        this._outcomeResolved = false;
        /** Resolves when the user completes or dismisses the walkthrough. */
        this.outcome = new Promise(resolve => { this._resolveOutcome = resolve; });
        const activeElement = getActiveElement();
        this.previouslyFocusedElement = isHTMLElement(activeElement) ? activeElement : undefined;
        this.overlay = append(container, $('.sessions-walkthrough-overlay'));
        this.overlay.setAttribute('role', 'dialog');
        this.overlay.setAttribute('aria-modal', 'true');
        this.overlay.setAttribute('aria-label', localize('walkthrough.aria', "Agents onboarding walkthrough"));
        this._register(toDisposable(() => this.overlay.remove()));
        this._register(addDisposableListener(this.overlay, EventType.KEY_DOWN, (e) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                return;
            }
            if (e.key === 'Tab') {
                this._trapFocus(e);
            }
        }));
        this._register(addDisposableListener(this.overlay, EventType.MOUSE_DOWN, e => {
            if (e.target === this.overlay) {
                e.preventDefault();
                e.stopPropagation();
            }
        }));
        this.card = append(this.overlay, $('.sessions-walkthrough-card'));
        // Scrollable content area
        this.contentContainer = append(this.card, $('.sessions-walkthrough-content'));
        // Fixed footer
        this.footerContainer = append(this.card, $('.sessions-walkthrough-footer'));
        const disclaimer = this._createDisclaimer();
        this.disclaimerElement = disclaimer.element;
        this.disclaimerLinks = disclaimer.links;
        this._renderSignIn();
    }
    // ------------------------------------------------------------------
    // Sign In
    _renderSignIn() {
        const stepDisposables = this.stepDisposables.value = new DisposableStore();
        this.contentContainer.textContent = '';
        this.footerContainer.textContent = '';
        this.disclaimerElement.classList.toggle('hidden', this.disclaimerLinks.length === 0);
        // Horizontal layout: icon left, text + buttons right
        const layout = append(this.contentContainer, $('.sessions-walkthrough-hero'));
        append(layout, $('div.sessions-walkthrough-logo'));
        const right = append(layout, $('.sessions-walkthrough-hero-text'));
        const titleEl = append(right, $('h2', undefined, localize('walkthrough.step1.title', "Welcome to Agents")));
        const subtitleEl = append(right, $('p', undefined, localize('walkthrough.step1.subtitle', "Sign in to continue with agent-powered development.")));
        // If already signed in, finish immediately so the app can render.
        if (this._isAlreadySetUp()) {
            this.complete();
            return;
        }
        const signInActions = append(right, $('.sessions-walkthrough-sign-in-actions'));
        const providerRow = append(signInActions, $('.sessions-walkthrough-providers-row'));
        const githubBtn = append(providerRow, $('button.sessions-walkthrough-provider-btn.sessions-walkthrough-provider-primary.provider-github'));
        append(githubBtn, $('span.sessions-walkthrough-provider-label', undefined, localize('walkthrough.signin.github', "Continue with GitHub")));
        const googleBtn = append(providerRow, $('button.sessions-walkthrough-provider-btn.sessions-walkthrough-provider-icon-only.provider-google'));
        googleBtn.setAttribute('aria-label', localize('walkthrough.signin.google', "Continue with Google"));
        googleBtn.title = localize('walkthrough.signin.google', "Continue with Google");
        const appleBtn = append(providerRow, $('button.sessions-walkthrough-provider-btn.sessions-walkthrough-provider-icon-only.provider-apple'));
        appleBtn.setAttribute('aria-label', localize('walkthrough.signin.apple', "Continue with Apple"));
        appleBtn.title = localize('walkthrough.signin.apple', "Continue with Apple");
        const enterpriseProviderName = this.productService.defaultChatAgent?.provider?.enterprise?.name || 'GHE.com';
        const enterpriseBtn = append(providerRow, $('button.sessions-walkthrough-provider-btn.sessions-walkthrough-provider-compact.provider-enterprise'));
        enterpriseBtn.setAttribute('aria-label', localize('walkthrough.signin.enterprise', "Continue with {0}", enterpriseProviderName));
        enterpriseBtn.title = localize('walkthrough.signin.enterprise', "Continue with {0}", enterpriseProviderName);
        append(enterpriseBtn, $('span.sessions-walkthrough-provider-label', undefined, enterpriseProviderName));
        // Error feedback below providers
        const errorContainer = append(this.footerContainer, $('p.sessions-walkthrough-error'));
        errorContainer.style.display = 'none';
        // Focus the first provider button so keyboard users can interact immediately
        disposableTimeout(() => {
            if (this.overlay.isConnected && !githubBtn.disabled) {
                githubBtn.focus();
            }
        }, 0, stepDisposables);
        const providerButtons = [githubBtn, googleBtn, appleBtn, enterpriseBtn];
        this.currentFocusableElements = [...providerButtons, ...this.disclaimerLinks];
        const providerStrategies = [
            ChatSetupStrategy.SetupWithoutEnterpriseProvider,
            ChatSetupStrategy.SetupWithGoogleProvider,
            ChatSetupStrategy.SetupWithAppleProvider,
            ChatSetupStrategy.SetupWithEnterpriseProvider,
        ];
        for (let i = 0; i < providerButtons.length; i++) {
            const strategy = providerStrategies[i];
            stepDisposables.add(addDisposableListener(providerButtons[i], EventType.CLICK, () => this._runSignIn(providerButtons, errorContainer, strategy, titleEl, subtitleEl, signInActions)));
        }
    }
    _isAlreadySetUp() {
        const { sentiment, entitlement } = this.chatEntitlementService;
        return !!(sentiment?.installed &&
            !sentiment?.disabled &&
            entitlement !== ChatEntitlement.Available &&
            !(entitlement === ChatEntitlement.Unknown && !this.chatEntitlementService.anonymous));
    }
    async _runSignIn(providerButtons, error, strategy, titleEl, subtitleEl, signInActions) {
        // Disable all provider buttons
        for (const btn of providerButtons) {
            btn.disabled = true;
        }
        this.currentFocusableElements = [];
        error.style.display = 'none';
        // Fade the content
        this.disclaimerElement.classList.add('hidden');
        this.contentContainer.classList.add('sessions-walkthrough-fade-out');
        await this._wait(fadeDuration);
        if (this._shouldAbortUpdate(titleEl, subtitleEl, signInActions)) {
            return;
        }
        // Swap title and subtitle in-place
        titleEl.textContent = localize('walkthrough.settingUp', "Signing in\u2026");
        subtitleEl.textContent = localize('walkthrough.poweredBy', "Complete authorization in your browser.");
        // Replace sign-in actions with progress bar
        const heroText = signInActions.parentElement;
        if (!heroText) {
            return;
        }
        signInActions.remove();
        append(heroText, $('.sessions-walkthrough-progress-bar', undefined, $('.sessions-walkthrough-progress-bar-fill')));
        // Fade back in
        this.contentContainer.classList.remove('sessions-walkthrough-fade-out');
        try {
            const success = await this.commandService.executeCommand(CHAT_SETUP_SUPPORT_ANONYMOUS_ACTION_ID, {
                setupStrategy: strategy
            });
            if (this._shouldAbortUpdate(titleEl, subtitleEl)) {
                return;
            }
            if (success) {
                // Update title and subtitle for the finishing phase
                titleEl.textContent = localize('walkthrough.signingIn', "Finishing setup\u2026");
                subtitleEl.textContent = localize('walkthrough.finishingSubtitle', "Getting everything ready for you.");
                this.logService.info('[sessions walkthrough] Restarting extension host after setup');
                const stopped = await this.extensionService.stopExtensionHosts(localize('walkthrough.restart', "Completing Agents setup"));
                if (this._shouldAbortUpdate(titleEl, subtitleEl)) {
                    return;
                }
                if (stopped) {
                    await this.extensionService.startExtensionHosts();
                    if (this._shouldAbortUpdate(titleEl, subtitleEl)) {
                        return;
                    }
                }
                this.complete();
            }
            else {
                // Show cancellation feedback, then reset to sign-in
                error.textContent = localize('walkthrough.canceledError', "Sign-in was canceled. Please try again.");
                error.style.display = '';
                await this._wait(resetMessageDuration);
                if (this._shouldAbortUpdate(error)) {
                    return;
                }
                error.style.display = 'none';
                this.contentContainer.classList.add('sessions-walkthrough-fade-out');
                await this._wait(fadeDuration);
                if (!this.overlay.isConnected) {
                    return;
                }
                this.contentContainer.classList.remove('sessions-walkthrough-fade-out');
                this._renderSignIn();
            }
        }
        catch (err) {
            this.logService.error('[sessions walkthrough] Sign-in failed:', err);
            // Show error feedback, then reset to sign-in
            error.textContent = localize('walkthrough.signInError', "Something went wrong. Please try again.");
            error.style.display = '';
            await this._wait(resetMessageDuration);
            if (this._shouldAbortUpdate(error)) {
                return;
            }
            error.style.display = 'none';
            this.contentContainer.classList.add('sessions-walkthrough-fade-out');
            await this._wait(fadeDuration);
            if (!this.overlay.isConnected) {
                return;
            }
            this.contentContainer.classList.remove('sessions-walkthrough-fade-out');
            this._renderSignIn();
        }
    }
    // ------------------------------------------------------------------
    // Lifecycle
    complete() {
        this._finish('completed');
    }
    _finish(outcome) {
        this.overlay.classList.add('sessions-walkthrough-dismissed');
        this._register(disposableTimeout(() => this.dispose(), dismissDuration));
        if (!this._outcomeResolved) {
            this._outcomeResolved = true;
            this._resolveOutcome(outcome);
        }
    }
    dismiss() {
        this._finish('dismissed');
    }
    dispose() {
        // If the overlay is disposed without an explicit finish (e.g. cleared by
        // the owner's DisposableStore), treat it as a dismissal so that `outcome`
        // always resolves and callers are never left waiting on a pending promise.
        if (!this._outcomeResolved) {
            this._outcomeResolved = true;
            this._resolveOutcome('dismissed');
        }
        super.dispose();
        if (this.previouslyFocusedElement?.isConnected) {
            this.previouslyFocusedElement.focus();
        }
    }
    _trapFocus(event) {
        const focusableElements = this._getFocusableElements();
        if (!focusableElements.length) {
            return;
        }
        const activeElement = getActiveElement();
        const fallbackElement = event.shiftKey ? focusableElements[focusableElements.length - 1] : focusableElements[0];
        if (!isHTMLElement(activeElement)) {
            event.preventDefault();
            fallbackElement?.focus();
            return;
        }
        const focusedIndex = focusableElements.indexOf(activeElement);
        if (focusedIndex === -1) {
            event.preventDefault();
            fallbackElement?.focus();
            return;
        }
        if (!event.shiftKey && focusedIndex === focusableElements.length - 1) {
            event.preventDefault();
            focusableElements[0].focus();
        }
        else if (event.shiftKey && focusedIndex === 0) {
            event.preventDefault();
            focusableElements[focusableElements.length - 1]?.focus();
        }
    }
    _getFocusableElements() {
        return this.currentFocusableElements.filter(element => element.isConnected);
    }
    _wait(duration) {
        return new Promise(resolve => {
            let didResolve = false;
            const timeoutDisposables = this.stepDisposables.value?.add(new DisposableStore()) ?? this._register(new DisposableStore());
            const complete = () => {
                if (didResolve) {
                    return;
                }
                didResolve = true;
                timeoutDisposables.dispose();
                resolve();
            };
            timeoutDisposables.add(disposableTimeout(complete, duration));
            timeoutDisposables.add(toDisposable(complete));
        });
    }
    _shouldAbortUpdate(...elements) {
        return !this.overlay.isConnected || elements.some(element => !element.isConnected);
    }
    _createDisclaimer() {
        const defaultChatAgent = this.productService.defaultChatAgent;
        const disclaimer = append(this.overlay, $('p.sessions-walkthrough-disclaimer.hidden'));
        const termsStatementUrl = defaultChatAgent?.termsStatementUrl || fallbackChatAgentLinks.termsStatementUrl;
        const privacyStatementUrl = defaultChatAgent?.privacyStatementUrl || fallbackChatAgentLinks.privacyStatementUrl;
        const publicCodeMatchesUrl = defaultChatAgent?.publicCodeMatchesUrl || fallbackChatAgentLinks.publicCodeMatchesUrl;
        const manageSettingsUrl = defaultChatAgent?.manageSettingsUrl || fallbackChatAgentLinks.manageSettingsUrl;
        const termsLink = this._appendDisclaimerLink(termsStatementUrl, localize('walkthrough.disclaimer.terms', "Terms"));
        const privacyLink = this._appendDisclaimerLink(privacyStatementUrl, localize('walkthrough.disclaimer.privacy', "Privacy Statement"));
        const publicCodeLink = this._appendDisclaimerLink(publicCodeMatchesUrl, localize('walkthrough.disclaimer.publicCode', "public code"));
        const settingsLink = this._appendDisclaimerLink(manageSettingsUrl, localize('walkthrough.disclaimer.settings', "settings"));
        append(disclaimer, document.createTextNode(localize('walkthrough.disclaimer.prefix', "By continuing, you agree to GitHub's ")));
        disclaimer.appendChild(termsLink);
        append(disclaimer, document.createTextNode(localize('walkthrough.disclaimer.middle', " and ")));
        disclaimer.appendChild(privacyLink);
        append(disclaimer, document.createTextNode(localize('walkthrough.disclaimer.suffix', ". GitHub Copilot may show ")));
        disclaimer.appendChild(publicCodeLink);
        append(disclaimer, document.createTextNode(localize('walkthrough.disclaimer.final', " suggestions and use your data to improve the product. You can change these ")));
        disclaimer.appendChild(settingsLink);
        append(disclaimer, document.createTextNode(localize('walkthrough.disclaimer.end', " anytime.")));
        return {
            element: disclaimer,
            links: [termsLink, privacyLink, publicCodeLink, settingsLink]
        };
    }
    _appendDisclaimerLink(href, label) {
        const link = $('a', { href }, label);
        this._register(addDisposableListener(link, EventType.CLICK, e => {
            e.preventDefault();
            e.stopPropagation();
            if (href) {
                void this.openerService.open(URI.parse(href), { fromUserGesture: true });
            }
        }));
        return link;
    }
};
SessionsWalkthroughOverlay = __decorate([
    __param(1, IChatEntitlementService),
    __param(2, ICommandService),
    __param(3, IExtensionService),
    __param(4, IOpenerService),
    __param(5, IProductService),
    __param(6, ILogService)
], SessionsWalkthroughOverlay);
export { SessionsWalkthroughOverlay };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2Vzc2lvbnNXYWxrdGhyb3VnaC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3Nlc3Npb25zL2NvbnRyaWIvd2VsY29tZS9icm93c2VyL3Nlc3Npb25zV2Fsa3Rocm91Z2gudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxpQ0FBaUMsQ0FBQztBQUN6QyxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUNyRSxPQUFPLEVBQUUsVUFBVSxFQUFFLGVBQWUsRUFBRSxpQkFBaUIsRUFBRSxZQUFZLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNwSCxPQUFPLEVBQUUsQ0FBQyxFQUFFLE1BQU0sRUFBRSxTQUFTLEVBQUUscUJBQXFCLEVBQUUsZ0JBQWdCLEVBQUUsYUFBYSxFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFDL0gsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBQzlDLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUNuRixPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFDckUsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLDhDQUE4QyxDQUFDO0FBQzlFLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSx1REFBdUQsQ0FBQztBQUN4RixPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxnRUFBZ0UsQ0FBQztBQUNuRyxPQUFPLEVBQUUsZUFBZSxFQUEwQix1QkFBdUIsRUFBRSxNQUFNLHNFQUFzRSxDQUFDO0FBQ3hKLE9BQU8sRUFBRSxzQ0FBc0MsRUFBRSxNQUFNLG1FQUFtRSxDQUFDO0FBQzNILE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLG1FQUFtRSxDQUFDO0FBQ3RHLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxnQ0FB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