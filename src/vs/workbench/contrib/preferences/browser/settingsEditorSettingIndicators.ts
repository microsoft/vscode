/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from 'vs/base/browser/dom';
import { IMouseEvent } from 'vs/base/browser/mouseEvent';
import { SimpleIconLabel } from 'vs/base/browser/ui/iconLabel/simpleIconLabel';
import { Emitter } from 'vs/base/common/event';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { localize } from 'vs/nls';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { getIgnoredSettings } from 'vs/platform/userDataSync/common/settingsMerge';
import { getDefaultIgnoredSettings } from 'vs/platform/userDataSync/common/userDataSync';
import { SettingsTreeSettingElement } from 'vs/workbench/contrib/preferences/browser/settingsTreeModels';
import { ID_SETTING_TAG, LANGUAGE_SETTING_TAG } from 'vs/workbench/contrib/preferences/common/preferences';

const $ = DOM.$;

export interface ISettingOverrideClickEvent {
	scope: string;
	targetKey: string;
}

/**
 * Renders the indicators next to a setting, such as Sync Ignored, Also Modified In, etc.
 */
export class SettingsTreeIndicatorsLabel {
	/**
	 * This element wraps around the other elements.
	 */
	private labelElement: HTMLElement;
	private languageOverridesElement: HTMLElement;
	private languageOverridesLabel: SimpleIconLabel;
	private scopeOverridesElement: HTMLElement;
	private syncIgnoredElement: HTMLElement;
	private defaultOverrideIndicatorElement: HTMLElement;
	private defaultOverrideIndicatorLabel: SimpleIconLabel;

	constructor(container: HTMLElement) {
		this.labelElement = DOM.append(container, $('.misc-label'));
		this.labelElement.style.display = 'inline';

		const { element: languageOverridesElement, label: languageOverridesLabel } = this.createLanguageOverridesIndicator();
		this.languageOverridesElement = languageOverridesElement;
		this.languageOverridesLabel = languageOverridesLabel;
		this.scopeOverridesElement = this.createScopeOverridesElement();
		this.syncIgnoredElement = this.createSyncIgnoredElement();
		const { element: defaultOverrideElement, label: defaultOverrideLabel } = this.createDefaultOverrideIndicator();
		this.defaultOverrideIndicatorElement = defaultOverrideElement;
		this.defaultOverrideIndicatorLabel = defaultOverrideLabel;
	}

	private createLanguageOverridesIndicator(): { element: HTMLElement; label: SimpleIconLabel } {
		const languageOverridesElement = $('span.setting-item-language-overrides');
		const languageOverridesLabel = new SimpleIconLabel(languageOverridesElement);
		return { element: languageOverridesElement, label: languageOverridesLabel };
	}

	private createScopeOverridesElement(): HTMLElement {
		const otherOverridesElement = $('span.setting-item-overrides');
		return otherOverridesElement;
	}

	private createSyncIgnoredElement(): HTMLElement {
		const syncIgnoredElement = $('span.setting-item-ignored');
		const syncIgnoredLabel = new SimpleIconLabel(syncIgnoredElement);
		syncIgnoredLabel.text = `$(sync-ignored) ${localize('extensionSyncIgnoredLabel', 'Sync: Ignored')}`;
		syncIgnoredLabel.title = localize('syncIgnoredTitle', "Settings sync does not sync this setting");
		return syncIgnoredElement;
	}

	private createDefaultOverrideIndicator(): { element: HTMLElement; label: SimpleIconLabel } {
		const defaultOverrideIndicator = $('span.setting-item-default-overridden');
		const defaultOverrideLabel = new SimpleIconLabel(defaultOverrideIndicator);
		return { element: defaultOverrideIndicator, label: defaultOverrideLabel };
	}

	private render() {
		const elementsToShow = [this.languageOverridesElement, this.scopeOverridesElement, this.syncIgnoredElement, this.defaultOverrideIndicatorElement].filter(element => {
			return element.style.display !== 'none';
		});

		this.labelElement.innerText = '';
		this.labelElement.style.display = 'none';
		if (elementsToShow.length) {
			this.labelElement.style.display = 'inline';
			DOM.append(this.labelElement, $('span', undefined, '  '));
			for (let i = 0; i < elementsToShow.length - 1; i++) {
				DOM.append(this.labelElement, elementsToShow[i]);
				DOM.append(this.labelElement, $('span.comma', undefined, ' '));
			}
			DOM.append(this.labelElement, elementsToShow[elementsToShow.length - 1]);
		}
	}

	updateSyncIgnored(element: SettingsTreeSettingElement, ignoredSettings: string[]) {
		this.syncIgnoredElement.style.display = ignoredSettings.includes(element.setting.key) ? 'inline' : 'none';
		this.render();
	}

