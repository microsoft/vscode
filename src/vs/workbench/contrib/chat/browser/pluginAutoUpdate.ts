/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { autorun } from '../../../../base/common/observable.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IMeteredConnectionService } from '../../../../platform/meteredConnection/common/meteredConnection.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { IPluginInstallService } from '../common/plugins/pluginInstallService.js';
import { IPluginMarketplaceService } from '../common/plugins/pluginMarketplaceService.js';

/**
 * Bridges the periodic plugin update *check* performed by
 * {@link IPluginMarketplaceService} with the plugin update *action* exposed
 * by {@link IPluginInstallService}.
 *
 * The marketplace service reports canonical marketplace IDs roughly once
 * a day when cloned plugin repositories have upstream changes.
 * Without this contribution, that signal was never consumed and plugins
 * were never auto-updated (see microsoft/vscode#308563).
 *
 * Only plugins from the reported marketplaces are updated. The marketplace
 * service applies managed per-marketplace policy before reporting updates.
 *
 * Processed marketplace IDs are acknowledged after every attempt, including
 * failures. IDs reported while an update is running remain queued.
 */
export class PluginAutoUpdate extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.pluginAutoUpdate';

	private _updateInFlight = false;

	constructor(
		@IPluginMarketplaceService private readonly _pluginMarketplaceService: IPluginMarketplaceService,
		@IPluginInstallService private readonly _pluginInstallService: IPluginInstallService,
		@ILogService private readonly _logService: ILogService,
		@IMeteredConnectionService private readonly _meteredConnectionService: IMeteredConnectionService,
	) {
		super();

		this._register(autorun(reader => {
			const marketplaceIds = this._pluginMarketplaceService.marketplacesWithUpdates.read(reader);
			if (marketplaceIds.size === 0) {
				return;
			}
			void this._triggerAutoUpdate(marketplaceIds);
		}));

		this._register(this._meteredConnectionService.onDidChangeIsConnectionMetered(isMetered => {
			if (!isMetered) {
				this._triggerQueuedAutoUpdate();
			}
		}));
	}

	private _triggerQueuedAutoUpdate(): void {
		const marketplaceIds = this._pluginMarketplaceService.marketplacesWithUpdates.get();
		if (marketplaceIds.size > 0) {
			void this._triggerAutoUpdate(marketplaceIds);
		}
	}

	private async _triggerAutoUpdate(marketplaceIds: ReadonlySet<string>): Promise<void> {
		if (this._store.isDisposed || this._updateInFlight || this._meteredConnectionService.isConnectionMetered) {
			return;
		}

		this._updateInFlight = true;
		try {
			await this._pluginInstallService.updateAllPlugins({ silent: true, automatic: true, marketplaceIds }, CancellationToken.None);
		} catch (err) {
			this._logService.error('[PluginAutoUpdate] Failed to auto-update plugins:', err);
		} finally {
			this._pluginMarketplaceService.clearUpdatesAvailable(marketplaceIds);
			this._updateInFlight = false;

			if (!this._store.isDisposed && !this._meteredConnectionService.isConnectionMetered) {
				this._triggerQueuedAutoUpdate();
			}
		}
	}
}
