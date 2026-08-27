/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { autorun } from '../../../../base/common/observable.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { mcpAccessConfig, McpAccessValue } from '../../../../platform/mcp/common/mcpManagement.js';
import { observableConfigValue } from '../../../../platform/observable/common/platformObservableUtils.js';
import { COPILOT_STRICT_PLUGIN_ONLY_CUSTOMIZATION_CONFIG } from '../../../../platform/policy/common/copilotManagedSettings.js';
import { IStorageService, StorageScope } from '../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { isStrictPluginOnlyCustomizationEnabled, StrictPluginOnlyCustomization } from '../../chat/common/customizationLockdown.js';
import { IMcpDiscovery, IMcpDiscoveryTelemetrySnapshot, mcpDiscoveryRegistry } from '../common/discovery/mcpDiscovery.js';
import { McpDiscoveryTelemetry, reconcileMcpStrictPluginOnly } from '../common/discovery/mcpDiscoveryTelemetry.js';

export class McpDiscovery extends Disposable implements IWorkbenchContribution {
	public static readonly ID = 'workbench.contrib.mcp.discovery';

	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
		@IConfigurationService configurationService: IConfigurationService,
		@IStorageService storageService: IStorageService,
		@ITelemetryService telemetryService: ITelemetryService,
	) {
		super();

		const telemetry = new McpDiscoveryTelemetry(telemetryService, configurationService, storageService);
		telemetry.logConfiguration();
		this._register(configurationService.onDidChangeConfiguration(() => telemetry.logConfiguration()));
		this._register(storageService.onDidChangeValue(StorageScope.PROFILE, 'mcp.enablement', this._store)(() => telemetry.logConfiguration()));
		this._register(storageService.onDidChangeValue(StorageScope.WORKSPACE, 'mcp.enablement', this._store)(() => telemetry.logConfiguration()));
		const mcpAccessValue = observableConfigValue(mcpAccessConfig, McpAccessValue.All, configurationService);
		const strictPluginOnly = observableConfigValue<StrictPluginOnlyCustomization>(COPILOT_STRICT_PLUGIN_ONLY_CUSTOMIZATION_CONFIG, undefined, configurationService);
		const store = this._register(new DisposableStore());

		this._register(autorun(reader => {
			store.clear();
			const value = mcpAccessValue.read(reader);
			if (value === McpAccessValue.None) {
				telemetry.logDiscovery([]);
				return;
			}
			const discoveries: IMcpDiscovery[] = [];
			for (const descriptor of mcpDiscoveryRegistry.getAll()) {
				const mcpDiscovery = instantiationService.createInstance(descriptor);
				if (value === McpAccessValue.Registry && !mcpDiscovery.fromGallery) {
					mcpDiscovery.dispose();
					continue;
				}
				store.add(mcpDiscovery);
				discoveries.push(mcpDiscovery);
				mcpDiscovery.start();
			}
			store.add(autorun(reader => {
				const snapshots: IMcpDiscoveryTelemetrySnapshot[] = [];
				for (const discovery of discoveries) {
					const snapshot = discovery.telemetrySnapshot.read(reader);
					if (!snapshot) {
						return;
					}
					snapshots.push(snapshot);
				}
				telemetry.logDiscovery(reconcileMcpStrictPluginOnly(snapshots, isStrictPluginOnlyCustomizationEnabled(strictPluginOnly.read(reader))));
			}));
		}));
	}
}
