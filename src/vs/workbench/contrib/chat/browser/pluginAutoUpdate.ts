/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { autorun } from '../../../../base/common/observable.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { AutoUpdateConfigurationKey, AutoUpdateConfigurationValue } from '../../extensions/common/extensions.js';
import { IPluginInstallService } from '../common/plugins/pluginInstallService.js';
import { IPluginMarketplaceService } from '../common/plugins/pluginMarketplaceService.js';

/**
 * Bridges the periodic plugin update *check* performed by
 * {@link IPluginMarketplaceService} with the plugin update *action* exposed
 * by {@link IPluginInstallService}.
 *
 * The marketplace service flips `hasUpdatesAvailable` to `true` roughly once
 * a day when at least one cloned plugin repository has upstream changes.
 * Without this contribution, that signal was never consumed and plugins
 * were never auto-updated (see microsoft/vscode#308563).
 *
 * When the signal becomes `true` and `extensions.autoUpdate` is not `false`,
 * we silently update all installed plugins. `updateAllPlugins` clears the
 * flag once the update completes, so the autorun re-arms naturally for the
 * next 24h cycle.
 */
export class PluginAutoUpdate extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.pluginAutoUpdate';

	private _updateInFlight = false;

	constructor(
		@IPluginMarketplaceService pluginMarketplaceService: IPluginMarketplaceService,
		@IPluginInstallService private readonly _pluginInstallService: IPluginInstallService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();

		this._register(autorun(reader => {
			if (!pluginMarketplaceService.hasUpdatesAvailable.read(reader)) {
				return;
			}
			void this._triggerAutoUpdate();
		}));
	}

	private async _triggerAutoUpdate(): Promise<void> {
		if (this._updateInFlight) {
			return;
		}

		const autoUpdate = this._configurationService.getValue<AutoUpdateConfigurationValue>(AutoUpdateConfigurationKey);
		if (autoUpdate === false) {
			return;
		}

		this._updateInFlight = true;
		try {
			await this._pluginInstallService.updateAllPlugins({ silent: true }, CancellationToken.None);
		} catch (err) {
			this._logService.error('[PluginAutoUpdate] Failed to auto-update plugins:', err);
		} finally {
			this._updateInFlight = false;
		}
	}
}
