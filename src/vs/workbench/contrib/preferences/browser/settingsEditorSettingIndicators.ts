/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from 'vs/base/browser/dom';
import { IMouseEvent } from 'vs/base/browser/mouseEvent';
import { IHoverDelegate, IHoverDelegateOptions } from 'vs/base/browser/ui/iconLabel/iconHoverDelegate';
import { ICustomHover, ITooltipMarkdownString, IUpdatableHoverOptions, setupCustomHover } from 'vs/base/browser/ui/iconLabel/iconLabelHover';
import { SimpleIconLabel } from 'vs/base/browser/ui/iconLabel/simpleIconLabel';
import { Emitter } from 'vs/base/common/event';
import { IDisposable, DisposableStore, MutableDisposable } from 'vs/base/common/lifecycle';
import { ILanguageService } from 'vs/editor/common/languages/language';
import { localize } from 'vs/nls';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { ConfigurationTarget, IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IUserDataProfilesService } from 'vs/platform/userDataProfile/common/userDataProfile';
import { getIgnoredSettings } from 'vs/platform/userDataSync/common/settingsMerge';
import { getDefaultIgnoredSettings, IUserDataSyncEnablementService } from 'vs/platform/userDataSync/common/userDataSync';
import { SettingsTreeSettingElement } from 'vs/workbench/contrib/preferences/browser/settingsTreeModels';
import { MODIFIED_INDICATOR_USE_INLINE_ONLY, POLICY_SETTING_TAG } from 'vs/workbench/contrib/preferences/common/preferences';
import { IHoverService } from 'vs/workbench/services/hover/browser/hover';

const $ = DOM.$;

type ScopeString = 'workspace' | 'user' | 'remote';

export interface ISettingOverrideClickEvent {
	scope: ScopeString;
	language: string;
	settingKey: string;
}

/**
 * Renders the indicators next to a setting, such as "Also Modified In".
 */
export class SettingsTreeIndicatorsLabel implements IDisposable {
	private indicatorsContainerElement: HTMLElement;
	private workspaceTrustElement: HTMLElement;
	private scopeOverridesElement: HTMLElement;
	private scopeOverridesLabel: SimpleIconLabel;
	private scopeOverridesHover: MutableDisposable<ICustomHover>;
	private syncIgnoredElement: HTMLElement;
	private defaultOverrideIndicatorElement: HTMLElement;
	private hoverDelegate: IHoverDelegate;
	private profilesEnabled: boolean;

	// Holds hovers that contain a fixed message.
	private simpleHoverStore: DisposableStore;

	constructor(
		container: HTMLElement,
		@IConfigurationService configurationService: IConfigurationService,
		@IHoverService hoverService: IHoverService,
		@IUserDataSyncEnablementService private readonly userDataSyncEnablementService: IUserDataSyncEnablementService,
		@ILanguageService private readonly languageService: ILanguageService,
		@IUserDataProfilesService private readonly userDataProfilesService: IUserDataProfilesService,
		@ICommandService private readonly commandService: ICommandService) {
		this.indicatorsContainerElement = DOM.append(container, $('.misc-label'));
		this.indicatorsContainerElement.style.display = 'inline';

		this.hoverDelegate = {
			showHover: (options: IHoverDelegateOptions, focus?: boolean) => {
				return hoverService.showHover(options, focus);
			},
			onDidHideHover: () => { },
			delay: configurationService.getValue<number>('workbench.hover.delay'),
			placement: 'element'
		};

		this.simpleHoverStore = new DisposableStore();
		const scopeOverridesIndicator = this.createScopeOverridesIndicator();
		this.workspaceTrustElement = this.createWorkspaceTrustElement();
		this.scopeOverridesElement = scopeOverridesIndicator.element;
		this.scopeOverridesLabel = scopeOverridesIndicator.label;
		this.syncIgnoredElement = this.createSyncIgnoredElement();
		this.defaultOverrideIndicatorElement = this.createDefaultOverrideIndicator();
		this.scopeOverridesHover = new MutableDisposable();
		this.profilesEnabled = this.userDataProfilesService.isEnabled();
	}

