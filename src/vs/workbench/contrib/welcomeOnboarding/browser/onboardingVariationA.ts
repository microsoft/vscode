/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { $, append, addDisposableListener, EventType, clearNode, getActiveWindow, isHTMLElement } from '../../../../base/browser/dom.js';
import { isCancellationError } from '../../../../base/common/errors.js';
import { StopWatch } from '../../../../base/common/stopwatch.js';
import { URI } from '../../../../base/common/uri.js';
import { isWindows, isMacintosh, isLinux } from '../../../../base/common/platform.js';
import { assertDefined } from '../../../../base/common/types.js';
import { ILayoutService } from '../../../../platform/layout/browser/layoutService.js';
import { KeyCode } from '../../../../base/common/keyCodes.js';
import { StandardKeyboardEvent } from '../../../../base/browser/keyboardEvent.js';
import { InputBox } from '../../../../base/browser/ui/inputbox/inputBox.js';
import { Button, IButton } from '../../../../base/browser/ui/button/button.js';
import { status } from '../../../../base/browser/ui/aria/aria.js';
import { localize } from '../../../../nls.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { Action } from '../../../../base/common/actions.js';
import { IWorkbenchThemeService } from '../../../services/themes/common/workbenchThemeService.js';
import { EXTENSION_INSTALL_SKIP_WALKTHROUGH_CONTEXT, IExtensionGalleryService, IExtensionManagementService } from '../../../../platform/extensionManagement/common/extensionManagement.js';
import { GitHubPaths, IDefaultAccountService } from '../../../../platform/defaultAccount/common/defaultAccount.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { INotificationService, Severity } from '../../../../platform/notification/common/notification.js';
import { ConfigurationTarget, IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { defaultButtonStyles, defaultInputBoxStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import product from '../../../../platform/product/common/product.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IPathService } from '../../../services/path/common/pathService.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { InstallChatEvent, InstallChatClassification, ChatSetupStrategy } from '../../chat/browser/chatSetup/chatSetup.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IAccessibilityService } from '../../../../platform/accessibility/common/accessibility.js';
import {
	OnboardingStepId,
	ONBOARDING_STEPS,
	ONBOARDING_AI_PREFERENCE_OPTIONS,
	AiCollaborationMode,
	IOnboardingThemeOption,
	getOnboardingStepTitle,
	getOnboardingStepSubtitle,
	GHE_FULL_URI_REGEX,
	GheParseResultKind,
	parseGheInstanceInput,
} from '../common/onboardingTypes.js';
import { IOnboardingService } from '../common/onboardingService.js';

type OnboardingStepViewClassification = {
	owner: 'cwebster-99';
	comment: 'Tracks which onboarding step is viewed.';
	step: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The step identifier.' };
	stepNumber: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'The 1-based step index.' };
};

type OnboardingStepViewEvent = {
	step: string;
	stepNumber: number;
};

type OnboardingActionClassification = {
	owner: 'cwebster-99';
	comment: 'Tracks actions taken on the onboarding wizard.';
	action: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The action performed.' };
	step: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The step the action was performed on.' };
	argument: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Optional context such as theme id, extension id, or provider.' };
};

type OnboardingActionEvent = {
	action: string;
	step: string;
	argument: string | undefined;
};

type EnterpriseSignInUiState = 'options' | 'instance' | 'progress';
type AuthenticationPrototypeProvider = 'copilot' | 'chatgpt' | 'ownKey';
type AuthenticationPrototypeHarness = 'copilot' | 'codex' | 'claude';
/** Request shapes a custom endpoint can speak; it need not be OpenAI-compatible. */
type AuthenticationPrototypeEndpointFormat = 'chat-completions' | 'responses' | 'messages';

interface IAuthenticationPrototypeEndpoint {
	url: string;
	key: string;
	format: AuthenticationPrototypeEndpointFormat;
}
type AuthenticationPrototypeProviderStatus = 'idle' | 'scanning' | 'detected' | 'connecting' | 'signed-in' | 'error';

interface IAuthenticationPrototypeAccount {
	readonly label: string;
	readonly detail?: string;
	readonly avatarUrl?: string;
}

interface IAuthenticationPrototypeProviderState {
	selected: boolean;
	status: AuthenticationPrototypeProviderStatus;
	account?: IAuthenticationPrototypeAccount;
}

/** Provider layouts the prototype can compare. */
type AuthenticationPrototypeLayout = 'grid' | 'stacked';

export interface IAuthenticationPrototypeOptions {
	readonly layout?: AuthenticationPrototypeLayout;
	readonly accounts?: Partial<Record<AuthenticationPrototypeProvider, IAuthenticationPrototypeAccount>>;
	readonly themes?: readonly IOnboardingThemeOption[];
	/** Holds the provider scan in its in-progress state so it can be inspected. */
	readonly holdScanning?: boolean;
}

assertDefined(product.defaultChatAgent, 'Onboarding requires a default chat agent product configuration.');
const defaultChat = product.defaultChatAgent;

/**
 * Variation A — Classic Wizard Modal
 *
 * A centered modal overlay with progress dots, clean step transitions,
 * and polished navigation. Sits on top of the agent sessions welcome
 * tab. When dismissed, the welcome tab is revealed underneath.
 *
 * Steps:
 * 1. Sign In — sessions-style sign-in hero with provider options
 * 2. Personalize — Theme selection grid + keymap pills
 * 3. Agent Sessions — Feature cards showcasing AI capabilities
 */
export class OnboardingVariationA extends Disposable implements IOnboardingService {

	declare readonly _serviceBrand: undefined;

	private readonly _onDidComplete = this._register(new Emitter<void>());
	readonly onDidComplete: Event<void> = this._onDidComplete.event;

	private readonly _onDidDismiss = this._register(new Emitter<void>());
	readonly onDidDismiss: Event<void> = this._onDidDismiss.event;

	private overlay: HTMLElement | undefined;
	private card: HTMLElement | undefined;
	private bodyEl: HTMLElement | undefined;
	private progressContainer: HTMLElement | undefined;
	private stepLabelEl: HTMLElement | undefined;
	private titleEl: HTMLElement | undefined;
	private subtitleEl: HTMLElement | undefined;
	private contentEl: HTMLElement | undefined;
	private backButton: HTMLButtonElement | undefined;
	private nextButton: HTMLButtonElement | undefined;
	private closeButton: HTMLButtonElement | undefined;
	private footerLeft: HTMLElement | undefined;
	private prototypeFooterSlot: HTMLElement | undefined;
	private _footerSignInBtn: HTMLButtonElement | undefined;

	private currentStepIndex = 0;
	private readonly steps = ONBOARDING_STEPS;
	private readonly disposables = this._register(new DisposableStore());
	private readonly stepDisposables = this._register(new DisposableStore());
	private previouslyFocusedElement: HTMLElement | undefined;
	private _isShowing = false;
	private authenticationPrototype = false;

	private readonly footerFocusableElements: HTMLElement[] = [];
	private readonly stepFocusableElements: HTMLElement[] = [];
	private selectedThemeId = 'dark-2026';
	private selectedKeymapId = 'vscode';
	private _detectedEditorIds: Set<string> | undefined;
	private _userSignedIn = false;
	private prototypeAuthenticationSelected = false;
	private prototypeProviderScanStarted = false;
	private prototypeProviderScanComplete = false;
	private activePrototypeProvider: AuthenticationPrototypeProvider | undefined;
	private renderingPrototypeProvider: AuthenticationPrototypeProvider | undefined;
	private prototypeThemes: readonly IOnboardingThemeOption[] | undefined;
	private prototypeHoldScanning = false;
	private prototypeLayout: AuthenticationPrototypeLayout = 'grid';
	private readonly prototypeCustomEndpoints: IAuthenticationPrototypeEndpoint[] = [];
	private prototypeEndpointDraft: IAuthenticationPrototypeEndpoint = { url: '', key: '', format: 'chat-completions' };
	private prototypeView: 'providers' | 'endpoints' = 'providers';
	private readonly prototypeDetectedProviders = new Set<AuthenticationPrototypeProvider>();
	private readonly prototypeProviderElements = new Map<AuthenticationPrototypeProvider, { container: HTMLElement; checkbox: HTMLInputElement; firstAction?: HTMLElement; accountChip?: HTMLElement }>();
	private readonly prototypeProviderStates: Record<AuthenticationPrototypeProvider, IAuthenticationPrototypeProviderState> = {
		copilot: { selected: true, status: 'idle' },
		chatgpt: { selected: false, status: 'idle' },
		ownKey: { selected: false, status: 'idle' },
	};
	private selectedAiMode: AiCollaborationMode = AiCollaborationMode.Balanced;
	private enterpriseSignInUiState: EnterpriseSignInUiState = 'options';
	private enterpriseInstanceValue = '';
	private enterpriseSignInWatch: StopWatch | undefined;

	constructor(
		@ILayoutService private readonly layoutService: ILayoutService,
		@IWorkbenchThemeService private readonly themeService: IWorkbenchThemeService,
		@IDefaultAccountService private readonly defaultAccountService: IDefaultAccountService,
		@IExtensionGalleryService private readonly extensionGalleryService: IExtensionGalleryService,
		@IExtensionManagementService private readonly extensionManagementService: IExtensionManagementService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@INotificationService private readonly notificationService: INotificationService,
		@IFileService private readonly fileService: IFileService,
		@IPathService private readonly pathService: IPathService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@ICommandService private readonly commandService: ICommandService,
		@IAccessibilityService private readonly accessibilityService: IAccessibilityService,
	) {
		super();

		// Detect currently active theme
		const currentTheme = this.themeService.getColorTheme();
		const allThemes = product.onboardingThemes ?? [];
		const matchingTheme = allThemes.find(t => t.themeId === currentTheme.settingsId);
		if (matchingTheme) {
			this.selectedThemeId = matchingTheme.id;
		}

		// Start detecting installed editors early so results are ready by the Personalize step
		this._detectInstalledEditors().then(ids => { this._detectedEditorIds = ids; });
	}

	get isShowing(): boolean {
		return this._isShowing;
	}

	enableAuthenticationPrototype(options?: IAuthenticationPrototypeOptions): void {
		this.authenticationPrototype = true;
		this.prototypeDetectedProviders.add('copilot');
		this.prototypeDetectedProviders.add('chatgpt');
		this.prototypeThemes = options?.themes;
		this.prototypeHoldScanning = options?.holdScanning ?? false;
		this.prototypeLayout = options?.layout ?? 'grid';
		for (const provider of this._getPrototypeProviders()) {
			this.prototypeProviderStates[provider].account = options?.accounts?.[provider];
		}
	}

	show(): void {
		if (this.overlay) {
			return;
		}

		this._isShowing = true;
		this.previouslyFocusedElement = getActiveWindow().document.activeElement as HTMLElement | undefined;

		const container = this.layoutService.activeContainer;

		// Overlay
		this.overlay = append(container, $('.onboarding-a-overlay'));
		this.overlay.setAttribute('role', 'dialog');
		this.overlay.setAttribute('aria-modal', 'true');
		this.overlay.setAttribute('aria-label', localize('onboarding.a.aria', "Welcome to Visual Studio Code"));

		// Card
		this.card = append(this.overlay, $('.onboarding-a-card'));
		this.card.classList.toggle('authentication-prototype', this.authenticationPrototype);

		// Close button (upper-right corner of card)
		this.closeButton = append(this.card, $<HTMLButtonElement>('button.onboarding-a-close-btn'));
		this.closeButton.type = 'button';
		this.closeButton.setAttribute('aria-label', localize('onboarding.close', "Close"));
		this.closeButton.appendChild(renderIcon(Codicon.close));

		// Header with progress
		const header = append(this.card, $('.onboarding-a-header'));
		this.progressContainer = append(header, $('.onboarding-a-progress'));
		this.stepLabelEl = append(this.progressContainer, $('span.onboarding-a-step-label'));
		this._renderProgress();

		// Body
		this.bodyEl = append(this.card, $('.onboarding-a-body'));
		this.titleEl = append(this.bodyEl, $('h2.onboarding-a-step-title'));
		this.subtitleEl = append(this.bodyEl, $('p.onboarding-a-step-subtitle'));
		this.contentEl = append(this.bodyEl, $('.onboarding-a-step-content'));
		this._renderStep();
		this._logStepView();

		// Footer
		const footer = append(this.card, $('.onboarding-a-footer'));

		this.footerLeft = append(footer, $('.onboarding-a-footer-left'));

		// The provider step renders its own actions here so the primary button
		// lands in the same place on every step.
		this.prototypeFooterSlot = append(footer, $('.onboarding-a-auth-footer-slot'));

		const footerRight = append(footer, $('.onboarding-a-footer-right'));

		this.backButton = append(footerRight, $<HTMLButtonElement>('button.onboarding-a-btn.onboarding-a-btn-secondary'));
		this.backButton.textContent = localize('onboarding.back', "Back");
		this.backButton.type = 'button';
		this.footerFocusableElements.push(this.backButton);

		this.nextButton = append(footerRight, $<HTMLButtonElement>('button.onboarding-a-btn.onboarding-a-btn-primary'));
		this.nextButton.type = 'button';
		this.footerFocusableElements.push(this.nextButton);
		this._updateButtonStates();

		// Event handlers
		this.disposables.add(addDisposableListener(this.closeButton, EventType.CLICK, () => {
			this._logAction('skip');
			this._dismiss('skip');
		}));
		this.disposables.add(addDisposableListener(this.backButton, EventType.CLICK, () => {
			if (this.currentStepIndex === 0 && this.enterpriseSignInUiState === 'instance') {
				this._logAction('cancelEnterpriseInstancePrompt');
				this.enterpriseSignInWatch = undefined;
				this._setEnterpriseSignInUiState('options');
				return;
			}

			this._logAction('back');
			this._prevStep();
		}));
		this.disposables.add(addDisposableListener(this.nextButton, EventType.CLICK, () => {
			if (this._isLastStep()) {
				this._logAction('complete');
				this._dismiss('complete');
			} else if (this.currentStepIndex === 0) {
				this._logAction('continueWithoutSignIn');
				this._nextStep();
			} else {
				this._logAction('next');
				this._nextStep();
			}
		}));

		this.disposables.add(addDisposableListener(this.overlay, EventType.MOUSE_DOWN, (e: MouseEvent) => {
			if (e.target === this.overlay) {
				this._dismiss('skip');
			}
		}));

		this.disposables.add(addDisposableListener(this.overlay, EventType.KEY_DOWN, (e: KeyboardEvent) => {
			const event = new StandardKeyboardEvent(e);

			// Prevent all keyboard shortcuts from reaching the keybinding service
			e.stopPropagation();

			if (event.keyCode === KeyCode.Escape) {
				e.preventDefault();
				this._dismiss('skip');
				return;
			}

			if (event.keyCode === KeyCode.Tab) {
				this._trapTab(e, event.shiftKey);
			}
		}));

		// Entrance animation
		this.overlay.classList.add('entering');
		getActiveWindow().requestAnimationFrame(() => {
			this.overlay?.classList.remove('entering');
			this.overlay?.classList.add('visible');
		});

		this._focusCurrentStepElement();
	}

	private _dismiss(reason: 'complete' | 'skip'): void {
		if (!this.overlay) {
			return;
		}

		this._logAction('dismiss', undefined, reason);

		this.overlay.classList.remove('visible');
		this.overlay.classList.add('exiting');

		let handled = false;
		const onTransitionEnd = () => {
			if (handled) {
				return;
			}
			handled = true;
			this._removeFromDOM();
			if (reason === 'complete') {
				this._onDidComplete.fire();
			}
			this._onDidDismiss.fire();
		};

		this.overlay.addEventListener('transitionend', onTransitionEnd, { once: true });
		setTimeout(onTransitionEnd, 400);
	}

	private _nextStep(): void {
		if (this.currentStepIndex < this.steps.length - 1) {
			const leavingStep = this.steps[this.currentStepIndex];
			if (leavingStep === OnboardingStepId.SignIn) {
				this.enterpriseSignInUiState = 'options';
				this.enterpriseInstanceValue = '';
				this.enterpriseSignInWatch = undefined;
			}
			if (leavingStep === OnboardingStepId.Personalize) {
				this._applyKeymap(this.selectedKeymapId);
			}
			this.currentStepIndex++;
			this._renderStep();
			this._renderProgress();
			this._updateButtonStates();
			this._focusCurrentStepElement();
			this._logStepView();
		}
	}

	private _prevStep(): void {
		if (this.currentStepIndex > 0) {
			this.currentStepIndex--;
			this._renderStep();
			this._renderProgress();
			this._updateButtonStates();
			this._focusCurrentStepElement();
			this._logStepView();
		}
	}

	private _isLastStep(): boolean {
		return this.currentStepIndex === this.steps.length - 1;
	}

	private _renderProgress(): void {
		if (!this.progressContainer || !this.stepLabelEl) {
			return;
		}

		clearNode(this.progressContainer);

		for (let i = 0; i < this.steps.length; i++) {
			const dot = append(this.progressContainer, $('span.onboarding-a-progress-dot'));
			if (i === this.currentStepIndex) {
				dot.classList.add('active');
			} else if (i < this.currentStepIndex) {
				dot.classList.add('completed');
			}
		}

		this.progressContainer.appendChild(this.stepLabelEl);
		this.stepLabelEl.textContent = localize(
			'onboarding.stepOf',
			"{0} of {1}",
			this.currentStepIndex + 1,
			this.steps.length
		);
	}

	/**
	 * Prototype-only step titles that continue the narrative started on the
	 * provider step. Returns `undefined` to fall back to the shipped copy.
	 */
	private _getPrototypeStepTitle(stepId: OnboardingStepId): string | undefined {
		if (!this.authenticationPrototype) {
			return undefined;
		}
		switch (stepId) {
			case OnboardingStepId.Personalize:
				return localize('onboarding.authPrototype.step.personalize', "Make It Yours");
			case OnboardingStepId.AgentSessions:
				return localize('onboarding.authPrototype.step.agentSessions', "Built Around Your Agents");
			default:
				return undefined;
		}
	}

	private _getPrototypeStepSubtitle(stepId: OnboardingStepId): string | undefined {
		if (!this.authenticationPrototype) {
			return undefined;
		}
		switch (stepId) {
			case OnboardingStepId.Personalize:
				return localize('onboarding.authPrototype.step.personalize.subtitle', "Pick a look that's easy on your eyes. You can change it anytime.");
			case OnboardingStepId.AgentSessions: {
				const connected = this._getPrototypeProviders().filter(provider => this.prototypeProviderStates[provider].selected && this.prototypeProviderStates[provider].status === 'signed-in');
				if (connected.length === 0) {
					return localize('onboarding.authPrototype.step.agentSessions.subtitle.none', "Connect a provider anytime to start running agents.");
				}
				if (connected.length === 1) {
					return localize('onboarding.authPrototype.step.agentSessions.subtitle.one', "{0} is ready. Here's where you'll work with it.", this._getPrototypeProviderDescriptor(connected[0]).label);
				}
				return localize('onboarding.authPrototype.step.agentSessions.subtitle', "{0} providers are ready. Here's where you'll work with them.", connected.length);
			}
			default:
				return undefined;
		}
	}

	private _renderStep(): void {
		if (!this.titleEl || !this.subtitleEl || !this.contentEl) {
			return;
		}

		this.stepDisposables.clear();
		this.stepFocusableElements.length = 0;

		const stepId = this.steps[this.currentStepIndex];
		const useSignInHero = stepId === OnboardingStepId.SignIn;
		const isPrototypeProviderStep = this.authenticationPrototype && stepId === OnboardingStepId.SignIn;
		this.card?.classList.toggle('auth-prototype-step', isPrototypeProviderStep);
		if (this.prototypeFooterSlot && !isPrototypeProviderStep) {
			clearNode(this.prototypeFooterSlot);
		}
		this.titleEl.style.display = useSignInHero ? 'none' : '';
		this.subtitleEl.style.display = useSignInHero ? 'none' : '';
		this.titleEl.textContent = this._getPrototypeStepTitle(stepId) ?? getOnboardingStepTitle(stepId);
		const prototypeSubtitle = this._getPrototypeStepSubtitle(stepId);
		if (prototypeSubtitle) {
			clearNode(this.subtitleEl);
			this.subtitleEl.textContent = prototypeSubtitle;
		} else if (stepId === OnboardingStepId.AgentSessions) {
			this._renderAgentSessionsSubtitle(this.subtitleEl);
		} else if (stepId === OnboardingStepId.Personalize) {
			this._renderPersonalizeSubtitle(this.subtitleEl);
		} else {
			this.subtitleEl.textContent = getOnboardingStepSubtitle(stepId);
		}

		clearNode(this.contentEl);

		switch (stepId) {
			case OnboardingStepId.SignIn:
				this._renderSignInStep(this.contentEl);
				break;
			case OnboardingStepId.Personalize:
				this._renderPersonalizeStep(this.contentEl);
				break;
			case OnboardingStepId.AiPreference:
				this._renderAiPreferenceStep(this.contentEl);
				break;
			case OnboardingStepId.AgentSessions:
				this._renderAgentSessionsStep(this.contentEl);
				break;
		}

		this.bodyEl?.setAttribute('aria-label', localize(
			'onboarding.step.aria',
			"Step {0} of {1}: {2}",
			this.currentStepIndex + 1,
			this.steps.length,
			getOnboardingStepTitle(stepId)
		));
	}

	private _updateButtonStates(): void {
		if (this.backButton) {
			if (this.authenticationPrototype && this.currentStepIndex === 0) {
				this.backButton.style.display = 'none';
			} else {
				const showEnterpriseBack = this.currentStepIndex === 0 && this.enterpriseSignInUiState === 'instance';
				this.backButton.style.display = (this.currentStepIndex === 0 && !showEnterpriseBack) ? 'none' : '';
			}
		}
		if (this.nextButton) {
			if (this.currentStepIndex === 0) {
				if (this.authenticationPrototype) {
					this.nextButton.style.display = 'none';
				} else if (this._userSignedIn) {
					this.nextButton.style.display = '';
					this.nextButton.className = 'onboarding-a-btn onboarding-a-btn-primary';
					this.nextButton.textContent = localize('onboarding.continue', "Continue");
				} else {
					this.nextButton.style.display = '';
					// Sign-in step: secondary "Continue without Signing In"
					this.nextButton.className = 'onboarding-a-btn onboarding-a-btn-secondary';
					this.nextButton.textContent = localize('onboarding.continueWithoutSignIn', "Continue without Signing In");
				}
			} else if (this._isLastStep()) {
				this.nextButton.style.display = '';
				this.nextButton.className = 'onboarding-a-btn onboarding-a-btn-primary';
				this.nextButton.textContent = localize('onboarding.getStarted', "Get Started");
			} else {
				this.nextButton.style.display = '';
				this.nextButton.className = 'onboarding-a-btn onboarding-a-btn-primary';
				this.nextButton.textContent = localize('onboarding.next', "Continue");
			}
		}
		if (this.footerLeft) {
			if (this._isLastStep()) {
				// Show sign-in nudge in footer
				if (!this._footerSignInBtn && !this._userSignedIn && !this.prototypeAuthenticationSelected) {
					this._footerSignInBtn = append(this.footerLeft, $<HTMLButtonElement>('button.onboarding-a-signin-nudge-btn'));
					this._footerSignInBtn.type = 'button';
					this._footerSignInBtn.textContent = localize('onboarding.sessions.signInNudge', "Sign in to use GitHub Copilot");
					this.stepDisposables.add(addDisposableListener(this._footerSignInBtn, EventType.CLICK, async () => {
						this._logAction('signInNudge');
						await this._handleSignIn();
						if (this._userSignedIn && this._footerSignInBtn) {
							this._footerSignInBtn.style.display = 'none';
						}
					}));
				}
			} else {
				if (this._footerSignInBtn) {
					this._footerSignInBtn.remove();
					this._footerSignInBtn = undefined;
				}
			}
		}
	}

	// =====================================================================
	// Step: Sign In
	// =====================================================================

	private _renderSignInStep(container: HTMLElement): void {
		if (this.authenticationPrototype) {
			this._renderAuthenticationPrototype(container);
			return;
		}

		const wrapper = append(container, $('.onboarding-a-signin'));
		const brand = append(wrapper, $('.onboarding-a-signin-brand'));
		const brandIcon = append(brand, $('span.onboarding-a-signin-brand-icon'));
		brandIcon.setAttribute('role', 'img');
		brandIcon.setAttribute('aria-label', product.nameLong);

		const content = append(wrapper, $('.onboarding-a-signin-content'));
		const contentMain = append(content, $('.onboarding-a-signin-content-main'));
		const title = append(contentMain, $('h2.onboarding-a-signin-title'));
		title.textContent = localize('onboarding.signIn.heroTitle', "Welcome to VS Code");

		const subtitle = append(contentMain, $('p.onboarding-a-signin-subtitle'));
		subtitle.textContent = localize('onboarding.signIn.heroSubtitle', "Sign in to use GitHub Copilot.");

		const actions = append(contentMain, $('.onboarding-a-signin-actions'));

		if (this._userSignedIn) {
			const signedIn = append(actions, $('.onboarding-a-signin-confirmation'));
			const icon = append(signedIn, $('span'));
			icon.classList.add(...ThemeIcon.asClassNameArray(Codicon.check));
			icon.setAttribute('aria-hidden', 'true');
			const text = append(signedIn, $('span'));
			text.textContent = localize('onboarding.signIn.signedIn', "You're signed in. You can continue to the next step.");
		} else {
			switch (this.enterpriseSignInUiState) {
				case 'instance':
					this._renderEnterpriseInstanceForm(actions);
					break;
				case 'progress':
					this._renderEnterpriseSignInProgress(actions);
					break;
				default:
					this._renderDefaultSignInActions(actions);
					break;
			}
		}

		const footer = append(wrapper, $('.onboarding-a-signin-footer'));

		const disclaimerCol = append(footer, $('.onboarding-a-signin-disclaimer-col'));

		// GitHub Copilot disclaimer
		const copilotDisclaimer = append(disclaimerCol, $('.onboarding-a-signin-disclaimer'));
		copilotDisclaimer.append(localize('onboarding.signIn.disclaimer.prefix', "By signing in, you agree to {0}'s ", defaultChat.provider.default.name));
		this._createInlineLink(copilotDisclaimer, localize('onboarding.signIn.disclaimer.terms', "Terms"), defaultChat.termsStatementUrl);
		copilotDisclaimer.append(localize('onboarding.signIn.disclaimer.middle', " and "));
		this._createInlineLink(copilotDisclaimer, localize('onboarding.signIn.disclaimer.privacy', "Privacy Statement"), defaultChat.privacyStatementUrl);
		copilotDisclaimer.append(localize('onboarding.signIn.disclaimer.copilotPrefix', ". {0} Copilot may show ", defaultChat.provider.default.name));
		this._createInlineLink(copilotDisclaimer, localize('onboarding.signIn.disclaimer.publicCode', "public code"), defaultChat.publicCodeMatchesUrl);
		copilotDisclaimer.append(localize('onboarding.signIn.disclaimer.improveSuffix', " suggestions and use your data to improve the product."));
		copilotDisclaimer.append(' ');
		copilotDisclaimer.append(localize('onboarding.signIn.disclaimer.settingsPrefix', "You can change these "));
		this._createInlineLink(copilotDisclaimer, localize('onboarding.signIn.disclaimer.settings', "settings"), this.defaultAccountService.resolveGitHubUrl(GitHubPaths.copilotSettings));
		copilotDisclaimer.append(localize('onboarding.signIn.disclaimer.suffix', " anytime."));
	}

	private _renderAuthenticationPrototype(container: HTMLElement): void {
		this._startPrototypeProviderScan();

		if (this.prototypeView === 'endpoints') {
			this._renderPrototypeEndpointsView(container);
			return;
		}

		const wrapper = append(container, $('.onboarding-a-auth-prototype'));
		const brand = append(wrapper, $('.onboarding-a-auth-vscode-icon'));
		brand.setAttribute('aria-hidden', 'true');

		const title = append(wrapper, $('h2.onboarding-a-auth-title'));
		title.textContent = localize('onboarding.authPrototype.title', "Where should your models come from?");
		const subtitleRow = append(wrapper, $('.onboarding-a-auth-subtitle-row'));
		const subtitle = append(subtitleRow, $('p.onboarding-a-auth-subtitle'));
		subtitle.textContent = localize('onboarding.authPrototype.subtitle', "Turn on everything you want to use. You can pick more than one.");
		this._renderPrototypeCompatibilityHelp(subtitleRow);

		if (!this.prototypeProviderScanComplete) {
			this._renderPrototypeScanStatus(wrapper);
		}

		const checklist = append(wrapper, $('.onboarding-a-auth-checklist'));
		checklist.classList.add(this.prototypeLayout);
		checklist.setAttribute('role', 'group');
		checklist.setAttribute('aria-label', localize('onboarding.authPrototype.providers.aria', "AI providers"));

		this.prototypeProviderElements.clear();
		if (this.prototypeLayout === 'stacked') {
			for (const provider of this._getPrototypeProviders()) {
				this._renderPrototypeProvider(checklist, provider);
			}
		} else {
			// Copilot is the primary path, so it owns a full-height column; the
			// remaining options share the other column and the same total space.
			this._renderPrototypeProvider(checklist, 'copilot');
			const secondary = append(checklist, $('.onboarding-a-auth-secondary'));
			for (const provider of this._getPrototypeProviders().filter(provider => provider !== 'copilot')) {
				this._renderPrototypeProvider(secondary, provider);
			}
		}

		this._renderPrototypeChecklistFooter(wrapper);
		this._renderPrototypeLayoutSwitch(wrapper);

		// Keep an expanded setup form fully visible when the list has to scroll.
		const expanded = this._getPrototypeProviders().find(provider => this._isPrototypeProviderExpanded(provider));
		if (expanded) {
			this.prototypeProviderElements.get(expanded)?.container.scrollIntoView({ block: 'nearest' });
		}
	}

	/**
	 * Prototype-only control for comparing the two provider layouts side by
	 * side. It is not part of the proposed onboarding UI.
	 */
	private _renderPrototypeLayoutSwitch(parent: HTMLElement): void {
		const stacked = this.prototypeLayout === 'stacked';
		const row = append(parent, $('.onboarding-a-auth-layout-switch'));
		const button = this._registerStepFocusable(append(row, $<HTMLButtonElement>('button.onboarding-a-auth-layout-button')), { secondary: true });
		button.type = 'button';
		button.appendChild(renderIcon(stacked ? Codicon.layout : Codicon.listUnordered));
		const label = append(button, $('span'));
		label.textContent = stacked
			? localize('onboarding.authPrototype.layout.toGrid', "Try grid layout")
			: localize('onboarding.authPrototype.layout.toStacked', "Try stacked layout");
		button.setAttribute('aria-label', label.textContent);

		this.stepDisposables.add(addDisposableListener(button, EventType.CLICK, () => {
			this.prototypeLayout = stacked ? 'grid' : 'stacked';
			this._logAction('switchPrototypeLayout', undefined, this.prototypeLayout);
			status(stacked
				? localize('onboarding.authPrototype.layout.grid.aria', "Grid layout.")
				: localize('onboarding.authPrototype.layout.stacked.aria', "Stacked layout."));
			this._renderStep();
			this._updateButtonStates();
		}));
	}

	private _isPrototypeProviderExpanded(provider: AuthenticationPrototypeProvider): boolean {
		const state = this.prototypeProviderStates[provider];
		return state.selected && state.status !== 'scanning' && state.status !== 'signed-in';
	}

	/**
	 * A quiet "?" affordance that reveals which harness each provider can drive.
	 * The matrix is the honest way to show this: Copilot models run in every
	 * harness, ChatGPT and Claude only drive their own, and a personal API key
	 * is limited to the Copilot harness.
	 */
	private _renderPrototypeCompatibilityHelp(parent: HTMLElement): void {
		const wrapper = append(parent, $('.onboarding-a-auth-help'));
		const trigger = this._registerStepFocusable(append(wrapper, $<HTMLButtonElement>('button.onboarding-a-auth-help-trigger')), { secondary: true });
		trigger.type = 'button';
		trigger.appendChild(renderIcon(Codicon.question));
		trigger.setAttribute('aria-label', localize('onboarding.authPrototype.help.aria', "Which harnesses can each provider run in?"));

		// The popover is a sibling of the help trigger so it can be centred on
		// the whole subtitle row; anchoring it to the small icon pushed the
		// matrix outside the panel.
		const popover = append(parent, $('.onboarding-a-auth-help-popover'));
		popover.id = 'onboarding-a-auth-help-popover';
		trigger.setAttribute('aria-describedby', popover.id);

		const heading = append(popover, $('p.onboarding-a-auth-help-title'));
		heading.textContent = localize('onboarding.authPrototype.help.title', "Which harnesses each provider can run in");

		const intro = append(popover, $('p.onboarding-a-auth-help-intro'));
		intro.textContent = localize('onboarding.authPrototype.help.intro', "A harness is what does the work: it plans, edits files, and runs commands. Each one supports its own set of models.");

		const harnesses: readonly AuthenticationPrototypeHarness[] = ['copilot', 'codex', 'claude'];
		const table = append(popover, $('table.onboarding-a-auth-matrix'));
		const headRow = append(append(table, $('thead')), $('tr'));
		append(headRow, $('th')).textContent = localize('onboarding.authPrototype.help.provider', "Provider");
		for (const harness of harnesses) {
			const cell = append(headRow, $('th'));
			cell.textContent = this._getPrototypeHarnessLabel(harness);
			cell.setAttribute('scope', 'col');
		}

		const body = append(table, $('tbody'));
		for (const provider of this._getPrototypeProviders()) {
			const support = this._getPrototypeProviderSupport(provider);
			const descriptor = this._getPrototypeProviderDescriptor(provider);
			const row = append(body, $('tr'));
			const label = append(row, $('th'));
			label.setAttribute('scope', 'row');
			const labelInner = append(label, $('.onboarding-a-auth-matrix-provider'));
			const mark = append(labelInner, $('.onboarding-a-auth-matrix-mark'));
			mark.setAttribute('aria-hidden', 'true');
			mark.appendChild(renderIcon(descriptor.icon));
			append(labelInner, $('span')).textContent = descriptor.label;
			for (const harness of harnesses) {
				const cell = append(row, $('td'));
				const supported = support[harness];
				cell.classList.toggle('supported', supported);
				cell.appendChild(renderIcon(supported ? Codicon.check : Codicon.dash));
				cell.setAttribute('aria-label', supported
					? localize('onboarding.authPrototype.help.supported', "Supported")
					: localize('onboarding.authPrototype.help.unsupported', "Not supported"));
			}
		}
	}

	private _startPrototypeProviderScan(): void {
		if (this.prototypeProviderScanStarted) {
			return;
		}

		this.prototypeProviderScanStarted = true;
		for (const provider of this._getPrototypeProviders()) {
			if (provider !== 'ownKey') {
				this.prototypeProviderStates[provider].status = 'scanning';
			}
		}

		if (this.prototypeHoldScanning) {
			return;
		}

		const targetWindow = getActiveWindow();
		const handle = targetWindow.setTimeout(() => {
			for (const provider of this._getPrototypeProviders()) {
				const state = this.prototypeProviderStates[provider];
				if (state.status !== 'scanning') {
					continue;
				}
				if (this.prototypeDetectedProviders.has(provider)) {
					state.selected = true;
					state.status = 'signed-in';
				} else {
					state.status = 'idle';
				}
			}
			this.prototypeProviderScanComplete = true;
			const detectedCount = this.prototypeDetectedProviders.size;
			status(localize('onboarding.authPrototype.scan.complete.aria', "Provider scan complete. Found {0} existing accounts or local setups.", detectedCount));
			this._rerenderAuthenticationPrototype(this._getFocusedPrototypeProvider());
		}, 800);
		this.disposables.add(toDisposable(() => targetWindow.clearTimeout(handle)));
	}

	private _renderPrototypeScanStatus(parent: HTMLElement): void {
		const scan = append(parent, $('.onboarding-a-auth-scan'));
		scan.setAttribute('aria-live', 'polite');
		scan.appendChild(renderIcon(Codicon.search));
		const label = append(scan, $('span'));
		label.textContent = localize('onboarding.authPrototype.scan.progress', "Looking for existing provider accounts on this device…");
	}

	private _getPrototypeProviders(): readonly AuthenticationPrototypeProvider[] {
		return ['copilot', 'chatgpt', 'ownKey'];
	}

	private _getPrototypeProviderDescriptor(provider: AuthenticationPrototypeProvider): { label: string; description: string; icon: ThemeIcon } {
		switch (provider) {
			case 'copilot':
				return {
					label: localize('onboarding.authPrototype.provider.copilot', "GitHub Copilot"),
					description: localize('onboarding.authPrototype.provider.copilot.description', "Inline suggestions and every harness"),
					icon: Codicon.copilotLarge,
				};
			case 'chatgpt':
				return {
					label: localize('onboarding.authPrototype.provider.chatGpt', "ChatGPT"),
					description: localize('onboarding.authPrototype.provider.chatGpt.description', "OpenAI models in the Codex harness"),
					icon: Codicon.openai,
				};
			case 'ownKey':
				return {
					label: localize('onboarding.authPrototype.provider.ownKey', "Your Own Key"),
					description: localize('onboarding.authPrototype.provider.ownKey.description', "Bring a key from any provider"),
					icon: Codicon.key,
				};
		}
	}

	/**
	 * Which harness each provider's models can run in. Copilot works everywhere;
	 * ChatGPT and Claude only drive their own harness; a personal API key is
	 * limited to the Copilot harness.
	 */
	private _getPrototypeProviderSupport(provider: AuthenticationPrototypeProvider): Record<AuthenticationPrototypeHarness, boolean> {
		switch (provider) {
			case 'copilot':
				return { copilot: true, codex: true, claude: true };
			case 'chatgpt':
				return { copilot: false, codex: true, claude: false };
			case 'ownKey':
				return { copilot: true, codex: false, claude: true };
		}
	}

	private _getPrototypeHarnessLabel(harness: AuthenticationPrototypeHarness): string {
		switch (harness) {
			case 'copilot':
				return localize('onboarding.authPrototype.harness.copilot', "Copilot");
			case 'codex':
				return localize('onboarding.authPrototype.harness.codex', "Codex");
			case 'claude':
				return localize('onboarding.authPrototype.harness.claude', "Claude Code");
		}
	}

	private _renderPrototypeProvider(parent: HTMLElement, provider: AuthenticationPrototypeProvider): void {
		const state = this.prototypeProviderStates[provider];
		const descriptor = this._getPrototypeProviderDescriptor(provider);
		const item = append(parent, $('.onboarding-a-auth-provider'));
		item.dataset.provider = provider;
		item.classList.toggle('selected', state.selected);
		item.classList.toggle('ready', state.status === 'signed-in');

		const header = append(item, $('.onboarding-a-auth-provider-header'));
		const selector = append(header, $('label.onboarding-a-auth-provider-selector'));
		const checkbox = this._registerStepFocusable(append(selector, $<HTMLInputElement>('input.onboarding-a-auth-provider-checkbox')));
		checkbox.type = 'checkbox';
		checkbox.checked = state.selected;
		// A switch role matches the toggle affordance and reads as on/off.
		checkbox.setAttribute('role', 'switch');
		checkbox.setAttribute('aria-label', localize('onboarding.authPrototype.provider.select.aria', "Use {0}", descriptor.label));

		const toggle = append(selector, $('.onboarding-a-auth-provider-toggle'));
		toggle.setAttribute('aria-hidden', 'true');
		append(toggle, $('.onboarding-a-auth-provider-toggle-knob'));

		const mark = append(selector, $('.onboarding-a-auth-provider-mark'));
		mark.setAttribute('aria-hidden', 'true');
		mark.appendChild(renderIcon(descriptor.icon));

		const copy = append(selector, $('.onboarding-a-auth-provider-copy'));
		const heading = append(copy, $('h3.onboarding-a-auth-provider-title'));
		heading.textContent = descriptor.label;
		const description = append(copy, $('p.onboarding-a-auth-provider-description'));
		description.id = `onboarding-a-auth-provider-description-${provider}`;
		description.textContent = descriptor.description;
		checkbox.setAttribute('aria-describedby', description.id);
		this.prototypeProviderElements.set(provider, { container: item, checkbox });

		const badge = this._renderPrototypeProviderBadge(header, provider, state);
		if (badge) {
			badge.id = `onboarding-a-auth-provider-status-${provider}`;
			checkbox.setAttribute('aria-describedby', `${description.id} ${badge.id}`);
		}

		if (provider === 'ownKey') {
			this._renderPrototypeOwnKeyBrands(item);
		}

		this.stepDisposables.add(addDisposableListener(checkbox, EventType.CHANGE, () => {
			state.selected = checkbox.checked;
			if (!state.selected && this.activePrototypeProvider === provider) {
				this.activePrototypeProvider = undefined;
			} else if (state.selected && state.status === 'idle') {
				this.activePrototypeProvider = provider;
			}
			this._logAction(state.selected ? 'selectAuthenticationProvider' : 'deselectAuthenticationProvider', undefined, provider);
			status(state.selected
				? localize('onboarding.authPrototype.provider.selected', "{0} selected.", descriptor.label)
				: localize('onboarding.authPrototype.provider.deselected', "{0} deselected.", descriptor.label));
			this._rerenderAuthenticationPrototype(provider, state.selected && state.status !== 'scanning');
		}));

		if (this._isPrototypeProviderExpanded(provider)) {
			this.renderingPrototypeProvider = provider;
			try {
				this._renderPrototypeProviderSetup(item, provider, state);
			} finally {
				this.renderingPrototypeProvider = undefined;
			}
		}
	}

	private _renderPrototypeAccountChip(parent: HTMLElement, provider: AuthenticationPrototypeProvider, account: IAuthenticationPrototypeAccount): HTMLElement {
		const descriptor = this._getPrototypeProviderDescriptor(provider);
		const chip = append(parent, $('.onboarding-a-auth-account-chip'));

		const avatar = append(chip, $('.onboarding-a-auth-account-avatar'));
		avatar.setAttribute('aria-hidden', 'true');
		if (account.avatarUrl) {
			const image = append(avatar, $<HTMLImageElement>('img'));
			image.src = account.avatarUrl;
			image.alt = '';
		} else if (provider === 'ownKey') {
			// A custom endpoint is a host, not a person, so avoid a fake monogram.
			avatar.classList.add('glyph');
			avatar.appendChild(renderIcon(descriptor.icon));
		} else {
			avatar.classList.add('monogram');
			avatar.textContent = account.label.charAt(0).toUpperCase();
		}

		const name = append(chip, $('span.onboarding-a-auth-account-name'));
		name.textContent = account.label;

		const switchButton = this._registerStepFocusable(append(chip, $<HTMLButtonElement>('button.onboarding-a-auth-account-switch')), { secondary: true });
		switchButton.type = 'button';
		switchButton.appendChild(renderIcon(provider === 'ownKey' ? Codicon.edit : Codicon.arrowSwap));
		switchButton.setAttribute('aria-label', provider === 'ownKey'
			? localize('onboarding.authPrototype.custom.edit.aria', "Edit custom endpoint. Currently using {0}.", account.label)
			: localize('onboarding.authPrototype.account.switch.aria', "Switch {0} account. Currently signed in as {1}.", descriptor.label, account.label));
		this.prototypeProviderElements.get(provider)!.accountChip = switchButton;

		this.stepDisposables.add(addDisposableListener(switchButton, EventType.CLICK, event => {
			event.preventDefault();
			event.stopPropagation();
			this._logAction('switchAuthenticationAccount', undefined, provider);
			if (provider === 'ownKey') {
				this.prototypeView = 'endpoints';
				this._renderStep();
				this._updateButtonStates();
				return;
			}
			this._useAnotherPrototypeProviderAccount(provider);
		}));

		return chip;
	}

	/**
	 * Shows which services a personal key can reach. Anthropic and Azure use
	 * their shipped marks; Foundry and OpenRouter fall back to neutral glyphs
	 * because VS Code does not ship those brand icons yet.
	 */
	private _renderPrototypeOwnKeyBrands(parent: HTMLElement): void {
		const brands: readonly { label: string; icon: ThemeIcon }[] = [
			{ label: localize('onboarding.authPrototype.brand.claude', "Anthropic Claude"), icon: Codicon.claude },
			{ label: localize('onboarding.authPrototype.brand.foundry', "Microsoft Foundry"), icon: Codicon.beaker },
			{ label: localize('onboarding.authPrototype.brand.openRouter', "OpenRouter"), icon: Codicon.compass },
			{ label: localize('onboarding.authPrototype.brand.azure', "Azure"), icon: Codicon.azure },
		];

		const row = append(parent, $('.onboarding-a-auth-brands'));
		row.setAttribute('aria-label', localize('onboarding.authPrototype.brands.aria', "Works with {0}", brands.map(brand => brand.label).join(', ')));
		for (const brand of brands) {
			const chip = append(row, $('.onboarding-a-auth-brand'));
			chip.title = brand.label;
			chip.setAttribute('aria-hidden', 'true');
			chip.appendChild(renderIcon(brand.icon));
		}
		const more = append(row, $('span.onboarding-a-auth-brand-more'));
		more.setAttribute('aria-hidden', 'true');
		more.textContent = localize('onboarding.authPrototype.brands.more', "and more");
	}

	private _renderPrototypeProviderBadge(parent: HTMLElement, provider: AuthenticationPrototypeProvider, state: IAuthenticationPrototypeProviderState): HTMLElement | undefined {
		if (state.status === 'signed-in' && state.account) {
			return this._renderPrototypeAccountChip(parent, provider, state.account);
		}
		if (provider === 'ownKey' && state.status === 'idle') {
			return undefined;
		}
		let label: string | undefined;
		switch (state.status) {
			case 'scanning':
				label = localize('onboarding.authPrototype.provider.scanning', "Scanning");
				break;
			case 'detected':
				label = localize('onboarding.authPrototype.provider.detected', "Ready");
				break;
			case 'connecting':
				label = localize('onboarding.authPrototype.provider.connecting', "Signing in");
				break;
			case 'signed-in':
				label = localize('onboarding.authPrototype.provider.signedIn', "Ready");
				break;
			case 'idle':
				label = localize('onboarding.authPrototype.provider.notDetected', "Not detected");
				break;
			case 'error':
				label = localize('onboarding.authPrototype.provider.error', "Needs attention");
				break;
		}
		if (!label) {
			return undefined;
		}
		const badge = append(parent, $('.onboarding-a-auth-provider-badge'));
		badge.classList.add(state.status);
		badge.textContent = label;
		return badge;
	}

	private _renderPrototypeProviderSetup(parent: HTMLElement, provider: AuthenticationPrototypeProvider, state: IAuthenticationPrototypeProviderState): void {
		const setup = append(parent, $('.onboarding-a-auth-provider-setup'));
		switch (state.status) {
			case 'scanning': {
				break;
			}
			case 'detected': {
				break;
			}
			case 'connecting': {
				break;
			}
			case 'signed-in': {
				break;
			}
			case 'error':
				this._createPrototypeProviderButton(setup, localize('onboarding.authPrototype.provider.retry', "Try Again"), Codicon.refresh, () => this._useAnotherPrototypeProviderAccount(provider), false);
				break;
			case 'idle':
				this._renderPrototypeManualProviderSetup(setup, provider);
				break;
		}
	}

	private _renderPrototypeManualProviderSetup(parent: HTMLElement, provider: AuthenticationPrototypeProvider): void {
		if (provider === 'copilot') {
			if (this.activePrototypeProvider !== 'copilot') {
				this._createPrototypeProviderButton(parent, localize('onboarding.authPrototype.copilot.chooseMethod', "Choose Sign-In Method"), Codicon.signIn, () => {
					this.activePrototypeProvider = 'copilot';
					this._rerenderAuthenticationPrototype('copilot', true);
				}, false);
				return;
			}
			if (this.enterpriseSignInUiState === 'instance') {
				this._createPrototypeProviderButton(parent, localize('onboarding.authPrototype.enterprise.back', "Back to Sign-In Methods"), Codicon.arrowLeft, () => {
					this.enterpriseSignInUiState = 'options';
					this._rerenderAuthenticationPrototype('copilot', true);
				}, true);
				this._renderPrototypeEnterpriseInstanceForm(parent);
				return;
			}
			this._renderPrototypeCopilotSignInOptions(parent);
			return;
		}

		if (provider === 'ownKey') {
			this._createPrototypeProviderButton(parent, localize('onboarding.authPrototype.custom.setUp', "Add Keys"), Codicon.server, () => {
				this.prototypeView = 'endpoints';
				this._renderStep();
				this._updateButtonStates();
			}, false);
			return;
		}

		const descriptor = this._getPrototypeProviderDescriptor(provider);
		this._createPrototypeProviderButton(parent, localize('onboarding.authPrototype.provider.signIn', "Sign In with {0}", descriptor.label), Codicon.signIn, () => this._beginPrototypeProviderConnection(provider), false);
	}

	/** Request shapes a custom endpoint can speak. */
	private _getPrototypeEndpointFormats(): readonly { id: AuthenticationPrototypeEndpointFormat; label: string }[] {
		return [
			{ id: 'chat-completions', label: localize('onboarding.authPrototype.custom.format.chat', "Chat completions") },
			{ id: 'responses', label: localize('onboarding.authPrototype.custom.format.responses', "Responses") },
			{ id: 'messages', label: localize('onboarding.authPrototype.custom.format.messages', "Messages (Anthropic)") },
		];
	}

	/**
	 * Dedicated endpoints step. Custom endpoints are a list rather than a single
	 * account, so they get their own surface instead of expanding a provider row.
	 */
	private _renderPrototypeEndpointsView(container: HTMLElement): void {
		const wrapper = append(container, $('.onboarding-a-auth-prototype.onboarding-a-auth-endpoints'));

		const title = append(wrapper, $('h2.onboarding-a-auth-title'));
		title.textContent = localize('onboarding.authPrototype.endpoints.title', "Add Your Own Keys");
		const subtitle = append(wrapper, $('p.onboarding-a-auth-subtitle'));
		subtitle.textContent = localize('onboarding.authPrototype.endpoints.subtitle', "Anthropic, Microsoft Foundry, OpenRouter, Azure, or a model on your own machine. Add as many as you need.");

		const list = append(wrapper, $('.onboarding-a-auth-endpoint-list'));
		list.setAttribute('role', 'list');
		list.setAttribute('aria-label', localize('onboarding.authPrototype.endpoints.list.aria', "Your keys"));
		if (this.prototypeCustomEndpoints.length === 0) {
			const empty = append(list, $('p.onboarding-a-auth-endpoint-empty'));
			empty.textContent = localize('onboarding.authPrototype.endpoints.empty', "No keys yet.");
		}
		for (const [index, endpoint] of this.prototypeCustomEndpoints.entries()) {
			this._renderPrototypeEndpointRow(list, endpoint, index);
		}

		this._renderPrototypeEndpointForm(wrapper);
		this._renderPrototypeEndpointsFooter();
	}

	private _renderPrototypeEndpointRow(parent: HTMLElement, endpoint: IAuthenticationPrototypeEndpoint, index: number): void {
		const row = append(parent, $('.onboarding-a-auth-endpoint-row'));
		row.setAttribute('role', 'listitem');

		const mark = append(row, $('.onboarding-a-auth-endpoint-mark'));
		mark.setAttribute('aria-hidden', 'true');
		mark.appendChild(renderIcon(Codicon.server));

		const copy = append(row, $('.onboarding-a-auth-endpoint-copy'));
		const host = append(copy, $('span.onboarding-a-auth-endpoint-host'));
		host.textContent = this._getPrototypeEndpointHost(endpoint);
		const meta = append(copy, $('span.onboarding-a-auth-endpoint-meta'));
		meta.textContent = this._getPrototypeEndpointFormats().find(format => format.id === endpoint.format)?.label ?? endpoint.format;

		const remove = this._registerStepFocusable(append(row, $<HTMLButtonElement>('button.onboarding-a-auth-endpoint-remove')), { secondary: true });
		remove.type = 'button';
		remove.appendChild(renderIcon(Codicon.trash));
		remove.setAttribute('aria-label', localize('onboarding.authPrototype.endpoints.remove', "Remove {0}", host.textContent));
		this.stepDisposables.add(addDisposableListener(remove, EventType.CLICK, () => {
			this.prototypeCustomEndpoints.splice(index, 1);
			this._syncPrototypeCustomEndpointState();
			this._logAction('removeCustomEndpoint');
			status(localize('onboarding.authPrototype.endpoints.removed', "Key removed."));
			this._renderStep();
			this._updateButtonStates();
		}));
	}

	private _renderPrototypeEndpointForm(parent: HTMLElement): void {
		const form = append(parent, $('.onboarding-a-auth-custom-form'));

		const urlField = append(form, $('.onboarding-a-auth-custom-field'));
		const urlLabel = append(urlField, $('label.onboarding-a-auth-enterprise-label'));
		urlLabel.textContent = localize('onboarding.authPrototype.custom.url', "Endpoint URL");
		const urlInput = this._registerStepFocusable(append(urlField, $<HTMLInputElement>('input.onboarding-a-auth-enterprise-input')));
		urlInput.type = 'text';
		urlInput.placeholder = 'https://my-model-host.example/v1';
		urlInput.value = this.prototypeEndpointDraft.url;
		urlInput.setAttribute('aria-label', urlLabel.textContent);

		const formatField = append(form, $('.onboarding-a-auth-custom-field.half'));
		const formatLabel = append(formatField, $('label.onboarding-a-auth-enterprise-label'));
		formatLabel.textContent = localize('onboarding.authPrototype.custom.format', "API Format");
		const formatSelect = this._registerStepFocusable(append(formatField, $<HTMLSelectElement>('select.onboarding-a-auth-enterprise-input')));
		formatSelect.setAttribute('aria-label', formatLabel.textContent);
		for (const format of this._getPrototypeEndpointFormats()) {
			const option = append(formatSelect, $<HTMLOptionElement>('option'));
			option.value = format.id;
			option.textContent = format.label;
			option.selected = format.id === this.prototypeEndpointDraft.format;
		}

		const keyField = append(form, $('.onboarding-a-auth-custom-field.half'));
		const keyLabel = append(keyField, $('label.onboarding-a-auth-enterprise-label'));
		keyLabel.textContent = localize('onboarding.authPrototype.custom.key', "API Key");
		const keyInput = this._registerStepFocusable(append(keyField, $<HTMLInputElement>('input.onboarding-a-auth-enterprise-input')));
		keyInput.type = 'password';
		keyInput.placeholder = localize('onboarding.authPrototype.custom.key.placeholder', "Paste your key");
		keyInput.value = this.prototypeEndpointDraft.key;
		keyInput.setAttribute('aria-label', keyLabel.textContent);

		const message = append(form, $('.onboarding-a-signin-ghe-message'));
		const actions = append(form, $('.onboarding-a-auth-enterprise-submit'));
		const addButton = this._createPrototypeButton(actions, localize('onboarding.authPrototype.endpoints.add', "Add Key"), undefined, () => submit(), true);

		const validate = (): boolean => {
			this.prototypeEndpointDraft = {
				url: urlInput.value.trim(),
				key: keyInput.value,
				format: formatSelect.value as AuthenticationPrototypeEndpointFormat,
			};
			const { url, key } = this.prototypeEndpointDraft;
			message.classList.remove('error', 'info');
			urlInput.classList.remove('error');

			if (!url) {
				message.textContent = '';
				addButton.enabled = false;
				return false;
			}
			if (!/^https?:\/\/\S+$/i.test(url)) {
				urlInput.classList.add('error');
				message.classList.add('error');
				message.textContent = localize('onboarding.authPrototype.custom.invalidUrl', "Enter a full URL, such as https://my-model-host.example/v1.");
				addButton.enabled = false;
				return false;
			}
			if (this.prototypeCustomEndpoints.some(endpoint => endpoint.url === url)) {
				message.classList.add('error');
				message.textContent = localize('onboarding.authPrototype.endpoints.duplicate', "That endpoint is already added.");
				addButton.enabled = false;
				return false;
			}
			if (!key) {
				message.classList.add('info');
				message.textContent = localize('onboarding.authPrototype.custom.needKey', "Add the API key for this endpoint. Local servers often accept any value.");
				addButton.enabled = false;
				return false;
			}
			message.textContent = '';
			addButton.enabled = true;
			return true;
		};

		const submit = (): void => {
			if (!validate()) {
				return;
			}
			this.prototypeCustomEndpoints.push(this.prototypeEndpointDraft);
			this.prototypeEndpointDraft = { url: '', key: '', format: this.prototypeEndpointDraft.format };
			this._syncPrototypeCustomEndpointState();
			this._logAction('addCustomEndpoint');
			status(localize('onboarding.authPrototype.endpoints.added', "Key added. {0} total.", this.prototypeCustomEndpoints.length));
			this._renderStep();
			this._updateButtonStates();
		};

		this.stepDisposables.add(addDisposableListener(formatSelect, EventType.CHANGE, validate));
		for (const input of [urlInput, keyInput]) {
			this.stepDisposables.add(addDisposableListener(input, EventType.INPUT, validate));
			this.stepDisposables.add(addDisposableListener(input, EventType.KEY_DOWN, event => {
				const keyboardEvent = new StandardKeyboardEvent(event);
				if (keyboardEvent.keyCode === KeyCode.Enter) {
					event.preventDefault();
					submit();
				}
			}));
		}
		validate();
	}

	private _renderPrototypeEndpointsFooter(): void {
		const footer = this.prototypeFooterSlot;
		if (!footer) {
			return;
		}
		clearNode(footer);

		const back = append(footer, $('.onboarding-a-auth-no-ai'));
		const backButton = this._createPrototypeButton(back, localize('onboarding.authPrototype.endpoints.back', "Back"), undefined, () => {
			this.prototypeView = 'providers';
			this._renderStep();
			this._updateButtonStates();
		}, true);
		backButton.element.classList.add('onboarding-a-auth-no-ai-button');

		const doneButton = this._createPrototypeButton(footer, localize('onboarding.authPrototype.endpoints.done', "Done"), undefined, () => {
			this.prototypeView = 'providers';
			this._renderStep();
			this._updateButtonStates();
		}, false);
		doneButton.enabled = this.prototypeCustomEndpoints.length > 0;
		doneButton.element.classList.add('onboarding-a-auth-continue-button');
	}

	private _syncPrototypeCustomEndpointState(): void {
		const state = this.prototypeProviderStates.ownKey;
		const count = this.prototypeCustomEndpoints.length;
		state.status = count > 0 ? 'signed-in' : 'idle';
		state.account = count > 0
			? {
				label: count === 1
					? this._getPrototypeEndpointHost(this.prototypeCustomEndpoints[0])
					: localize('onboarding.authPrototype.endpoints.count', "{0} keys", count)
			}
			: undefined;
	}

	private _getPrototypeEndpointHost(endpoint: IAuthenticationPrototypeEndpoint): string {
		try {
			return new URL(endpoint.url).host;
		} catch {
			return endpoint.url;
		}
	}

	private _renderPrototypeCopilotSignInOptions(parent: HTMLElement): void {
		this._createPrototypeProviderButton(parent, localize('onboarding.authPrototype.github', "Continue with GitHub"), Codicon.github, () => this._beginPrototypeProviderConnection('copilot', 'github'), false);
		const google = this._createPrototypeProviderButton(parent, localize('onboarding.authPrototype.google', "Continue with Google"), Codicon.account, () => this._beginPrototypeProviderConnection('copilot', 'google'), true);
		google.element.classList.add('onboarding-a-auth-google-button');
		this._createPrototypeProviderButton(parent, localize('onboarding.authPrototype.githubEnterprise', "GitHub Enterprise"), Codicon.server, () => {
			this.enterpriseSignInUiState = 'instance';
			this._rerenderAuthenticationPrototype('copilot', true);
		}, true);
	}

	private _renderPrototypeEnterpriseInstanceForm(parent: HTMLElement): void {
		const form = append(parent, $('.onboarding-a-auth-enterprise-form'));
		const label = append(form, $('label.onboarding-a-auth-enterprise-label'));
		label.textContent = this._getEnterpriseInstancePromptLabel();

		const input = this._registerStepFocusable(append(form, $<HTMLInputElement>('input.onboarding-a-auth-enterprise-input')));
		this._registerPrototypeProviderAction(input, true);
		input.type = 'text';
		input.placeholder = label.textContent ?? '';
		input.setAttribute('aria-label', label.textContent ?? '');

		const message = append(form, $('.onboarding-a-signin-ghe-message'));
		const submitContainer = append(form, $('.onboarding-a-auth-enterprise-submit'));
		const submitButton = this._createPrototypeButton(
			submitContainer,
			localize('onboarding.authPrototype.enterprise.continue', "Continue"),
			Codicon.arrowRight,
			() => submit(),
			false
		);
		this._registerPrototypeProviderAction(submitButton.element);

		const validate = (): boolean => {
			this.enterpriseInstanceValue = input.value;
			message.classList.remove('error', 'info');
			input.classList.remove('error');

			const result = parseGheInstanceInput(input.value);
			switch (result.kind) {
				case GheParseResultKind.Empty:
					message.textContent = this._getEnterpriseInstancePromptLabel();
					submitButton.enabled = false;
					return false;
				case GheParseResultKind.SingleWord:
					message.classList.add('info');
					message.textContent = localize('onboarding.authPrototype.enterprise.resolve', "Will resolve to {0}", result.resolvedUri);
					submitButton.enabled = true;
					return true;
				case GheParseResultKind.FullUri:
					message.textContent = '';
					submitButton.enabled = true;
					return true;
				case GheParseResultKind.Invalid:
					input.classList.add('error');
					message.classList.add('error');
					message.textContent = localize('onboarding.authPrototype.enterprise.invalid', 'Enter a valid {0} instance, such as "octocat" or "https://octocat.ghe.com".', defaultChat.provider.enterprise.name);
					submitButton.enabled = false;
					return false;
			}
		};

		const submit = (): void => {
			if (validate()) {
				this._beginPrototypeProviderConnection('copilot', 'github-enterprise');
			}
		};

		this.stepDisposables.add(addDisposableListener(input, EventType.INPUT, validate));
		this.stepDisposables.add(addDisposableListener(input, EventType.KEY_DOWN, event => {
			const keyboardEvent = new StandardKeyboardEvent(event);
			if (keyboardEvent.keyCode === KeyCode.Enter) {
				event.preventDefault();
				submit();
			}
		}));
		validate();
	}

	private _createPrototypeProviderButton(parent: HTMLElement, label: string, icon: ThemeIcon, onClick: () => void, secondary: boolean): IButton {
		const button = this._createPrototypeButton(parent, label, icon, onClick, secondary);
		this._registerPrototypeProviderAction(button.element);
		return button;
	}

	private _registerPrototypeProviderAction<T extends HTMLElement>(element: T, preferred = false): T {
		element.dataset.providerAction = 'true';
		if (this.renderingPrototypeProvider) {
			const elements = this.prototypeProviderElements.get(this.renderingPrototypeProvider);
			if (elements && (preferred || !elements.firstAction)) {
				elements.firstAction = element;
			}
		}
		return element;
	}

	private _useAnotherPrototypeProviderAccount(provider: AuthenticationPrototypeProvider): void {
		const state = this.prototypeProviderStates[provider];
		state.status = 'idle';
		state.selected = true;
		this.activePrototypeProvider = provider;
		if (provider === 'copilot') {
			this.enterpriseSignInUiState = 'options';
		}
		this._rerenderAuthenticationPrototype(provider, true);
		status(localize('onboarding.authPrototype.provider.manualSetup.aria', "Showing manual setup for {0}.", this._getPrototypeProviderDescriptor(provider).label));
	}

	private _beginPrototypeProviderConnection(provider: AuthenticationPrototypeProvider, method?: 'github' | 'google' | 'github-enterprise'): void {
		const state = this.prototypeProviderStates[provider];
		state.selected = true;
		state.status = 'connecting';
		this.activePrototypeProvider = provider;
		this._logAction('connectAuthenticationProvider', undefined, method ?? provider);
		this._rerenderAuthenticationPrototype(provider);

		const targetWindow = getActiveWindow();
		const handle = targetWindow.setTimeout(() => {
			state.status = 'signed-in';
			this.activePrototypeProvider = this._getNextPrototypeProviderRequiringSetup();
			const descriptor = this._getPrototypeProviderDescriptor(provider);
			status(localize('onboarding.authPrototype.provider.connected.aria', "{0} is signed in.", descriptor.label));
			this._rerenderAuthenticationPrototype(this.activePrototypeProvider ?? provider, this.activePrototypeProvider !== undefined);
		}, 450);
		this.disposables.add(toDisposable(() => targetWindow.clearTimeout(handle)));
	}

	private _getNextPrototypeProviderRequiringSetup(): AuthenticationPrototypeProvider | undefined {
		return this._getPrototypeProviders().find(provider => {
			const state = this.prototypeProviderStates[provider];
			return state.selected && state.status !== 'signed-in';
		});
	}

	/**
	 * Explains what pressing Continue will actually do: which provider becomes the
	 * default for chat, and that the rest stay a model-picker away.
	 */
	private _renderPrototypeOutcomeSummary(parent: HTMLElement, selectedProviders: readonly AuthenticationPrototypeProvider[], allReady: boolean): void {
		if (!allReady || selectedProviders.length === 0) {
			return;
		}

		const [defaultProvider, ...secondaryProviders] = selectedProviders;
		const defaultLabel = this._getPrototypeProviderDescriptor(defaultProvider).label;
		const summary = append(parent, $('p.onboarding-a-auth-outcome'));
		summary.textContent = secondaryProviders.length === 0
			? localize('onboarding.authPrototype.outcome.single', "Chat and inline suggestions will use {0}.", defaultLabel)
			: localize('onboarding.authPrototype.outcome.default', "{0} powers chat to start. Pick a different model whenever you like.", defaultLabel);
	}

	private _renderPrototypeChecklistFooter(parent: HTMLElement): void {
		const selectedProviders = this._getPrototypeProviders().filter(provider => this.prototypeProviderStates[provider].selected);
		const readyProviders = selectedProviders.filter(provider => this.prototypeProviderStates[provider].status === 'signed-in');
		const allReady = selectedProviders.length > 0 && readyProviders.length === selectedProviders.length;

		this._renderPrototypeOutcomeSummary(parent, selectedProviders, allReady);

		// Actions live in the card footer so Continue keeps its position across steps.
		const footer = this.prototypeFooterSlot;
		if (!footer) {
			return;
		}
		clearNode(footer);

		const noAi = append(footer, $('.onboarding-a-auth-no-ai'));
		const noAiButton = this._createPrototypeButton(
			noAi,
			localize('onboarding.authPrototype.noAi', "Continue without AI features"),
			undefined,
			() => {
				this.prototypeAuthenticationSelected = true;
				this._logAction('selectAuthenticationProvider', undefined, 'no-ai');
				status(localize('onboarding.authPrototype.selected.noAi', "Continuing without AI features."));
				this._nextStep();
			},
			true
		);
		noAiButton.element.classList.add('onboarding-a-auth-no-ai-button');

		const continueButton = this._createPrototypeButton(
			footer,
			allReady
				? localize('onboarding.authPrototype.continue', "Continue")
				: localize('onboarding.authPrototype.continue.pending', "Finish Provider Setup"),
			undefined,
			() => {
				this.prototypeAuthenticationSelected = true;
				this._logAction('completeAuthenticationProviders', undefined, selectedProviders.join(','));
				this._nextStep();
			},
			false
		);
		continueButton.enabled = allReady;
		continueButton.element.classList.add('onboarding-a-auth-continue-button');
	}

	private _getFocusedPrototypeProvider(): AuthenticationPrototypeProvider | undefined {
		const activeElement = getActiveWindow().document.activeElement;
		if (!isHTMLElement(activeElement)) {
			return undefined;
		}
		for (const [provider, elements] of this.prototypeProviderElements) {
			if (elements.container.contains(activeElement)) {
				return provider;
			}
		}
		return undefined;
	}

	private _rerenderAuthenticationPrototype(provider?: AuthenticationPrototypeProvider, focusAction = false): void {
		if (this.steps[this.currentStepIndex] !== OnboardingStepId.SignIn) {
			return;
		}
		this._renderStep();
		this._updateButtonStates();
		if (!provider) {
			return;
		}
		const elements = this.prototypeProviderElements.get(provider);
		(focusAction ? elements?.firstAction : elements?.checkbox)?.focus();
	}

	private _createPrototypeButton(parent: HTMLElement, label: string, icon: ThemeIcon | undefined, onClick: () => void, secondary: boolean): IButton {
		const button = this.stepDisposables.add(new Button(parent, {
			...defaultButtonStyles,
			secondary,
			small: true,
			supportIcons: true,
			ariaLabel: label,
		}));
		button.label = icon ? localize('onboarding.authPrototype.labelWithIcon', "$({0}) {1}", icon.id, label) : label;
		this.stepDisposables.add(button.onDidClick(onClick));
		this._registerStepFocusable(button.element);
		return button;
	}

	private _renderDefaultSignInActions(actions: HTMLElement): void {
		const githubBtn = this._registerStepFocusable(this._createSignInButton(actions, 'github', localize('onboarding.signIn.github', "Continue with GitHub"), {
			emphasized: true,
			label: localize('onboarding.signIn.github.aria', "Continue with GitHub")
		}));
		this.stepDisposables.add(addDisposableListener(githubBtn, EventType.CLICK, () => {
			this._logAction('signIn', undefined, 'github');
			this._handleSignIn();
		}));

		const googleBtn = this._registerStepFocusable(this._createSignInButton(actions, 'google', localize('onboarding.signIn.google', "Continue with Google"), {
			iconOnly: true,
			label: localize('onboarding.signIn.google', "Continue with Google")
		}));
		this.stepDisposables.add(addDisposableListener(googleBtn, EventType.CLICK, () => {
			this._logAction('signIn', undefined, 'google');
			this._handleSignIn('google');
		}));

		const gheBtn = this._registerStepFocusable(this._createSignInButton(actions, 'github-enterprise', localize('onboarding.signIn.ghe', "GHE"), {
			textOnly: true,
			label: localize('onboarding.signIn.ghe.aria', "Continue with GitHub Enterprise")
		}));
		this.stepDisposables.add(addDisposableListener(gheBtn, EventType.CLICK, () => {
			this._logAction('signIn', undefined, 'github-enterprise');
			void this._handleEnterpriseSignIn();
		}));
	}

	private static readonly GHE_INPUT_ACTION_PADDING = 28;

	private _renderEnterpriseInstanceForm(actions: HTMLElement): void {
		const enterprisePromptLabel = this._getEnterpriseInstancePromptLabel();

		const container = append(actions, $('.onboarding-a-signin-ghe-input'));

		const submitAction = this.stepDisposables.add(new Action(
			'onboarding.signIn.enterprise.submit',
			localize('onboarding.signIn.enterprise.continue', "Continue"),
			ThemeIcon.asClassName(Codicon.arrowRight),
			false,
		));

		const inputBox = this.stepDisposables.add(new InputBox(container, undefined, {
			placeholder: localize('onboarding.signIn.enterprise.placeholder', 'i.e. "octocat" or "https://octocat.ghe.com"...'),
			ariaLabel: enterprisePromptLabel,
			actions: [submitAction],
			inputBoxStyles: defaultInputBoxStyles,
		}));
		inputBox.value = this.enterpriseInstanceValue;
		inputBox.paddingRight = OnboardingVariationA.GHE_INPUT_ACTION_PADDING;
		const input = this._registerStepFocusable(inputBox.inputElement);

		const submit = async () => {
			const result = parseGheInstanceInput(inputBox.value);
			if (result.kind === GheParseResultKind.Empty || result.kind === GheParseResultKind.Invalid) {
				validate();
				return;
			}
			await this._submitEnterpriseInstance(result.resolvedUri);
		};
		submitAction.run = submit;

		const message = append(container, $('.onboarding-a-signin-ghe-message'));

		const validate = (): boolean => {
			this.enterpriseInstanceValue = inputBox.value;
			inputBox.element.classList.remove('error');
			message.classList.remove('error', 'info');

			const result = parseGheInstanceInput(inputBox.value);
			switch (result.kind) {
				case GheParseResultKind.Empty:
					message.textContent = enterprisePromptLabel;
					submitAction.enabled = false;
					return false;
				case GheParseResultKind.SingleWord:
					message.classList.add('info');
					message.textContent = localize('onboarding.signIn.enterprise.resolve', "Will resolve to {0}", result.resolvedUri);
					submitAction.enabled = true;
					return true;
				case GheParseResultKind.FullUri:
					submitAction.enabled = true;
					message.textContent = '';
					return true;
				case GheParseResultKind.Invalid:
					inputBox.element.classList.add('error');
					message.classList.add('error');
					message.textContent = localize('onboarding.signIn.enterprise.invalid', 'You must enter a valid {0} instance (i.e. "octocat" or "https://octocat.ghe.com")', defaultChat.provider.enterprise.name);
					submitAction.enabled = false;
					return false;
			}
		};

		this.stepDisposables.add(inputBox.onDidChange(() => {
			validate();
		}));

		this.stepDisposables.add(addDisposableListener(input, EventType.KEY_DOWN, e => {
			const event = new StandardKeyboardEvent(e);
			if (event.keyCode === KeyCode.Enter) {
				e.preventDefault();
				void submitAction.run();
				return;
			}

			if (event.keyCode === KeyCode.Escape) {
				e.preventDefault();
				e.stopPropagation();
				this._logAction('cancelEnterpriseInstancePrompt');
				this.enterpriseSignInWatch = undefined;
				this._setEnterpriseSignInUiState('options');
			}
		}));

		validate();
	}

	private _renderEnterpriseSignInProgress(actions: HTMLElement): void {
		const container = append(actions, $('.onboarding-a-signin-ghe-progress'));
		container.setAttribute('aria-live', 'polite');
		const spinner = append(container, $('span'));
		spinner.classList.add(...ThemeIcon.asClassNameArray(Codicon.loading), 'codicon-modifier-spin');
		spinner.setAttribute('aria-hidden', 'true');
		const message = append(container, $('.onboarding-a-signin-ghe-progress-message'));
		message.textContent = localize('onboarding.signIn.enterprise.progress', "Waiting for {0} sign-in to complete...", defaultChat.provider.enterprise.name);
	}

	private _getEnterpriseInstancePromptLabel(): string {
		return localize('onboarding.signIn.enterprise.prompt', "What is your {0} instance?", defaultChat.provider.enterprise.name);
	}

	private _setEnterpriseSignInUiState(state: EnterpriseSignInUiState): void {
		this.enterpriseSignInUiState = state;
		if (this.steps[this.currentStepIndex] === OnboardingStepId.SignIn && this.contentEl) {
			this._renderStep();
			this._updateButtonStates();
			this._focusCurrentStepElement();
		}
	}

	private _createSignInButton(parent: HTMLElement, providerClass: 'github' | 'github-enterprise' | 'google', label: string, options?: { emphasized?: boolean; iconOnly?: boolean; textOnly?: boolean; label?: string }): HTMLButtonElement {
		const isCompact = options?.iconOnly || options?.textOnly;
		const btn = append(parent, $<HTMLButtonElement>(isCompact ? 'button.onboarding-a-signin-icon-btn' : 'button.onboarding-a-signin-btn'));
		btn.type = 'button';
		btn.title = options?.label ?? label;
		btn.setAttribute('aria-label', options?.label ?? label);
		if (options?.emphasized) {
			btn.classList.add('primary');
		}

		if (!options?.textOnly) {
			const mark = append(btn, $('span.onboarding-a-provider-mark'));
			mark.classList.add(providerClass);
			mark.setAttribute('aria-hidden', 'true');
			if (providerClass === 'github' || providerClass === 'github-enterprise') {
				mark.appendChild(renderIcon(Codicon.github));
			}
		}

		if (!options?.iconOnly) {
			const labelEl = append(btn, $('span.onboarding-a-signin-btn-label'));
			labelEl.textContent = label;
		}

		return btn;
	}

	private async _handleSignIn(socialProvider?: string): Promise<void> {
		const provider = socialProvider ?? 'github';
		const watch = StopWatch.create();
		try {
			const account = await this.defaultAccountService.signIn({
				extraAuthorizeParameters: { get_started_with: 'copilot-vscode' },
				provider: socialProvider,
			});
			if (account) {
				this._userSignedIn = true;
				this.telemetryService.publicLog2<InstallChatEvent, InstallChatClassification>('commandCenter.chatInstall', { installResult: 'installed', installDuration: watch.elapsed(), signUpErrorCode: undefined, provider });
				// Run chat setup in the background (sign-up, extension install, entitlement resolution)
				this.commandService.executeCommand('workbench.action.chat.triggerSetup', undefined, {
					disableChatViewReveal: true,
					setupStrategy: ChatSetupStrategy.DefaultSetup,
				});
				this._nextStep();
			}
		} catch (error) {
			if (isCancellationError(error)) {
				this.telemetryService.publicLog2<InstallChatEvent, InstallChatClassification>('commandCenter.chatInstall', { installResult: 'cancelled', installDuration: watch.elapsed(), signUpErrorCode: undefined, provider });
				return;
			}

			this.telemetryService.publicLog2<InstallChatEvent, InstallChatClassification>('commandCenter.chatInstall', { installResult: 'failedNotSignedIn', installDuration: watch.elapsed(), signUpErrorCode: undefined, provider });
			this.notificationService.notify({
				severity: Severity.Error,
				message: localize('onboarding.signIn.error', "Sign-in failed. You can try again later from the Accounts menu."),
			});
		}
	}

	private async _handleEnterpriseSignIn(): Promise<void> {
		const existingUri = this.configurationService.getValue<string>(defaultChat.providerUriSetting);
		if (typeof existingUri !== 'string' || !GHE_FULL_URI_REGEX.test(existingUri)) {
			this.enterpriseInstanceValue = existingUri ?? '';
			this.enterpriseSignInWatch = StopWatch.create();
			this._setEnterpriseSignInUiState('instance');
			return;
		}

		this.enterpriseInstanceValue = existingUri;
		await this._runEnterpriseSignInSetup();
	}

	private async _submitEnterpriseInstance(resolvedUri: string): Promise<void> {
		try {
			await this.configurationService.updateValue(defaultChat.providerUriSetting, resolvedUri, ConfigurationTarget.USER);
			this.enterpriseInstanceValue = resolvedUri;
			await this._runEnterpriseSignInSetup();
		} catch {
			this.enterpriseSignInWatch = undefined;
			this._setEnterpriseSignInUiState('instance');
			this._notifyEnterpriseSignInError();
		}
	}

	private async _runEnterpriseSignInSetup(): Promise<void> {
		const watch = this.enterpriseSignInWatch ?? StopWatch.create();
		const provider = defaultChat.provider.enterprise.id;
		this._setEnterpriseSignInUiState('progress');

		try {
			const success = await this.commandService.executeCommand<boolean>('workbench.action.chat.triggerSetup', undefined, {
				disableChatViewReveal: true,
				setupStrategy: ChatSetupStrategy.SetupWithEnterpriseProvider,
			});

			if (success) {
				this._userSignedIn = true;
				this.telemetryService.publicLog2<InstallChatEvent, InstallChatClassification>('commandCenter.chatInstall', { installResult: 'installed', installDuration: watch.elapsed(), signUpErrorCode: undefined, provider });
				this._nextStep();
			} else {
				this._setEnterpriseSignInUiState('options');
			}
		} catch (error) {
			if (isCancellationError(error)) {
				this._setEnterpriseSignInUiState('options');
				this.telemetryService.publicLog2<InstallChatEvent, InstallChatClassification>('commandCenter.chatInstall', { installResult: 'cancelled', installDuration: watch.elapsed(), signUpErrorCode: undefined, provider });
				return;
			}

			this._setEnterpriseSignInUiState('instance');
			this.telemetryService.publicLog2<InstallChatEvent, InstallChatClassification>('commandCenter.chatInstall', { installResult: 'failedNotSignedIn', installDuration: watch.elapsed(), signUpErrorCode: undefined, provider });
			this._notifyEnterpriseSignInError();
		} finally {
			this.enterpriseSignInWatch = undefined;
		}
	}

	private _notifyEnterpriseSignInError(): void {
		this.notificationService.notify({
			severity: Severity.Error,
			message: localize('onboarding.signIn.enterprise.error', "GitHub Enterprise sign-in failed. Check your instance URL and try again."),
		});
	}

	// =====================================================================
	// Step: Personalize (Theme + Keymap)
	// =====================================================================

	private _renderPersonalizeStep(container: HTMLElement): void {
		const wrapper = append(container, $('.onboarding-a-personalize'));

		// Theme section. In prototype mode the step subtitle already frames the
		// choice, so the redundant section label and hint are dropped.
		if (!this.authenticationPrototype) {
			const themeLabel = append(wrapper, $('div.onboarding-a-section-label'));
			themeLabel.textContent = localize('onboarding.personalize.theme', "Color Theme");

			const themeHint = append(wrapper, $('div.onboarding-a-theme-hint'));
			themeHint.textContent = localize('onboarding.personalize.themeHint', "You can browse and install more themes later from the Extensions view.");
		}

		const themeGrid = append(wrapper, $('.onboarding-a-theme-grid'));
		themeGrid.setAttribute('role', 'radiogroup');
		themeGrid.setAttribute('aria-label', localize('onboarding.personalize.themeLabel', "Choose a color theme"));

		const hasOtherEditors = this._hasOtherEditors();
		const allThemes = this.prototypeThemes ?? product.onboardingThemes ?? [];
		// When other editors are detected, show a compact set (exclude solarized variants).
		const themes: readonly IOnboardingThemeOption[] = hasOtherEditors
			? allThemes.filter(t => !t.id.startsWith('solarized'))
			: allThemes;

		if (!hasOtherEditors) {
			themeGrid.classList.add('theme-grid-expanded');
		}

		const themeCards: HTMLElement[] = [];
		for (const theme of themes) {
			this._createThemeCard(themeGrid, theme, themeCards);
		}
		// Make all theme cards individually tabbable
		for (const card of themeCards) {
			card.setAttribute('tabindex', '0');
		}

		// Keyboard Mapping section — only shown when another editor is detected
		const keymapOptions = this._detectedEditorIds
			? (product.onboardingKeymaps ?? []).filter(k => this._detectedEditorIds!.has(k.id))
			: [];

		if (hasOtherEditors) {
			const keymapLabel = append(wrapper, $('div.onboarding-a-section-label.onboarding-a-section-label-keymap'));
			keymapLabel.textContent = localize('onboarding.personalize.keymap', "Keyboard Mapping");

			const keymapHint = append(wrapper, $('div.onboarding-a-theme-hint'));
			keymapHint.textContent = localize('onboarding.personalize.keymapHint', "Coming from another editor? Import your keyboard mapping to feel right at home.");

			const keymapList = append(wrapper, $('.onboarding-a-keymap-list'));
			keymapList.setAttribute('role', 'radiogroup');
			keymapList.setAttribute('aria-label', localize('onboarding.personalize.keymapLabel', "Choose a keyboard mapping"));

			const keymapPills: HTMLButtonElement[] = [];
			for (const keymap of keymapOptions) {
				const pill = this._registerStepFocusable(append(keymapList, $<HTMLButtonElement>('button.onboarding-a-keymap-pill')));
				pill.type = 'button';
				pill.setAttribute('role', 'radio');
				pill.setAttribute('aria-checked', keymap.id === this.selectedKeymapId ? 'true' : 'false');
				pill.title = keymap.description;
				keymapPills.push(pill);

				const labelSpan = append(pill, $('span'));
				labelSpan.textContent = keymap.label;

				if (keymap.id === this.selectedKeymapId) {
					pill.classList.add('selected');
				}

				this.stepDisposables.add(addDisposableListener(pill, EventType.CLICK, () => {
					this._logAction('selectKeymap', undefined, keymap.id);
					this.selectedKeymapId = keymap.id;

					for (const p of keymapPills) {
						p.classList.remove('selected');
						p.setAttribute('aria-checked', 'false');
					}
					pill.classList.add('selected');
					pill.setAttribute('aria-checked', 'true');
					this.accessibilityService.alert(localize('onboarding.keymap.selected.alert', "{0} keyboard mapping selected", keymap.label));
				}));
			}
			const selectedKeymapIndex = keymapOptions.findIndex(k => k.id === this.selectedKeymapId);
			this._setupRadioGroupNavigation(keymapPills, Math.max(0, selectedKeymapIndex));
		}

	}

	private _renderPersonalizeSubtitle(container: HTMLElement): void {
		clearNode(container);
		const modifier = isMacintosh ? 'Cmd' : 'Ctrl';
		container.append(
			localize('onboarding.personalize.tip.prefix', "Tip: Press "),
			this._createKbd(localize({ key: 'onboarding.personalize.tip.modifier', comment: ['This is a keyboard modifier key, Ctrl on Windows/Linux or Cmd on Mac'] }, "{0}", modifier)),
			'+',
			this._createKbd(localize('onboarding.personalize.tip.shift', "Shift")),
			'+',
			this._createKbd(localize('onboarding.personalize.tip.p', "P")),
			localize('onboarding.personalize.tip.suffix', " to access all VS Code commands."),
		);
	}

	private _createThemeCard(parent: HTMLElement, theme: IOnboardingThemeOption, allCards: HTMLElement[]): void {
		const card = this._registerStepFocusable(append(parent, $('div.onboarding-a-theme-card')));
		allCards.push(card);
		card.setAttribute('role', 'radio');
		card.setAttribute('aria-checked', theme.id === this.selectedThemeId ? 'true' : 'false');
		card.setAttribute('aria-label', theme.label);

		if (theme.id === this.selectedThemeId) {
			card.classList.add('selected');
		}

		// SVG preview image, resolved through CSS so it works in every bundle.
		const preview = append(card, $('div.onboarding-a-theme-preview'));
		preview.classList.add(`theme-preview-${theme.id}`);
		preview.setAttribute('aria-hidden', 'true');

		// Label
		const label = append(card, $('div.onboarding-a-theme-label'));
		label.textContent = theme.label;

		this.stepDisposables.add(addDisposableListener(card, EventType.CLICK, () => {
			this._logAction('selectTheme', undefined, theme.id);
			this._selectTheme(theme);
			for (const c of allCards) {
				c.classList.remove('selected');
				c.setAttribute('aria-checked', 'false');
			}
			card.classList.add('selected');
			card.setAttribute('aria-checked', 'true');
			this.accessibilityService.alert(localize('onboarding.theme.selected.alert', "{0} theme selected", theme.label));
		}));

		this.stepDisposables.add(addDisposableListener(card, EventType.KEY_DOWN, (e: KeyboardEvent) => {
			if (e.key === 'Enter' || e.key === ' ') {
				e.preventDefault();
				card.click();
			}
		}));
	}

	// =====================================================================
	// Theme / Keymap helpers
	// =====================================================================

	private async _selectTheme(theme: IOnboardingThemeOption): Promise<void> {
		this.selectedThemeId = theme.id;
		const allThemes = await this.themeService.getColorThemes();
		const match = allThemes.find(t => t.settingsId === theme.themeId);
		if (match) {
			this.themeService.setColorTheme(match.id, ConfigurationTarget.USER);
		}
	}

	private async _applyKeymap(keymapId: string): Promise<void> {
		const keymap = (product.onboardingKeymaps ?? []).find(k => k.id === keymapId);
		if (!keymap?.extensionId) {
			return; // VS Code default, nothing to install
		}

		try {
			const gallery = await this.extensionGalleryService.getExtensions([{ id: keymap.extensionId }], CancellationToken.None);
			if (gallery.length > 0) {
				await this.extensionManagementService.installFromGallery(gallery[0], { context: { [EXTENSION_INSTALL_SKIP_WALKTHROUGH_CONTEXT]: true } });
			}
		} catch {
			this.notificationService.notify({
				severity: Severity.Warning,
				message: localize('onboarding.keymap.installError', "Could not install {0} keymap. You can install it later from Extensions.", keymap.label),
			});
		}
	}

	private _hasOtherEditors(): boolean {
		const keymapOptions = this._detectedEditorIds
			? (product.onboardingKeymaps ?? []).filter(k => this._detectedEditorIds!.has(k.id))
			: [];
		return keymapOptions.some(k => k.id !== 'vscode');
	}

	/**
	 * Checks common install paths for known editors and returns the set of
	 * keymap option IDs whose editors are found on this machine.
	 * Always includes 'vscode' (the default). In web environments or on
	 * unknown platforms, returns only 'vscode'.
	 */
	private async _detectInstalledEditors(): Promise<Set<string>> {
		const detected = new Set<string>(['vscode']);
		const home = this.pathService.userHome({ preferLocal: true });

		interface EditorCheck { id: string; paths: URI[] }
		const checks: EditorCheck[] = [];

		if (isWindows) {
			const localAppData = URI.joinPath(home, 'AppData', 'Local');
			checks.push(
				{ id: 'sublime', paths: [URI.file('C:\\Program Files\\Sublime Text\\sublime_text.exe'), URI.file('C:\\Program Files\\Sublime Text 3\\sublime_text.exe')] },
				{ id: 'intellij', paths: [URI.joinPath(localAppData, 'JetBrains', 'Toolbox')] },
				{ id: 'vim', paths: [URI.joinPath(home, '_vimrc'), URI.joinPath(localAppData, 'nvim', 'init.vim'), URI.joinPath(localAppData, 'nvim', 'init.lua')] },
				{ id: 'eclipse', paths: [URI.file('C:\\Program Files\\Eclipse\\eclipse.exe'), URI.file('C:\\Program Files\\eclipse\\eclipse.exe')] },
				{ id: 'notepadpp', paths: [URI.file('C:\\Program Files\\Notepad++\\notepad++.exe'), URI.file('C:\\Program Files (x86)\\Notepad++\\notepad++.exe')] },
			);
		} else if (isMacintosh) {
			checks.push(
				{ id: 'sublime', paths: [URI.file('/Applications/Sublime Text.app')] },
				{ id: 'intellij', paths: [URI.file('/Applications/IntelliJ IDEA.app'), URI.file('/Applications/IntelliJ IDEA CE.app')] },
				{ id: 'vim', paths: [URI.joinPath(home, '.vimrc'), URI.joinPath(home, '.config', 'nvim', 'init.vim'), URI.joinPath(home, '.config', 'nvim', 'init.lua')] },
				{ id: 'eclipse', paths: [URI.file('/Applications/Eclipse.app'), URI.file('/Applications/Eclipse IDE.app')] },
				{ id: 'notepadpp', paths: [URI.file('/Applications/Notepad++.app')] },
			);
		} else if (isLinux) {
			checks.push(
				{ id: 'sublime', paths: [URI.file('/usr/bin/subl'), URI.file('/opt/sublime_text/sublime_text')] },
				{ id: 'intellij', paths: [URI.joinPath(home, '.local', 'share', 'JetBrains', 'Toolbox'), URI.file('/opt/idea')] },
				{ id: 'vim', paths: [URI.joinPath(home, '.vimrc'), URI.joinPath(home, '.config', 'nvim', 'init.vim'), URI.joinPath(home, '.config', 'nvim', 'init.lua')] },
				{ id: 'eclipse', paths: [URI.file('/usr/bin/eclipse'), URI.file('/opt/eclipse/eclipse'), URI.joinPath(home, 'eclipse', 'eclipse')] },
				{ id: 'notepadpp', paths: [URI.file('/usr/bin/notepadqq'), URI.file('/snap/notepad-plus-plus/current')] },
			);
		}

		await Promise.all(checks.map(async check => {
			for (const path of check.paths) {
				try {
					if (await this.fileService.exists(path)) {
						detected.add(check.id);
						return;
					}
				} catch {
					// Path not accessible — skip
				}
			}
		}));

		return detected;
	}

	// =====================================================================
	// Step: AI Preference
	// =====================================================================

	private _renderAiPreferenceStep(container: HTMLElement): void {
		const wrapper = append(container, $('.onboarding-a-ai-pref'));

		const cards = append(wrapper, $('.onboarding-a-ai-pref-cards'));
		cards.setAttribute('role', 'radiogroup');
		cards.setAttribute('aria-label', localize('onboarding.aiPref.label', "Choose your AI collaboration style"));

		const allCards: HTMLButtonElement[] = [];
		for (const option of ONBOARDING_AI_PREFERENCE_OPTIONS) {
			const card = this._registerStepFocusable(append(cards, $<HTMLButtonElement>('button.onboarding-a-ai-pref-card')));
			card.type = 'button';
			card.dataset.id = option.id;
			card.setAttribute('role', 'radio');
			card.setAttribute('aria-checked', option.id === this.selectedAiMode ? 'true' : 'false');
			allCards.push(card);

			if (option.id === this.selectedAiMode) {
				card.classList.add('selected');
			}

			const iconEl = append(card, $('span.onboarding-a-ai-pref-card-icon'));
			iconEl.setAttribute('aria-hidden', 'true');
			const icon = Codicon[option.icon as keyof typeof Codicon] ?? Codicon.sparkle;
			iconEl.appendChild(renderIcon(icon));

			const titleEl = append(card, $('div.onboarding-a-ai-pref-card-title'));
			titleEl.textContent = option.label;

			const descEl = append(card, $('div.onboarding-a-ai-pref-card-desc'));
			descEl.textContent = option.description;

			this.stepDisposables.add(addDisposableListener(card, EventType.CLICK, () => {
				this._logAction('selectAiMode', undefined, option.id);
				this.selectedAiMode = option.id;
				for (const c of allCards) {
					c.classList.toggle('selected', c.dataset.id === option.id);
					c.setAttribute('aria-checked', c.dataset.id === option.id ? 'true' : 'false');
				}
				this._applyAiPreference(option.id);
				this.accessibilityService.alert(localize('onboarding.aiPref.selected.alert', "{0} selected", option.label));
			}));
		}
		const selectedAiIndex = ONBOARDING_AI_PREFERENCE_OPTIONS.findIndex(o => o.id === this.selectedAiMode);
		this._setupRadioGroupNavigation(allCards, Math.max(0, selectedAiIndex));

		const hint = append(wrapper, $('div.onboarding-a-ai-pref-hint'));
		hint.textContent = localize('onboarding.aiPref.hint', "You can change this anytime in Settings.");
	}

	private _applyAiPreference(mode: AiCollaborationMode): void {
		switch (mode) {
			case AiCollaborationMode.CodeFirst:
				this.configurationService.updateValue('chat.agent.autoFix', false, ConfigurationTarget.USER);
				break;
			case AiCollaborationMode.Balanced:
				this.configurationService.updateValue('chat.agent.autoFix', true, ConfigurationTarget.USER);
				break;
			case AiCollaborationMode.AgentForward:
				this.configurationService.updateValue('chat.agent.autoFix', true, ConfigurationTarget.USER);
				break;
		}
	}

	// =====================================================================
	// Step: Agent Sessions
	// =====================================================================

	private _renderAgentSessionsSubtitle(el: HTMLElement): void {
		clearNode(el);
		const keys = isMacintosh
			? ['\u2318', '\u2303', 'I']  // Cmd+Control+I
			: ['Ctrl', 'Alt', 'I'];
		const shortcut = keys.map(k => this._createKbd(k));
		el.append(localize('onboarding.step.agentSessions.subtitle.before', "Open Chat anytime with "));
		for (let i = 0; i < shortcut.length; i++) {
			if (i > 0) {
				el.append('+');
			}
			el.append(shortcut[i]);
		}
	}

	private _renderAgentSessionsStep(container: HTMLElement): void {
		if (this.authenticationPrototype) {
			this._renderPrototypeAgentSessionsStep(container);
			return;
		}

		const wrapper = append(container, $('.onboarding-a-sessions'));

		const features = append(wrapper, $('.onboarding-a-sessions-features'));

		// Group 1: Chat modes — Plan / Agent
		const chatGroup = append(features, $('.onboarding-a-sessions-group'));
		const chatLabel = append(chatGroup, $('div.onboarding-a-sessions-group-label'));
		chatLabel.textContent = localize('onboarding.sessions.group.chat', "Agents made for the task");
		const chatGrid = append(chatGroup, $('.onboarding-a-sessions-grid.onboarding-a-sessions-grid-2'));

		this._createFeatureCard(chatGrid, Codicon.listOrdered,
			localize('onboarding.sessions.planMode', "Plan"),
			localize('onboarding.sessions.planMode.desc', "Produce a structured implementation plan before any code changes, then hand it off to an agent to execute."));

		this._createFeatureCard(chatGrid, Codicon.commentDiscussion,
			localize('onboarding.sessions.agentMode', "Agent"),
			localize('onboarding.sessions.agentMode.desc', "Describe a goal. The agent plans the approach, edits files, runs commands, and self-corrects. You review and approve along the way."));

		// Group 2: ways to run and customize agents beyond the default Chat experience
		const moreGroup = append(features, $('.onboarding-a-sessions-group'));
		const moreLabel = append(moreGroup, $('div.onboarding-a-sessions-group-label'));
		moreLabel.textContent = localize('onboarding.sessions.group.more', "Agents that work your way");
		const moreGrid = append(moreGroup, $('.onboarding-a-sessions-grid.onboarding-a-sessions-grid-2'));

		this._createFeatureCard(moreGrid, Codicon.rocket,
			localize('onboarding.sessions.runAnywhere', "Run Agents Anywhere"),
			localize('onboarding.sessions.runAnywhere.desc', "Run agents locally for interactive work, in the background with Copilot CLI, or in the cloud with cloud agents that open a pull request your team can review."));

		this._createFeatureCard(moreGrid, Codicon.settingsGear,
			localize('onboarding.sessions.customize', "Customize Your Agents"),
			localize('onboarding.sessions.customize.desc', "Tailor Copilot to your project with custom instructions and agents, skills, reusable prompts, and MCP servers that connect to the tools and context you rely on."));

		// Tutorial link at bottom of content, above footer
		const docsRow = append(wrapper, $('.onboarding-a-sessions-docs'));
		this._createDocLink(docsRow, localize('onboarding.sessions.agentsTutorial', "Agents tutorial"), 'https://code.visualstudio.com/docs/agents/agents-tutorial?referrer=in-product', 'agentsTutorial');
	}

	/**
	 * Prototype closing step. The provider step promised flexibility, so this
	 * pays that off: the connected providers are shown as a row of marks, and
	 * the Agents window is the headline rather than a single assistant.
	 */
	private _renderPrototypeAgentSessionsStep(container: HTMLElement): void {
		const wrapper = append(container, $('.onboarding-a-sessions.onboarding-a-sessions-prototype'));
		const connected = this._getPrototypeProviders().filter(provider => this.prototypeProviderStates[provider].selected && this.prototypeProviderStates[provider].status === 'signed-in');

		if (connected.length > 0) {
			const lineup = append(wrapper, $('.onboarding-a-sessions-lineup'));
			lineup.setAttribute('aria-label', localize('onboarding.authPrototype.sessions.lineup.aria', "Connected providers"));
			for (const provider of connected) {
				const descriptor = this._getPrototypeProviderDescriptor(provider);
				const mark = append(lineup, $('.onboarding-a-sessions-lineup-mark'));
				mark.title = descriptor.label;
				mark.appendChild(renderIcon(descriptor.icon));
			}
		}

		const grid = append(wrapper, $('.onboarding-a-sessions-grid.onboarding-a-sessions-grid-2'));

		this._createFeatureCard(grid, Codicon.layers,
			localize('onboarding.authPrototype.sessions.window', "The Agents Window"),
			localize('onboarding.authPrototype.sessions.window.desc', "A dedicated space to start agents, watch them work side by side, and review their changes before you keep them."));

		this._createFeatureCard(grid, Codicon.arrowSwap,
			localize('onboarding.authPrototype.sessions.models', "Switch Models Freely"),
			connected.length > 1
				? localize('onboarding.authPrototype.sessions.models.desc.multi', "Your {0} providers are all in the model picker. Each harness runs the models it supports.", connected.length)
				: localize('onboarding.authPrototype.sessions.models.desc', "Add another provider anytime. Each harness runs the models it supports."));

		this._createFeatureCard(grid, Codicon.rocket,
			localize('onboarding.authPrototype.sessions.anywhere', "Run Agents Anywhere"),
			localize('onboarding.authPrototype.sessions.anywhere.desc', "Work with an agent locally, hand long tasks to the background, or send them to the cloud to come back as a pull request."));

		this._createFeatureCard(grid, Codicon.settingsGear,
			localize('onboarding.authPrototype.sessions.customize', "Make Them Yours"),
			localize('onboarding.authPrototype.sessions.customize.desc', "Custom instructions, skills, reusable prompts, and MCP servers shape how every agent works on your project."));

		const docsRow = append(wrapper, $('.onboarding-a-sessions-docs'));
		this._createDocLink(docsRow, localize('onboarding.sessions.agentsTutorial', "Agents tutorial"), 'https://code.visualstudio.com/docs/agents/agents-tutorial?referrer=in-product', 'agentsTutorial');
	}

	private _createFeatureCard(parent: HTMLElement, icon: ThemeIcon, title: string, description?: string): HTMLElement {
		const card = append(parent, $('div.onboarding-a-feature-card'));
		const iconCol = append(card, $('div.onboarding-a-feature-icon'));
		iconCol.appendChild(renderIcon(icon));
		const textCol = append(card, $('div.onboarding-a-feature-text'));
		const titleEl = append(textCol, $('div.onboarding-a-feature-title'));
		titleEl.textContent = title;
		const descEl = append(textCol, $('div.onboarding-a-feature-desc'));
		if (description) {
			descEl.textContent = description;
		}
		return descEl;
	}

	private _createKbd(label: string): HTMLElement {
		const kbd = $('kbd.onboarding-a-kbd');
		kbd.textContent = label;
		return kbd;
	}

	private _createDocLink(parent: HTMLElement, label: string, href: string, linkId?: string): void {
		const link = this._registerStepFocusable(append(parent, $<HTMLAnchorElement>('a.onboarding-a-doc-link')));
		link.textContent = label;
		link.href = href;
		link.target = '_blank';
		link.rel = 'noopener';
		link.prepend(renderIcon(Codicon.linkExternal));
		if (linkId) {
			this.stepDisposables.add(addDisposableListener(link, EventType.CLICK, () => {
				this._logAction('docLinkClick', undefined, linkId);
			}));
		}
	}

	private _createInlineLink(parent: HTMLElement, label: string, href: string): HTMLAnchorElement {
		const link = this._registerStepFocusable(append(parent, $<HTMLAnchorElement>('a.onboarding-a-inline-link')));
		link.textContent = label;
		link.href = href;
		link.target = '_blank';
		link.rel = 'noopener';
		return link;
	}

	// =====================================================================
	// Radio-group keyboard navigation (roving tabindex)
	// =====================================================================

	/**
	 * Sets up WAI-ARIA radio-group keyboard navigation on a set of elements:
	 * - Arrow keys move focus between items (with wrap-around)
	 * - Only the focused item has tabindex=0; the rest have tabindex=-1
	 * - Space/Enter on a focused item fires its click handler
	 */
	private _setupRadioGroupNavigation(items: HTMLElement[], selectedIndex: number): void {
		// Initialise roving tabindex: only the selected item is tab-reachable
		for (let i = 0; i < items.length; i++) {
			items[i].setAttribute('tabindex', i === selectedIndex ? '0' : '-1');
		}

		for (let i = 0; i < items.length; i++) {
			this.stepDisposables.add(addDisposableListener(items[i], EventType.KEY_DOWN, (e: KeyboardEvent) => {
				const event = new StandardKeyboardEvent(e);
				let newIndex: number | undefined;

				if (event.keyCode === KeyCode.RightArrow || event.keyCode === KeyCode.DownArrow) {
					newIndex = (i + 1) % items.length;
				} else if (event.keyCode === KeyCode.LeftArrow || event.keyCode === KeyCode.UpArrow) {
					newIndex = (i - 1 + items.length) % items.length;
				} else if (event.keyCode === KeyCode.Home) {
					newIndex = 0;
				} else if (event.keyCode === KeyCode.End) {
					newIndex = items.length - 1;
				}

				if (newIndex !== undefined) {
					e.preventDefault();
					e.stopPropagation();
					items[i].setAttribute('tabindex', '-1');
					items[newIndex].setAttribute('tabindex', '0');
					items[newIndex].focus();
					items[newIndex].click();
				}
			}));
		}
	}

	// =====================================================================
	// Focus trap
	// =====================================================================

	private _trapTab(e: KeyboardEvent, shiftKey: boolean): void {
		if (!this.overlay) {
			return;
		}

		const allFocusable = this._getFocusableElements();

		if (allFocusable.length === 0) {
			e.preventDefault();
			return;
		}

		const first = allFocusable[0];
		const last = allFocusable[allFocusable.length - 1];

		if (shiftKey && getActiveWindow().document.activeElement === first) {
			e.preventDefault();
			last.focus();
		} else if (!shiftKey && getActiveWindow().document.activeElement === last) {
			e.preventDefault();
			first.focus();
		}
	}

	private _getFocusableElements(): HTMLElement[] {
		return [...(this.closeButton ? [this.closeButton] : []), ...this.stepFocusableElements, ...this.footerFocusableElements].filter(element => this._isTabbable(element));
	}

	private _focusCurrentStepElement(): void {
		const tabbable = this.stepFocusableElements.filter(element => this._isTabbable(element));
		// Secondary affordances (help, switch account) stay tabbable but should
		// never steal the initial focus from the step's primary control.
		const stepFocusable = tabbable.find(element => element.dataset.secondaryFocus !== 'true') ?? tabbable[0];
		(stepFocusable ?? this.nextButton ?? this.closeButton)?.focus();
	}

	private _registerStepFocusable<T extends HTMLElement>(element: T, options?: { secondary?: boolean }): T {
		if (options?.secondary) {
			element.dataset.secondaryFocus = 'true';
		}
		this.stepFocusableElements.push(element);
		return element;
	}

	private _isTabbable(element: HTMLElement): boolean {
		if (!element.isConnected || element.getAttribute('aria-hidden') === 'true' || element.tabIndex === -1 || element.hasAttribute('disabled')) {
			return false;
		}

		const computedStyle = getActiveWindow().getComputedStyle(element);
		return computedStyle.display !== 'none' && computedStyle.visibility !== 'hidden';
	}

	// =====================================================================
	// Telemetry
	// =====================================================================

	private _logStepView(): void {
		const stepId = this.steps[this.currentStepIndex];
		this.telemetryService.publicLog2<OnboardingStepViewEvent, OnboardingStepViewClassification>('welcomeOnboarding.stepView', {
			step: stepId,
			stepNumber: this.currentStepIndex + 1,
		});
	}

	private _logAction(action: string, stepOverride?: OnboardingStepId, argument?: string): void {
		this.telemetryService.publicLog2<OnboardingActionEvent, OnboardingActionClassification>('welcomeOnboarding.actionExecuted', {
			action,
			step: stepOverride ?? this.steps[this.currentStepIndex],
			argument: argument ?? undefined,
		});
	}

	// =====================================================================
	// Cleanup
	// =====================================================================

	private _removeFromDOM(): void {
		if (this.overlay) {
			this.overlay.remove();
			this.overlay = undefined;
		}

		this.card = undefined;
		this.bodyEl = undefined;
		this.progressContainer = undefined;
		this.stepLabelEl = undefined;
		this.titleEl = undefined;
		this.subtitleEl = undefined;
		this.contentEl = undefined;
		this.backButton = undefined;
		this.nextButton = undefined;
		this.closeButton = undefined;
		this.footerLeft = undefined;
		this._footerSignInBtn = undefined;
		this.footerFocusableElements.length = 0;
		this.stepFocusableElements.length = 0;
		this.enterpriseSignInUiState = 'options';
		this.enterpriseInstanceValue = '';
		this.enterpriseSignInWatch = undefined;
		this._isShowing = false;
		this.disposables.clear();
		this.stepDisposables.clear();

		if (this.previouslyFocusedElement) {
			this.previouslyFocusedElement.focus();
			this.previouslyFocusedElement = undefined;
		}

		this.currentStepIndex = 0;
	}

	override dispose(): void {
		this._removeFromDOM();
		super.dispose();
	}
}