	updateLanguageOverrides(element: SettingsTreeSettingElement, elementDisposables: DisposableStore, onApplyFilter: Emitter<string[]>) {
		this.languageOverridesElement.style.display = 'none';
		const hasLanguageSpecificValuesOrOverrides = element.languageDefaultOverrides.size || element.languageOverridenScopeLists.size;
		if (!element.languageSelector && hasLanguageSpecificValuesOrOverrides) {
			this.languageOverridesElement.style.display = 'inline';
			this.languageOverridesLabel.text = '$(bracket) ';

			// Get the list of languages that have default value overrides or user-configured values.
			const overrideSources: Set<string> = new Set<string>();
			for (const language of element.languageDefaultOverrides.keys()) {
				overrideSources.add(language);
			}
			for (const language of element.languageOverridenScopeLists.keys()) {
				overrideSources.add(language);
			}

			const overrideSourcesList: string[] = Array.from(overrideSources).sort();
			this.languageOverridesLabel.title = localize('languageOverridesDetails', "Language-specific settings or default value overrides occur for: {0}", overrideSourcesList.join(', '));
			for (let i = 0; i < overrideSourcesList.length; i++) {
				const language = overrideSourcesList[i];
				const languageLink = DOM.append(this.languageOverridesElement, $('a.language-link', undefined, language));

				if (i !== overrideSourcesList.length - 1) {
					DOM.append(this.languageOverridesElement, $('span', undefined, ', '));
				}

				elementDisposables.add(
					DOM.addStandardDisposableListener(languageLink, DOM.EventType.CLICK, e => {
						onApplyFilter.fire([`@${LANGUAGE_SETTING_TAG}${language}`, `@${ID_SETTING_TAG}${element.setting.key}`]);
						e.preventDefault();
						e.stopPropagation();
					}));
			}
		}
		this.render();
	}

	updateScopeOverrides(element: SettingsTreeSettingElement, elementDisposables: DisposableStore, onDidClickOverrideElement: Emitter<ISettingOverrideClickEvent>) {
		this.scopeOverridesElement.innerText = '';
		this.scopeOverridesElement.style.display = 'none';
		if (element.overriddenScopeList.length) {
			this.scopeOverridesElement.style.display = 'inline';
			const otherOverridesLabel = element.isConfigured ?
				localize('alsoConfiguredIn', "Also modified in") :
				localize('configuredIn', "Modified in");

			DOM.append(this.scopeOverridesElement, $('span', undefined, `${otherOverridesLabel}: `));
			for (let i = 0; i < element.overriddenScopeList.length; i++) {
				const view = DOM.append(this.scopeOverridesElement, $('a.modified-scope', undefined, element.overriddenScopeList[i]));

				if (i !== element.overriddenScopeList.length - 1) {
					DOM.append(this.scopeOverridesElement, $('span', undefined, ', '));
				}

				elementDisposables.add(
					DOM.addStandardDisposableListener(view, DOM.EventType.CLICK, (e: IMouseEvent) => {
						onDidClickOverrideElement.fire({
							targetKey: element.setting.key,
							scope: element.overriddenScopeList[i]
						});
						e.preventDefault();
						e.stopPropagation();
					}));
			}
		}
		this.render();
	}

	updateDefaultOverrideIndicator(element: SettingsTreeSettingElement) {
		this.defaultOverrideIndicatorElement.style.display = 'none';
		const defaultValueSource = element.defaultValueSource;
		if (defaultValueSource) {
			this.defaultOverrideIndicatorElement.style.display = 'inline';
			if (typeof defaultValueSource !== 'string' && defaultValueSource.id !== element.setting.extensionInfo?.id) {
				const extensionSource = defaultValueSource.displayName ?? defaultValueSource.id;
				this.defaultOverrideIndicatorLabel.title = localize('defaultOverriddenDetails', "Default setting value overridden by {0}", extensionSource);
				this.defaultOverrideIndicatorLabel.text = localize('defaultOverrideLabelText', "$(replace) {0}", extensionSource);
			} else if (typeof defaultValueSource === 'string') {
				this.defaultOverrideIndicatorLabel.title = localize('defaultOverriddenDetails', "Default setting value overridden by {0}", defaultValueSource);
				this.defaultOverrideIndicatorLabel.text = localize('defaultOverrideLabelText', "$(replace) {0}", defaultValueSource);
			}
		}
		this.render();
	}
}

export function getIndicatorsLabelAriaLabel(element: SettingsTreeSettingElement, configurationService: IConfigurationService): string {
	const ariaLabelSections: string[] = [];

	// Add other overrides text
	const otherOverridesStart = element.isConfigured ?
		localize('alsoConfiguredIn', "Also modified in") :
		localize('configuredIn', "Modified in");
	const otherOverridesList = element.overriddenScopeList.join(', ');
	if (element.overriddenScopeList.length) {
		ariaLabelSections.push(`${otherOverridesStart} ${otherOverridesList}`);
	}

	// Add sync ignored text
	const ignoredSettings = getIgnoredSettings(getDefaultIgnoredSettings(), configurationService);
	if (ignoredSettings.includes(element.setting.key)) {
		ariaLabelSections.push(localize('syncIgnoredTitle', "Settings sync does not sync this setting"));
	}

	// Add default override indicator text
	if (element.defaultValueSource) {
		const defaultValueSource = element.defaultValueSource;
		if (typeof defaultValueSource !== 'string' && defaultValueSource.id !== element.setting.extensionInfo?.id) {
			const extensionSource = defaultValueSource.displayName ?? defaultValueSource.id;
			ariaLabelSections.push(localize('defaultOverriddenDetails', "Default setting value overridden by {0}", extensionSource));
		} else if (typeof defaultValueSource === 'string') {
			ariaLabelSections.push(localize('defaultOverriddenDetails', "Default setting value overridden by {0}", defaultValueSource));
		}
	}

	const ariaLabel = ariaLabelSections.join('. ');
	return ariaLabel;
}