	private createWorkspaceTrustElement(): HTMLElement {
		const workspaceTrustElement = $('span.setting-item-workspace-trust');
		const workspaceTrustLabel = new SimpleIconLabel(workspaceTrustElement);
		workspaceTrustLabel.text = '$(warning) ' + localize('workspaceUntrustedLabel', "Setting value not effective");
		const contentFallback = localize('trustLabel', "The setting value can only be applied in a trusted workspace.");

		const contentMarkdownString = contentFallback + ` [${localize('manageWorkspaceTrust', "Manage Workspace Trust")}](manage-workspace-trust).`;
		const content: ITooltipMarkdownString = {
			markdown: {
				value: contentMarkdownString,
				isTrusted: false,
				supportHtml: false
			},
			markdownNotSupportedFallback: contentFallback
		};
		const options: IUpdatableHoverOptions = {
			linkHandler: (url: string) => {
				this.commandService.executeCommand('workbench.trust.manage');
				this.scopeOverridesHover.value?.hide();
			}
		};

		this.simpleHoverStore.add(setupCustomHover(this.hoverDelegate, workspaceTrustElement, content, options));
		return workspaceTrustElement;
	}

	private createScopeOverridesIndicator(): { element: HTMLElement; label: SimpleIconLabel } {
		const otherOverridesElement = $('span.setting-item-overrides');
		const otherOverridesLabel = new SimpleIconLabel(otherOverridesElement);
		return { element: otherOverridesElement, label: otherOverridesLabel };
	}

	private createSyncIgnoredElement(): HTMLElement {
		const syncIgnoredElement = $('span.setting-item-ignored');
		const syncIgnoredLabel = new SimpleIconLabel(syncIgnoredElement);
		syncIgnoredLabel.text = localize('extensionSyncIgnoredLabel', 'Not synced');
		const syncIgnoredHoverContent = localize('syncIgnoredTitle', "This setting is ignored during sync");
		this.simpleHoverStore.add(setupCustomHover(this.hoverDelegate, syncIgnoredElement, syncIgnoredHoverContent));
		return syncIgnoredElement;
	}

	private createDefaultOverrideIndicator(): HTMLElement {
		const defaultOverrideIndicator = $('span.setting-item-default-overridden');
		const defaultOverrideLabel = new SimpleIconLabel(defaultOverrideIndicator);
		defaultOverrideLabel.text = localize('defaultOverriddenLabel', "Default value changed");
		return defaultOverrideIndicator;
	}

	private render() {
		const elementsToShow = [this.workspaceTrustElement, this.scopeOverridesElement, this.syncIgnoredElement, this.defaultOverrideIndicatorElement].filter(element => {
			return element.style.display !== 'none';
		});

		this.indicatorsContainerElement.innerText = '';
		this.indicatorsContainerElement.style.display = 'none';
		if (elementsToShow.length) {
			this.indicatorsContainerElement.style.display = 'inline';
			DOM.append(this.indicatorsContainerElement, $('span', undefined, '('));
			for (let i = 0; i < elementsToShow.length - 1; i++) {
				DOM.append(this.indicatorsContainerElement, elementsToShow[i]);
				DOM.append(this.indicatorsContainerElement, $('span.comma', undefined, ' • '));
			}
			DOM.append(this.indicatorsContainerElement, elementsToShow[elementsToShow.length - 1]);
			DOM.append(this.indicatorsContainerElement, $('span', undefined, ')'));
		}
	}

	updateWorkspaceTrust(element: SettingsTreeSettingElement) {
		this.workspaceTrustElement.style.display = element.isUntrusted ? 'inline' : 'none';
		this.render();
	}

	updateSyncIgnored(element: SettingsTreeSettingElement, ignoredSettings: string[]) {
		this.syncIgnoredElement.style.display = this.userDataSyncEnablementService.isEnabled()
			&& ignoredSettings.includes(element.setting.key) ? 'inline' : 'none';
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
		this.scopeOverridesHover.dispose();
		this.simpleHoverStore.dispose();
	}

