/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $ } from '../../../base/browser/dom.js';
import { HorizontalDirection, IMenuDirection, VerticalDirection } from '../../../base/browser/ui/menu/menu.js';
import { Disposable, toDisposable } from '../../../base/common/lifecycle.js';
import { autorun } from '../../../base/common/observable.js';
import { isMacintosh, isNative } from '../../../base/common/platform.js';
import { IConfigurationService, isConfigured } from '../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../platform/instantiation/common/instantiation.js';
import { observableConfigValue } from '../../../platform/observable/common/platformObservableUtils.js';
import { logSettingExperimentTrigger } from '../../../platform/telemetry/common/experimentTrigger.js';
import { ITelemetryService } from '../../../platform/telemetry/common/telemetry.js';
import { hasNativeMenu, hasNativeTitlebar, MenuBarVisibility } from '../../../platform/window/common/window.js';
import { CustomMenubarControl } from '../../../workbench/browser/parts/titlebar/menubarControl.js';

export const SESSIONS_SHOW_APPLICATION_MENU_SETTING = 'sessions.showApplicationMenu';

/**
 * Whether the Agents window can show its application menu in its title bar: on Windows and Linux, whose windows have no
 * native menu while they use the custom title bar. macOS keeps its native application menu, and a native title bar
 * stays unchanged even though the Agents window uses the custom menu style by default.
 */
export function canShowApplicationMenu(configurationService: IConfigurationService): boolean {
	return isNative && !isMacintosh && !hasNativeTitlebar(configurationService) && !hasNativeMenu(configurationService);
}

/**
 * The menu bar as a single button, like the compact menu of the workbench, whatever `window.menuBarVisibility` is: the
 * Agents window has no other menu bar. Its menus open beside the button.
 */
class CompactMenubarControl extends CustomMenubarControl {

	protected override get currentMenubarVisibility(): MenuBarVisibility {
		return 'compact';
	}

	protected override get currentCompactMenuMode(): IMenuDirection {
		return { horizontal: HorizontalDirection.Right, vertical: VerticalDirection.Below };
	}
}

/**
 * The application menu of the Agents window, a compact menu bar shown before `before` in `container` while
 * {@link SESSIONS_SHOW_APPLICATION_MENU_SETTING} is enabled. Hosts create it only where
 * {@link canShowApplicationMenu} allows, and `onDidChange` tells them once the menu has been added or removed, such as
 * to measure again what fits in the title bar.
 */
export class ApplicationMenu extends Disposable {

	constructor(
		container: HTMLElement,
		before: HTMLElement,
		onDidChange: () => void,
		@IConfigurationService configurationService: IConfigurationService,
		@IInstantiationService instantiationService: IInstantiationService,
		@ITelemetryService telemetryService: ITelemetryService,
	) {
		super();

		// The experiment decides whether the menu shows here, unless the user chose.
		if (!isConfigured(configurationService.inspect(SESSIONS_SHOW_APPLICATION_MENU_SETTING))) {
			logSettingExperimentTrigger(telemetryService, SESSIONS_SHOW_APPLICATION_MENU_SETTING);
		}

		const enabled = observableConfigValue(SESSIONS_SHOW_APPLICATION_MENU_SETTING, true, configurationService);
		this._register(autorun(reader => {
			// The previous run's menu, if any, has been removed by now.
			if (enabled.read(reader)) {
				const element = container.insertBefore($('div.menubar'), before);
				reader.store.add(toDisposable(() => element.remove()));
				reader.store.add(instantiationService.createInstance(CompactMenubarControl)).create(element);
			}
			onDidChange();
		}));
	}
}
