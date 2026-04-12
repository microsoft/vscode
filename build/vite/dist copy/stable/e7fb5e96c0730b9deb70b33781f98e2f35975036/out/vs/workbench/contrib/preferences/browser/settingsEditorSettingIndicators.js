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
import * as DOM from '../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../base/browser/keyboardEvent.js';
import { SimpleIconLabel } from '../../../../base/browser/ui/iconLabel/simpleIconLabel.js';
import { RunOnceScheduler } from '../../../../base/common/async.js';
import { MarkdownString, createMarkdownLink } from '../../../../base/common/htmlContent.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../base/common/network.js';
import { URI } from '../../../../base/common/uri.js';
import { ILanguageService } from '../../../../editor/common/languages/language.js';
import { localize } from '../../../../nls.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IUserDataSyncEnablementService } from '../../../../platform/userDataSync/common/userDataSync.js';
import { IWorkbenchConfigurationService } from '../../../services/configuration/common/configuration.js';
import { ADVANCED_INDICATOR_DESCRIPTION, EXPERIMENTAL_INDICATOR_DESCRIPTION, POLICY_SETTING_TAG, PREVIEW_INDICATOR_DESCRIPTION } from '../common/preferences.js';
const $ = DOM.$;
/**
 * Contains a set of the sync-ignored settings
 * to keep the sync ignored indicator and the getIndicatorsLabelAriaLabel() function in sync.
 * SettingsTreeIndicatorsLabel#updateSyncIgnored provides the source of truth.
 */
let cachedSyncIgnoredSettingsSet = new Set();
/**
 * Contains a copy of the sync-ignored settings to determine when to update
 * cachedSyncIgnoredSettingsSet.
 */
let cachedSyncIgnoredSettings = [];
/**
 * Renders the indicators next to a setting, such as "Also Modified In".
 */
