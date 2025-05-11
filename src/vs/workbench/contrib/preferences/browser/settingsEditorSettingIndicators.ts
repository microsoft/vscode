/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../base/browser/keyboardEvent.js';
import { HoverPosition } from '../../../../base/browser/ui/hover/hoverWidget.js';
import { SimpleIconLabel } from '../../../../base/browser/ui/iconLabel/simpleIconLabel.js';
import { RunOnceScheduler } from '../../../../base/common/async.js';
import { Emitter } from '../../../../base/common/event.js';
import { IMarkdownString, MarkdownString } from '../../../../base/common/htmlContent.js';
import { KeyCode } from '../../../../base/common/keyCodes.js';
import { IDisposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { ILanguageService } from '../../../../editor/common/languages/language.js';
import { localize } from '../../../../nls.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { ConfigurationTarget } from '../../../../platform/configuration/common/configuration.js';
import { IUserDataProfilesService } from '../../../../platform/userDataProfile/common/userDataProfile.js';
import { IUserDataSyncEnablementService } from '../../../../platform/userDataSync/common/userDataSync.js';
import { SettingsTreeSettingElement } from './settingsTreeModels.js';
import { EXPERIMENTAL_INDICATOR_DESCRIPTION, POLICY_SETTING_TAG, PREVIEW_INDICATOR_DESCRIPTION } from '../common/preferences.js';
import { IWorkbenchConfigurationService } from '../../../services/configuration/common/configuration.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import type { IHoverOptions, IHoverWidget } from '../../../../base/browser/ui/hover/hover.js';

const $ = DOM.$;

type ScopeString = 'workspace' | 'user' | 'remote' | 'default';

export interface ISettingOverrideClickEvent {
	scope: ScopeString;
	language: string;
	settingKey: string;
}

interface SettingIndicator {
	element: HTMLElement;
	/**
	 * The element to focus on when navigating with keyboard.
	 * When undefined, use {@link element} instead.
	 */
	focusElement?: HTMLElement;
	label: SimpleIconLabel;
	disposables: DisposableStore;
}

/**
 * Contains a set of the sync-ignored settings
 * to keep the sync ignored indicator and the getIndicatorsLabelAriaLabel() function in sync.
 * SettingsTreeIndicatorsLabel#updateSyncIgnored provides the source of truth.
 */
let cachedSyncIgnoredSettingsSet: Set<string> = new Set<string>();

/**
 * Contains a copy of the sync-ignored settings to determine when to update
 * cachedSyncIgnoredSettingsSet.
 */
let cachedSyncIgnoredSettings: string[] = [];

/**
 * Renders the indicators next to a setting, such as "Also Modified In".
 */
export class SettingsTreeIndicatorsLabel implements IDisposable {
	private readonly indicatorsContainerElement: HTMLElement;

	private readonly previewIndicator: SettingIndicator;
	private readonly workspaceTrustIndicator: SettingIndicator;
	private readonly scopeOverridesIndicator: SettingIndicator;
	private readonly syncIgnoredIndicator: SettingIndicator;
	private readonly defaultOverrideIndicator: SettingIndicator;

	/** Indicators that each have their own square container at the top-right of the setting */
	private readonly isolatedIndicators: SettingIndicator[] = [];
	/** Indicators that end up wrapped in a parenthesis at the top-right of the setting */
	private readonly parenthesizedIndicators: SettingIndicator[];

	private readonly keybindingListeners: DisposableStore = new DisposableStore();
	private focusedIndex = 0;

	constructor(
		container: HTMLElement,
		@IWorkbenchConfigurationService private readonly configurationService: IWorkbenchConfigurationService,
		@IHoverService private readonly hoverService: IHoverService,
		@IUserDataSyncEnablementService private readonly userDataSyncEnablementService: IUserDataSyncEnablementService,
		@ILanguageService private readonly languageService: ILanguageService,
		@ICommandService private readonly commandService: ICommandService) {
		this.indicatorsContainerElement = DOM.append(container, $('.setting-indicators-container'));
		this.indicatorsContainerElement.style.display = 'inline';

		this.previewIndicator = this.createPreviewIndicator();
		this.isolatedIndicators = [this.previewIndicator];

		this.workspaceTrustIndicator = this.createWorkspaceTrustIndicator();
		this.scopeOverridesIndicator = this.createScopeOverridesIndicator();
		this.syncIgnoredIndicator = this.createSyncIgnoredIndicator();
		this.defaultOverrideIndicator = this.createDefaultOverrideIndicator();
		this.parenthesizedIndicators = [this.workspaceTrustIndicator, this.scopeOverridesIndicator, this.syncIgnoredIndicator, this.defaultOverrideIndicator];
	}

	private defaultHoverOptions: Partial<IHoverOptions> = {
		trapFocus: true,
		position: {
			hoverPosition: HoverPosition.BELOW,
		},
		appearance: {
			showPointer: true,
			compact: false,
		}
	};

	private addHoverDisposables(disposables: DisposableStore, element: HTMLElement, showHover: (focus: boolean) => IHoverWidget | undefined) {
		disposables.clear();
		const scheduler: RunOnceScheduler = disposables.add(new RunOnceScheduler(() => {
			const hover = showHover(false);
			if (hover) {
				disposables.add(hover);
			}
		}, this.configurationService.getValue<number>('workbench.hover.delay')));
		disposables.add(DOM.addDisposableListener(element, DOM.EventType.MOUSE_OVER, () => {
			if (!scheduler.isScheduled()) {
				scheduler.schedule();
			}
		}));
		disposables.add(DOM.addDisposableListener(element, DOM.EventType.MOUSE_LEAVE, () => {
			scheduler.cancel();
		}));
		disposables.add(DOM.addDisposableListener(element, DOM.EventType.KEY_DOWN, (e) => {
			const evt = new StandardKeyboardEvent(e);
			if (evt.equals(KeyCode.Space) || evt.equals(KeyCode.Enter)) {
				const hover = showHover(true);
				if (hover) {
					disposables.add(hover);
				}
				e.preventDefault();
			}
		}));
	}

	private createWorkspaceTrustIndicator(): SettingIndicator {
		const disposables = new DisposableStore();
		const workspaceTrustElement = $('span.setting-indicator.setting-item-workspace-trust');
		const workspaceTrustLabel = disposables.add(new SimpleIconLabel(workspaceTrustElement));
		workspaceTrustLabel.text = '$(shield) ' + localize('workspaceUntrustedLabel', "Requires workspace trust");

		const content = localize('trustLabel', "The setting value can only be applied in a trusted workspace.");
		const showHover = (focus: boolean) => {
			return this.hoverService.showInstantHover({
				...this.defaultHoverOptions,
				content,
				target: workspaceTrustElement,
				actions: [{
					label: localize('manageWorkspaceTrust', "Manage Workspace Trust"),
					commandId: 'workbench.trust.manage',
					run: (target: HTMLElement) => {
						this.commandService.executeCommand('workbench.trust.manage');
					}
				}],
			}, focus);
		};
		this.addHoverDisposables(disposables, workspaceTrustElement, showHover);
		return {
			element: workspaceTrustElement,
			label: workspaceTrustLabel,
			disposables
		};
	}

	private createScopeOverridesIndicator(): SettingIndicator {
		const disposables = new DisposableStore();
		// Don't add .setting-indicator class here, because it gets conditionally added later.
		const otherOverridesElement = $('span.setting-item-overrides');
		const otherOverridesLabel = disposables.add(new SimpleIconLabel(otherOverridesElement));
		return {
			element: otherOverridesElement,
			label: otherOverridesLabel,
			disposables
		};
	}

	private createSyncIgnoredIndicator(): SettingIndicator {
		const disposables = new DisposableStore();
		const syncIgnoredElement = $('span.setting-indicator.setting-item-ignored');
		const syncIgnoredLabel = disposables.add(new SimpleIconLabel(syncIgnoredElement));
		syncIgnoredLabel.text = localize('extensionSyncIgnoredLabel', 'Not synced');

		const syncIgnoredHoverContent = localize('syncIgnoredTitle', "This setting is ignored during sync");
		const showHover = (focus: boolean) => {
			return this.hoverService.showInstantHover({
				...this.defaultHoverOptions,
				content: syncIgnoredHoverContent,
				target: syncIgnoredElement
			}, focus);
		};
		this.addHoverDisposables(disposables, syncIgnoredElement, showHover);

		return {
			element: syncIgnoredElement,
			label: syncIgnoredLabel,
			disposables
		};
	}

	private createDefaultOverrideIndicator(): SettingIndicator {
		const disposables = new DisposableStore();
		const defaultOverrideIndicator = $('span.setting-indicator.setting-item-default-overridden');
		const defaultOverrideLabel = disposables.add(new SimpleIconLabel(defaultOverrideIndicator));
		defaultOverrideLabel.text = localize('defaultOverriddenLabel', "Default value changed");

		return {
			element: defaultOverrideIndicator,
			label: defaultOverrideLabel,
			disposables
		};
	}

	private createPreviewIndicator(): SettingIndicator {
		const disposables = new DisposableStore();
		const previewIndicator = $('span.setting-indicator.setting-item-preview');
		const previewLabel = disposables.add(new SimpleIconLabel(previewIndicator));

		return {
			element: previewIndicator,
			label: previewLabel,
			disposables
		};
	}

	private render() {
		this.indicatorsContainerElement.innerText = '';
		this.indicatorsContainerElement.style.display = 'none';

		const isolatedIndicatorsToShow = this.isolatedIndicators.filter(indicator => {
			return indicator.element.style.display !== 'none';
		});
		if (isolatedIndicatorsToShow.length) {
			this.indicatorsContainerElement.style.display = 'inline';
			for (let i = 0; i < isolatedIndicatorsToShow.length; i++) {
				DOM.append(this.indicatorsContainerElement, isolatedIndicatorsToShow[i].element);
			}
		}

		const parenthesizedIndicatorsToShow = this.parenthesizedIndicators.filter(indicator => {
			return indicator.element.style.display !== 'none';
		});
		if (parenthesizedIndicatorsToShow.length) {
			this.indicatorsContainerElement.style.display = 'inline';
			DOM.append(this.indicatorsContainerElement, $('span', undefined, '('));
			for (let i = 0; i < parenthesizedIndicatorsToShow.length - 1; i++) {
				DOM.append(this.indicatorsContainerElement, parenthesizedIndicatorsToShow[i].element);
				DOM.append(this.indicatorsContainerElement, $('span.comma', undefined, ' • '));
			}
			DOM.append(this.indicatorsContainerElement, parenthesizedIndicatorsToShow[parenthesizedIndicatorsToShow.length - 1].element);
			DOM.append(this.indicatorsContainerElement, $('span', undefined, ')'));
		}
		this.resetIndicatorNavigationKeyBindings([...isolatedIndicatorsToShow, ...parenthesizedIndicatorsToShow]);
	}

	private resetIndicatorNavigationKeyBindings(indicators: SettingIndicator[]) {
		this.keybindingListeners.clear();
		this.indicatorsContainerElement.role = indicators.length >= 1 ? 'toolbar' : 'button';
		if (!indicators.length) {
			return;
		}
		const firstElement = indicators[0].focusElement ?? indicators[0].element;
		firstElement.tabIndex = 0;
		this.keybindingListeners.add(DOM.addDisposableListener(this.indicatorsContainerElement, 'keydown', (e) => {
			const ev = new StandardKeyboardEvent(e);
			let handled = true;
			if (ev.equals(KeyCode.Home)) {
				this.focusIndicatorAt(indicators, 0);
			} else if (ev.equals(KeyCode.End)) {
				this.focusIndicatorAt(indicators, indicators.length - 1);
			} else if (ev.equals(KeyCode.RightArrow)) {
				const indexToFocus = (this.focusedIndex + 1) % indicators.length;
				this.focusIndicatorAt(indicators, indexToFocus);
			} else if (ev.equals(KeyCode.LeftArrow)) {
				const indexToFocus = this.focusedIndex ? this.focusedIndex - 1 : indicators.length - 1;
				this.focusIndicatorAt(indicators, indexToFocus);
			} else {
				handled = false;
			}

			if (handled) {
				e.preventDefault();
				e.stopPropagation();
			}
		}));
	}

	private focusIndicatorAt(indicators: SettingIndicator[], index: number) {
		if (index === this.focusedIndex) {
			return;
		}
		const indicator = indicators[index];
		const elementToFocus = indicator.focusElement ?? indicator.element;
		elementToFocus.tabIndex = 0;
		elementToFocus.focus();

		const currentlyFocusedIndicator = indicators[this.focusedIndex];
		const previousFocusedElement = currentlyFocusedIndicator.focusElement ?? currentlyFocusedIndicator.element;
		previousFocusedElement.tabIndex = -1;

		this.focusedIndex = index;
	}

	updateWorkspaceTrust(element: SettingsTreeSettingElement) {
		this.workspaceTrustIndicator.element.style.display = element.isUntrusted ? 'inline' : 'none';
		this.render();
	}

	updateSyncIgnored(element: SettingsTreeSettingElement, ignoredSettings: string[]) {
		this.syncIgnoredIndicator.element.style.display = this.userDataSyncEnablementService.isEnabled()
			&& ignoredSettings.includes(element.setting.key) ? 'inline' : 'none';
		this.render();
		if (cachedSyncIgnoredSettings !== ignoredSettings) {
			cachedSyncIgnoredSettings = ignoredSettings;
			cachedSyncIgnoredSettingsSet = new Set<string>(cachedSyncIgnoredSettings);
		}
	}

	updatePreviewIndicator(element: SettingsTreeSettingElement) {
		const isPreviewSetting = element.tags?.has('preview');
		const isExperimentalSetting = element.tags?.has('experimental');
		this.previewIndicator.element.style.display = (isPreviewSetting || isExperimentalSetting) ? 'inline' : 'none';
		this.previewIndicator.label.text = isPreviewSetting ?
			localize('previewLabel', "Preview") :
			localize('experimentalLabel', "Experimental");

		const content = isPreviewSetting ? PREVIEW_INDICATOR_DESCRIPTION : EXPERIMENTAL_INDICATOR_DESCRIPTION;
		const showHover = (focus: boolean) => {
			return this.hoverService.showInstantHover({
				...this.defaultHoverOptions,
				content,
				target: this.previewIndicator.element
			}, focus);
		};
		this.addHoverDisposables(this.previewIndicator.disposables, this.previewIndicator.element, showHover);

		this.render();
	}

	private getInlineScopeDisplayText(completeScope: string): string {
		const [scope, language] = completeScope.split(':');
		const localizedScope = scope === 'user' ?
			localize('user', "User") : scope === 'workspace' ?
				localize('workspace', "Workspace") : localize('remote', "Remote");
		if (language) {
			return `${this.languageService.getLanguageName(language)} > ${localizedScope}`;
		}
		return localizedScope;
	}

	dispose() {
		this.keybindingListeners.dispose();
		for (const indicator of this.isolatedIndicators) {
			indicator.disposables.dispose();
		}
		for (const indicator of this.parenthesizedIndicators) {
			indicator.disposables.dispose();
		}
	}

	updateScopeOverrides(element: SettingsTreeSettingElement, onDidClickOverrideElement: Emitter<ISettingOverrideClickEvent>, onApplyFilter: Emitter<string>) {
		this.scopeOverridesIndicator.disposables.clear();
		this.scopeOverridesIndicator.element.innerText = '';
		this.scopeOverridesIndicator.element.style.display = 'none';
		this.scopeOverridesIndicator.focusElement = this.scopeOverridesIndicator.element;
		if (element.hasPolicyValue) {
			// If the setting falls under a policy, then no matter what the user sets, the policy value takes effect.
			this.scopeOverridesIndicator.element.style.display = 'inline';
			this.scopeOverridesIndicator.element.classList.add('setting-indicator');

			this.scopeOverridesIndicator.label.text = '$(briefcase) ' + localize('policyLabelText', "Managed by organization");
			const content = localize('policyDescription', "This setting is managed by your organization and its actual value cannot be changed.");
			const showHover = (focus: boolean) => {
				return this.hoverService.showInstantHover({
					...this.defaultHoverOptions,
					content,
					actions: [{
						label: localize('policyFilterLink', "View policy settings"),
						commandId: '_settings.action.viewPolicySettings',
						run: (_) => {
							onApplyFilter.fire(`@${POLICY_SETTING_TAG}`);
						}
					}],
					target: this.scopeOverridesIndicator.element
				}, focus);
			};
			this.addHoverDisposables(this.scopeOverridesIndicator.disposables, this.scopeOverridesIndicator.element, showHover);
		} else if (element.settingsTarget === ConfigurationTarget.USER_LOCAL && this.configurationService.isSettingAppliedForAllProfiles(element.setting.key)) {
			this.scopeOverridesIndicator.element.style.display = 'inline';
			this.scopeOverridesIndicator.element.classList.add('setting-indicator');

			this.scopeOverridesIndicator.label.text = localize('applicationSetting', "Applies to all profiles");

			const content = localize('applicationSettingDescription', "The setting is not specific to the current profile, and will retain its value when switching profiles.");
			const showHover = (focus: boolean) => {
				return this.hoverService.showInstantHover({
					...this.defaultHoverOptions,
					content,
					target: this.scopeOverridesIndicator.element
				}, focus);
			};
			this.addHoverDisposables(this.scopeOverridesIndicator.disposables, this.scopeOverridesIndicator.element, showHover);
		} else if (element.overriddenScopeList.length || element.overriddenDefaultsLanguageList.length) {
			if (element.overriddenScopeList.length === 1 && !element.overriddenDefaultsLanguageList.length) {
				// We can inline the override and show all the text in the label
				// so that users don't have to wait for the hover to load
				// just to click into the one override there is.
				this.scopeOverridesIndicator.element.style.display = 'inline';
				this.scopeOverridesIndicator.element.classList.remove('setting-indicator');

				const prefaceText = element.isConfigured ?
					localize('alsoConfiguredIn', "Also modified in") :
					localize('configuredIn', "Modified in");
				this.scopeOverridesIndicator.label.text = `${prefaceText} `;

				const overriddenScope = element.overriddenScopeList[0];
				const view = DOM.append(this.scopeOverridesIndicator.element, $('a.modified-scope', undefined, this.getInlineScopeDisplayText(overriddenScope)));
				view.tabIndex = -1;
				this.scopeOverridesIndicator.focusElement = view;
				const onClickOrKeydown = (e: UIEvent) => {
					const [scope, language] = overriddenScope.split(':');
					onDidClickOverrideElement.fire({
						settingKey: element.setting.key,
						scope: scope as ScopeString,
						language
					});
					e.preventDefault();
					e.stopPropagation();
				};
				this.scopeOverridesIndicator.disposables.add(DOM.addDisposableListener(view, DOM.EventType.CLICK, (e) => {
					onClickOrKeydown(e);
				}));
				this.scopeOverridesIndicator.disposables.add(DOM.addDisposableListener(view, DOM.EventType.KEY_DOWN, (e) => {
					const ev = new StandardKeyboardEvent(e);
					if (ev.equals(KeyCode.Space) || ev.equals(KeyCode.Enter)) {
						onClickOrKeydown(e);
					}
				}));
			} else {
				this.scopeOverridesIndicator.element.style.display = 'inline';
				this.scopeOverridesIndicator.element.classList.add('setting-indicator');
				const scopeOverridesLabelText = element.isConfigured ?
					localize('alsoConfiguredElsewhere', "Also modified elsewhere") :
					localize('configuredElsewhere', "Modified elsewhere");
				this.scopeOverridesIndicator.label.text = scopeOverridesLabelText;

				let contentMarkdownString = '';
				if (element.overriddenScopeList.length) {
					const prefaceText = element.isConfigured ?
						localize('alsoModifiedInScopes', "The setting has also been modified in the following scopes:") :
						localize('modifiedInScopes', "The setting has been modified in the following scopes:");
					contentMarkdownString = prefaceText;
					for (const scope of element.overriddenScopeList) {
						const scopeDisplayText = this.getInlineScopeDisplayText(scope);
						contentMarkdownString += `\n- [${scopeDisplayText}](${encodeURIComponent(scope)} "${getAccessibleScopeDisplayText(scope, this.languageService)}")`;
					}
				}
				if (element.overriddenDefaultsLanguageList.length) {
					if (contentMarkdownString) {
						contentMarkdownString += `\n\n`;
					}
					const prefaceText = localize('hasDefaultOverridesForLanguages', "The following languages have default overrides:");
					contentMarkdownString += prefaceText;
					for (const language of element.overriddenDefaultsLanguageList) {
						const scopeDisplayText = this.languageService.getLanguageName(language);
						contentMarkdownString += `\n- [${scopeDisplayText}](${encodeURIComponent(`default:${language}`)} "${scopeDisplayText}")`;
					}
				}
				const content: IMarkdownString = {
					value: contentMarkdownString,
					isTrusted: false,
					supportHtml: false
				};
				this.scopeOverridesIndicator.disposables.add(this.hoverService.setupDelayedHover(this.scopeOverridesIndicator.element, () => ({
					...this.defaultHoverOptions,
					content,
					linkHandler: (url: string) => {
						const [scope, language] = decodeURIComponent(url).split(':');
						onDidClickOverrideElement.fire({
							settingKey: element.setting.key,
							scope: scope as ScopeString,
							language
						});
					}
				}), { setupKeyboardEvents: true }));
			}
		}
		this.render();
	}

	updateDefaultOverrideIndicator(element: SettingsTreeSettingElement) {
		this.defaultOverrideIndicator.element.style.display = 'none';
		let sourceToDisplay = getDefaultValueSourceToDisplay(element);
		if (sourceToDisplay !== undefined) {
			this.defaultOverrideIndicator.element.style.display = 'inline';
			this.defaultOverrideIndicator.disposables.clear();

			// Show source of default value when hovered
			if (Array.isArray(sourceToDisplay) && sourceToDisplay.length === 1) {
				sourceToDisplay = sourceToDisplay[0];
			}

			let defaultOverrideHoverContent;
			if (!Array.isArray(sourceToDisplay)) {
				defaultOverrideHoverContent = localize('defaultOverriddenDetails', "Default setting value overridden by `{0}`", sourceToDisplay);
			} else {
				sourceToDisplay = sourceToDisplay.map(source => `\`${source}\``);
				defaultOverrideHoverContent = localize('multipledefaultOverriddenDetails', "A default values has been set by {0}", sourceToDisplay.slice(0, -1).join(', ') + ' & ' + sourceToDisplay.slice(-1));
			}

			const showHover = (focus: boolean) => {
				return this.hoverService.showInstantHover({
					content: new MarkdownString().appendMarkdown(defaultOverrideHoverContent),
					target: this.defaultOverrideIndicator.element,
					position: {
						hoverPosition: HoverPosition.BELOW,
					},
					appearance: {
						showPointer: true,
						compact: false
					}
				}, focus);
			};
			this.addHoverDisposables(this.defaultOverrideIndicator.disposables, this.defaultOverrideIndicator.element, showHover);
		}
		this.render();
	}
}

function getDefaultValueSourceToDisplay(element: SettingsTreeSettingElement): string | undefined | string[] {
	let sourceToDisplay: string | undefined | string[];
	const defaultValueSource = element.defaultValueSource;
	if (defaultValueSource) {
		if (defaultValueSource instanceof Map) {
			sourceToDisplay = [];
			for (const [, value] of defaultValueSource) {
				const newValue = typeof value !== 'string' ? value.displayName ?? value.id : value;
				if (!sourceToDisplay.includes(newValue)) {
					sourceToDisplay.push(newValue);
				}
			}
		} else if (typeof defaultValueSource === 'string') {
			sourceToDisplay = defaultValueSource;
		} else {
			sourceToDisplay = defaultValueSource.displayName ?? defaultValueSource.id;
		}
	}
	return sourceToDisplay;
}

function getAccessibleScopeDisplayText(completeScope: string, languageService: ILanguageService): string {
	const [scope, language] = completeScope.split(':');
	const localizedScope = scope === 'user' ?
		localize('user', "User") : scope === 'workspace' ?
			localize('workspace', "Workspace") : localize('remote', "Remote");
	if (language) {
		return localize('modifiedInScopeForLanguage', "The {0} scope for {1}", localizedScope, languageService.getLanguageName(language));
	}
	return localizedScope;
}

function getAccessibleScopeDisplayMidSentenceText(completeScope: string, languageService: ILanguageService): string {
	const [scope, language] = completeScope.split(':');
	const localizedScope = scope === 'user' ?
		localize('user', "User") : scope === 'workspace' ?
			localize('workspace', "Workspace") : localize('remote', "Remote");
	if (language) {
		return localize('modifiedInScopeForLanguageMidSentence', "the {0} scope for {1}", localizedScope.toLowerCase(), languageService.getLanguageName(language));
	}
	return localizedScope;
}

export function getIndicatorsLabelAriaLabel(element: SettingsTreeSettingElement, configurationService: IWorkbenchConfigurationService, userDataProfilesService: IUserDataProfilesService, languageService: ILanguageService): string {
	const ariaLabelSections: string[] = [];

	// Add preview or experimental indicator text
	if (element.tags?.has('preview')) {
		ariaLabelSections.push(localize('previewLabel', "Preview"));
	} else if (element.tags?.has('experimental')) {
		ariaLabelSections.push(localize('experimentalLabel', "Experimental"));
	}

	// Add workspace trust text
	if (element.isUntrusted) {
		ariaLabelSections.push(localize('workspaceUntrustedAriaLabel', "Workspace untrusted; setting value not applied"));
	}

	if (element.hasPolicyValue) {
		ariaLabelSections.push(localize('policyDescriptionAccessible', "Managed by organization policy; setting value not applied"));
	} else if (element.settingsTarget === ConfigurationTarget.USER_LOCAL && configurationService.isSettingAppliedForAllProfiles(element.setting.key)) {
		ariaLabelSections.push(localize('applicationSettingDescriptionAccessible', "Setting value retained when switching profiles"));
	} else {
		// Add other overrides text
		const otherOverridesStart = element.isConfigured ?
			localize('alsoConfiguredIn', "Also modified in") :
			localize('configuredIn', "Modified in");
		const otherOverridesList = element.overriddenScopeList
			.map(scope => getAccessibleScopeDisplayMidSentenceText(scope, languageService)).join(', ');
		if (element.overriddenScopeList.length) {
			ariaLabelSections.push(`${otherOverridesStart} ${otherOverridesList}`);
		}
	}

	// Add sync ignored text
	if (cachedSyncIgnoredSettingsSet.has(element.setting.key)) {
		ariaLabelSections.push(localize('syncIgnoredAriaLabel', "Setting ignored during sync"));
	}

	// Add default override indicator text
	let sourceToDisplay = getDefaultValueSourceToDisplay(element);
	if (sourceToDisplay !== undefined) {
		if (Array.isArray(sourceToDisplay) && sourceToDisplay.length === 1) {
			sourceToDisplay = sourceToDisplay[0];
		}

		let overriddenDetailsText;
		if (!Array.isArray(sourceToDisplay)) {
			overriddenDetailsText = localize('defaultOverriddenDetailsAriaLabel', "{0} overrides the default value", sourceToDisplay);
		} else {
			overriddenDetailsText = localize('multipleDefaultOverriddenDetailsAriaLabel', "{0} override the default value", sourceToDisplay.slice(0, -1).join(', ') + ' & ' + sourceToDisplay.slice(-1));
		}
		ariaLabelSections.push(overriddenDetailsText);
	}

	// Add text about default values being overridden in other languages
	const otherLanguageOverridesList = element.overriddenDefaultsLanguageList
		.map(language => languageService.getLanguageName(language)).join(', ');
	if (element.overriddenDefaultsLanguageList.length) {
		const otherLanguageOverridesText = localize('defaultOverriddenLanguagesList', "Language-specific default values exist for {0}", otherLanguageOverridesList);
		ariaLabelSections.push(otherLanguageOverridesText);
	}

	const ariaLabel = ariaLabelSections.join('. ');
	return ariaLabel;
}