	updateScopeOverrides(element: SettingsTreeSettingElement, elementDisposables: DisposableStore, onDidClickOverrideElement: Emitter<ISettingOverrideClickEvent>, onApplyFilter: Emitter<string>) {
		this.scopeOverridesElement.innerText = '';
		this.scopeOverridesElement.style.display = 'none';
		if (element.hasPolicyValue) {
			// If the setting falls under a policy, then no matter what the user sets, the policy value takes effect.
			this.scopeOverridesElement.style.display = 'inline';
			this.scopeOverridesElement.classList.add('with-custom-hover');

			this.scopeOverridesLabel.text = '$(warning) ' + localize('policyLabelText', "Setting value not effective");
			const contentFallback = localize('policyDescription', "This setting is managed by your organization and its effective value cannot be changed.");
			const contentMarkdownString = contentFallback + ` [${localize('policyFilterLink', "View policy settings")}](policy-settings).`;
			const content: ITooltipMarkdownString = {
				markdown: {
					value: contentMarkdownString,
					isTrusted: false,
					supportHtml: false
				},
				markdownNotSupportedFallback: contentFallback
			};
			const options: IUpdatableHoverOptions = {
				linkHandler: (url: string) => {
					onApplyFilter.fire(`@${POLICY_SETTING_TAG}`);
					this.scopeOverridesHover.value?.hide();
				}
			};
			this.scopeOverridesHover.value = setupCustomHover(this.hoverDelegate, this.scopeOverridesElement, content, options);
		} else if (this.profilesEnabled && element.matchesScope(ConfigurationTarget.APPLICATION, false)) {
			// If the setting is an application-scoped setting, there are no overrides so we can use this
			// indicator to display that information instead.
			this.scopeOverridesElement.style.display = 'inline';
			this.scopeOverridesElement.classList.add('with-custom-hover');

			const applicationSettingText = localize('applicationSetting', "Applies to all profiles");
			this.scopeOverridesLabel.text = applicationSettingText;

			const content = localize('applicationSettingDescription', "The setting is not specific to the current profile, and will retain its value when switching profiles.");
			this.scopeOverridesHover.value = setupCustomHover(this.hoverDelegate, this.scopeOverridesElement, content);
		} else if (element.overriddenScopeList.length || element.overriddenDefaultsLanguageList.length) {
			if ((MODIFIED_INDICATOR_USE_INLINE_ONLY && element.overriddenScopeList.length) ||
				(element.overriddenScopeList.length === 1 && !element.overriddenDefaultsLanguageList.length)) {
				// Render inline if we have the flag and there are scope overrides to render,
				// or if there is only one scope override to render and no language overrides.
				this.scopeOverridesElement.style.display = 'inline';
				this.scopeOverridesElement.classList.remove('with-custom-hover');
				this.scopeOverridesHover.value = undefined;

				// Just show all the text in the label.
				const prefaceText = element.isConfigured ?
					localize('alsoConfiguredIn', "Also modified in") :
					localize('configuredIn', "Modified in");
				this.scopeOverridesLabel.text = `${prefaceText} `;

				for (let i = 0; i < element.overriddenScopeList.length; i++) {
					const overriddenScope = element.overriddenScopeList[i];
					const view = DOM.append(this.scopeOverridesElement, $('a.modified-scope', undefined, this.getInlineScopeDisplayText(overriddenScope)));
					if (i !== element.overriddenScopeList.length - 1) {
						DOM.append(this.scopeOverridesElement, $('span.comma', undefined, ', '));
					}
					elementDisposables.add(
						DOM.addStandardDisposableListener(view, DOM.EventType.CLICK, (e: IMouseEvent) => {
							const [scope, language] = overriddenScope.split(':');
							onDidClickOverrideElement.fire({
								settingKey: element.setting.key,
								scope: scope as ScopeString,
								language
							});
							e.preventDefault();
							e.stopPropagation();
						}));
				}
			} else if (!MODIFIED_INDICATOR_USE_INLINE_ONLY) {
				// Even if the check above fails, we want to
				// show the text in a custom hover only if
				// the feature flag isn't on.
				this.scopeOverridesElement.style.display = 'inline';
				this.scopeOverridesElement.classList.add('with-custom-hover');
				const scopeOverridesLabelText = element.isConfigured ?
					localize('alsoConfiguredElsewhere', "Also modified elsewhere") :
					localize('configuredElsewhere', "Modified elsewhere");
				this.scopeOverridesLabel.text = scopeOverridesLabelText;

				let contentMarkdownString = '';
				let contentFallback = '';
				if (element.overriddenScopeList.length) {
					const prefaceText = element.isConfigured ?
						localize('alsoModifiedInScopes', "The setting has also been modified in the following scopes:") :
						localize('modifiedInScopes', "The setting has been modified in the following scopes:");
					contentMarkdownString = prefaceText;
					contentFallback = prefaceText;
					for (const scope of element.overriddenScopeList) {
						const scopeDisplayText = this.getInlineScopeDisplayText(scope);
						contentMarkdownString += `\n- [${scopeDisplayText}](${encodeURIComponent(scope)} "${getAccessibleScopeDisplayText(scope, this.languageService)}")`;
						contentFallback += `\n• ${scopeDisplayText}`;
					}
				}
				if (element.overriddenDefaultsLanguageList.length) {
					if (contentMarkdownString) {
						contentMarkdownString += `\n\n`;
						contentFallback += `\n\n`;
					}
					const prefaceText = localize('hasDefaultOverridesForLanguages', "The following languages have default overrides:");
					contentMarkdownString += prefaceText;
					contentFallback += prefaceText;
					for (const language of element.overriddenDefaultsLanguageList) {
						const scopeDisplayText = this.languageService.getLanguageName(language);
						contentMarkdownString += `\n- [${scopeDisplayText}](${encodeURIComponent(`default:${language}`)} "${scopeDisplayText}")`;
						contentFallback += `\n• ${scopeDisplayText}`;
					}
				}
				const content: ITooltipMarkdownString = {
					markdown: {
						value: contentMarkdownString,
						isTrusted: false,
						supportHtml: false
					},
					markdownNotSupportedFallback: contentFallback
				};
				const options: IUpdatableHoverOptions = {
					linkHandler: (url: string) => {
						const [scope, language] = decodeURIComponent(url).split(':');
						onDidClickOverrideElement.fire({
							settingKey: element.setting.key,
							scope: scope as ScopeString,
							language
						});
						this.scopeOverridesHover.value?.hide();
					}
				};
				this.scopeOverridesHover.value = setupCustomHover(this.hoverDelegate, this.scopeOverridesElement, content, options);
			}
		}
		this.render();
	}