let SettingsTreeIndicatorsLabel = class SettingsTreeIndicatorsLabel {
    constructor(container, configurationService, hoverService, userDataSyncEnablementService, languageService, commandService) {
        this.configurationService = configurationService;
        this.hoverService = hoverService;
        this.userDataSyncEnablementService = userDataSyncEnablementService;
        this.languageService = languageService;
        this.commandService = commandService;
        /** Indicators that each have their own square container at the top-right of the setting */
        this.isolatedIndicators = [];
        this.keybindingListeners = new DisposableStore();
        this.focusedIndex = 0;
        this.defaultHoverOptions = {
            trapFocus: true,
            style: 1 /* HoverStyle.Pointer */,
            position: {
                hoverPosition: 2 /* HoverPosition.BELOW */,
            },
        };
        this.indicatorsContainerElement = DOM.append(container, $('.setting-indicators-container'));
        this.indicatorsContainerElement.style.display = 'inline';
        this.previewIndicator = this.createPreviewIndicator();
        this.advancedIndicator = this.createAdvancedIndicator();
        this.isolatedIndicators = [this.previewIndicator, this.advancedIndicator];
        this.workspaceTrustIndicator = this.createWorkspaceTrustIndicator();
        this.scopeOverridesIndicator = this.createScopeOverridesIndicator();
        this.syncIgnoredIndicator = this.createSyncIgnoredIndicator();
        this.defaultOverrideIndicator = this.createDefaultOverrideIndicator();
        this.parenthesizedIndicators = [this.workspaceTrustIndicator, this.scopeOverridesIndicator, this.syncIgnoredIndicator, this.defaultOverrideIndicator];
    }
    addHoverDisposables(disposables, element, showHover) {
        disposables.clear();
        const scheduler = disposables.add(new RunOnceScheduler(() => {
            const hover = showHover(false);
            if (hover) {
                disposables.add(hover);
            }
        }, this.configurationService.getValue('workbench.hover.delay')));
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
            if (evt.equals(10 /* KeyCode.Space */) || evt.equals(3 /* KeyCode.Enter */)) {
                const hover = showHover(true);
                if (hover) {
                    disposables.add(hover);
                }
                e.preventDefault();
            }
        }));
    }
    createWorkspaceTrustIndicator() {
        const disposables = new DisposableStore();
        const workspaceTrustElement = $('span.setting-indicator.setting-item-workspace-trust');
        const workspaceTrustLabel = disposables.add(new SimpleIconLabel(workspaceTrustElement));
        workspaceTrustLabel.text = '$(shield) ' + localize('workspaceUntrustedLabel', "Requires workspace trust");
        const content = localize('trustLabel', "The setting value can only be applied in a trusted workspace.");
        const showHover = (focus) => {
            return this.hoverService.showInstantHover({
                ...this.defaultHoverOptions,
                content,
                target: workspaceTrustElement,
                actions: [{
                        label: localize('manageWorkspaceTrust', "Manage Workspace Trust"),
                        commandId: 'workbench.trust.manage',
                        run: (target) => {
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
    createScopeOverridesIndicator() {
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
    createSyncIgnoredIndicator() {
        const disposables = new DisposableStore();
        const syncIgnoredElement = $('span.setting-indicator.setting-item-ignored');
        const syncIgnoredLabel = disposables.add(new SimpleIconLabel(syncIgnoredElement));
        syncIgnoredLabel.text = localize('extensionSyncIgnoredLabel', 'Not synced');
        const syncIgnoredHoverContent = localize('syncIgnoredTitle', "This setting is ignored during sync");
        const showHover = (focus) => {
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
    createDefaultOverrideIndicator() {
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
    createPreviewIndicator() {
        const disposables = new DisposableStore();
        const previewIndicator = $('span.setting-indicator.setting-item-preview');
        const previewLabel = disposables.add(new SimpleIconLabel(previewIndicator));
        return {
            element: previewIndicator,
            label: previewLabel,
            disposables
        };
    }
    createAdvancedIndicator() {
        const disposables = new DisposableStore();
        const advancedIndicator = $('span.setting-indicator.setting-item-preview');
        const advancedLabel = disposables.add(new SimpleIconLabel(advancedIndicator));
        advancedLabel.text = localize('advancedLabel', "Advanced");
        const showHover = (focus) => {
            return this.hoverService.showInstantHover({
                ...this.defaultHoverOptions,
                content: ADVANCED_INDICATOR_DESCRIPTION,
                target: advancedIndicator
            }, focus);
        };
        this.addHoverDisposables(disposables, advancedIndicator, showHover);
        return {
            element: advancedIndicator,
            label: advancedLabel,
            disposables
        };
    }
    render() {
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
    resetIndicatorNavigationKeyBindings(indicators) {
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
            if (ev.equals(14 /* KeyCode.Home */)) {
                this.focusIndicatorAt(indicators, 0);
            }
            else if (ev.equals(13 /* KeyCode.End */)) {
                this.focusIndicatorAt(indicators, indicators.length - 1);
            }
            else if (ev.equals(17 /* KeyCode.RightArrow */)) {
                const indexToFocus = (this.focusedIndex + 1) % indicators.length;
                this.focusIndicatorAt(indicators, indexToFocus);
            }
            else if (ev.equals(15 /* KeyCode.LeftArrow */)) {
                const indexToFocus = this.focusedIndex ? this.focusedIndex - 1 : indicators.length - 1;
                this.focusIndicatorAt(indicators, indexToFocus);
            }
            else {
                handled = false;
            }
            if (handled) {
                e.preventDefault();
                e.stopPropagation();
            }
        }));
    }
    focusIndicatorAt(indicators, index) {
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
    updateWorkspaceTrust(element) {
        this.workspaceTrustIndicator.element.style.display = element.isUntrusted ? 'inline' : 'none';
        this.render();
    }
    updateSyncIgnored(element, ignoredSettings) {
        this.syncIgnoredIndicator.element.style.display = this.userDataSyncEnablementService.isEnabled()
            && ignoredSettings.includes(element.setting.key) ? 'inline' : 'none';
        this.render();
        if (cachedSyncIgnoredSettings !== ignoredSettings) {
            cachedSyncIgnoredSettings = ignoredSettings;
            cachedSyncIgnoredSettingsSet = new Set(cachedSyncIgnoredSettings);
        }
    }
    updatePreviewIndicator(element) {
        const isPreviewSetting = element.tags?.has('preview');
        const isExperimentalSetting = element.tags?.has('experimental');
        this.previewIndicator.element.style.display = (isPreviewSetting || isExperimentalSetting) ? 'inline' : 'none';
        this.previewIndicator.label.text = isPreviewSetting ?
            localize('previewLabel', "Preview") :
            localize('experimentalLabel', "Experimental");
        const content = isPreviewSetting ? PREVIEW_INDICATOR_DESCRIPTION : EXPERIMENTAL_INDICATOR_DESCRIPTION;
        const showHover = (focus) => {
            return this.hoverService.showInstantHover({
                ...this.defaultHoverOptions,
                content,
                target: this.previewIndicator.element
            }, focus);
        };
        this.addHoverDisposables(this.previewIndicator.disposables, this.previewIndicator.element, showHover);
        this.render();
    }
    updateAdvancedIndicator(element) {
        const isAdvancedSetting = element.tags?.has('advanced');
        this.advancedIndicator.element.style.display = isAdvancedSetting ? 'inline' : 'none';
        this.render();
    }
    getInlineScopeDisplayText(completeScope) {
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
    updateScopeOverrides(element, onDidClickOverrideElement, onApplyFilter) {
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
            const showHover = (focus) => {
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
        }
        else if (element.settingsTarget === 3 /* ConfigurationTarget.USER_LOCAL */ && this.configurationService.isSettingAppliedForAllProfiles(element.setting.key)) {
            this.scopeOverridesIndicator.element.style.display = 'inline';
            this.scopeOverridesIndicator.element.classList.add('setting-indicator');
            this.scopeOverridesIndicator.label.text = localize('applicationSetting', "Applies to all profiles");
            const content = localize('applicationSettingDescription', "The setting is not specific to the current profile, and will retain its value when switching profiles.");
            const showHover = (focus) => {
                return this.hoverService.showInstantHover({
                    ...this.defaultHoverOptions,
                    content,
                    target: this.scopeOverridesIndicator.element
                }, focus);
            };
            this.addHoverDisposables(this.scopeOverridesIndicator.disposables, this.scopeOverridesIndicator.element, showHover);
        }
        else if (element.overriddenScopeList.length || element.overriddenDefaultsLanguageList.length) {
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
                const onClickOrKeydown = (e) => {
                    const [scope, language] = overriddenScope.split(':');
                    onDidClickOverrideElement.fire({
                        settingKey: element.setting.key,
                        scope: scope,
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
                    if (ev.equals(10 /* KeyCode.Space */) || ev.equals(3 /* KeyCode.Enter */)) {
                        onClickOrKeydown(e);
                    }
                }));
            }
            else {
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
                        contentMarkdownString += '\n- ' + createMarkdownLink(scopeDisplayText, SettingScopeLink.create(scope).toString(), getAccessibleScopeDisplayText(scope, this.languageService));
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
                        contentMarkdownString += '\n- ' + createMarkdownLink(scopeDisplayText ?? language, SettingScopeLink.create(`default:${language}`).toString());
                    }
                }
                const content = {
                    value: contentMarkdownString,
                    isTrusted: false,
                    supportHtml: false
                };
                this.scopeOverridesIndicator.disposables.add(this.hoverService.setupDelayedHover(this.scopeOverridesIndicator.element, () => ({
                    ...this.defaultHoverOptions,
                    content,
                    linkHandler: (url) => {
                        const [scope, language] = SettingScopeLink.parse(url).split(':');
                        onDidClickOverrideElement.fire({
                            settingKey: element.setting.key,
                            scope: scope,
                            language
                        });
                    }
                }), { setupKeyboardEvents: true }));
            }
        }
        this.render();
    }
    updateDefaultOverrideIndicator(element) {
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
            }
            else {
                sourceToDisplay = sourceToDisplay.map(source => `\`${source}\``);
                defaultOverrideHoverContent = localize('multipledefaultOverriddenDetails', "A default values has been set by {0}", sourceToDisplay.slice(0, -1).join(', ') + ' & ' + sourceToDisplay.slice(-1));
            }
            const showHover = (focus) => {
                return this.hoverService.showInstantHover({
                    content: new MarkdownString().appendMarkdown(defaultOverrideHoverContent),
                    target: this.defaultOverrideIndicator.element,
                    style: 1 /* HoverStyle.Pointer */,
                    position: {
                        hoverPosition: 2 /* HoverPosition.BELOW */,
                    },
                }, focus);
            };
            this.addHoverDisposables(this.defaultOverrideIndicator.disposables, this.defaultOverrideIndicator.element, showHover);
        }
        this.render();
    }
};
SettingsTreeIndicatorsLabel = __decorate([
    __param(1, IWorkbenchConfigurationService),
    __param(2, IHoverService),
    __param(3, IUserDataSyncEnablementService),
    __param(4, ILanguageService),
    __param(5, ICommandService)
], SettingsTreeIndicatorsLabel);
export { SettingsTreeIndicatorsLabel };
function getDefaultValueSourceToDisplay(element) {
    let sourceToDisplay;
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
        }
        else if (typeof defaultValueSource === 'string') {
            sourceToDisplay = defaultValueSource;
        }
        else {
            sourceToDisplay = defaultValueSource.displayName ?? defaultValueSource.id;
        }
    }
    return sourceToDisplay;
}
function getAccessibleScopeDisplayText(completeScope, languageService) {
    const [scope, language] = completeScope.split(':');
    const localizedScope = scope === 'user' ?
        localize('user', "User") : scope === 'workspace' ?
        localize('workspace', "Workspace") : localize('remote', "Remote");
    if (language) {
        return localize('modifiedInScopeForLanguage', "The {0} scope for {1}", localizedScope, languageService.getLanguageName(language));
    }
    return localizedScope;
}
function getAccessibleScopeDisplayMidSentenceText(completeScope, languageService) {
    const [scope, language] = completeScope.split(':');
    const localizedScope = scope === 'user' ?
        localize('user', "User") : scope === 'workspace' ?
        localize('workspace', "Workspace") : localize('remote', "Remote");
    if (language) {
        return localize('modifiedInScopeForLanguageMidSentence', "the {0} scope for {1}", localizedScope.toLowerCase(), languageService.getLanguageName(language));
    }
    return localizedScope;
}
export function getIndicatorsLabelAriaLabel(element, configurationService, userDataProfilesService, languageService) {
    const ariaLabelSections = [];
    // Add preview or experimental indicator text
    if (element.tags?.has('preview')) {
        ariaLabelSections.push(localize('previewLabel', "Preview"));
    }
    else if (element.tags?.has('experimental')) {
        ariaLabelSections.push(localize('experimentalLabel', "Experimental"));
    }
    if (element.tags?.has('advanced')) {
        ariaLabelSections.push(localize('advancedLabel', "Advanced"));
    }
    // Add workspace trust text
    if (element.isUntrusted) {
        ariaLabelSections.push(localize('workspaceUntrustedAriaLabel', "Workspace untrusted; setting value not applied"));
    }
    if (element.hasPolicyValue) {
        ariaLabelSections.push(localize('policyDescriptionAccessible', "Managed by organization policy; setting value not applied"));
    }
    else if (element.settingsTarget === 3 /* ConfigurationTarget.USER_LOCAL */ && configurationService.isSettingAppliedForAllProfiles(element.setting.key)) {
        ariaLabelSections.push(localize('applicationSettingDescriptionAccessible', "Setting value retained when switching profiles"));
    }
    else {
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
        }
        else {
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
/**
 * Internal links used to open a specific scope in the settings editor
 */
var SettingScopeLink;
(function (SettingScopeLink) {
    function create(scope) {
        return URI.from({
            scheme: Schemas.internal,
            path: '/',
            query: encodeURIComponent(scope)
        });
    }
    SettingScopeLink.create = create;
    function parse(link) {
        const uri = URI.parse(link);
        return decodeURIComponent(uri.query);
    }
    SettingScopeLink.parse = parse;
})(SettingScopeLink || (SettingScopeLink = {}));
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2V0dGluZ3NFZGl0b3JTZXR0aW5nSW5kaWNhdG9ycy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL3ByZWZlcmVuY2VzL2Jyb3dzZXIvc2V0dGluZ3NFZGl0b3JTZXR0aW5nSW5kaWNhdG9ycy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEtBQUssR0FBRyxNQUFNLGlDQUFpQyxDQUFDO0FBQ3ZELE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDJDQUEyQyxDQUFDO0FBR2xGLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSwwREFBMEQsQ0FBQztBQUMzRixPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUVwRSxPQUFPLEVBQW1CLGNBQWMsRUFBRSxrQkFBa0IsRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBRTdHLE9BQU8sRUFBRSxlQUFlLEVBQWUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNwRixPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFDN0QsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQ3JELE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLGlEQUFpRCxDQUFDO0FBQ25GLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQUM5QyxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFFbkYsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBRTVFLE9BQU8sRUFBRSw4QkFBOEIsRUFBRSxNQUFNLDBEQUEwRCxDQUFDO0FBQzFHLE9BQU8sRUFBRSw4QkFBOEIsRUFBRSxNQUFNLHlEQUF5RCxDQUFDO0FBQ3pHLE9BQU8sRUFBRSw4QkFBOEIsRUFBRSxrQ0FB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