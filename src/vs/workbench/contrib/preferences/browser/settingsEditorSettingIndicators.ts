/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from 'vs/base/browser/dom';
import { IMouseEvent } from 'vs/base/browser/mouseEvent';
import { IHoverDelegate, IHoverDelegateOptions } from 'vs/base/browser/ui/iconLabel/iconHoverDelegate';
import { setupCustomHover } from 'vs/base/browser/ui/iconLabel/iconLabelHover';
import { SimpleIconLabel } from 'vs/base/browser/ui/iconLabel/simpleIconLabel';
import { Emitter } from 'vs/base/common/event';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { localize } from 'vs/nls';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { getIgnoredSettings } from 'vs/platform/userDataSync/common/settingsMerge';
import { getDefaultIgnoredSettings, IUserDataSyncEnablementService } from 'vs/platform/userDataSync/common/userDataSync';
import { SettingsTreeSettingElement } from 'vs/workbench/contrib/preferences/browser/settingsTreeModels';
import { IHoverService } from 'vs/workbench/services/hover/browser/hover';

const $ = DOM.$;

export interface ISettingOverrideClickEvent {
	scope: string;
	targetKey: string;
}

/**
 * Renders the indicators next to a setting, such as "Also Modified In".
 */
export class SettingsTreeIndicatorsLabel {
	private indicatorsContainerElement: HTMLElement;
	private scopeOverridesElement: HTMLElement;
	private syncIgnoredElement: HTMLElement;
	private defaultOverrideIndicatorElement: HTMLElement;
	private hoverDelegate: IHoverDelegate;

	constructor(
		container: HTMLElement,
		@IConfigurationService configurationService: IConfigurationService,
		@IHoverService hoverService: IHoverService,
		@IUserDataSyncEnablementService private readonly userDataSyncEnablementService: IUserDataSyncEnablementService) {
		this.indicatorsContainerElement = DOM.append(container, $('.misc-label'));
		this.indicatorsContainerElement.style.display = 'inline';

		this.scopeOverridesElement = this.createScopeOverridesElement();
		this.syncIgnoredElement = this.createSyncIgnoredElement();
		this.defaultOverrideIndicatorElement = this.createDefaultOverrideIndicator();

		this.hoverDelegate = {
			showHover: (options: IHoverDelegateOptions, focus?: boolean) => {
				return hoverService.showHover(options, focus);
			},
			delay: configurationService.getValue<number>('workbench.hover.delay'),
			placement: 'element'
		};
	}

	private createScopeOverridesElement(): HTMLElement {
		const otherOverridesElement = $('span.setting-item-overrides');
		return otherOverridesElement;
	}

	private createSyncIgnoredElement(): HTMLElement {
		const syncIgnoredElement = $('span.setting-item-ignored');
		const syncIgnoredLabel = new SimpleIconLabel(syncIgnoredElement);
		syncIgnoredLabel.text = '$(info) ' + localize('extensionSyncIgnoredLabel', 'Not synced');
		const syncIgnoredHoverContent = localize('syncIgnoredTitle', "Settings sync does not sync this setting");
		setupCustomHover(this.hoverDelegate, syncIgnoredElement, syncIgnoredHoverContent);
		return syncIgnoredElement;
	}

	private createDefaultOverrideIndicator(): HTMLElement {
		const defaultOverrideIndicator = $('span.setting-item-default-overridden');
		const defaultOverrideLabel = new SimpleIconLabel(defaultOverrideIndicator);
		defaultOverrideLabel.text = '$(info) ' + localize('defaultOverriddenLabel', "Default value changed");
		return defaultOverrideIndicator;
	}

	private render() {
		const elementsToShow = [this.scopeOverridesElement, this.syncIgnoredElement, this.defaultOverrideIndicatorElement].filter(element => {
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

	updateSyncIgnored(element: SettingsTreeSettingElement, ignoredSettings: string[]) {
		this.syncIgnoredElement.style.display = this.userDataSyncEnablementService.isEnabled()
			&& ignoredSettings.includes(element.setting.key) ? 'inline' : 'none';
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
		if (typeof defaultValueSource !== 'string' && defaultValueSource.id !== element.setting.extensionInfo?.id) {
			sourceToDisplay = defaultValueSource.displayName ?? defaultValueSource.id;
		} else if (typeof defaultValueSource === 'string') {
			sourceToDisplay = defaultValueSource;
		}
	}
	return sourceToDisplay;
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
	const sourceToDisplay = getDefaultValueSourceToDisplay(element);
	if (sourceToDisplay !== undefined) {
		ariaLabelSections.push(localize('defaultOverriddenDetails', "Default setting value overridden by {0}", sourceToDisplay));
	}

	const ariaLabel = ariaLabelSections.join('. ');
	return ariaLabel;
}