	updateDefaultOverrideIndicator(element: SettingsTreeSettingElement) {
		this.defaultOverrideIndicatorElement.style.display = 'none';
		const sourceToDisplay = getDefaultValueSourceToDisplay(element);
		if (sourceToDisplay !== undefined) {
			this.defaultOverrideIndicatorElement.style.display = 'inline';
			const defaultOverrideHoverContent = localize('defaultOverriddenDetails', "Default setting value overridden by {0}", sourceToDisplay);
			setupCustomHover(this.hoverDelegate, this.defaultOverrideIndicatorElement, defaultOverrideHoverContent);
		}
		this.render();
	}
}

function getDefaultValueSourceToDisplay(element: SettingsTreeSettingElement): string | undefined {
	let sourceToDisplay: string | undefined;
	const defaultValueSource = element.defaultValueSource;
	if (defaultValueSource) {
		if (typeof defaultValueSource !== 'string') {
			sourceToDisplay = defaultValueSource.displayName ?? defaultValueSource.id;
		} else if (typeof defaultValueSource === 'string') {
			sourceToDisplay = defaultValueSource;
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

export function getIndicatorsLabelAriaLabel(element: SettingsTreeSettingElement, configurationService: IConfigurationService, userDataProfilesService: IUserDataProfilesService, languageService: ILanguageService): string {
	const ariaLabelSections: string[] = [];

	// Add workspace trust text
	if (element.isUntrusted) {
		ariaLabelSections.push(localize('workspaceUntrustedAriaLabel', "Workspace untrusted; setting value will not take effect"));
	}

	const profilesEnabled = userDataProfilesService.isEnabled();
	if (element.hasPolicyValue) {
		ariaLabelSections.push(localize('policyDescriptionAccessible', "Setting managed by organization policy; value will not take effect"));
	} else if (profilesEnabled && element.matchesScope(ConfigurationTarget.APPLICATION, false)) {
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
	const ignoredSettings = getIgnoredSettings(getDefaultIgnoredSettings(), configurationService);
	if (ignoredSettings.includes(element.setting.key)) {
		ariaLabelSections.push(localize('syncIgnoredAriaLabel', "Setting ignored during sync"));
	}

	// Add default override indicator text
	const sourceToDisplay = getDefaultValueSourceToDisplay(element);
	if (sourceToDisplay !== undefined) {
		ariaLabelSections.push(localize('defaultOverriddenDetailsAriaLabel', "{0} overrides the default value", sourceToDisplay));
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
