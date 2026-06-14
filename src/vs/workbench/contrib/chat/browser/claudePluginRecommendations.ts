/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { INotificationService, NeverShowAgainScope, Severity } from '../../../../platform/notification/common/notification.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { IExtensionsWorkbenchService } from '../../extensions/common/extensions.js';
import { IChatService } from '../common/chatService/chatService.js';
import { IMarketplacePlugin, IPluginMarketplaceService } from '../common/plugins/pluginMarketplaceService.js';

export class AgentPluginRecommendations extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.agentPluginRecommendations';

	private _hasNotified = false;

	constructor(
		@IChatService private readonly _chatService: IChatService,
		@IPluginMarketplaceService private readonly _pluginMarketplaceService: IPluginMarketplaceService,
		@INotificationService private readonly _notificationService: INotificationService,
		@IExtensionsWorkbenchService private readonly _extensionsWorkbenchService: IExtensionsWorkbenchService,
	) {
		super();

		this._register(this._chatService.onDidSubmitRequest(() => {
			if (!this._hasNotified) {
				this._hasNotified = true;
				this._checkForRecommendedPlugins();
			}
		}));
	}

	private async _checkForRecommendedPlugins(): Promise<void> {
		const recommended = this._pluginMarketplaceService.recommendedPlugins.get();
		if (recommended.size === 0) {
			return;
		}

		// Build a set of installed plugin keys ("name@marketplace") from
		// storage without triggering any network fetch.
		const installedKeys = new Set<string>();
		for (const entry of this._pluginMarketplaceService.installedPlugins.get()) {
			const key = `${entry.plugin.name}@${entry.plugin.marketplace}`;
			installedKeys.add(key);
		}

		// Only count recommendations that resolve to a known marketplace
		// plugin. Otherwise the @recommended search would land on an empty
		// list (see microsoft/vscode#315347). Fall back to a fresh fetch
		// when the cache hasn't been populated yet so first-run sessions
		// with valid recommendations still notify.
		let fetched: readonly IMarketplacePlugin[] = this._pluginMarketplaceService.lastFetchedPlugins.get();
		if (fetched.length === 0) {
			try {
				fetched = await this._pluginMarketplaceService.fetchMarketplacePlugins(CancellationToken.None);
			} catch {
				return;
			}
		}
		const knownKeys = new Set<string>();
		for (const plugin of fetched) {
			knownKeys.add(`${plugin.name}@${plugin.marketplace}`);
		}

		let uninstalledCount = 0;
		for (const key of recommended) {
			if (!installedKeys.has(key) && knownKeys.has(key)) {
				uninstalledCount++;
			}
		}

		if (uninstalledCount === 0) {
			return;
		}

		this._notificationService.prompt(
			Severity.Info,
			uninstalledCount === 1
				? localize('agentPluginRecommendation.one', "This workspace recommends 1 agent plugin.")
				: localize('agentPluginRecommendation.many', "This workspace recommends {0} agent plugins.", uninstalledCount),
			[{
				label: localize('showPlugins', "Show Plugins"),
				run: () => {
					this._extensionsWorkbenchService.openSearch('@agentPlugins @recommended');
				}
			}],
			{
				neverShowAgain: {
					id: 'agentPluginRecommendations.dismissed',
					scope: NeverShowAgainScope.WORKSPACE,
					isSecondary: true,
				}
			}
		);
	}
}
