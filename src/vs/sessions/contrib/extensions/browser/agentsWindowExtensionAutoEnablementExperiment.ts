/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { autorun, derived, observableFromEvent, observableSignalFromEvent } from '../../../../base/common/observable.js';
import { isObject } from '../../../../base/common/types.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ExtensionIdentifier, EXTENSIONS_AGENTS_WINDOW_AUTO_ENABLE_EXTENSIONS, EXTENSIONS_AGENTS_WINDOW_MANAGEMENT } from '../../../../platform/extensions/common/extensions.js';
import { observableConfigValue } from '../../../../platform/observable/common/platformObservableUtils.js';
import { logSettingKeyExperimentTrigger } from '../../../../platform/telemetry/common/experimentTrigger.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IWorkbenchContribution } from '../../../../workbench/common/contributions.js';
import { ExtensionState, IExtensionsWorkbenchService } from '../../../../workbench/contrib/extensions/common/extensions.js';
import { IExperimentalSettingsService } from '../../../../workbench/services/configuration/common/experimentalSettings.js';
import { IExtensionManifestPropertiesService } from '../../../../workbench/services/extensions/common/extensionManifestPropertiesService.js';

/**
 * Runs a separate experiment for each installed extension that the Agents window could enable automatically: requests
 * each extension's value of the keyed experiment-controlled {@link EXTENSIONS_AGENTS_WINDOW_AUTO_ENABLE_EXTENSIONS}
 * setting, by its lowercase identifier, and logs the trigger of each extension's experiment.
 */
export class AgentsWindowExtensionAutoEnablementExperiment extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.agentsWindowExtensionAutoEnablementExperiment';

	constructor(
		@IExtensionsWorkbenchService extensionsWorkbenchService: IExtensionsWorkbenchService,
		@IExtensionManifestPropertiesService extensionManifestPropertiesService: IExtensionManifestPropertiesService,
		@IExperimentalSettingsService experimentalSettingsService: IExperimentalSettingsService,
		@IConfigurationService configurationService: IConfigurationService,
		@ITelemetryService telemetryService: ITelemetryService,
	) {
		super();

		const managementEnabled = observableConfigValue(EXTENSIONS_AGENTS_WINDOW_MANAGEMENT, false, configurationService);
		const extensionsChanged = observableSignalFromEvent(this, extensionsWorkbenchService.onChange);
		const eligibleIds = derived(this, reader => {
			if (!managementEnabled.read(reader)) {
				return [];
			}
			extensionsChanged.read(reader);
			return extensionsWorkbenchService.local.flatMap(extension => !extension.isBuiltin && extension.local && extension.state === ExtensionState.Installed && extensionManifestPropertiesService.isEligibleForSessionsWindowAutoEnablement(extension.local.manifest)
				? [ExtensionIdentifier.toKey(extension.identifier.id)]
				: []);
		});
		// Only experiments assign default values for extensions.
		const experimentValues = observableFromEvent(this,
			Event.filter(configurationService.onDidChangeConfiguration, e => e.affectsConfiguration(EXTENSIONS_AGENTS_WINDOW_AUTO_ENABLE_EXTENSIONS)),
			() => configurationService.inspect<unknown>(EXTENSIONS_AGENTS_WINDOW_AUTO_ENABLE_EXTENSIONS).defaultValue,
		);

		this._register(autorun(reader => {
			const ids = eligibleIds.read(reader);
			experimentalSettingsService.requestKeys(EXTENSIONS_AGENTS_WINDOW_AUTO_ENABLE_EXTENSIONS, ids);
			// Every arm of an extension's experiment assigns a value for the extension, before the extension is enabled or
			// disabled accordingly. Values that users set win over the experiment, but users can set them in response to their
			// arm, so they don't exclude users from the experiment.
			const values = experimentValues.read(reader);
			for (const id of ids) {
				if (isObject(values) && Object.hasOwn(values, id)) {
					logSettingKeyExperimentTrigger(telemetryService, EXTENSIONS_AGENTS_WINDOW_AUTO_ENABLE_EXTENSIONS, id);
				}
			}
		}));
	}
}
